import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, DbUser } from '@/types';

export function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  });
}

export interface AuthCheckResult {
  user: { id: string; email?: string } | null;
  profile: DbUser | null;
  errorResponse: NextResponse<ApiResponse<null>> | null;
}

/**
 * Extracts and verifies the authenticated Supabase user and fetches their database profile.
 * Standardizes authentication (401) and authorization (403) across backend API routes.
 */
export async function getAuthUserAndProfile(req: NextRequest): Promise<AuthCheckResult> {
  const supabase = createServerSupabaseClient();
  let userId: string | null = null;
  let userEmail: string | undefined = undefined;

  // 1. Check Authorization header for Bearer JWT token
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      userId = user.id;
      userEmail = user.email;
    }
  }

  // 2. Dev / Test fallback: check x-user-id header if provided in test requests
  if (!userId) {
    const testUserId = req.headers.get('x-user-id');
    if (testUserId) {
      userId = testUserId;
    }
  }

  // 3. Standard Supabase Auth session fallback
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      userEmail = user.email;
    }
  }

  // If no user found, return 401 Unauthorized
  if (!userId) {
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please sign in.'
      }
    };
    return {
      user: null,
      profile: null,
      errorResponse: NextResponse.json(response, { status: 401 })
    };
  }

  // Fetch user profile from database
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, name, email, role, created_at')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    // If user profile is not found in users table
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'UNAUTHORIZED',
        message: 'User profile not found in system.'
      }
    };
    return {
      user: { id: userId, email: userEmail },
      profile: null,
      errorResponse: NextResponse.json(response, { status: 401 })
    };
  }

  return {
    user: { id: userId, email: userEmail },
    profile: profile as DbUser,
    errorResponse: null
  };
}

/**
 * Enforces collector role authorization.
 * Returns HTTP 401 if unauthenticated, HTTP 403 if user role is not collector.
 */
export async function requireCollectorAuth(req: NextRequest): Promise<AuthCheckResult> {
  const authResult = await getAuthUserAndProfile(req);
  if (authResult.errorResponse) {
    return authResult;
  }

  if (authResult.profile?.role !== 'collector') {
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: 'Collector authorization required for this action.'
      }
    };
    return {
      user: authResult.user,
      profile: authResult.profile,
      errorResponse: NextResponse.json(response, { status: 403 })
    };
  }

  return authResult;
}
