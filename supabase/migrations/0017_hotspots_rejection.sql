-- 0017_hotspots_rejection.sql
-- Adds rejection flow support for dumping hotspots, handles mutual exclusion and idempotency.

-- Drop view first to avoid PostgreSQL type change error when modifying view queries
DROP VIEW IF EXISTS public.dumping_hotspots;

-- Recreate view to exclude reports with review_status = 'rejected'
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
    WHERE dr.status IN ('reported', 'investigating') 
      AND dr.location IS NOT NULL
      AND (dr.review_status IS NULL OR dr.review_status != 'rejected')
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

-- Recreate confirm_dumping_hotspot to block confirmation if already rejected
CREATE OR REPLACE FUNCTION public.confirm_dumping_hotspot(p_anchor_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_lat DOUBLE PRECISION;
    v_lon DOUBLE PRECISION;
    v_loc GEOGRAPHY;
    v_community_id UUID;
    v_review_status VARCHAR(50);
    v_reporter_count INTEGER := 0;
    r RECORD;
BEGIN
    -- 1. Find the anchor report details
    SELECT latitude, longitude, location, community_id, review_status
    INTO v_lat, v_lon, v_loc, v_community_id, v_review_status
    FROM public.dumping_reports
    WHERE id = p_anchor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anchor report not found';
    END IF;

    -- 2. Mutual exclusion check
    IF v_review_status = 'rejected' THEN
        RAISE EXCEPTION 'Cannot confirm a rejected hotspot';
    END IF;

    -- 3. Mark all reports within 50 meters as confirmed
    UPDATE public.dumping_reports
    SET review_status = 'confirmed'
    WHERE status IN ('reported', 'investigating')
      AND ST_DWithin(location, v_loc, 50.0);

    -- 4. Award +5 reward points to each unique reporter
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

-- Stored procedure to atomically reject open dumping hotspots (idempotent, mutually exclusive)
CREATE OR REPLACE FUNCTION public.reject_dumping_hotspot(p_anchor_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_lat DOUBLE PRECISION;
    v_lon DOUBLE PRECISION;
    v_loc GEOGRAPHY;
    v_review_status VARCHAR(50);
BEGIN
    -- 1. Find the anchor report details
    SELECT latitude, longitude, location, review_status
    INTO v_lat, v_lon, v_loc, v_review_status
    FROM public.dumping_reports
    WHERE id = p_anchor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anchor report not found';
    END IF;

    -- 2. Mutual exclusion check
    IF v_review_status = 'confirmed' THEN
        RAISE EXCEPTION 'Cannot reject a confirmed hotspot';
    END IF;

    -- 3. Idempotency check: if already rejected, return successful no-op
    IF v_review_status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_rejected', true
        );
    END IF;

    -- 4. Mark all reports within 50 meters as rejected
    UPDATE public.dumping_reports
    SET review_status = 'rejected'
    WHERE status IN ('reported', 'investigating')
      AND ST_DWithin(location, v_loc, 50.0);

    RETURN jsonb_build_object(
        'success', true,
        'already_rejected', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
