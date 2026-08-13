import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, requireCollectorAuth } from '@/lib/supabase/server';
import { batchFilterQuerySchema } from '@/lib/validations/batch';
import { ApiResponse, CollectionBatchDTO, VerificationStatus } from '@/types';

/**
 * POST /api/collection-batches
 * Creates a new collection batch owned by the authenticated collector.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user & verify collector role
    const { user, profile, errorResponse } = await requireCollectorAuth(request);
    if (errorResponse) {
      return errorResponse;
    }

    const supabase = createServerSupabaseClient();

    // 2. Insert new batch row owned by authenticated collector
    const { data: newBatch, error: insertError } = await supabase
      .from('collection_batches')
      .insert({
        collector_id: user!.id,
        status: 'CREATED'
      })
      .select(`
        id,
        collector_id,
        status,
        created_at,
        updated_at,
        collector:users!collection_batches_collector_id_fkey(name)
      `)
      .single();

    if (insertError || !newBatch) {
      console.error('[POST /api/collection-batches Database Error]:', insertError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to create collection batch.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 3. Format response object
    const collectorObj = Array.isArray(newBatch.collector) ? newBatch.collector[0] : newBatch.collector;

    const formattedData: CollectionBatchDTO = {
      id: newBatch.id,
      collectorId: newBatch.collector_id,
      collectorName: collectorObj?.name || profile?.name,
      status: newBatch.status,
      createdAt: newBatch.created_at,
      updatedAt: newBatch.updated_at,
      requestCount: 0,
      requests: []
    };

    const response: ApiResponse<CollectionBatchDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 201 });

  } catch (err: unknown) {
    console.error('[POST /api/collection-batches Unexpected Error]:', err);
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
 * GET /api/collection-batches
 * Returns list of collection batches owned by the authenticated collector.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user & verify collector role
    const { user, profile, errorResponse } = await requireCollectorAuth(request);
    if (errorResponse) {
      return errorResponse;
    }

    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    // 2. Validate query parameters
    const queryResult = batchFilterQuerySchema.safeParse({
      status: searchParams.get('status') || undefined,
      limit: searchParams.get('limit') || undefined,
      page: searchParams.get('page') || undefined,
    });

    if (!queryResult.success) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: queryResult.error.issues[0]?.message || 'Invalid query parameters'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { status, limit, page } = queryResult.data;
    const offset = (page - 1) * limit;

    // 3. Query collection batches owned by this collector
    let query = supabase
      .from('collection_batches')
      .select(`
        id,
        collector_id,
        status,
        created_at,
        updated_at,
        collector:users!collection_batches_collector_id_fkey(name),
        collection_requests (id, status),
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
      .eq('collector_id', user!.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: batchesData, error: fetchError } = await query;

    if (fetchError) {
      console.error('[GET /api/collection-batches Database Error]:', fetchError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve collection batches.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 4. Format DTO list
    const formattedData: CollectionBatchDTO[] = (batchesData || []).map((b: Record<string, unknown>) => {
      const collectorObj = Array.isArray(b.collector) ? b.collector[0] : b.collector;
      const reqList = Array.isArray(b.collection_requests) ? b.collection_requests : [];
      const evList = Array.isArray(b.evidence) ? b.evidence : [];
      const vehicleEv = evList.find((e: Record<string, unknown>) => e.evidence_type === 'VEHICLE');

      return {
        id: String(b.id),
        collectorId: String(b.collector_id),
        collectorName: (collectorObj as { name?: string })?.name || profile?.name,
        status: b.status as CollectionBatchDTO['status'],
        createdAt: String(b.created_at),
        updatedAt: String(b.updated_at),
        requestCount: reqList.length,
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
    });

    const response: ApiResponse<CollectionBatchDTO[]> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[GET /api/collection-batches Unexpected Error]:', err);
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
