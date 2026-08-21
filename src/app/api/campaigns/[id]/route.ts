import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

/**
 * PATCH /api/campaigns/[id]
 * Updates campaign status. Restricts status updates to the organizer.
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
    const { status } = body;

    const validStatuses = ['draft', 'published', 'registration_open', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid campaign status provided.' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Retrieve original campaign to verify ownership
    const { data: campaign, error: getErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (getErr || !campaign) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Campaign not found.' }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Verify ownership
    if (campaign.organizer_id !== user.id) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'You are not authorized to manage this campaign.' }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // API level lifecycle transition rule: draft campaigns cannot be cancelled directly
    if (status === 'cancelled' && campaign.status === 'draft') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Draft campaigns cannot be cancelled. Publish them first.' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Update the campaign status (this triggers Postgres trg_campaign_status_transition)
    const { data: updatedCampaign, error: updateError } = await supabase
      .from('campaigns')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[PATCH /api/campaigns/[id] DB Error]:', updateError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: updateError.message || 'Failed to update campaign status.' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    const response: ApiResponse<any> = {
      success: true,
      data: updatedCampaign,
      error: null
    };
    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[PATCH /api/campaigns/[id] Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
