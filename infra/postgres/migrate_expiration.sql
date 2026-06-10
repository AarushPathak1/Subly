-- Migration 3 of 3 — add expired listing status
-- Run after migrate_payments.sql.
-- NOTE: ADD VALUE on an enum is not transactional in Postgres — do not wrap in a transaction block.
ALTER TYPE listing_status ADD VALUE IF NOT EXISTS 'expired';
