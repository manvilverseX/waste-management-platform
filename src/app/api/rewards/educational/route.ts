import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

/**
 * POST /api/rewards/educational
 * Awards 10 reward points to the authenticated resident for daily green tip interaction.
 * Rate-limits requests to once per 24 hours per user to prevent duplicate abuse.
 */
export async function POST(request: NextRequest) {
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

    // 2. Prevent abuse: Check if the user already claimed educational points in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existingClaims, error: checkError } = await supabase
      .from('reward_transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('reference_type', 'educational')
      .gt('created_at', oneDayAgo)
      .limit(1);

    if (checkError) {
      console.error('[POST /api/rewards/educational Check Error]:', checkError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to verify transaction history.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    if (existingClaims && existingClaims.length > 0) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'LIMIT_EXCEEDED',
          message: 'You have already claimed your educational points for today. Check back tomorrow!'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // 3. Award 10 points
    const { error: insertError } = await supabase
      .from('reward_transactions')
      .insert({
        user_id: user.id,
        points: 10,
        reason: 'Completed daily green tip activity',
        reference_type: 'educational'
      });

    if (insertError) {
      console.error('[POST /api/rewards/educational Insert Error]:', insertError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to award reward points.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    const response: ApiResponse<{ pointsAwarded: number }> = {
      success: true,
      data: { pointsAwarded: 10 },
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[POST /api/rewards/educational Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'An unexpected error occurred.'
      }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
