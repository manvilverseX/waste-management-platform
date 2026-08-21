import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

/**
 * POST /api/campaigns/[id]/complete
 * Completes campaign atomically and awards rewards. Restricted to the organizer.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id: campaignId } = await params;

    // Retrieve campaign details to verify organizer
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

    // Verify caller is the organizer
    if (campaign.organizer_id !== user.id) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Only the campaign organizer can complete the campaign.' }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Invoke atomic complete_campaign database RPC
    const { data: rawResult, error: rpcErr } = await supabase.rpc('complete_campaign', {
      p_campaign_id: campaignId
    });

    if (rpcErr || !rawResult) {
      console.error('[POST complete RPC Error]:', rpcErr);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: rpcErr?.message || 'Failed to complete campaign atomically.' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // Format output camelCase
    // complete_campaign returns: {success, campaign_id, participants_rewarded, organizer_rewarded, participant_points, organizer_points}
    const result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;

    const formatted = {
      success: result.success,
      campaignId: result.campaign_id,
      participantsRewarded: result.participants_rewarded,
      organizerRewarded: result.organizer_rewarded,
      participantPoints: result.participant_points,
      organizerPoints: result.organizer_points
    };

    const response: ApiResponse<any> = {
      success: true,
      data: formatted,
      error: null
    };
    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[POST complete Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
