import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse, CollectionRequestDTO } from '@/types';

/**
 * POST /api/collection-requests/[id]/claim
 * Allows an authenticated collector to claim a pending collection request.
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await props.params;

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

    // 2. Verify user exists and has 'collector' role
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

    if (userData.role !== 'collector') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Only accounts with the collector role can claim collection requests.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // 3. Fetch request to verify existence, status, and community matching
    const { data: requestData, error: requestFetchError } = await supabase
      .from('collection_requests')
      .select('status, community_id')
      .eq('id', requestId)
      .maybeSingle();

    if (requestFetchError || !requestData) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'COLLECTION_REQUEST_NOT_FOUND',
          message: 'The specified collection request was not found.'
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    if (requestData.status !== 'PENDING') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'INVALID_REQUEST_STATE',
          message: 'Only PENDING requests can be claimed.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Verify collector belongs to the community of the request
    const { data: membership, error: membershipError } = await supabase
      .from('community_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('community_id', requestData.community_id)
      .maybeSingle();

    if (membershipError || !membership) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only claim requests belonging to your registered community.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // 4. Update status to ASSIGNED and assign collector_id
    const { data: updatedRequest, error: updateError } = await supabase
      .from('collection_requests')
      .update({
        status: 'ASSIGNED',
        collector_id: user.id
      })
      .eq('id', requestId)
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
      `)
      .single();

    if (updateError || !updatedRequest) {
      console.error('[Claim API Update Error]:', updateError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to claim collection request.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 5. Return updated request
    const residentObj = Array.isArray(updatedRequest.resident) ? updatedRequest.resident[0] : updatedRequest.resident;
    const communityObj = Array.isArray(updatedRequest.community) ? updatedRequest.community[0] : updatedRequest.community;

    const formattedData: CollectionRequestDTO = {
      id: updatedRequest.id,
      residentId: updatedRequest.resident_id,
      communityId: updatedRequest.community_id,
      status: updatedRequest.status,
      requestedAt: updatedRequest.requested_at,
      completedAt: updatedRequest.completed_at,
      collectorId: updatedRequest.collector_id,
      residentName: residentObj?.name,
      communityName: communityObj?.name
    };

    const response: ApiResponse<CollectionRequestDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[Claim API Unexpected Error]:', err);
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
