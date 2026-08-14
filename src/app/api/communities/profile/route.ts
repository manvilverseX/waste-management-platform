import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse, CommunityProfileDTO } from '@/types';

/**
 * GET /api/communities/profile
 * Retrieves community profile details (id, name, address, member count) for the authenticated resident.
 */
export async function GET(request: NextRequest) {
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
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      };
      return NextResponse.json(response, { status: 401 });
    }

    // 2. Get user community membership
    const { data: membership, error: membershipError } = await supabase
      .from('community_memberships')
      .select('community_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      console.error('[GET /api/communities/profile Membership Error]:', membershipError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve community membership.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    if (!membership) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: 'User is not registered in any community.'
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    const communityId = membership.community_id;

    // 3. Fetch community details
    const { data: community, error: communityError } = await supabase
      .from('communities')
      .select('id, name, address')
      .eq('id', communityId)
      .single();

    if (communityError || !community) {
      console.error('[GET /api/communities/profile Community Details Error]:', communityError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve community details.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 4. Count total members in the community
    const { count, error: countError } = await supabase
      .from('community_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('community_id', communityId);

    if (countError) {
      console.error('[GET /api/communities/profile Member Count Error]:', countError);
    }

    const formattedData: CommunityProfileDTO = {
      id: community.id,
      name: community.name,
      address: community.address,
      membersCount: count || 0
    };

    const response: ApiResponse<CommunityProfileDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: any) {
    console.error('[GET /api/communities/profile Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.'
      }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
