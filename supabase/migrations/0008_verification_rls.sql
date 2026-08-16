-- RLS Policies for verification_results table

-- Drop any existing conflicting policies
DROP POLICY IF EXISTS "Collectors and municipality can insert verification results" ON verification_results;
DROP POLICY IF EXISTS "Users can view verification results if they can view the evidence" ON verification_results;

-- 1. Policy to allow inserting verification results
-- Only municipality users, or collectors assigned to the corresponding collection request, are permitted to insert.
CREATE POLICY "Collectors and municipality can insert verification results"
    ON verification_results FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND (
                u.role = 'municipality' OR (
                    u.role = 'collector' AND EXISTS (
                        SELECT 1 FROM evidence e
                        JOIN collection_requests cr ON cr.id = e.collection_request_id
                        WHERE e.id = evidence_id AND cr.collector_id = auth.uid()
                    )
                )
            )
        )
    );

-- 2. Policy to allow selecting verification results
-- Users can view verification results if they have select permission on the corresponding evidence row.
CREATE POLICY "Users can view verification results if they can view the evidence"
    ON verification_results FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM evidence e
            WHERE e.id = evidence_id
        )
    );
