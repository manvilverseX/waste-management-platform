import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUserAndProfile, requireCollectorAuth } from '@/lib/supabase/server';
import { updateCollectionStatusSchema } from '@/lib/validations/collector';
import { validateStatusTransition } from '@/lib/collector/state-machine';
import { ApiResponse, CollectionRequestDTO, EvidenceDTO } from '@/types';

/**
 * GET /api/collection-requests/:id
 * Fetch details of a single collection request including its evidence items.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate user
    const { user, profile, errorResponse } = await getAuthUserAndProfile(request);
    if (errorResponse) {
      return errorResponse;
    }

    const { id } = await params;
    const supabase = createServerSupabaseClient();

    // 2. Fetch collection request with related evidence and user details
    const { data: requestData, error: requestError } = await supabase
      .from('collection_requests')
      .select(`
        id,
        resident_id,
        community_id,
        collector_id,
        status,
        requested_at,
        completed_at,
        resident:users!collection_requests_resident_id_fkey(name),
        community:communities!collection_requests_community_id_fkey(name),
        collector:users!collection_requests_collector_id_fkey(name),
        evidence (
          id,
          collection_request_id,
          evidence_type,
          image_url,
          uploaded_by,
          uploaded_at,
          verification_status
        )
      `)
      .eq('id', id)
      .single();

    if (requestError || !requestData) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: `Collection request with ID '${id}' not found.`
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // 3. Authorization check
    if (profile?.role === 'resident' && requestData.resident_id !== user!.id) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to view this collection request.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // 4. Format evidence list into camelCase DTOs
    const formattedEvidence: EvidenceDTO[] = (requestData.evidence || []).map((e: Record<string, unknown>) => ({
      id: String(e.id),
      collectionRequestId: String(e.collection_request_id),
      evidenceType: e.evidence_type as EvidenceDTO['evidenceType'],
      imageUrl: String(e.image_url),
      uploadedBy: String(e.uploaded_by),
      uploadedAt: String(e.uploaded_at),
      verificationStatus: e.verification_status as EvidenceDTO['verificationStatus'],
    }));

    // 5. Format response object
    const residentObj = Array.isArray(requestData.resident) ? requestData.resident[0] : requestData.resident;
    const communityObj = Array.isArray(requestData.community) ? requestData.community[0] : requestData.community;
    const collectorObj = Array.isArray(requestData.collector) ? requestData.collector[0] : requestData.collector;

    const formattedData: CollectionRequestDTO = {
      id: requestData.id,
      residentId: requestData.resident_id,
      communityId: requestData.community_id,
      collectorId: requestData.collector_id || null,
      status: requestData.status,
      requestedAt: requestData.requested_at,
      completedAt: requestData.completed_at,
      residentName: residentObj?.name,
      communityName: communityObj?.name,
      collectorName: collectorObj?.name,
      evidence: formattedEvidence,
    };

    const response: ApiResponse<CollectionRequestDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[GET /api/collection-requests/:id Error]:', err);
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
 * PATCH /api/collection-requests/:id
 * Allows updating status of a collection request (e.g. PENDING -> ASSIGNED -> COLLECTED).
 * Strictly enforces authentication, collector authorization, request ownership/assignment, and state transitions.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate user and verify collector role
    const { user, errorResponse } = await requireCollectorAuth(request);
    if (errorResponse) {
      return errorResponse;
    }

    const { id } = await params;
    const body = await request.json();

    // 2. Validate request body schema
    const validationResult = updateCollectionStatusSchema.safeParse(body);
    if (!validationResult.success) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: validationResult.error.issues[0]?.message || 'Invalid status value'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { status: targetStatus } = validationResult.data;
    const supabase = createServerSupabaseClient();

    // 3. Fetch current request details from database
    const { data: existingRequest, error: fetchError } = await supabase
      .from('collection_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingRequest) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: `Collection request with ID '${id}' not found.`
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // 4. Request Assignment Authorization Check
    // If request is already assigned to a DIFFERENT collector, return 403 Forbidden
    if (existingRequest.collector_id && existingRequest.collector_id !== user!.id) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to modify a collection request assigned to another collector.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // 5. Centralized State Machine Transition Check
    const transitionCheck = validateStatusTransition(existingRequest.status, targetStatus);
    if (!transitionCheck.valid) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: transitionCheck.reason || `Cannot transition from ${existingRequest.status} to ${targetStatus}`
        }
      };
      return NextResponse.json(response, { status: 422 });
    }

    // 6. Prepare DB update payload
    const updatePayload: Record<string, unknown> = {
      status: targetStatus
    };

    // Auto-assign collector if transitioning into ASSIGNED status
    if (targetStatus === 'ASSIGNED' && !existingRequest.collector_id) {
      updatePayload.collector_id = user!.id;
    }

    // Set completed_at timestamp on terminal or collection completion states
    if (targetStatus === 'COLLECTED' || targetStatus === 'VERIFIED') {
      updatePayload.completed_at = new Date().toISOString();
    }

    // 7. Perform Database Update
    const { data: updatedData, error: updateError } = await supabase
      .from('collection_requests')
      .update(updatePayload)
      .eq('id', id)
      .select(`
        id,
        resident_id,
        community_id,
        collector_id,
        status,
        requested_at,
        completed_at,
        resident:users!collection_requests_resident_id_fkey(name),
        community:communities!collection_requests_community_id_fkey(name),
        collector:users!collection_requests_collector_id_fkey(name)
      `)
      .single();

    if (updateError || !updatedData) {
      console.error('[PATCH /api/collection-requests/:id Database Error]:', updateError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'UPDATE_FAILED',
          message: `Failed to update status for collection request '${id}'.`
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 8. Format and return updated DTO
    const residentObj = Array.isArray(updatedData.resident) ? updatedData.resident[0] : updatedData.resident;
    const communityObj = Array.isArray(updatedData.community) ? updatedData.community[0] : updatedData.community;
    const collectorObj = Array.isArray(updatedData.collector) ? updatedData.collector[0] : updatedData.collector;

    const formattedData: CollectionRequestDTO = {
      id: updatedData.id,
      residentId: updatedData.resident_id,
      communityId: updatedData.community_id,
      collectorId: updatedData.collector_id || null,
      status: updatedData.status,
      requestedAt: updatedData.requested_at,
      completedAt: updatedData.completed_at,
      residentName: residentObj?.name,
      communityName: communityObj?.name,
      collectorName: collectorObj?.name,
    };

    const response: ApiResponse<CollectionRequestDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[PATCH /api/collection-requests/:id Unexpected Error]:', err);
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
