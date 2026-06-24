-- Migration 7 of 7 — listing view count
-- Run after migrate_viewings.sql. Safe to re-run.

ALTER TABLE listings
    ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;
