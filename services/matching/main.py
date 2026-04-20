"""
Subly Matching Service
FastAPI + Pinecone for vector-similarity listing search.
Consumes listings.new (embedding pipeline) and listing.scam_check (scam pipeline).
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

import aio_pika
import psycopg2
from fastapi import FastAPI, HTTPException
from openai import OpenAI
from pinecone import Pinecone
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("matching")

# ─── Clients ─────────────────────────────────────────────────────────────────

openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
index = pc.Index(os.environ.get("PINECONE_INDEX", "subly-listings"))

db_conn = psycopg2.connect(os.environ["DATABASE_URL"])
db_conn.autocommit = True


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
    try:
        conn = await aio_pika.connect_robust(os.environ["RABBITMQ_URL"])
        channel = await conn.channel()
        queue = await channel.declare_queue("listings.new", durable=True)

        async with queue.iterator() as q:
            async for message in q:
                async with message.process():
                    listing = json.loads(message.body)
                    await embed_listing_from_payload(listing)
    except Exception as e:
        log.warning(f"listings.new consumer error (non-fatal): {e}")


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
        f"{bedrooms} bed, {bathrooms} bath.",
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

    db_conn.cursor().execute(
        "UPDATE listings SET embedding_id=%s WHERE id=%s", (listing_id, listing_id)
    )
    log.info(f"Embedded listing {listing_id} from listings.new")


async def consume_scam_queue():
    """
    Listens to listing.scam_check. Placeholder for future scam classifier;
    re-embeds from DB so the vector index stays consistent on retries.
    """
    try:
        conn = await aio_pika.connect_robust(os.environ["RABBITMQ_URL"])
        channel = await conn.channel()
        queue = await channel.declare_queue("listing.scam_check", durable=True)

        async with queue.iterator() as q:
            async for message in q:
                async with message.process():
                    data = json.loads(message.body)
                    listing_id = data.get("listing_id")
                    if listing_id:
                        await embed_listing(listing_id)
    except Exception as e:
        log.warning(f"listing.scam_check consumer error (non-fatal): {e}")


async def embed_listing(listing_id: str):
    """Fetch listing from DB and embed. Used by the scam-check pipeline and backfills."""
    cur = db_conn.cursor()
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
        f"{bedrooms} bed, {bathrooms} bath.",
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

    cur.execute("UPDATE listings SET embedding_id=%s WHERE id=%s", (listing_id, listing_id))
    log.info(f"Embedded listing {listing_id}")


# ─── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(consume_new_listings()),
        asyncio.create_task(consume_scam_queue()),
    ]
    yield
    for t in tasks:
        t.cancel()


# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="Subly Matching Service", lifespan=lifespan)


class SearchRequest(BaseModel):
    query: str
    university: Optional[str] = None
    top_k: int = 10


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
    cur = db_conn.cursor()
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

    return [
        MatchResult(
            listing_id=m["id"],
            score=m["score"],
            university=m.get("metadata", {}).get("university"),
            rent_cents=m.get("metadata", {}).get("rent_cents"),
            bedrooms=m.get("metadata", {}).get("bedrooms"),
            bathrooms=m.get("metadata", {}).get("bathrooms"),
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
