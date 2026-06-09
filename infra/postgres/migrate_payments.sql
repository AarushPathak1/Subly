-- Migration: add payment confirmation columns to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS initial_rent_cents INT NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
