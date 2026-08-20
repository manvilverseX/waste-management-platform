-- 0013_verification_gps_columns.sql
-- Adds GPS verification columns to verification_results if they do not already exist.

ALTER TABLE verification_results
  ADD COLUMN IF NOT EXISTS gps_distance DOUBLE PRECISION;

ALTER TABLE verification_results
  ADD COLUMN IF NOT EXISTS gps_decision VARCHAR(50);
