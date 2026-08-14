import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse, RewardSummaryDTO } from '@/types';

/**
 * GET /api/rewards/summary
 * Retrieves the rewards summary (balance, lifetime points, and community rank) for the authenticated resident.
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

    // 2. Fetch authenticated user's transactions to calculate balancePoints and lifetimePoints
    const { data: userTransactions, error: txError } = await supabase
      .from('reward_transactions')
      .select('points')
      .eq('user_id', user.id);

    if (txError) {
      console.error('[GET /api/rewards/summary Database Error]:', txError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve reward transactions.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    const balancePoints = (userTransactions || []).reduce((sum, tx) => sum + tx.points, 0);
    const lifetimePoints = (userTransactions || []).filter(tx => tx.points > 0).reduce((sum, tx) => sum + tx.points, 0);

    // 3. Determine community rank
    let rank: number | null = null;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      console.warn(
        '[GET /api/rewards/summary]: SUPABASE_SERVICE_ROLE_KEY is not defined in local environment variables. ' +
        'Community ranking cannot be computed due to database RLS policies. Defaulting rank to null.'
      );
      rank = null;
    } else {
      // Fetch community membership using user's token
      const { data: membership, error: memberError } = await supabase
        .from('community_memberships')
        .select('community_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberError) {
        console.error('[GET /api/rewards/summary Membership Error]:', memberError);
      } else if (membership) {
        const communityId = membership.community_id;

        // Instantiate admin client (without token argument) to bypass RLS
        const adminSupabase = createServerSupabaseClient();

        // Get all members of the same community
        const { data: members, error: membersError } = await adminSupabase
          .from('community_memberships')
          .select('user_id')
          .eq('community_id', communityId);

        if (membersError) {
          console.error('[GET /api/rewards/summary Members List Error]:', membersError);
        } else if (members && members.length > 0) {
          const memberIds = members.map(m => m.user_id);

          // Get all transactions for these community members
          const { data: allTxs, error: allTxsError } = await adminSupabase
            .from('reward_transactions')
            .select('user_id, points')
            .in('user_id', memberIds);

          if (allTxsError) {
            console.error('[GET /api/rewards/summary All Transactions Error]:', allTxsError);
          } else {
            // Aggregate points per member
            const pointsMap = new Map<string, number>();
            memberIds.forEach(id => pointsMap.set(id, 0));

            if (allTxs) {
              for (const tx of allTxs) {
                const current = pointsMap.get(tx.user_id) || 0;
                pointsMap.set(tx.user_id, current + tx.points);
              }
            }

            // Sort members by points descending
            const sortedMembers = Array.from(pointsMap.entries()).sort((a, b) => b[1] - a[1]);

            // Find authenticated user's 1-based rank
            const rankIndex = sortedMembers.findIndex(m => m[0] === user.id);
            if (rankIndex !== -1) {
              rank = rankIndex + 1;
            }
          }
        }
      }
    }

    const summaryData: RewardSummaryDTO = {
      balancePoints,
      lifetimePoints,
      rank
    };

    const response: ApiResponse<RewardSummaryDTO> = {
      success: true,
      data: summaryData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: any) {
    console.error('[GET /api/rewards/summary Unexpected Error]:', err);
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
