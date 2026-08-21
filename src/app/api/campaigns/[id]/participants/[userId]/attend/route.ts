import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

/**
 * POST /api/campaigns/[id]/participants/[userId]/attend
 * Marks a participant as attended. Restricted to the organizer.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
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

    const { id: campaignId, userId: participantUserId } = await params;

    // Retrieve campaign details to verify ownership and lifecycle state
    const { data: campaign, error: campErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campErr || !campaign) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Campaign not found.' }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Verify caller is organizer
    if (campaign.organizer_id !== user.id) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Only the campaign organizer can modify attendance.' }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Reject attendance updates if campaign is completed or cancelled
    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'BAD_REQUEST', message: 'Attendance cannot be modified after campaign completion or cancellation.' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Retrieve registration details
    const { data: registration, error: regErr } = await supabase
      .from('campaign_registrations')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('user_id', participantUserId)
      .single();

    if (regErr || !registration) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Participant registration not found.' }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Reject if cancelled
    if (registration.status === 'cancelled') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'BAD_REQUEST', message: 'Cancelled registrations cannot be marked attended.' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Update status to attended
    const { data: updated, error: updateErr } = await supabase
      .from('campaign_registrations')
      .update({ status: 'attended' })
      .eq('id', registration.id)
      .select()
      .single();

    if (updateErr) {
      console.error('[POST attend update DB Error]:', updateErr);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update attendance status.' }
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
    console.error('[POST attend Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
