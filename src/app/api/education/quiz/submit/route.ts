import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const supabase = createServerSupabaseClient(token);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    const body = await request.json();
    const { contentId, answer } = body;

    if (!contentId || answer === undefined) {
      return NextResponse.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'contentId and answer are required' } }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('submit_quiz_answer', {
      p_content_id: contentId,
      p_answer: answer
    });

    if (error) {
      return NextResponse.json({ success: false, data: null, error: { code: 'DATABASE_ERROR', message: error.message } }, { status: 500 });
    }

    return NextResponse.json<ApiResponse<{ isCorrect: boolean; pointsAwarded: number; correctAnswer: string }>>({
      success: true,
      data: {
        isCorrect: data.is_correct,
        pointsAwarded: Number(data.points_awarded),
        correctAnswer: data.correct_answer
      },
      error: null
    });
  } catch (err) {
    return NextResponse.json({ success: false, data: null, error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unexpected error' } }, { status: 500 });
  }
}
