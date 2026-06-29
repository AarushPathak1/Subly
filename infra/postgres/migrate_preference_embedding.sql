-- Adds a cached OpenAI embedding of the user's vibe/preferences so the
-- matching service does not have to re-embed on every dashboard load.
-- NULL means "cache miss; recompute on next read".
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS preference_embedding FLOAT8[];
