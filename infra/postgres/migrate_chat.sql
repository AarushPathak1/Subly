-- Run this once against an existing DB to add chat support.
-- Safe to re-run (all statements are idempotent).

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS renter_read_at  TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lister_read_at  TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_listing_renter_unique
    ON conversations(listing_id, renter_id);

CREATE INDEX IF NOT EXISTS conversations_renter_idx ON conversations(renter_id);
CREATE INDEX IF NOT EXISTS conversations_lister_idx ON conversations(lister_id);
CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON messages(conversation_id, created_at);
