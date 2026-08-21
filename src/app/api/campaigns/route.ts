import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

/**
 * GET /api/campaigns
 * Retrieves all campaigns organized by the authenticated resident.
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

    // Fetch campaigns and join the count of registrations
    const { data: campaigns, error: fetchError } = await supabase
      .from('campaigns')
      .select(`
        *,
        registrations:campaign_registrations(count)
      `)
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('[GET /api/campaigns DB Error]:', fetchError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve campaigns.' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // Format output data to camelCase
    const formatted = (campaigns || []).map((c) => ({
      id: c.id,
      communityId: c.community_id,
      organizerId: c.organizer_id,
      title: c.title,
      description: c.description,
      campaignDate: c.campaign_date,
      startTime: c.start_time,
      endTime: c.end_time,
      location: c.location,
      expectedParticipants: c.expected_participants,
      status: c.status,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      registrationCount: c.registrations?.[0]?.count || 0
    }));

    const response: ApiResponse<any[]> = {
      success: true,
      data: formatted,
      error: null
    };
    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[GET /api/campaigns Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * POST /api/campaigns
 * Creates a new cleanliness campaign in 'draft' status.
 */
export async function POST(request: NextRequest) {
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

    // Verify user role is 'resident'
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'resident') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Only residents can launch cleanliness campaigns.' }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Fetch user's community memberships (Strict Server-Side Enforced)
    const { data: membership, error: memError } = await supabase
      .from('community_memberships')
      .select('community_id')
      .eq('user_id', user.id)
      .single();

    if (memError || !membership) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'BAD_REQUEST', message: 'You must belong to a community to launch a campaign.' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Parse and validate body
    const body = await request.json();
    const { title, description, campaignDate, startTime, endTime, location, expectedParticipants } = body;

    if (!title || !description || !campaignDate || !startTime || !endTime || !location) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Missing required campaign parameters.' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Check end time is after start time
    if (endTime <= startTime) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Campaign end time must be after the start time.' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    let parsedParticipants: number | null = null;
    if (expectedParticipants !== undefined && expectedParticipants !== '') {
      parsedParticipants = parseInt(expectedParticipants, 10);
      if (isNaN(parsedParticipants) || parsedParticipants <= 0) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: { code: 'VALIDATION_ERROR', message: 'Expected participants must be a positive integer.' }
        };
        return NextResponse.json(response, { status: 400 });
      }
    }

    // Create the campaign in 'draft' status
    const { data: newCampaign, error: createError } = await supabase
      .from('campaigns')
      .insert({
        community_id: membership.community_id,
        organizer_id: user.id,
        title,
        description,
        campaign_date: campaignDate,
        start_time: startTime,
        end_time: endTime,
        location,
        expected_participants: parsedParticipants,
        status: 'draft'
      })
      .select()
      .single();

    if (createError) {
      console.error('[POST /api/campaigns DB Error]:', createError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: createError.message || 'Failed to create campaign.' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    const response: ApiResponse<any> = {
      success: true,
      data: newCampaign,
      error: null
    };
    return NextResponse.json(response, { status: 201 });

  } catch (err: unknown) {
    console.error('[POST /api/campaigns Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
