import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServerSupabaseAnonClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development' && process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN_IN_PROD !== 'true') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 });
  }

  try {
    let role: 'resident' | 'collector' | 'municipality' = 'resident';
    let communityId = 'eb888dee-4b1e-4c65-8ffa-351783fd06d1'; // Default: Maplewood District
    let userIndex = 1;

    try {
      const body = await request.json();
      if (body?.role === 'collector') {
        role = 'collector';
      } else if (body?.role === 'municipality') {
        role = 'municipality';
      }
      if (body?.communityId) {
        communityId = body.communityId;
      }
      if (typeof body?.userIndex === 'number') {
        userIndex = body.userIndex;
      }
    } catch {
      // Default to values if body is empty/invalid
    }

    // Determine target email and name
    let email = '';
    let name = '';

    if (role === 'municipality') {
      email = 'municipality-test@ecoclean.com';
      name = 'Municipality Admin';
    } else {
      // Determine prefix based on community
      let prefix = '';
      if (communityId === 'a1888dee-4b1e-4c65-8ffa-351783fd06d0') {
        prefix = 'purvankara';
      } else if (communityId === 'b1888dee-4b1e-4c65-8ffa-351783fd06d1') {
        prefix = 'prestige';
      } else if (communityId === 'c1888dee-4b1e-4c65-8ffa-351783fd06d2') {
        prefix = 'concord';
      } else {
        prefix = 'maplewood';
      }

      if (role === 'resident') {
        // Support legacy resident-test@ecoclean.com
        if (prefix === 'maplewood' && userIndex === 1) {
          email = 'resident-test@ecoclean.com';
          name = 'Test Resident';
        } else {
          email = `resident-${prefix}-${userIndex}@ecoclean.com`;
          const capitalized = prefix.charAt(0).toUpperCase() + prefix.slice(1);
          name = `${capitalized} Resident ${userIndex}`;
        }
      } else if (role === 'collector') {
        // Support legacy collector-test@ecoclean.com
        if (prefix === 'maplewood') {
          email = 'collector-test@ecoclean.com';
          name = 'Test Collector';
        } else {
          email = `collector-${prefix}@ecoclean.com`;
          const capitalized = prefix.charAt(0).toUpperCase() + prefix.slice(1);
          name = `${capitalized} Collector`;
        }
      }
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

    // Ensure the user has exactly one community membership (only for residents and collectors)
    if (targetUserId && role !== 'municipality') {
      // Remove any prior memberships
      const { error: deleteError } = await supabaseAdmin
        .from('community_memberships')
        .delete()
        .eq('user_id', targetUserId);

      if (deleteError) {
        console.error('[dev-login] Failed to clean prior memberships:', deleteError);
      }

      // Add single community membership
      const { error: membershipError } = await supabaseAdmin
        .from('community_memberships')
        .insert({
          user_id: targetUserId,
          community_id: communityId,
          membership_role: 'member'
        });

      if (membershipError) {
        console.error('[dev-login] Failed to assign community membership:', membershipError);
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
