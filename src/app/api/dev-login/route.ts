import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServerSupabaseAnonClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development' && process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN_IN_PROD !== 'true') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 });
  }

  try {
    let role: 'resident' | 'collector' | 'municipality' = 'resident';
    try {
      const body = await request.json();
      if (body?.role === 'collector') {
        role = 'collector';
      } else if (body?.role === 'municipality') {
        role = 'municipality';
      }
    } catch {
      // Default to resident if request body is empty or invalid JSON
    }

    let email = 'resident-test@ecoclean.com';
    if (role === 'collector') {
      email = 'collector-test@ecoclean.com';
    } else if (role === 'municipality') {
      email = 'municipality-test@ecoclean.com';
    }

    let password = process.env.TEST_RESIDENT_PASSWORD || 'TempPass999!';
    if (role === 'collector') {
      password = process.env.TEST_COLLECTOR_PASSWORD || 'TempPass999!';
    } else if (role === 'municipality') {
      password = process.env.TEST_MUNICIPALITY_PASSWORD || 'TempPass999!';
    }

    const supabaseAdmin = createServerSupabaseClient(); // Privileged service role client

    // 1. Verify and bootstrap profile if missing
    const { data: profile, error: profileFetchError } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('email', email)
      .maybeSingle();

    if (profileFetchError) {
      console.error('[dev-login] Error fetching user profile:', profileFetchError);
    }

    let targetUserId = profile?.id;

    if (!profile) {
      console.log(`[dev-login] Bootstrapping test user: ${email} (${role})`);
      
      // Create user in Auth
      const { data: authData, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      if (authCreateError || !authData.user) {
        console.error('[dev-login] Failed to bootstrap auth user:', authCreateError);
        return NextResponse.json({ error: authCreateError?.message || 'Failed to create auth user.' }, { status: 500 });
      }

      const userId = authData.user.id;
      targetUserId = userId;

      let name = 'Test Resident';
      if (role === 'collector') {
        name = 'Test Collector';
      } else if (role === 'municipality') {
        name = 'Test Municipality';
      }

      // Insert user profile into public.users
      const { error: userInsertError } = await supabaseAdmin
        .from('users')
        .insert({
          id: userId,
          name,
          email,
          role
        });

      if (userInsertError) {
        console.error('[dev-login] Failed to insert profile row:', userInsertError);
        return NextResponse.json({ error: 'Failed to insert user profile.' }, { status: 500 });
      }
    }

    // Ensure the user has community membership
    if (targetUserId) {
      const { data: memberRecord } = await supabaseAdmin
        .from('community_memberships')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('community_id', 'eb888dee-4b1e-4c65-8ffa-351783fd06d1')
        .maybeSingle();

      if (!memberRecord) {
        const { error: membershipError } = await supabaseAdmin
          .from('community_memberships')
          .insert({
            user_id: targetUserId,
            community_id: 'eb888dee-4b1e-4c65-8ffa-351783fd06d1',
            membership_role: 'member'
          });

        if (membershipError) {
          console.error('[dev-login] Failed to assign community membership:', membershipError);
        }
      }
    }

    // 2. Perform regular sign in using Anon client
    const supabaseAnon = createServerSupabaseAnonClient();
    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return NextResponse.json({ error: error?.message || 'Login failed' }, { status: 401 });
    }

    return NextResponse.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
