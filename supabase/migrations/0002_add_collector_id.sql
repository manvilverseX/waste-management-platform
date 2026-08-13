-- Migration: 0002_add_collector_id.sql
-- Description: Adds collector_id assignment to collection_requests and extends status enum for the strict collection state machine.

-- 1. Add collector_id column to collection_requests table
ALTER TABLE collection_requests
ADD COLUMN IF NOT EXISTS collector_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 2. Create performance index on collector_id
CREATE INDEX IF NOT EXISTS idx_collection_requests_collector ON collection_requests(collector_id);

-- 3. Safely add new values to collection_status enum for the state machine
ALTER TYPE collection_status ADD VALUE IF NOT EXISTS 'WASTE_READY';
ALTER TYPE collection_status ADD VALUE IF NOT EXISTS 'PICKUP_EVIDENCE_SUBMITTED';
ALTER TYPE collection_status ADD VALUE IF NOT EXISTS 'VEHICLE_EVIDENCE_SUBMITTED';
ALTER TYPE collection_status ADD VALUE IF NOT EXISTS 'VERIFICATION_IN_PROGRESS';
ALTER TYPE collection_status ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';
