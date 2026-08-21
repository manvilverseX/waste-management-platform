import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createDumpingReportSchema } from '@/lib/validations/resident';
import { ApiResponse, DumpingReportDTO } from '@/types';

/**
 * POST /api/dumping-reports
 * Allows authenticated residents to submit a new illegal dumping report.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user using Authorization Bearer token
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    const supabase = createServerSupabaseClient(token);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      };
      return NextResponse.json(response, { status: 401 });
    }

    // 2. Validate request body
    const body = await request.json();
    const validationResult = createDumpingReportSchema.safeParse(body);
    if (!validationResult.success) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: validationResult.error.issues[0]?.message || 'Invalid request body.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { imageUrl, latitude, longitude, description, gpsAccuracy, gpsCapturedAt } = validationResult.data;

    // 3. Verify user is in a community
    const { data: membership, error: membershipError } = await supabase
      .from('community_memberships')
      .select('community_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'You must belong to a community to file a dumping report.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    const communityId = membership.community_id;

    // 4. Insert new dumping report
    const { data: newReport, error: insertError } = await supabase
      .from('dumping_reports')
      .insert({
        reported_by: user.id,
        community_id: communityId,
        image_url: imageUrl,
        latitude,
        longitude,
        description,
        status: 'reported',
        gps_accuracy: gpsAccuracy,
        gps_captured_at: gpsCapturedAt
      })
      .select('id, reported_by, community_id, image_url, latitude, longitude, description, status, reported_at, gps_accuracy, gps_captured_at')
      .single();

    if (insertError || !newReport) {
      console.error('[POST /api/dumping-reports Database Error]:', insertError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to create dumping report.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 5. Format to DTO
    const formattedData: DumpingReportDTO = {
      id: newReport.id,
      reportedBy: newReport.reported_by,
      communityId: newReport.community_id,
      imageUrl: newReport.image_url,
      latitude: newReport.latitude,
      longitude: newReport.longitude,
      description: newReport.description,
      status: newReport.status as any,
      reportedAt: newReport.reported_at,
      gpsAccuracy: newReport.gps_accuracy,
      gpsCapturedAt: newReport.gps_captured_at
    };

    const response: ApiResponse<DumpingReportDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 201 });

  } catch (err: any) {
    console.error('[POST /api/dumping-reports Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.'
      }
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * GET /api/dumping-reports
 * Retrieves community-wide dumping reports.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user using Authorization Bearer token
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    const supabase = createServerSupabaseClient(token);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      };
      return NextResponse.json(response, { status: 401 });
    }

    // 2. Fetch user role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const isMunicipality = userData?.role === 'municipality';

    // 3. Get user community membership
    const { data: membership, error: membershipError } = await supabase
      .from('community_memberships')
      .select('community_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'You must belong to a community to view dumping reports.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    const communityId = membership.community_id;

    // 4. Fetch community dumping reports
    const { data: reports, error: fetchError } = await supabase
      .from('dumping_reports')
      .select('id, reported_by, community_id, image_url, latitude, longitude, description, status, reported_at, gps_accuracy, gps_captured_at')
      .eq('community_id', communityId)
      .order('reported_at', { ascending: false });

    if (fetchError) {
      console.error('[GET /api/dumping-reports Database Error]:', fetchError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve dumping reports.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 5. Format to DTO list with privacy masking
    const formattedData: DumpingReportDTO[] = (reports || []).map((report) => {
      const isOwner = report.reported_by === user.id;
      const canAccessExactCoords = isMunicipality || isOwner;

      return {
        id: report.id,
        reportedBy: report.reported_by,
        communityId: report.community_id,
        imageUrl: report.image_url,
        latitude: canAccessExactCoords ? report.latitude : null,
        longitude: canAccessExactCoords ? report.longitude : null,
        description: report.description,
        status: report.status as any,
        reportedAt: report.reported_at,
        gpsAccuracy: canAccessExactCoords ? report.gps_accuracy : null,
        gpsCapturedAt: canAccessExactCoords ? report.gps_captured_at : null
      };
    });

    const response: ApiResponse<DumpingReportDTO[]> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: any) {
    console.error('[GET /api/dumping-reports Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.'
      }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
