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
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Listings ───────────────────────────────────────────────────────────────
CREATE TYPE listing_status AS ENUM ('draft', 'active', 'paused', 'leased');

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
    images          TEXT[],                   -- S3/CDN URLs
    status          listing_status DEFAULT 'draft',
    embedding_id    TEXT,                     -- Pinecone vector ID
    scam_score      NUMERIC(4,3) DEFAULT 0,   -- 0.000–1.000
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
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id  UUID REFERENCES listings(id) ON DELETE CASCADE,
    renter_id   UUID REFERENCES users(id) ON DELETE CASCADE,
    lister_id   UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       UUID REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

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
