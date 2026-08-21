import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data: tips, error } = await supabase
      .from('educational_content')
      .select('id, title, content')
      .eq('type', 'tip')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        data: null,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch educational tips' }
      }, { status: 500 });
    }

    return NextResponse.json<ApiResponse<{id: string, title: string, content: string}[]>>({
      success: true,
      data: tips || [],
      error: null
    });
  } catch (err) {
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      data: null,
      error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unexpected error' }
    }, { status: 500 });
  }
}
