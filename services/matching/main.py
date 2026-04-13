"""
Subly Matching Service
FastAPI + Pinecone for vector-similarity listing search.
Consumes listing.scam_check queue from RabbitMQ.
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


# ─── RabbitMQ consumer ───────────────────────────────────────────────────────

async def consume_scam_queue():
    """
    Listens to listing.scam_check and embeds new listings into Pinecone.
    Scam scoring is a placeholder — wire in a classifier here.
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
        log.warning(f"RabbitMQ consumer error (non-fatal): {e}")


async def embed_listing(listing_id: str):
    """Fetch listing text, generate embedding, upsert into Pinecone."""
    cur = db_conn.cursor()
    cur.execute(
        "SELECT title, description, address, university_near FROM listings WHERE id=%s",
        (listing_id,),
    )
    row = cur.fetchone()
    if not row:
        log.warning(f"Listing {listing_id} not found for embedding")
        return

    title, description, address, university = row
    text = f"{title}. {description or ''}. Near {university or address}."

    response = openai_client.embeddings.create(
        model="text-embedding-3-small", input=text
    )
    embedding = response.data[0].embedding

    index.upsert(
        vectors=[{"id": listing_id, "values": embedding, "metadata": {"university": university or ""}}]
    )

    # Update DB with Pinecone ID
    cur.execute(
        "UPDATE listings SET embedding_id=%s WHERE id=%s", (listing_id, listing_id)
    )
    log.info(f"Embedded listing {listing_id}")


# ─── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(consume_scam_queue())
    yield
    task.cancel()


# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="Subly Matching Service", lifespan=lifespan)


class SearchRequest(BaseModel):
    query: str
    university: Optional[str] = None
    top_k: int = 10


class SearchResult(BaseModel):
    listing_id: str
    score: float
    university: Optional[str]


@app.get("/healthz")
def health():
    return {"status": "ok", "service": "matching"}


@app.post("/search", response_model=list[SearchResult])
def search(req: SearchRequest):
    """
    Semantic search over active listings using Pinecone.
    Optionally filter by university metadata.
    """
    response = openai_client.embeddings.create(
        model="text-embedding-3-small", input=req.query
    )
    query_embedding = response.data[0].embedding

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
