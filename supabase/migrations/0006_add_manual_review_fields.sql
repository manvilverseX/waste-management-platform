-- Migration: 0006_add_manual_review_fields.sql
-- Description: Adds manual review decision tracking, reviewer identity, timestamp, and explanation fields to verification_results table.

ALTER TABLE verification_results
ADD COLUMN IF NOT EXISTS manual_decision VARCHAR(50),
ADD COLUMN IF NOT EXISTS manual_reason TEXT,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Performance index for queries on reviewed cases
CREATE INDEX IF NOT EXISTS idx_verification_results_reviewed ON verification_results(reviewed_at) WHERE reviewed_at IS NOT NULL;
