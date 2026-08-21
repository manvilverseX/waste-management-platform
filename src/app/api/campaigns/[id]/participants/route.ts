import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

/**
 * GET /api/campaigns/[id]/participants
 * Retrieves all registrations for the specified campaign.
 * Restricted to the campaign organizer.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    // Retrieve campaign details to verify owner
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
        error: { code: 'FORBIDDEN', message: 'Only the organizer can manage attendance.' }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Retrieve participant registrations
    const { data: registrations, error: fetchErr } = await supabase
      .from('campaign_registrations')
      .select(`
        id,
        campaign_id,
        user_id,
        registered_at,
        status,
        user:users(name)
      `)
      .eq('campaign_id', campaignId)
      .order('registered_at', { ascending: true });

    if (fetchErr) {
      console.error('[GET participants DB Error]:', fetchErr);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve participants.' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // Format output to camelCase
    const formatted = (registrations || []).map((r: any) => ({
      id: r.id,
      campaignId: r.campaign_id,
      userId: r.user_id,
      registeredAt: r.registered_at,
      status: r.status,
      userName: r.user?.name || 'Resident Member'
    }));

    const response: ApiResponse<any[]> = {
      success: true,
      data: formatted,
      error: null
    };
    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[GET participants Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
