import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

/**
 * POST /api/dumping-reports/reject
 * Rejects an illegal dumping hotspot as false alarm and awards 0 rewards.
 * Restricted to municipality administrators.
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
        error: { code: 'UNAUTHORIZED', message: 'Authentication is required.' }
      };
      return NextResponse.json(response, { status: 401 });
    }

    // 2. Verify user role is 'municipality'
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || userData?.role !== 'municipality') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Only municipality administrators can reject dumping hotspots.' }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // 3. Parse request body
    const body = await request.json();
    const { hotspotId } = body;

    if (!hotspotId) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Missing hotspotId parameter.' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // 4. Call database stored procedure
    const { data, error: rpcError } = await supabase.rpc('reject_dumping_hotspot', {
      p_anchor_id: hotspotId
    });

    if (rpcError) {
      console.error('[POST /api/dumping-reports/reject Stored Procedure Error]:', rpcError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: rpcError.message || 'Failed to execute rejection.' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    const response: ApiResponse<any> = {
      success: true,
      data,
      error: null
    };
    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[POST /api/dumping-reports/reject Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
