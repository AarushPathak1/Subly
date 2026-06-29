-- Migration: "What's Included" structured fields on listings.
-- Safe to re-run (all operations are idempotent).

ALTER TABLE listings
    ADD COLUMN IF NOT EXISTS lease_type         TEXT,
    ADD COLUMN IF NOT EXISTS furnished          TEXT,
    ADD COLUMN IF NOT EXISTS utilities_included TEXT[];

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'listings_lease_type_check'
    ) THEN
        ALTER TABLE listings
            ADD CONSTRAINT listings_lease_type_check
            CHECK (lease_type IS NULL OR lease_type IN ('whole_place','private_room','shared_room'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'listings_furnished_check'
    ) THEN
        ALTER TABLE listings
            ADD CONSTRAINT listings_furnished_check
            CHECK (furnished IS NULL OR furnished IN ('furnished','partially','unfurnished'));
    END IF;
END$$;
