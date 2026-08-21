import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const supabase = createServerSupabaseClient(token);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }

    // Check how many questions attempted today
    const { count, error: countErr } = await supabase
      .from('quiz_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('attempt_date', new Date().toISOString().split('T')[0]);

    if (countErr) {
      return NextResponse.json({ success: false, data: null, error: { code: 'DATABASE_ERROR', message: 'Failed to check attempts' } }, { status: 500 });
    }

    const attemptsToday = count || 0;
    const remainingAttempts = Math.max(0, 5 - attemptsToday);

    if (remainingAttempts === 0) {
      return NextResponse.json<ApiResponse<{ questions: never[]; remainingAttempts: number }>>({
        success: true,
        data: { questions: [], remainingAttempts: 0 },
        error: null
      });
    }

    // Fetch questions not yet attempted by this user
    // We can do this efficiently using a NOT IN subquery or a left join
    // Supabase JS doesn't support complex NOT IN natively without RPC,
    // but we can fetch a pool of questions, fetch user's attempts, and filter in memory since the dataset is small.
    const { data: allQuestions, error: qErr } = await supabase
      .from('educational_content')
      .select('id, type, title, content, options')
      .eq('type', 'quiz_mcq');

    if (qErr) {
      return NextResponse.json({ success: false, data: null, error: { code: 'DATABASE_ERROR', message: 'Failed to fetch questions' } }, { status: 500 });
    }

    const { data: userAttempts, error: aErr } = await supabase
      .from('quiz_attempts')
      .select('content_id')
      .eq('user_id', user.id);

    if (aErr) {
      return NextResponse.json({ success: false, data: null, error: { code: 'DATABASE_ERROR', message: 'Failed to fetch attempts' } }, { status: 500 });
    }

    const attemptedIds = new Set(userAttempts?.map(a => a.content_id) || []);

    // Shuffle and pick up to `remainingAttempts` unanswered questions
    const unanswered = allQuestions?.filter(q => !attemptedIds.has(q.id)) || [];
    const shuffled = unanswered.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, remainingAttempts);

    return NextResponse.json<ApiResponse<{ questions: typeof selected; remainingAttempts: number }>>({
      success: true,
      data: {
        questions: selected,
        remainingAttempts
      },
      error: null
    });
  } catch (err) {
    return NextResponse.json({ success: false, data: null, error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unexpected error' } }, { status: 500 });
  }
}
