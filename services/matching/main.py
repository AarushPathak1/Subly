"""
Subly Matching Service
FastAPI + Pinecone for vector-similarity listing search.
Consumes listings.new for embedding. Trust service owns listing.scam_check.
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

import aio_pika
import psycopg2
from psycopg2 import pool as pg_pool
from fastapi import FastAPI, Header, HTTPException
from openai import OpenAI
from pinecone import Pinecone
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("matching")

# ─── Startup env validation ───────────────────────────────────────────────────

_required = ["DATABASE_URL", "RABBITMQ_URL", "OPENAI_API_KEY", "PINECONE_API_KEY"]
_missing = [k for k in _required if not os.environ.get(k)]
if _missing:
    raise RuntimeError(f"[matching] missing required env vars: {', '.join(_missing)}")

# ─── Clients ─────────────────────────────────────────────────────────────────

openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
index = pc.Index(os.environ.get("PINECONE_INDEX", "subly-listings"))

_db_pool = pg_pool.ThreadedConnectionPool(minconn=4, maxconn=20, dsn=os.environ["DATABASE_URL"])


def get_db():
    conn = _db_pool.getconn()
    conn.autocommit = True
    return conn


def release_db(conn):
    _db_pool.putconn(conn)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def embed_text(text: str) -> list[float]:
    response = openai_client.embeddings.create(
        model="text-embedding-3-small", input=text
    )
    return response.data[0].embedding


def _load_or_compute_user_embedding(
    user_id: str,
) -> tuple[list[float], Optional[str], Optional[str], Optional[int], Optional[int]]:
    """
    Sync helper (run inside asyncio.to_thread). Reads user_profiles for the
    given user_id. Returns (embedding, vibe_text, university, max_rent_cents,
    min_bedrooms). On cache miss, calls OpenAI, writes result back, returns it.
    Two concurrent misses both call OpenAI and both write (last-writer-wins,
    idempotent). Raises HTTPException(404) if no profile row exists.
    """
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT vibe_text, university, max_rent_cents, min_bedrooms,
                          preference_embedding
                   FROM user_profiles WHERE user_id = %s""",
                (user_id,),
            )
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User profile not found")

        vibe_text, university, max_rent_cents, min_bedrooms, cached_embedding = row

        if cached_embedding is not None:
            return list(cached_embedding), vibe_text, university, max_rent_cents, min_bedrooms

        # Cache miss — build query text and embed
        parts = [f"Looking for a place near {university or 'campus'}."]
        if min_bedrooms:
            parts.append(f"{min_bedrooms}+ bedrooms.")
        if max_rent_cents:
            parts.append(f"Budget up to ${max_rent_cents / 100:.0f}/month.")
        if vibe_text:
            parts.append(vibe_text)
        query_text = " ".join(parts)

        try:
            embedding = embed_text(query_text)
        except Exception as e:
            log.error(f"OpenAI embed failed for user {user_id}: {e}")
            raise HTTPException(status_code=502, detail="Embedding service unavailable")

        # Write back — best-effort; don't fail the request if the UPDATE fails
        try:
            with conn.cursor() as upd:
                upd.execute(
                    "UPDATE user_profiles SET preference_embedding = %s WHERE user_id = %s",
                    (embedding, user_id),
                )
        except Exception as e:
            log.warning(f"Failed to cache preference_embedding for user {user_id}: {e}")

        return embedding, vibe_text, university, max_rent_cents, min_bedrooms
    finally:
        release_db(conn)


