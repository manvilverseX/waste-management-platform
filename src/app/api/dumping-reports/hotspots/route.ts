import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    const supabase = createServerSupabaseClient(token);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Authentication is required.' }
      };
      return NextResponse.json(response, { status: 401 });
    }

    // Verify user role is 'municipality'
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || userData?.role !== 'municipality') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Only municipality administrators can access hotspot alerts.' }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Query active hotspots from public.dumping_hotspots
    const { data: hotspots, error: hotspotsError } = await supabase
      .from('dumping_hotspots')
      .select(`
        id,
        unique_reporters,
        total_reports,
        latitude,
        longitude,
        latest_report_at,
        representative_image,
        latest_description,
        community_id,
        priority,
        priority_percentage,
        review_status
      `)
      .order('latest_report_at', { ascending: false });

    if (hotspotsError) {
      console.error('[GET /api/dumping-reports/hotspots DB Error]:', hotspotsError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve hotspots.' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // Fetch communities to map community names
    const { data: communities } = await supabase
      .from('communities')
      .select('id, name');

    const formattedHotspots = (hotspots || []).map((h) => {
      const communityName = communities?.find(c => c.id === h.community_id)?.name || 'Unknown Community';
      return {
        id: h.id,
        uniqueReporters: h.unique_reporters,
        unique_reporters: h.unique_reporters,
        totalReports: h.total_reports,
        total_reports: h.total_reports,
        latitude: h.latitude,
        longitude: h.longitude,
        latestReportAt: h.latest_report_at,
        representativeImage: h.representative_image,
        latestDescription: h.latest_description,
        communityId: h.community_id,
        communityName,
        priority: h.priority,
        priorityLevel: h.priority,
        priority_level: h.priority,
        priorityPercentage: h.priority_percentage,
        priority_percentage: h.priority_percentage,
        reviewStatus: h.review_status,
        review_status: h.review_status
      };
    });

    const response: ApiResponse<any[]> = {
      success: true,
      data: formattedHotspots,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[GET /api/dumping-reports/hotspots Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
