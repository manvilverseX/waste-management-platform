-- Add unique constraint to prevent duplicate evidence of the same type for a collection request
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS unique_request_evidence_type;
ALTER TABLE evidence ADD CONSTRAINT unique_request_evidence_type UNIQUE (collection_request_id, evidence_type);
