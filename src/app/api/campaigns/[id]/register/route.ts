import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

/**
 * POST /api/campaigns/[id]/register
 * Registers the authenticated resident for the campaign.
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

    // Verify resident role
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'resident') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Only residents can register for campaigns.' }
      };
      return NextResponse.json(response, { status: 403 });
    }

    const { id: campaignId } = await params;

    // Retrieve campaign details
    const { data: campaign, error: getErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (getErr || !campaign) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Campaign not found.' }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Verify campaign is registration_open
    if (campaign.status !== 'registration_open') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'BAD_REQUEST', message: 'Registration is not open for this campaign.' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Verify community membership (Trigger checks it too, but we can verify it here for clean response)
    const { data: membership } = await supabase
      .from('community_memberships')
      .select('*')
      .eq('user_id', user.id)
      .eq('community_id', campaign.community_id)
      .single();

    if (!membership) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'You must belong to the campaign\'s community to register.' }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Check if registration already exists (regardless of status, e.g., if cancelled, we can reactive it or prevent it)
    const { data: existingReg } = await supabase
      .from('campaign_registrations')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (existingReg) {
      if (existingReg.status === 'registered') {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: { code: 'CONFLICT', message: 'You are already registered for this campaign.' }
        };
        return NextResponse.json(response, { status: 409 });
      } else {
        // If it was cancelled, we can reactivate it back to 'registered'
        const { data: updatedReg, error: reactivateErr } = await supabase
          .from('campaign_registrations')
          .update({ status: 'registered', registered_at: new Date().toISOString() })
          .eq('id', existingReg.id)
          .select()
          .single();

        if (reactivateErr) {
          const response: ApiResponse<null> = {
            success: false,
            data: null,
            error: { code: 'DATABASE_ERROR', message: 'Failed to reactivate registration.' }
          };
          return NextResponse.json(response, { status: 500 });
        }

        const response: ApiResponse<any> = {
          success: true,
          data: updatedReg,
          error: null
        };
        return NextResponse.json(response, { status: 200 });
      }
    }

    // Insert new registration
    const { data: newReg, error: regError } = await supabase
      .from('campaign_registrations')
      .insert({
        campaign_id: campaignId,
        user_id: user.id,
        status: 'registered'
      })
      .select()
      .single();

    if (regError) {
      console.error('[POST register DB Error]:', regError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: regError.message || 'Failed to complete registration.' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    const response: ApiResponse<any> = {
      success: true,
      data: newReg,
      error: null
    };
    return NextResponse.json(response, { status: 201 });

  } catch (err: unknown) {
    console.error('[POST register Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * PATCH /api/campaigns/[id]/register
 * Cancels registration.
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

    const { id: campaignId } = await params;
    const body = await request.json();
    const { status } = body;

    if (status !== 'cancelled') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Only transition to cancelled is allowed.' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Fetch campaign details to verify state
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

    // Verify campaign is active
    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'BAD_REQUEST', message: 'Registration cannot be cancelled for a completed or cancelled campaign.' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Fetch existing registration
    const { data: registration, error: regErr } = await supabase
      .from('campaign_registrations')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (regErr || !registration) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Registration not found.' }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Perform status update to cancelled
    const { data: updated, error: updateError } = await supabase
      .from('campaign_registrations')
      .update({ status: 'cancelled' })
      .eq('id', registration.id)
      .select()
      .single();

    if (updateError) {
      console.error('[PATCH register DB Error]:', updateError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: 'Failed to cancel campaign registration.' }
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
    console.error('[PATCH register Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
