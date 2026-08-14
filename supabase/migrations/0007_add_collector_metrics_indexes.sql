-- Migration: 0007_add_collector_metrics_indexes.sql
-- Description: Adds database indexes on timestamps and collector relations for optimized performance metrics aggregation queries.

-- 1. Index for collector requests date filtering
CREATE INDEX IF NOT EXISTS idx_collection_requests_collector_requested 
ON collection_requests(collector_id, requested_at);

-- 2. Index for collector batches date filtering
CREATE INDEX IF NOT EXISTS idx_collection_batches_collector_created 
ON collection_batches(collector_id, created_at);

-- 3. Index for evidence date filtering by uploader
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by_created 
ON evidence(uploaded_by, uploaded_at);
