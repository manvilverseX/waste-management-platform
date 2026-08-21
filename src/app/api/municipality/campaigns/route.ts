import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

/**
 * GET /api/municipality/campaigns
 * Retrieves all campaigns in the platform for monitoring.
 * Restricted to municipality officers.
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

    // Verify caller is a municipality officer
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'municipality') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Access restricted to municipality officers.' }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Retrieve all campaigns
    const { data: campaigns, error: fetchErr } = await supabase
      .from('campaigns')
      .select(`
        *,
        community:communities(name),
        organizer:users(name),
        registrations:campaign_registrations(status)
      `)
      .order('campaign_date', { ascending: false });

    if (fetchErr) {
      console.error('[GET municipality campaigns DB Error]:', fetchErr);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve campaigns.' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // Process statistics
    const formatted = (campaigns || []).map((c: any) => {
      const regs = c.registrations || [];
      const registered = regs.filter((r: any) => r.status === 'registered' || r.status === 'attended').length;
      const attended = regs.filter((r: any) => r.status === 'attended').length;
      const cancelled = regs.filter((r: any) => r.status === 'cancelled').length;

      return {
        id: c.id,
        title: c.title,
        description: c.description,
        campaignDate: c.campaign_date,
        startTime: c.start_time,
        endTime: c.end_time,
        location: c.location,
        expectedParticipants: c.expected_participants,
        status: c.status,
        communityName: c.community?.name || 'Local Locality',
        organizerName: c.organizer?.name || 'Resident Organizer',
        registeredCount: registered,
        attendedCount: attended,
        cancelledCount: cancelled,
        participantPointsDistributed: attended * 100,
        organizerPointsAwarded: c.status === 'completed' ? 1000 : 0
      };
    });

    const response: ApiResponse<any[]> = {
      success: true,
      data: formatted,
      error: null
    };
    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[GET municipality campaigns Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
