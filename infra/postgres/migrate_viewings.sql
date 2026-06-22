-- Migration 6 of 6 — viewing proposals in chat
-- Run after migrate_saved_listings.sql. Safe to re-run.

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text';

DO $$ BEGIN
    ALTER TABLE messages ADD CONSTRAINT messages_kind_check
        CHECK (kind IN ('text', 'viewing_proposal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- JSONB payload for viewing proposals. NULL for text messages.
-- Shape: {
--   "proposed_at":     "2026-07-05T18:30:00Z",    -- ISO-8601 UTC, required
--   "status":          "pending" | "accepted" | "declined" | "superseded",
--   "responded_at":    "2026-07-04T12:05:00Z" | null,
--   "responder_id":    "<uuid>" | null,
--   "note":            "<= 280 chars, optional"
-- }
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS viewing JSONB;

DO $$ BEGIN
    ALTER TABLE messages ADD CONSTRAINT messages_viewing_shape_check
        CHECK (
            (kind = 'text' AND viewing IS NULL) OR
            (kind = 'viewing_proposal' AND viewing IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS messages_conv_pending_viewings_idx
    ON messages(conversation_id)
    WHERE kind = 'viewing_proposal' AND (viewing->>'status') = 'pending';
