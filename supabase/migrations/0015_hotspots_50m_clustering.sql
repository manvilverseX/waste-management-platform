-- 0015_hotspots_50m_clustering.sql
-- Updates the dumping_hotspots view to use a 50-meter clustering radius and calculates priority percentage.

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
    END as priority,
    LEAST(100, 
      CASE 
        WHEN unique_reporters >= 7 THEN 75 + LEAST(25, (unique_reporters - 7) * 5 + total_reports)
        WHEN unique_reporters >= 4 THEN 50 + LEAST(24, (unique_reporters - 4) * 8 + total_reports)
        WHEN unique_reporters >= 2 THEN 25 + LEAST(24, (unique_reporters - 2) * 12 + total_reports)
        ELSE LEAST(24, total_reports * 5)
      END
    ) as priority_percentage
FROM cluster_summary;
