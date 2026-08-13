-- Migration: 0004_add_collection_batches.sql
-- Description: Adds collection_batches table, links requests & evidence to batches, and adds VEHICLE to evidence_type enum.

-- 1. Create custom enum for batch status
CREATE TYPE batch_status AS ENUM (
    'CREATED',
    'COLLECTING',
    'READY_FOR_VEHICLE_EVIDENCE',
    'VEHICLE_EVIDENCE_SUBMITTED',
    'CANCELLED'
);

-- 2. Create collection_batches table
CREATE TABLE collection_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collector_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status batch_status NOT NULL DEFAULT 'CREATED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for batch query performance
CREATE INDEX idx_collection_batches_collector ON collection_batches(collector_id);
CREATE INDEX idx_collection_batches_status ON collection_batches(status);

-- Enable RLS on collection_batches
ALTER TABLE collection_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Collectors can view their own batches"
    ON collection_batches FOR SELECT
    USING (auth.uid() = collector_id);

CREATE POLICY "Collectors can insert their own batches"
    ON collection_batches FOR INSERT
    WITH CHECK (auth.uid() = collector_id);

CREATE POLICY "Collectors can update their own batches"
    ON collection_batches FOR UPDATE
    USING (auth.uid() = collector_id);

-- 3. Link collection_requests to collection_batches
ALTER TABLE collection_requests
ADD COLUMN IF NOT EXISTS collection_batch_id UUID REFERENCES collection_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_collection_requests_batch ON collection_requests(collection_batch_id);

-- 4. Extend evidence table to support batch-level vehicle evidence
ALTER TABLE evidence ALTER COLUMN collection_request_id DROP NOT NULL;

ALTER TABLE evidence
ADD COLUMN IF NOT EXISTS collection_batch_id UUID REFERENCES collection_batches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_evidence_batch ON evidence(collection_batch_id);

-- 5. Add VEHICLE value to evidence_type enum safely
ALTER TYPE evidence_type ADD VALUE IF NOT EXISTS 'VEHICLE';

-- 6. Enforce Evidence Entity Invariants (VEHICLE -> batch required, PICKUP/BEFORE -> request required)
ALTER TABLE evidence
ADD CONSTRAINT chk_evidence_target_invariant CHECK (
    (evidence_type = 'VEHICLE' AND collection_batch_id IS NOT NULL) OR
    (evidence_type IN ('RESIDENT_BEFORE', 'COLLECTOR_AFTER') AND collection_request_id IS NOT NULL)
);

-- 7. Ensure maximum of 1 VEHICLE evidence record per collection batch (prevents double submissions)
CREATE UNIQUE INDEX idx_evidence_single_vehicle_per_batch 
ON evidence(collection_batch_id) 
WHERE evidence_type = 'VEHICLE';
