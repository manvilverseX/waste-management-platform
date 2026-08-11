import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { updateCollectionStatusSchema } from '@/lib/validations/collector';
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
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    // 1. Fetch collection request with related evidence
    const { data: requestData, error: requestError } = await supabase
      .from('collection_requests')
      .select(`
        id,
        resident_id,
        community_id,
        status,
        requested_at,
        completed_at,
        resident:users!collection_requests_resident_id_fkey(name),
        community:communities!collection_requests_community_id_fkey(name),
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

    // 2. Format evidence list into camelCase DTOs
    const formattedEvidence: EvidenceDTO[] = (requestData.evidence || []).map((e: any) => ({
      id: e.id,
      collectionRequestId: e.collection_request_id,
      evidenceType: e.evidence_type,
      imageUrl: e.image_url,
      uploadedBy: e.uploaded_by,
      uploadedAt: e.uploaded_at,
      verificationStatus: e.verification_status,
    }));

    // 3. Format response object
    const residentObj = Array.isArray(requestData.resident) ? requestData.resident[0] : requestData.resident;
    const communityObj = Array.isArray(requestData.community) ? requestData.community[0] : requestData.community;

    const formattedData: CollectionRequestDTO = {
      id: requestData.id,
      residentId: requestData.resident_id,
      communityId: requestData.community_id,
      status: requestData.status,
      requestedAt: requestData.requested_at,
      completedAt: requestData.completed_at,
      residentName: residentObj?.name,
      communityName: communityObj?.name,
      evidence: formattedEvidence,
    };

    const response: ApiResponse<CollectionRequestDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: any) {
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
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // 1. Validate request body using Zod
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

    const { status } = validationResult.data;
    const supabase = createServerSupabaseClient();

    // 2. Prepare update payload
    const updatePayload: Record<string, any> = {
      status
    };

    // If status is updated to COLLECTED or VERIFIED, mark completed_at timestamp
    if (status === 'COLLECTED' || status === 'VERIFIED') {
      updatePayload.completed_at = new Date().toISOString();
    }

    // 3. Update database record
    const { data: updatedData, error: updateError } = await supabase
      .from('collection_requests')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updatedData) {
      console.error('[PATCH /api/collection-requests/:id Error]:', updateError);
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

    // 4. Format and return response
    const formattedData: CollectionRequestDTO = {
      id: updatedData.id,
      residentId: updatedData.resident_id,
      communityId: updatedData.community_id,
      status: updatedData.status,
      requestedAt: updatedData.requested_at,
      completedAt: updatedData.completed_at
    };

    const response: ApiResponse<CollectionRequestDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: any) {
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
