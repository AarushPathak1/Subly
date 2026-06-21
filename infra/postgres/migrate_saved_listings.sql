-- Migration 5 of 5 — saved listings
-- Run after migrate_reviews.sql. Safe to re-run.

CREATE TABLE IF NOT EXISTS saved_listings (
    user_id     UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS saved_listings_user_created_idx
    ON saved_listings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS saved_listings_listing_idx
    ON saved_listings(listing_id);
