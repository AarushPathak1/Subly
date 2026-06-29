-- ─── Listings feed ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS listings_status_created_idx
    ON listings(status, created_at DESC);

CREATE INDEX IF NOT EXISTS listings_user_status_created_idx
    ON listings(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS listings_univ_status_created_idx
    ON listings(university_near, status, created_at DESC)
    WHERE status = 'active';

-- ─── Reviews ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS reviews_listing_published_idx
    ON reviews(listing_id, published)
    WHERE published = true;

CREATE INDEX IF NOT EXISTS reviews_conversation_idx
    ON reviews(conversation_id);

-- ─── Conversations ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS conversations_confirmed_at_idx
    ON conversations(confirmed_at)
    WHERE confirmed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_renter_last_msg_idx
    ON conversations(renter_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS conversations_lister_last_msg_idx
    ON conversations(lister_id, last_message_at DESC NULLS LAST);

-- ─── Reports ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS reports_reporter_status_idx
    ON reports(reporter_id, status);

-- NOTE: matching service opens up to 80 connections (4 workers x 20).
-- Ensure postgres max_connections >= 200 in prod.
