import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, requireCollectorAuth } from '@/lib/supabase/server';
import { addRequestsToBatchSchema } from '@/lib/validations/batch';
import { ApiResponse, CollectionBatchDTO } from '@/types';

/**
 * POST /api/collection-batches/:batchId/requests
 * Adds eligible pickup requests (status: PICKUP_EVIDENCE_SUBMITTED) to a collection batch.
 */
export async function POST(
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
    const body = await request.json();

    // 2. Validate request body
    const validationResult = addRequestsToBatchSchema.safeParse(body);
    if (!validationResult.success) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: validationResult.error.issues[0]?.message || 'Invalid request body'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { requestIds } = validationResult.data;
    const supabase = createServerSupabaseClient();

    // 3. Fetch batch & verify collector ownership
    const { data: targetBatch, error: batchError } = await supabase
      .from('collection_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (batchError || !targetBatch) {
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

    if (targetBatch.collector_id !== user!.id) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to modify a collection batch owned by another collector.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Check batch status allows adding requests
    if (targetBatch.status === 'VEHICLE_EVIDENCE_SUBMITTED' || targetBatch.status === 'CANCELLED') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'INVALID_BATCH_STATE',
          message: `Cannot add requests to batch in '${targetBatch.status}' state.`
        }
      };
      return NextResponse.json(response, { status: 422 });
    }

    // 4. Validate all specified collection requests
    const { data: requestsToInclude, error: reqsError } = await supabase
      .from('collection_requests')
      .select('id, collector_id, collection_batch_id, status')
      .in('id', requestIds);

    if (reqsError || !requestsToInclude || requestsToInclude.length !== requestIds.length) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'INVALID_COLLECTION_REQUESTS',
          message: 'One or more collection requests were not found.'
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    for (const reqItem of requestsToInclude) {
      // Must be assigned to this collector
      if (reqItem.collector_id !== user!.id) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'FORBIDDEN',
            message: `Collection request '${reqItem.id}' is not assigned to you.`
          }
        };
        return NextResponse.json(response, { status: 403 });
      }

      // Must be in PICKUP_EVIDENCE_SUBMITTED or COLLECTED status
      if (reqItem.status !== 'PICKUP_EVIDENCE_SUBMITTED' && reqItem.status !== 'COLLECTED') {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'INVALID_REQUEST_STATE',
            message: `Collection request '${reqItem.id}' has status '${reqItem.status}'. Only requests with pickup evidence submitted can be added to a batch.`
          }
        };
        return NextResponse.json(response, { status: 422 });
      }

      // Must not already belong to another batch
      if (reqItem.collection_batch_id && reqItem.collection_batch_id !== batchId) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'ALREADY_BATCHED',
            message: `Collection request '${reqItem.id}' already belongs to another batch.`
          }
        };
        return NextResponse.json(response, { status: 422 });
      }
    }

    // 5. Atomic Update: update collection requests with batch foreign key only if assigned to caller
    const { data: updatedRequests, error: updateReqsError } = await supabase
      .from('collection_requests')
      .update({ collection_batch_id: batchId })
      .in('id', requestIds)
      .eq('collector_id', user!.id)
      .select('id');

    if (updateReqsError || !updatedRequests || updatedRequests.length !== requestIds.length) {
      console.error('[POST /api/collection-batches/:batchId/requests Error]:', updateReqsError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'CONCURRENCY_CONFLICT',
          message: 'One or more collection requests were modified or batched concurrently.'
        }
      };
      return NextResponse.json(response, { status: 409 });
    }

    // 6. Update batch status to READY_FOR_VEHICLE_EVIDENCE
    const { data: updatedBatch, error: updateBatchError } = await supabase
      .from('collection_batches')
      .update({
        status: 'READY_FOR_VEHICLE_EVIDENCE',
        updated_at: new Date().toISOString()
      })
      .eq('id', batchId)
      .select(`
        id,
        collector_id,
        status,
        created_at,
        updated_at,
        collector:users!collection_batches_collector_id_fkey(name),
        collection_requests (id, status)
      `)
      .single();

    if (updateBatchError || !updatedBatch) {
      console.error('[POST /api/collection-batches/:batchId/requests Batch Update Error]:', updateBatchError);
    }

    const collectorObj = Array.isArray(updatedBatch?.collector) ? updatedBatch?.collector[0] : updatedBatch?.collector;
    const reqList = Array.isArray(updatedBatch?.collection_requests) ? updatedBatch?.collection_requests : [];

    const formattedData: CollectionBatchDTO = {
      id: updatedBatch?.id || batchId,
      collectorId: updatedBatch?.collector_id || user!.id,
      collectorName: collectorObj?.name || profile?.name,
      status: updatedBatch?.status || 'READY_FOR_VEHICLE_EVIDENCE',
      createdAt: updatedBatch?.created_at || new Date().toISOString(),
      updatedAt: updatedBatch?.updated_at || new Date().toISOString(),
      requestCount: reqList.length
    };

    const response: ApiResponse<CollectionBatchDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[POST /api/collection-batches/:batchId/requests Unexpected Error]:', err);
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
