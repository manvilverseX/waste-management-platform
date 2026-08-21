import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

/**
 * GET /api/notifications
 * Retrieves notifications for the authenticated user.
 */
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

    const { data: notifications, error: fetchError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('[GET /api/notifications DB Error]:', fetchError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve notifications.' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // Format output data to camelCase
    const formatted = (notifications || []).map((n) => ({
      id: n.id,
      userId: n.user_id,
      type: n.type,
      title: n.title,
      message: n.message,
      referenceType: n.reference_type,
      referenceId: n.reference_id,
      isRead: n.is_read,
      createdAt: n.created_at
    }));

    const response: ApiResponse<any[]> = {
      success: true,
      data: formatted,
      error: null
    };
    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[GET /api/notifications Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
