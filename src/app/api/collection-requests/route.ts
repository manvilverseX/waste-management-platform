import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createCollectionRequestSchema } from '@/lib/validations/resident';
import { ApiResponse, CollectionRequestDTO } from '@/types';

/**
 * POST /api/collection-requests
 * Allows authenticated residents to create a new waste collection request.
 */
export async function POST(request: NextRequest) {
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

    // 2. Validate request body
    const body = await request.json();
    const validationResult = createCollectionRequestSchema.safeParse(body);
    if (!validationResult.success) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: validationResult.error.issues[0]?.message || 'Invalid request body.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { communityId } = validationResult.data;

    // 3. Verify user exists in public.users and has 'resident' role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User profile does not exist in the system.'
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    if (userData.role !== 'resident') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Only accounts with the resident role can create collection requests.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // 4. Verify user is a member of the specified community
    const { data: membershipData, error: membershipError } = await supabase
      .from('community_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('community_id', communityId)
      .maybeSingle();

    if (membershipError || !membershipData) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'You must be a registered member of the community to request a collection.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // 5. Insert new collection request
    const { data: newRequest, error: insertError } = await supabase
      .from('collection_requests')
      .insert({
        resident_id: user.id,
        community_id: communityId,
        status: 'PENDING'
      })
      .select(`
        id,
        resident_id,
        community_id,
        status,
        requested_at,
        completed_at,
        resident:users!collection_requests_resident_id_fkey(name),
        community:communities!collection_requests_community_id_fkey(name)
      `)
      .single();

    if (insertError || !newRequest) {
      console.error('[POST /api/collection-requests Database Error]:', insertError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to create collection request.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 6. Return response formatted as DTO
    const residentObj = Array.isArray(newRequest.resident) ? newRequest.resident[0] : newRequest.resident;
    const communityObj = Array.isArray(newRequest.community) ? newRequest.community[0] : newRequest.community;

    const formattedData: CollectionRequestDTO = {
      id: newRequest.id,
      residentId: newRequest.resident_id,
      communityId: newRequest.community_id,
      status: newRequest.status,
      requestedAt: newRequest.requested_at,
      completedAt: newRequest.completed_at,
      residentName: residentObj?.name,
      communityName: communityObj?.name
    };

    const response: ApiResponse<CollectionRequestDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 201 });

  } catch (err: any) {
    console.error('[POST /api/collection-requests Unexpected Error]:', err);
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

/**
 * GET /api/collection-requests
 * Allows authenticated residents to retrieve their waste collection requests.
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

    // Check user role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User profile does not exist.'
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Build role-based query
    let query = supabase
      .from('collection_requests')
      .select(`
        id,
        resident_id,
        community_id,
        status,
        requested_at,
        completed_at,
        collector_id,
        resident:users!collection_requests_resident_id_fkey(name),
        community:communities!collection_requests_community_id_fkey(name)
      `);

    if (userData.role === 'resident') {
      query = query.eq('resident_id', user.id);
    } else if (userData.role === 'collector') {
      // Find the collector's community
      const { data: membership } = await supabase
        .from('community_memberships')
        .select('community_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (membership?.community_id) {
        query = query.eq('community_id', membership.community_id);
      } else {
        // Return empty list if collector has no assigned community
        const response: ApiResponse<CollectionRequestDTO[]> = {
          success: true,
          data: [],
          error: null
        };
        return NextResponse.json(response, { status: 200 });
      }
    }

    const { data: requests, error: fetchError } = await query
      .order('requested_at', { ascending: false });

    if (fetchError) {
      console.error('[GET /api/collection-requests Database Error]:', fetchError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve collection requests.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 3. Format requests to DTOs
    const formattedData: CollectionRequestDTO[] = (requests || []).map((req) => {
      const residentObj = Array.isArray(req.resident) ? req.resident[0] : req.resident;
      const communityObj = Array.isArray(req.community) ? req.community[0] : req.community;

      return {
        id: req.id,
        residentId: req.resident_id,
        communityId: req.community_id,
        status: req.status,
        requestedAt: req.requested_at,
        completedAt: req.completed_at,
        collectorId: req.collector_id,
        residentName: residentObj?.name,
        communityName: communityObj?.name
      };
    });

    const response: ApiResponse<CollectionRequestDTO[]> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[GET /api/collection-requests Unexpected Error]:', err);
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

