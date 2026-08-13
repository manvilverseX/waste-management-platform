-- Migration: 0005_add_verification_audit_log.sql
-- Description: Extends verification_results table for audit logging, hard evidence check records, structured AI details, and explainable reasons.

ALTER TABLE verification_results
ADD COLUMN IF NOT EXISTS collection_request_id UUID REFERENCES collection_requests(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS hard_evidence_checks JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ai_analysis_details JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS reason TEXT;

-- Create performance index on collection_request_id for rapid history queries
CREATE INDEX IF NOT EXISTS idx_verification_results_request ON verification_results(collection_request_id);
