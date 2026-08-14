import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse, RewardTransactionDTO } from '@/types';

/**
 * GET /api/rewards
 * Retrieves the reward transactions history for the authenticated resident.
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

    // 2. Query reward transactions in database
    const { data: transactions, error: fetchError } = await supabase
      .from('reward_transactions')
      .select('id, points, reason, reference_type, reference_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('[GET /api/rewards Database Error]:', fetchError);
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

    // 3. Map snake_case database fields to camelCase DTO fields
    const formattedData: RewardTransactionDTO[] = (transactions || []).map((tx) => ({
      id: tx.id,
      points: tx.points,
      reason: tx.reason,
      referenceType: tx.reference_type,
      referenceId: tx.reference_id,
      createdAt: tx.created_at
    }));

    const response: ApiResponse<RewardTransactionDTO[]> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: any) {
    console.error('[GET /api/rewards Unexpected Error]:', err);
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
