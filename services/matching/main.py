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
from fastapi import FastAPI, HTTPException
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

_db_pool = pg_pool.ThreadedConnectionPool(minconn=2, maxconn=10, dsn=os.environ["DATABASE_URL"])


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
    query: str
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


@app.get("/healthz")
def health():
    return {"status": "ok", "service": "matching"}


@app.get("/matches/{user_id}", response_model=list[MatchResult])
def get_matches(user_id: str):
    """
    Fetch a user's preferences from user_profiles, synthesize a vibe query,
    and return the top 5 semantically similar listings from Pinecone.
    Hard filters on university, rent, and bedrooms narrow the candidate set
    before vector similarity re-ranks it.
    """
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT vibe_text, university, max_rent_cents, min_bedrooms
                   FROM user_profiles WHERE user_id = %s""",
                (user_id,),
            )
            prefs = cur.fetchone()
        if not prefs:
            raise HTTPException(status_code=404, detail="User profile not found")

        vibe_text, university, max_rent_cents, min_bedrooms = prefs

        parts = [f"Looking for a place near {university or 'campus'}."]
        if min_bedrooms:
            parts.append(f"{min_bedrooms}+ bedrooms.")
        if max_rent_cents:
            parts.append(f"Budget up to ${max_rent_cents / 100:.0f}/month.")
        if vibe_text:
            parts.append(vibe_text)
        query_text = " ".join(parts)

        embedding = embed_text(query_text)

        filter_dict: dict = {}
        if university:
            filter_dict["university"] = {"$eq": university.upper()}
        if max_rent_cents:
            filter_dict["rent_cents"] = {"$lte": max_rent_cents}
        if min_bedrooms:
            filter_dict["bedrooms"] = {"$gte": min_bedrooms}

        results = index.query(
            vector=embedding,
            top_k=5,
            filter=filter_dict if filter_dict else None,
            include_metadata=True,
        )

        listing_ids = [m["id"] for m in results["matches"]]
        scam_scores: dict[str, float] = {}
        if listing_ids:
            with conn.cursor() as scam_cur:
                scam_cur.execute(
                    "SELECT id::text, scam_score FROM listings WHERE id = ANY(%s)",
                    (listing_ids,),
                )
                scam_scores = {row[0]: float(row[1]) for row in scam_cur.fetchall()}
    finally:
        release_db(conn)

    return [
        MatchResult(
            listing_id=m["id"],
            score=m["score"],
            university=m.get("metadata", {}).get("university"),
            rent_cents=m.get("metadata", {}).get("rent_cents"),
            bedrooms=m.get("metadata", {}).get("bedrooms"),
            bathrooms=m.get("metadata", {}).get("bathrooms"),
            scam_score=scam_scores.get(m["id"], 0.0),
        )
        for m in results["matches"]
    ]


@app.post("/search", response_model=list[SearchResult])
def search(req: SearchRequest):
    """Semantic search over listings — generic, not personalized."""
    query_embedding = embed_text(req.query)

    filter_dict = {}
    if req.university:
        filter_dict["university"] = {"$eq": req.university.upper()}

    results = index.query(
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
async def trigger_embed(listing_id: str):
    """Manually trigger embedding for a listing (useful for backfills)."""
    await embed_listing(listing_id)
    return {"listing_id": listing_id, "status": "embedded"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 3003))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
