-- Additive: add lat/lng to listings for Google Places integration.
ALTER TABLE listings
    ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'listings_lat_range_check'
    ) THEN
        ALTER TABLE listings
            ADD CONSTRAINT listings_lat_range_check
            CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'listings_lng_range_check'
    ) THEN
        ALTER TABLE listings
            ADD CONSTRAINT listings_lng_range_check
            CHECK (lng IS NULL OR (lng BETWEEN -180 AND 180));
    END IF;
END $$;
