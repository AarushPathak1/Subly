-- Migration 8 of 8 — account deletion (soft-delete now, hard-delete after 30 days)
-- Run after migrate_view_count.sql. Safe to re-run.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_purge_after_idx
    ON users(purge_after)
    WHERE deleted_at IS NOT NULL;
