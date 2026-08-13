import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, requireCollectorAuth } from '@/lib/supabase/server';
import { ApiResponse, CollectionBatchDTO, CollectionRequestDTO, VerificationStatus } from '@/types';

/**
 * GET /api/collection-batches/:batchId
 * Returns detailed view of a single collection batch with its included requests and vehicle evidence.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    // 1. Authenticate user & verify collector role
    const { user, profile, errorResponse } = await requireCollectorAuth(request);
    if (errorResponse) {
      return errorResponse;
    }

    const { batchId } = await params;
    const supabase = createServerSupabaseClient();

    // 2. Fetch batch record with related requests and evidence
    const { data: batchData, error: fetchError } = await supabase
      .from('collection_batches')
      .select(`
        id,
        collector_id,
        status,
        created_at,
        updated_at,
        collector:users!collection_batches_collector_id_fkey(name),
        collection_requests (
          id,
          resident_id,
          community_id,
          collector_id,
          collection_batch_id,
          status,
          requested_at,
          completed_at,
          resident:users!collection_requests_resident_id_fkey(name),
          community:communities!collection_requests_community_id_fkey(name)
        ),
        evidence!evidence_collection_batch_id_fkey (
          id,
          collection_batch_id,
          evidence_type,
          image_url,
          uploaded_by,
          uploaded_at,
          verification_status,
          latitude,
          longitude,
          captured_at
        )
      `)
      .eq('id', batchId)
      .single();

    if (fetchError || !batchData) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: `Collection batch with ID '${batchId}' not found.`
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // 3. Batch Ownership Protection Check
    if (batchData.collector_id !== user!.id) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to access a collection batch owned by another collector.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // 4. Format response data
    const collectorObj = Array.isArray(batchData.collector) ? batchData.collector[0] : batchData.collector;
    const rawRequests = Array.isArray(batchData.collection_requests) ? batchData.collection_requests : [];
    const rawEvidence = Array.isArray(batchData.evidence) ? batchData.evidence : [];

    const formattedRequests: CollectionRequestDTO[] = rawRequests.map((r: Record<string, unknown>) => {
      const residentObj = Array.isArray(r.resident) ? r.resident[0] : r.resident;
      const communityObj = Array.isArray(r.community) ? r.community[0] : r.community;
      return {
        id: String(r.id),
        residentId: String(r.resident_id),
        communityId: String(r.community_id),
        collectorId: r.collector_id ? String(r.collector_id) : null,
        collectionBatchId: r.collection_batch_id ? String(r.collection_batch_id) : null,
        status: r.status as CollectionRequestDTO['status'],
        requestedAt: String(r.requested_at),
        completedAt: r.completed_at ? String(r.completed_at) : null,
        residentName: (residentObj as { name?: string })?.name,
        communityName: (communityObj as { name?: string })?.name,
      };
    });

    const vehicleEv = rawEvidence.find((e: Record<string, unknown>) => e.evidence_type === 'VEHICLE');

    const formattedBatch: CollectionBatchDTO = {
      id: batchData.id,
      collectorId: batchData.collector_id,
      collectorName: collectorObj?.name || profile?.name,
      status: batchData.status,
      createdAt: batchData.created_at,
      updatedAt: batchData.updated_at,
      requestCount: formattedRequests.length,
      requests: formattedRequests,
      vehicleEvidence: vehicleEv ? {
        id: String(vehicleEv.id),
        collectionBatchId: String(vehicleEv.collection_batch_id),
        evidenceType: 'VEHICLE',
        imageUrl: String(vehicleEv.image_url),
        uploadedBy: String(vehicleEv.uploaded_by),
        uploadedAt: String(vehicleEv.uploaded_at),
        verificationStatus: vehicleEv.verification_status as VerificationStatus,
        latitude: vehicleEv.latitude as number | null,
        longitude: vehicleEv.longitude as number | null,
        capturedAt: vehicleEv.captured_at ? String(vehicleEv.captured_at) : null
      } : null
    };

    const response: ApiResponse<CollectionBatchDTO> = {
      success: true,
      data: formattedBatch,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[GET /api/collection-batches/:batchId Error]:', err);
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
