-- Migration: drop legacy includes_agreement column from conversations
-- (feature removed in commit e48c424, persisted volumes still carry the column).
-- Idempotent — safe to re-run.
ALTER TABLE conversations DROP COLUMN IF EXISTS includes_agreement;
