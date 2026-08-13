-- Migration: 0003_add_evidence_location.sql
-- Description: Adds GPS latitude, longitude, and client capture timestamp to evidence table.

ALTER TABLE evidence
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;

-- Range constraints for geographic coordinates
ALTER TABLE evidence
ADD CONSTRAINT evidence_lat_range CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
ADD CONSTRAINT evidence_lon_range CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
