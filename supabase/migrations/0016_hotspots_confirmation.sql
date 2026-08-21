-- 0016_hotspots_confirmation.sql
-- Adds review status, unique constraint for dumping confirmation rewards, and confirming function.

ALTER TABLE public.dumping_reports
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT 'open' CHECK (review_status IN ('open', 'confirmed', 'rejected'));

-- Drop view first to avoid PostgreSQL type change error (integer -> UUID)
DROP VIEW IF EXISTS public.dumping_hotspots;

-- Create the dumping_hotspots view to use anchor_report_id and include review_status.
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
        dr.review_status,
        ST_ClusterDBSCAN(ST_Transform(dr.location::geometry, 3857), 50.0, 1) OVER() as cluster_id
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
        (array_agg(community_id ORDER BY reported_at DESC))[1] as community_id,
        (array_agg(id ORDER BY reported_at ASC))[1] as anchor_report_id,
        CASE
            WHEN bool_or(review_status = 'confirmed') THEN 'confirmed'
            WHEN bool_or(review_status = 'rejected') THEN 'rejected'
            ELSE 'open'
        END as review_status
    FROM active_reports
    GROUP BY cluster_id
)
SELECT 
    anchor_report_id as id,
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
    END as priority,
    LEAST(100, 
      CASE 
        WHEN unique_reporters >= 7 THEN 75 + LEAST(25, (unique_reporters - 7) * 5 + total_reports)
        WHEN unique_reporters >= 4 THEN 50 + LEAST(24, (unique_reporters - 4) * 8 + total_reports)
        WHEN unique_reporters >= 2 THEN 25 + LEAST(24, (unique_reporters - 2) * 12 + total_reports)
        ELSE LEAST(24, total_reports * 5)
      END
    ) as priority_percentage,
    review_status
FROM cluster_summary;

-- Unique constraint for dumping confirmation rewards to prevent duplicate +5 points per incident per user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_dumping_confirmation
  ON public.reward_transactions (reference_type, reference_id, user_id)
  WHERE reference_type = 'dumping_confirmation';

-- Atomic database function to confirm dumping and award rewards.
CREATE OR REPLACE FUNCTION public.confirm_dumping_hotspot(p_anchor_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_lat DOUBLE PRECISION;
    v_lon DOUBLE PRECISION;
    v_loc GEOGRAPHY;
    v_community_id UUID;
    v_reporter_count INTEGER := 0;
    r RECORD;
BEGIN
    -- 1. Find the anchor report details
    SELECT latitude, longitude, location, community_id
    INTO v_lat, v_lon, v_loc, v_community_id
    FROM public.dumping_reports
    WHERE id = p_anchor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anchor report not found';
    END IF;

    -- 2. Mark all reports within 50 meters as confirmed
    UPDATE public.dumping_reports
    SET review_status = 'confirmed'
    WHERE status IN ('reported', 'investigating')
      AND ST_DWithin(location, v_loc, 50.0);

    -- 3. Award +5 reward points to each unique reporter
    FOR r IN (
        SELECT DISTINCT reported_by
        FROM public.dumping_reports
        WHERE ST_DWithin(location, v_loc, 50.0)
    ) LOOP
        INSERT INTO public.reward_transactions (user_id, points, reason, reference_type, reference_id)
        VALUES (r.reported_by, 5, 'Confirmed open dumping report', 'dumping_confirmation', p_anchor_id)
        ON CONFLICT (reference_type, reference_id, user_id) WHERE reference_type = 'dumping_confirmation' DO NOTHING;
        
        v_reporter_count := v_reporter_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'reporters_rewarded', v_reporter_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
