-- Migration 4 of 4 — reviews
-- Run after migrate_expiration.sql. Safe to re-run.

CREATE TABLE IF NOT EXISTS reviews (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reviewer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    listing_id      UUID REFERENCES listings(id) ON DELETE SET NULL,
    rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body            TEXT NOT NULL DEFAULT '',
    published       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reviews_reviewer_conversation_unique UNIQUE (reviewer_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS reviews_published_created_idx
    ON reviews(published, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_rating_idx ON reviews(rating);
