-- Migration 8: listing/user/message reports for trust & safety triage.
-- Safe to re-run.

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
