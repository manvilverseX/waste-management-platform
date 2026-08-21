import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

/**
 * PATCH /api/notifications/[id]
 * Marks a notification as read.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
    const body = await request.json();
    const { isRead } = body;

    if (isRead !== true) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Only setting isRead to true is supported.' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Retrieve original notification to verify ownership
    const { data: notification, error: getErr } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', id)
      .single();

    if (getErr || !notification) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Notification not found.' }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Verify ownership
    if (notification.user_id !== user.id) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'You are not authorized to access this notification.' }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Update
    const { data: updated, error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[PATCH /api/notifications/[id] DB Error]:', updateError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update notification state.' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    const response: ApiResponse<any> = {
      success: true,
      data: updated,
      error: null
    };
    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[PATCH /api/notifications/[id] Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
