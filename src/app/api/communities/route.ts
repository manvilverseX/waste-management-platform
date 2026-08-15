import { NextResponse } from 'next/server';
import { createServerSupabaseAnonClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

export async function GET() {
  try {
    const supabase = createServerSupabaseAnonClient();
    
    // Fetch only the ID and Name of each community
    const { data: communities, error } = await supabase
      .from('communities')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) {
      console.error('[GET /api/communities Error]:', error);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve communities.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    const response: ApiResponse<Array<{ id: string; name: string }>> = {
      success: true,
      data: communities || [],
      error: null
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err: unknown) {
    console.error('[GET /api/communities Unexpected Error]:', err);
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
