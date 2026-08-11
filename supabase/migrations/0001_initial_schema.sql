-- Enable PostGIS extension for geographic coordinates
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create Custom Enum Types
CREATE TYPE user_role AS ENUM ('resident', 'collector', 'municipality');
CREATE TYPE collection_status AS ENUM ('PENDING', 'ASSIGNED', 'COLLECTED', 'VERIFIED', 'REJECTED', 'CANCELLED');
CREATE TYPE evidence_type AS ENUM ('RESIDENT_BEFORE', 'COLLECTOR_AFTER');
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE dumping_report_status AS ENUM ('reported', 'investigating', 'cleaned', 'false_alarm');
CREATE TYPE municipality_issue_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE municipality_issue_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- 1. users table
-- Compatible with Supabase auth.users.id
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role user_role NOT NULL DEFAULT 'resident',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. communities table
CREATE TABLE communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location GEOGRAPHY(Point, 4326),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT lat_range CHECK (latitude >= -90 AND latitude <= 90),
    CONSTRAINT lon_range CHECK (longitude >= -180 AND longitude <= 180)
);

-- Trigger to automatically synchronize geography point from lat/lng
CREATE OR REPLACE FUNCTION update_community_location()
RETURNS TRIGGER AS $$
BEGIN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_community_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON communities
FOR EACH ROW EXECUTE FUNCTION update_community_location();

-- 3. community_memberships table
CREATE TABLE community_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    membership_role VARCHAR(100) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, community_id)
);

-- 4. collection_requests table
CREATE TABLE collection_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    status collection_status NOT NULL DEFAULT 'PENDING',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 5. evidence table
CREATE TABLE evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_request_id UUID NOT NULL REFERENCES collection_requests(id) ON DELETE CASCADE,
    evidence_type evidence_type NOT NULL,
    image_url TEXT NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verification_status verification_status NOT NULL DEFAULT 'pending'
);

-- 6. verification_results table
CREATE TABLE verification_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    decision VARCHAR(255) NOT NULL,
    confidence_score NUMERIC(5, 2) NOT NULL CHECK (confidence_score >= 0.00 AND confidence_score <= 100.00),
    analysis TEXT NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. dumping_reports table
CREATE TABLE dumping_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reported_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location GEOGRAPHY(Point, 4326),
    description TEXT NOT NULL,
    status dumping_report_status NOT NULL DEFAULT 'reported',
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT report_lat_range CHECK (latitude >= -90 AND latitude <= 90),
    CONSTRAINT report_lon_range CHECK (longitude >= -180 AND longitude <= 180)
);

-- Trigger to automatically synchronize geography point for dumping reports
CREATE OR REPLACE FUNCTION update_dumping_report_location()
RETURNS TRIGGER AS $$
BEGIN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_dumping_report_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON dumping_reports
FOR EACH ROW EXECUTE FUNCTION update_dumping_report_location();

-- 8. reward_transactions table
CREATE TABLE reward_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference_type VARCHAR(100) NOT NULL,
    reference_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. community_scores table
CREATE TABLE community_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0,
    period VARCHAR(50) NOT NULL, -- e.g., '2026-W33', '2026-M08'
    breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. municipality_issues table
CREATE TABLE municipality_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    reported_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority municipality_issue_priority NOT NULL DEFAULT 'medium',
    status municipality_issue_status NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);


-- Indexes for Performance and Foreign Key Constraints
CREATE INDEX idx_users_role ON users(role);

CREATE INDEX idx_communities_location ON communities USING GIST (location);

CREATE INDEX idx_community_memberships_user ON community_memberships(user_id);
CREATE INDEX idx_community_memberships_community ON community_memberships(community_id);

CREATE INDEX idx_collection_requests_resident ON collection_requests(resident_id);
CREATE INDEX idx_collection_requests_community ON collection_requests(community_id);
CREATE INDEX idx_collection_requests_status ON collection_requests(status);

