import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseAnonClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required.'
        }
      }, { status: 400 });
    }

    const supabase = createServerSupabaseAnonClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: error?.message || 'Invalid email or password.'
        }
      }, { status: 401 });
    }

    // Fetch user profile to determine role
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.session.user.id)
      .single();

    const role = userData?.role || 'resident';

    return NextResponse.json({
      success: true,
      data: {
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          user: {
            id: data.session.user.id,
            email: data.session.user.email,
            name: data.session.user.user_metadata?.name || data.session.user.email?.split('@')[0] || '',
          }
        },
        role
      }
    });

  } catch (err: unknown) {
    console.error('[Login API Unexpected Error]:', err);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'An unexpected error occurred during login.'
      }
    }, { status: 500 });
  }
}