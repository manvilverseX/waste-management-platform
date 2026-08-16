-- Add collector_id reference to collection_requests
ALTER TABLE collection_requests ADD COLUMN collector_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_collection_requests_collector ON collection_requests(collector_id);

-- Drop previous select policy
DROP POLICY IF EXISTS "Residents can view their own collection requests" ON collection_requests;

-- New select policy allowing residents to view their own, and collectors/municipality to view all
CREATE POLICY "Users can view collection requests based on role"
    ON collection_requests FOR SELECT
    USING (
        auth.uid() = resident_id OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role IN ('collector', 'municipality')
        )
    );

-- New update policy allowing residents to cancel their requests, and collectors/municipality to update state
CREATE POLICY "Users can update collection requests based on role"
    ON collection_requests FOR UPDATE
    USING (
        auth.uid() = resident_id OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role IN ('collector', 'municipality')
        )
    )
    WITH CHECK (
        auth.uid() = resident_id OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role IN ('collector', 'municipality')
        )
    );
