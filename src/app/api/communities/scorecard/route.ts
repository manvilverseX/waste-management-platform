import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse, CommunityScorecardDTO } from '@/types';

/**
 * GET /api/communities/scorecard
 * Retrieves the latest weekly community scorecard (score, period, breakdown metrics) for the authenticated resident's community.
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
      console.error('[GET /api/communities/scorecard Membership Error]:', membershipError);
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

    // 3. Fetch the most recent scorecard for the community
    const { data: scorecard, error: scorecardError } = await supabase
      .from('community_scores')
      .select('id, community_id, score, period, breakdown, calculated_at')
      .eq('community_id', communityId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (scorecardError) {
      console.error('[GET /api/communities/scorecard Scorecard Error]:', scorecardError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve community scorecard.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    if (!scorecard) {
      // Return successful response with null payload if no scorecards are calculated yet
      const response: ApiResponse<null> = {
        success: true,
        data: null,
        error: null
      };
      return NextResponse.json(response, { status: 200 });
    }

    // 4. Map DB jsonb values to typescript DTO structure
    const breakdownObj = scorecard.breakdown as any;
    const formattedData: CommunityScorecardDTO = {
      id: scorecard.id,
      communityId: scorecard.community_id,
      score: scorecard.score,
      period: scorecard.period,
      breakdown: {
        segregation: breakdownObj?.segregation || 0,
        participation: breakdownObj?.participation || 0,
        cleanliness: breakdownObj?.cleanliness || 0
      },
      calculatedAt: scorecard.calculated_at
    };

    const response: ApiResponse<CommunityScorecardDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: any) {
    console.error('[GET /api/communities/scorecard Unexpected Error]:', err);
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
