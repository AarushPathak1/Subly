-- Migration 2 of 3 — payment confirmation columns
-- Run after migrate_chat.sql. Safe to re-run (all statements use IF NOT EXISTS).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS initial_rent_cents INT NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
