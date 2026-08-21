-- 1. Alter public.evidence table to support GPS metadata
ALTER TABLE public.evidence ADD COLUMN latitude DOUBLE PRECISION;
ALTER TABLE public.evidence ADD COLUMN longitude DOUBLE PRECISION;
ALTER TABLE public.evidence ADD COLUMN gps_accuracy DOUBLE PRECISION;
ALTER TABLE public.evidence ADD COLUMN gps_captured_at TIMESTAMPTZ;
ALTER TABLE public.evidence ADD COLUMN location GEOGRAPHY(Point, 4326);

CREATE INDEX idx_evidence_location ON public.evidence USING GIST (location);

-- Trigger to automatically synchronize geography point for evidence photos
CREATE OR REPLACE FUNCTION public.update_evidence_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    ELSE
        NEW.location := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_evidence_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.evidence
FOR EACH ROW EXECUTE FUNCTION update_evidence_location();


-- 2. Alter public.dumping_reports to capture accuracy and timestamp
ALTER TABLE public.dumping_reports ADD COLUMN gps_accuracy DOUBLE PRECISION;
ALTER TABLE public.dumping_reports ADD COLUMN gps_captured_at TIMESTAMPTZ;


-- 3. Alter public.verification_results to log GPS verification audits
ALTER TABLE public.verification_results ADD COLUMN gps_distance DOUBLE PRECISION;
ALTER TABLE public.verification_results ADD COLUMN gps_decision VARCHAR(50);


-- 4. Create the public.dumping_hotspots view using PostGIS ST_ClusterDBSCAN
CREATE OR REPLACE VIEW public.dumping_hotspots AS
WITH active_reports AS (
    SELECT 
        dr.id,
        dr.reported_by,
        dr.community_id,
        dr.image_url,
        dr.latitude,
        dr.longitude,
        dr.location,
        dr.description,
        dr.status,
        dr.reported_at,
        dr.gps_accuracy,
        dr.gps_captured_at,
        ST_ClusterDBSCAN(ST_Transform(dr.location::geometry, 3857), 100.0, 1) OVER() as cluster_id
    FROM public.dumping_reports dr
    WHERE dr.status IN ('reported', 'investigating') AND dr.location IS NOT NULL
),
cluster_summary AS (
    SELECT 
        cluster_id,
        count(DISTINCT reported_by) as unique_reporters,
        count(id) as total_reports,
        ST_Centroid(ST_Union(location::geometry))::geography as centroid,
        max(reported_at) as latest_report_at,
        (array_agg(image_url ORDER BY reported_at DESC))[1] as representative_image,
        (array_agg(description ORDER BY reported_at DESC))[1] as latest_description,
        (array_agg(community_id ORDER BY reported_at DESC))[1] as community_id
    FROM active_reports
    GROUP BY cluster_id
)
SELECT 
    cluster_id as id,
    unique_reporters,
    total_reports,
    ST_Y(centroid::geometry) as latitude,
    ST_X(centroid::geometry) as longitude,
    centroid as location,
    latest_report_at,
    representative_image,
    latest_description,
    community_id,
    CASE 
        WHEN unique_reporters >= 7 THEN 'critical'::public.municipality_issue_priority
        WHEN unique_reporters >= 4 THEN 'high'::public.municipality_issue_priority
        WHEN unique_reporters >= 2 THEN 'medium'::public.municipality_issue_priority
        ELSE 'low'::public.municipality_issue_priority
    END as priority
FROM cluster_summary;
