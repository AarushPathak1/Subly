"""
Subly Trust Service
Async worker that consumes listing.scam_check and scores listings for fraud.
Combines keyword heuristics, a price-anomaly check, and an LLM tone analysis,
then writes the final scam_score back to the listings table.
"""

import asyncio
import json
import logging
import os
import re
from contextlib import asynccontextmanager

import aio_pika
import psycopg2
from psycopg2 import pool as pg_pool
from fastapi import FastAPI
from openai import OpenAI

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("trust")

# ─── Startup env validation ───────────────────────────────────────────────────

_required = ["DATABASE_URL", "RABBITMQ_URL", "OPENAI_API_KEY"]
_missing = [k for k in _required if not os.environ.get(k)]
if _missing:
    raise RuntimeError(f"[trust] missing required env vars: {', '.join(_missing)}")

# ─── Clients ─────────────────────────────────────────────────────────────────

openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

_db_pool = pg_pool.ThreadedConnectionPool(minconn=2, maxconn=10, dsn=os.environ["DATABASE_URL"])


def get_db():
    conn = _db_pool.getconn()
    conn.autocommit = True
    return conn


def release_db(conn):
    _db_pool.putconn(conn)


# ─── Heuristic: keyword signals ──────────────────────────────────────────────
#
# Each keyword maps to a score contribution; keyword_score = min(1.0, Σ weights).
# Weights are calibrated so a single high-signal keyword pushes the score to ~0.5,
# while two or more combined push it above 0.7 even before the LLM weighs in.

SCAM_SIGNALS: dict[str, float] = {
    # Off-platform payment requests
    "zelle":            0.30,
    "cashapp":          0.30,
    "cash app":         0.30,
    "venmo":            0.25,
    "western union":    0.55,
    "wire transfer":    0.55,
    "money order":      0.45,
    # Classic advance-fee: owner is conveniently unreachable
    "currently abroad":    0.55,
    "out of the country":  0.55,
    "traveling abroad":    0.45,
    "in another country":  0.50,
    "can't show":          0.30,
    "cannot show":         0.30,
    # Advance deposit pressure
    "send deposit":         0.45,
    "deposit first":        0.45,
    "hold the apartment":   0.30,
    # Soft urgency signals (low weight individually)
    "first come first served": 0.10,
    "won't last":              0.10,
    "act now":                 0.10,
}


def compute_keyword_score(title: str, description: str) -> float:
    text = f"{title} {description or ''}".lower()
    total = 0.0
    for kw, w in SCAM_SIGNALS.items():
        if " " in kw:
            if kw in text:
                total += w
        else:
            if re.search(rf"\b{re.escape(kw)}\b", text):
                total += w
    return min(1.0, total)


# ─── Heuristic: price anomaly ─────────────────────────────────────────────────

def compute_rent_flag(listing_id: str, rent_cents: int, university: str) -> float:
    """
    Returns 1.0 if the listing's rent is more than 30 % below the average
    for that university (requires at least 3 comparable active listings).
    """
    if not university or not rent_cents:
        return 0.0
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT AVG(rent_cents), COUNT(*)
                   FROM listings
                   WHERE university_near = %s AND status != 'draft' AND id != %s""",
                (university, listing_id),
            )
            row = cur.fetchone()
    finally:
        release_db(conn)
    if not row or not row[0] or row[1] < 3:
        return 0.0
    return 1.0 if rent_cents < float(row[0]) * 0.70 else 0.0


# ─── LLM: tone analysis ───────────────────────────────────────────────────────

async def compute_llm_score(
    title: str,
    description: str,
    rent_cents: int,
    university: str,
    bedrooms: int,
) -> tuple[float, str]:
    """
    Prompts gpt-4o-mini to rate scam likelihood 0.0–1.0.
    Returns (score, reason). Uses JSON mode for reliable parsing.
    """
    user_content = (
        f"Title: {title}\n"
        f"Description: {description or 'N/A'}\n"
        f"Rent: ${rent_cents / 100:.0f}/month\n"
        f"University area: {university or 'N/A'}\n"
        f"Bedrooms: {bedrooms}"
    )
    response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a housing fraud detection system for student subleases. "
                    'Respond only with JSON: {"score": <float 0.0–1.0>, "reason": <string ≤60 words>}. '
                    "score 0.0 = clearly legitimate, 1.0 = almost certainly a scam. "
                    "Key fraud signals: requesting payment before viewing (Zelle/Venmo/wire), "
                    "rent far below local market, owner abroad and cannot show unit, "
                    "urgency tactics, or asking for a deposit before a lease is signed."
                ),
            },
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )
    data = json.loads(response.choices[0].message.content)
    score = max(0.0, min(1.0, float(data.get("score", 0.5))))
    reason = data.get("reason", "")
    return score, reason


# ─── Orchestration ────────────────────────────────────────────────────────────

async def run_trust_checks(listing_id: str) -> None:
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT title, description, rent_cents, university_near, bedrooms
                   FROM listings WHERE id = %s""",
                (listing_id,),
            )
            row = cur.fetchone()
        if not row:
            log.warning(f"Listing {listing_id} not found, skipping")
            return

        title, description, rent_cents, university, bedrooms = row

        kw   = compute_keyword_score(title, description or "")
        rf   = compute_rent_flag(listing_id, rent_cents or 0, university or "")
        llm, reason = await compute_llm_score(
            title, description or "", rent_cents or 0, university or "", bedrooms or 1
        )

        # LLM is the primary signal (50 %); keywords reinforce scam patterns (30 %);
        # price anomaly is a supporting signal (20 %) — not decisive alone.
        final = round(min(1.0, llm * 0.5 + kw * 0.3 + rf * 0.2), 3)

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE listings SET scam_score = %s, status = 'active' WHERE id = %s",
                (final, listing_id),
            )
        log.info(
            f"[trust] {listing_id} → score={final:.3f} "
            f"(llm={llm:.2f} kw={kw:.2f} rent_flag={rf:.0f}) | {reason}"
        )
    finally:
        release_db(conn)


# ─── RabbitMQ consumer ────────────────────────────────────────────────────────

async def consume_scam_queue() -> None:
    while True:
        try:
            conn = await aio_pika.connect_robust(os.environ["RABBITMQ_URL"])
            channel = await conn.channel()
            await channel.set_qos(prefetch_count=4)
            queue = await channel.declare_queue("listing.scam_check", durable=True)
            async with queue.iterator() as q:
                async for message in q:
                    async with message.process():
                        data = json.loads(message.body)
                        listing_id = data.get("listing_id")
                        if listing_id:
                            await run_trust_checks(listing_id)
        except asyncio.CancelledError:
            break
        except Exception as e:
            log.error(f"RabbitMQ consumer error, retrying in 5s: {e}")
            await asyncio.sleep(5)


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(consume_scam_queue())
    yield
    task.cancel()


# ─── App (healthz only — this service is a pure worker) ──────────────────────

app = FastAPI(title="Subly Trust Service", lifespan=lifespan)


@app.get("/healthz")
def health():
    return {"status": "ok", "service": "trust"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 3004))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
