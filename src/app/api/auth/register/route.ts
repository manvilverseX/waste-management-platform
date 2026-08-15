import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { registerSchema } from '@/lib/validations/auth';

export async function POST(request: NextRequest) {
  let createdAuthUserId: string | null = null;

  try {
    const body = await request.json();
    const validationResult = registerSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: validationResult.error.issues[0]?.message || 'Invalid registration data.'
        }
      }, { status: 400 });
    }

    const { fullName, email, password, communityId } = validationResult.data;

    // Check if SUPABASE_SERVICE_ROLE_KEY is configured to ensure rollback safety
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Register API]: SUPABASE_SERVICE_ROLE_KEY environment variable is missing.');
      return NextResponse.json({
        success: false,
        data: null,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Server configuration error: Registration service key is missing.'
        }
      }, { status: 500 });
    }

    // Use service-role Supabase client for registration (privileged server-side)
    const supabase = createServerSupabaseClient();

    // Verify selected community exists
    const { data: community, error: communityError } = await supabase
      .from('communities')
      .select('id')
      .eq('id', communityId)
      .maybeSingle();

    if (communityError || !community) {
      return NextResponse.json({
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: 'The selected community does not exist.'
        }
      }, { status: 404 });
    }

    // Create the Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: fullName
        }
      }
    });

    if (authError || !authData.user || !authData.user.id) {
      console.error('[Register API Auth Error]:', authError);
      return NextResponse.json({
        success: false,
        data: null,
        error: {
          code: 'AUTH_ERROR',
          message: authError?.message || 'Failed to create authentication user.'
        }
      }, { status: 400 });
    }

    createdAuthUserId = authData.user.id;

    // Create public.users profile (force role 'resident' — never client-supplied)
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: createdAuthUserId,
        name: fullName,
        email: email,
        role: 'resident'
      });

    if (profileError) {
      console.error('[Register API Profile Creation Error]:', profileError);
      // Rollback auth user
      await supabase.auth.admin.deleteUser(createdAuthUserId);
      return NextResponse.json({
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to create user profile in the database.'
        }
      }, { status: 500 });
    }

    // Create community membership association
    const { error: membershipError } = await supabase
      .from('community_memberships')
      .insert({
        user_id: createdAuthUserId,
        community_id: communityId,
        membership_role: 'member'
      });

    if (membershipError) {
      console.error('[Register API Membership Creation Error]:', membershipError);
      // Rollback: Delete the public.users record and the auth user
      await supabase.from('users').delete().eq('id', createdAuthUserId);
      await supabase.auth.admin.deleteUser(createdAuthUserId);
      return NextResponse.json({
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to associate user with the community.'
        }
      }, { status: 500 });
    }

    // Handle email confirmation requirement
    if (!authData.session) {
      return NextResponse.json({
        success: true,
        data: {
          sessionRequired: true,
          message: 'Registration successful. Please check your email to confirm your account.'
        },
        error: null
      }, { status: 201 });
    }

    // Email confirmation not required, return active session
    return NextResponse.json({
      success: true,
      data: {
        sessionRequired: false,
        session: {
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
          user: {
            id: authData.user.id,
            email: authData.user.email,
            name: fullName
          }
        }
      },
      error: null
    }, { status: 201 });

  } catch (err: unknown) {
    console.error('[Register API Unexpected Error]:', err);

    // Rollback: Delete the Auth user if created
    if (createdAuthUserId) {
      try {
        const supabase = createServerSupabaseClient();
        await supabase.auth.admin.deleteUser(createdAuthUserId);
        console.log(`Rollback: Cleaned up auth user ${createdAuthUserId}`);
      } catch (cleanupErr) {
        console.error('Failed to cleanup auth user during rollback:', cleanupErr);
      }
    }

    const message = err instanceof Error ? err.message : 'An unexpected error occurred during registration.';
    return NextResponse.json({
      success: false,
      data: null,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message
      }
    }, { status: 500 });
  }
}