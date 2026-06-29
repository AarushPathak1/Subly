-- Subly initial schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- fuzzy text search

-- ─── Users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_id    TEXT UNIQUE NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    edu_verified BOOLEAN DEFAULT FALSE,
    university  TEXT,
    deleted_at  TIMESTAMPTZ,
    purge_after TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_purge_after_idx
    ON users(purge_after)
    WHERE deleted_at IS NOT NULL;

-- ─── Listings ───────────────────────────────────────────────────────────────
CREATE TYPE listing_status AS ENUM ('draft', 'active', 'paused', 'leased', 'expired');

CREATE TABLE IF NOT EXISTS listings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    address         TEXT NOT NULL,
    university_near TEXT,
    rent_cents      INT NOT NULL,             -- stored in cents
    available_from  DATE NOT NULL,
    available_to    DATE,
    bedrooms        SMALLINT DEFAULT 1,
    bathrooms       NUMERIC(3,1) DEFAULT 1,
    amenities       TEXT[],
    lease_type      TEXT CONSTRAINT listings_lease_type_check CHECK (lease_type IS NULL OR lease_type IN ('whole_place','private_room','shared_room')),
    furnished       TEXT CONSTRAINT listings_furnished_check  CHECK (furnished  IS NULL OR furnished  IN ('furnished','partially','unfurnished')),
    utilities_included TEXT[],
    images          TEXT[],                   -- S3/CDN URLs
    status          listing_status DEFAULT 'draft',
    embedding_id    TEXT,                     -- Pinecone vector ID
    scam_score      NUMERIC(4,3) DEFAULT 0,   -- 0.000–1.000
    view_count      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listings_user_id_idx ON listings(user_id);
CREATE INDEX IF NOT EXISTS listings_status_idx  ON listings(status);
CREATE INDEX IF NOT EXISTS listings_univ_idx    ON listings(university_near);

-- ─── User Profiles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    vibe_text       TEXT,                       -- freeform preference description
    university      TEXT,                       -- target university / area
    max_rent_cents  INT,                        -- upper rent budget in cents
    min_bedrooms    SMALLINT DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_profiles_user_id_idx ON user_profiles(user_id);

-- ─── Conversations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id          UUID REFERENCES listings(id) ON DELETE CASCADE,
    renter_id           UUID REFERENCES users(id) ON DELETE CASCADE,
    lister_id           UUID REFERENCES users(id) ON DELETE CASCADE,
    renter_read_at      TIMESTAMPTZ,
    lister_read_at      TIMESTAMPTZ,
    last_message_at     TIMESTAMPTZ,
    initial_rent_cents  INT NOT NULL DEFAULT 0,
    confirmed_at        TIMESTAMPTZ,
    stripe_session_id   TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT conversations_listing_renter_unique UNIQUE (listing_id, renter_id)
);

CREATE INDEX IF NOT EXISTS conversations_renter_idx ON conversations(renter_id);
CREATE INDEX IF NOT EXISTS conversations_lister_idx ON conversations(lister_id);

CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       UUID REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    kind            TEXT NOT NULL DEFAULT 'text',
    CONSTRAINT messages_kind_check CHECK (kind IN ('text', 'viewing_proposal')),
    -- JSONB payload for viewing proposals. NULL for text messages.
    -- Shape: {
    --   "proposed_at":     "2026-07-05T18:30:00Z",    -- ISO-8601 UTC, required
    --   "status":          "pending" | "accepted" | "declined" | "superseded",
    --   "responded_at":    "2026-07-04T12:05:00Z" | null,
    --   "responder_id":    "<uuid>" | null,
    --   "note":            "<= 280 chars, optional"
    -- }
    viewing         JSONB,
    CONSTRAINT messages_viewing_shape_check CHECK (
        (kind = 'text' AND viewing IS NULL) OR
        (kind = 'viewing_proposal' AND viewing IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_conv_pending_viewings_idx
    ON messages(conversation_id)
    WHERE kind = 'viewing_proposal' AND (viewing->>'status') = 'pending';

-- ─── Trigger: updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at         BEFORE UPDATE ON users         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER listings_updated_at      BEFORE UPDATE ON listings      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Reviews ────────────────────────────────────────────────────────────────
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

-- ─── Invite Requests ────────────────────────────────────────────────────────
CREATE TYPE invite_request_status AS ENUM ('pending', 'approved', 'rejected', 'redeemed');

CREATE TABLE IF NOT EXISTS invite_requests (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               TEXT UNIQUE NOT NULL,
    university_name     TEXT,
    status              invite_request_status DEFAULT 'pending',
    verification_token  TEXT,
    redeemed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invite_requests_status_idx ON invite_requests(status);

CREATE TRIGGER invite_requests_updated_at BEFORE UPDATE ON invite_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Saved Listings ─────────────────────────────────────────────────────────
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

-- ─── Reports ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_kind     TEXT NOT NULL CHECK (target_kind IN ('listing', 'user', 'message')),
    target_id       UUID NOT NULL,
    reason          TEXT NOT NULL CHECK (reason IN ('scam', 'spam', 'harassment', 'inappropriate', 'other')),
    details         TEXT NOT NULL DEFAULT '' CHECK (char_length(details) <= 1000),
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reports_reporter_target_unique UNIQUE (reporter_id, target_kind, target_id)
);

CREATE INDEX IF NOT EXISTS reports_target_idx ON reports(target_kind, target_id);
CREATE INDEX IF NOT EXISTS reports_status_created_idx ON reports(status, created_at DESC);