def _fetch_listing_details(
    listing_ids: list[str],
) -> tuple[dict[str, float], dict[str, dict]]:
    """Sync helper. Batch-fetches scam scores and card metadata from Postgres."""
    scam_scores: dict[str, float] = {}
    listing_details: dict[str, dict] = {}
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id::text, scam_score, title, address, images, available_from::text
                   FROM listings WHERE id = ANY(%s::uuid[])""",
                (listing_ids,),
            )
            for row in cur.fetchall():
                lid, scam_score, title, address, images, available_from = row
                scam_scores[lid] = float(scam_score)
                listing_details[lid] = {
                    "title": title,
                    "address": address,
                    "image_url": images[0] if images else None,
                    "available_from": available_from,
                }
    finally:
        release_db(conn)
    return scam_scores, listing_details


# ─── RabbitMQ consumers ──────────────────────────────────────────────────────

async def consume_new_listings():
    """
    Listens to listings.new. Embeds each listing into Pinecone using the full
    message payload, so no extra DB round-trip is needed.
    """
    while True:
        try:
            conn = await aio_pika.connect_robust(os.environ["RABBITMQ_URL"])
            channel = await conn.channel()
            queue = await channel.declare_queue("listings.new", durable=True)
            async with queue.iterator() as q:
                async for message in q:
                    async with message.process():
                        listing = json.loads(message.body)
                        await embed_listing_from_payload(listing)
        except asyncio.CancelledError:
            break
        except Exception as e:
            log.error(f"listings.new consumer error, retrying in 5s: {e}")
            await asyncio.sleep(5)


async def embed_listing_from_payload(listing: dict):
    """Embed a listing from its full message payload and upsert to Pinecone."""
    listing_id = listing.get("id")
    if not listing_id:
        log.warning("listings.new message missing 'id', skipping")
        return

    title       = listing.get("title", "")
    description = listing.get("description", "")
    university  = listing.get("university_near", "")
    address     = listing.get("address", "")
    bedrooms    = listing.get("bedrooms", 1)
    bathrooms   = listing.get("bathrooms", 1.0)
    rent_cents  = listing.get("rent_cents", 0)
    amenities   = listing.get("amenities") or []

    parts = [
        title,
        description,
        f"Near {university or address}.",
        f"{bedrooms or 1} bed, {bathrooms or 1.0} bath.",
        f"${rent_cents / 100:.0f}/mo.",
    ]
    if amenities:
        parts.append("Amenities: " + ", ".join(amenities) + ".")
    text = " ".join(p for p in parts if p)

    embedding = embed_text(text)

    index.upsert(vectors=[{
        "id": listing_id,
        "values": embedding,
        "metadata": {
            "university": (university or "").upper(),
            "rent_cents": rent_cents,
            "bedrooms":   bedrooms,
            "bathrooms":  float(bathrooms),
        },
    }])

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE listings SET embedding_id=%s WHERE id=%s", (listing_id, listing_id)
            )
    finally:
        release_db(conn)
    log.info(f"Embedded listing {listing_id} from listings.new")


async def embed_listing(listing_id: str):
    """Fetch listing from DB and embed. Used by the scam-check pipeline and backfills."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT title, description, address, university_near,
                          rent_cents, bedrooms, bathrooms, amenities
                   FROM listings WHERE id = %s""",
                (listing_id,),
            )
            row = cur.fetchone()
        if not row:
            log.warning(f"Listing {listing_id} not found for embedding")
            return

        title, description, address, university, rent_cents, bedrooms, bathrooms, amenities = row
        parts = [
            title,
            description or "",
            f"Near {university or address}.",
            f"{bedrooms or 1} bed, {bathrooms or 1.0} bath.",
            f"${(rent_cents or 0) / 100:.0f}/mo.",
        ]
        if amenities:
            parts.append("Amenities: " + ", ".join(amenities) + ".")
        text = " ".join(p for p in parts if p)

        embedding = embed_text(text)

        index.upsert(vectors=[{
            "id": listing_id,
            "values": embedding,
            "metadata": {
                "university": (university or "").upper(),
                "rent_cents": rent_cents or 0,
                "bedrooms":   bedrooms or 1,
                "bathrooms":  float(bathrooms or 1),
            },
        }])

        with conn.cursor() as update_cur:
            update_cur.execute(
                "UPDATE listings SET embedding_id=%s WHERE id=%s", (listing_id, listing_id)
            )
        log.info(f"Embedded listing {listing_id}")
    finally:
        release_db(conn)


# ─── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(consume_new_listings())
    yield
    task.cancel()


# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="Subly Matching Service", lifespan=lifespan)


class SearchRequest(BaseModel):
    query: str = Field(..., max_length=500)
    university: Optional[str] = None
    top_k: int = Field(default=10, ge=1, le=100)


class SearchResult(BaseModel):
    listing_id: str
    score: float
    university: Optional[str] = None


class MatchResult(BaseModel):
    listing_id: str
    score: float
    university: Optional[str] = None
    rent_cents: Optional[int] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    scam_score: float = 0.0
    title: Optional[str] = None
    address: Optional[str] = None
    image_url: Optional[str] = None
    available_from: Optional[str] = None   # ISO date (YYYY-MM-DD)


@app.get("/healthz")
def health():
    return {"status": "ok", "service": "matching"}


@app.get("/matches/{user_id}", response_model=list[MatchResult])
async def get_matches(user_id: str, x_user_id: Optional[str] = Header(default=None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-ID header")
    if x_user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot access another user's matches")

    embedding, vibe_text, university, max_rent_cents, min_bedrooms = \
        await asyncio.to_thread(_load_or_compute_user_embedding, user_id)

    filter_dict: dict = {}
    if university:
        filter_dict["university"] = {"$eq": university.upper()}
    if max_rent_cents:
        filter_dict["rent_cents"] = {"$lte": max_rent_cents}
    if min_bedrooms:
        filter_dict["bedrooms"] = {"$gte": min_bedrooms}

    results = await asyncio.to_thread(
        index.query,
        vector=embedding,
        top_k=5,
        filter=filter_dict if filter_dict else None,
        include_metadata=True,
    )

    listing_ids = [m["id"] for m in results["matches"]]
    scam_scores: dict[str, float] = {}
    listing_details: dict[str, dict] = {}
    if listing_ids:
        scam_scores, listing_details = await asyncio.to_thread(
            _fetch_listing_details, listing_ids
        )

    return [
        MatchResult(
            listing_id=m["id"],
            score=m["score"],
            university=m.get("metadata", {}).get("university"),
            rent_cents=m.get("metadata", {}).get("rent_cents"),
            bedrooms=m.get("metadata", {}).get("bedrooms"),
            bathrooms=m.get("metadata", {}).get("bathrooms"),
            scam_score=scam_scores.get(m["id"], 0.0),
            title=listing_details.get(m["id"], {}).get("title"),
            address=listing_details.get(m["id"], {}).get("address"),
            image_url=listing_details.get(m["id"], {}).get("image_url"),
            available_from=listing_details.get(m["id"], {}).get("available_from"),
        )
        for m in results["matches"]
    ]


@app.post("/search", response_model=list[SearchResult])
async def search(req: SearchRequest, x_user_id: Optional[str] = Header(default=None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-ID header")

    query_embedding = await asyncio.to_thread(embed_text, req.query)

    filter_dict = {}
    if req.university:
        filter_dict["university"] = {"$eq": req.university.upper()}

    results = await asyncio.to_thread(
        index.query,
        vector=query_embedding,
        top_k=req.top_k,
        filter=filter_dict if filter_dict else None,
        include_metadata=True,
    )

    return [
        SearchResult(
            listing_id=m["id"],
            score=m["score"],
            university=m.get("metadata", {}).get("university"),
        )
        for m in results["matches"]
    ]


@app.post("/embed/{listing_id}")
async def trigger_embed(listing_id: str, x_internal_call: Optional[str] = Header(default=None)):
    """
    Manually trigger embedding for a listing (useful for backfills). Re-embedding
    calls OpenAI and Pinecone, so this must not be triggerable by an arbitrary
    caller. Only internal/server-to-server calls (X-Internal-Call: true, set by
    the gateway after validating X-Internal-Secret) may proceed.
    """
    if x_internal_call != "true":
        raise HTTPException(status_code=403, detail="Internal endpoint")
    await embed_listing(listing_id)
    return {"listing_id": listing_id, "status": "embedded"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 3003))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