CREATE INDEX idx_evidence_request ON evidence(collection_request_id);
CREATE INDEX idx_evidence_uploaded_by ON evidence(uploaded_by);

CREATE INDEX idx_verification_results_evidence ON verification_results(evidence_id);

CREATE INDEX idx_dumping_reports_reported_by ON dumping_reports(reported_by);
CREATE INDEX idx_dumping_reports_community ON dumping_reports(community_id);
CREATE INDEX idx_dumping_reports_location ON dumping_reports USING GIST (location);
CREATE INDEX idx_dumping_reports_status ON dumping_reports(status);

CREATE INDEX idx_reward_transactions_user ON reward_transactions(user_id);

CREATE INDEX idx_community_scores_community ON community_scores(community_id);
CREATE INDEX idx_community_scores_period ON community_scores(period);

CREATE INDEX idx_municipality_issues_community ON municipality_issues(community_id);
CREATE INDEX idx_municipality_issues_reported_by ON municipality_issues(reported_by);
CREATE INDEX idx_municipality_issues_status ON municipality_issues(status);


-- Enable Row Level Security (RLS) on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE dumping_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipality_issues ENABLE ROW LEVEL SECURITY;


-- ROW LEVEL SECURITY POLICIES

-- users policies
CREATE POLICY "Users can read their own profiles"
    ON users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profiles"
    ON users FOR UPDATE
    USING (auth.uid() = id);

-- TODO: Add policy to allow municipality users to view all users
-- TODO: Add policy to allow users to view other users in the same community


-- communities policies
CREATE POLICY "Anyone can view communities"
    ON communities FOR SELECT
    USING (true);

-- TODO: Restrict insert/update/delete on communities to municipality users only


-- community_memberships policies
CREATE POLICY "Users can view memberships of their own communities"
    ON community_memberships FOR SELECT
    USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM community_memberships cm 
            WHERE cm.user_id = auth.uid() AND cm.community_id = community_memberships.community_id
        )
    );

CREATE POLICY "Users can join communities"
    ON community_memberships FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave communities"
    ON community_memberships FOR DELETE
    USING (auth.uid() = user_id);


-- collection_requests policies
CREATE POLICY "Residents can view their own collection requests"
    ON collection_requests FOR SELECT
    USING (auth.uid() = resident_id);

CREATE POLICY "Residents can insert their own collection requests"
    ON collection_requests FOR INSERT
    WITH CHECK (auth.uid() = resident_id);

-- TODO: Allow collectors to view/update collection requests assigned to their community
-- TODO: Allow municipality to view all collection requests


-- evidence policies
CREATE POLICY "Users can view evidence if they can view the collection request"
    ON evidence FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM collection_requests cr
            WHERE cr.id = evidence.collection_request_id AND (
                cr.resident_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('collector', 'municipality')
                )
            )
        )
    );

CREATE POLICY "Users can upload evidence"
    ON evidence FOR INSERT
    WITH CHECK (auth.uid() = uploaded_by);


-- verification_results policies
-- TODO: Restrict read permissions to the requesting resident, collectors, and municipality
-- TODO: Restrict write permissions to collectors (Nipun/Evidence verification module) or automated workflows


-- dumping_reports policies
CREATE POLICY "Anyone can view dumping reports"
    ON dumping_reports FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can submit dumping reports"
    ON dumping_reports FOR INSERT
    WITH CHECK (auth.uid() = reported_by);

-- TODO: Restrict status updates on dumping reports to municipality users


-- reward_transactions policies
CREATE POLICY "Users can view their own reward transactions"
    ON reward_transactions FOR SELECT
    USING (auth.uid() = user_id);

-- TODO: Prevent direct insertion of reward transactions from client side (restrict to server-side only)


-- community_scores policies
CREATE POLICY "Anyone can view community scores"
    ON community_scores FOR SELECT
    USING (true);


-- municipality_issues policies
-- TODO: Add policies based on role. Residents can view/create issues for their community, municipality can manage all.
