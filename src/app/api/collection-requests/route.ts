import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUserAndProfile } from '@/lib/supabase/server';
import { collectionFilterQuerySchema } from '@/lib/validations/collector';
import { ApiResponse, CollectionRequestDTO } from '@/types';

/**
 * GET /api/collection-requests
 * Allows authenticated collectors and authorized users to view collection requests.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { user, profile, errorResponse } = await getAuthUserAndProfile(request);
    if (errorResponse) {
      return errorResponse;
    }

    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    // 2. Validate query parameters using Zod
    const queryResult = collectionFilterQuerySchema.safeParse({
      status: searchParams.get('status') || undefined,
      communityId: searchParams.get('communityId') || undefined,
      collectorId: searchParams.get('collectorId') || undefined,
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

    const { status, communityId, collectorId, limit, page } = queryResult.data;
    const offset = (page - 1) * limit;

    // 3. Query Supabase database
    let query = supabase
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
        collector:users!collection_requests_collector_id_fkey(name)
      `)
      .order('requested_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (communityId) {
      query = query.eq('community_id', communityId);
    }

    if (collectorId) {
      query = query.eq('collector_id', collectorId);
    }

    // Role-based visibility filtering:
    // If resident: only see their own requests
    if (profile?.role === 'resident') {
      query = query.eq('resident_id', user!.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/collection-requests Database Error]:', error);
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

    // 4. Format response data into camelCase DTOs
    const formattedData: CollectionRequestDTO[] = (data || []).map((row: Record<string, unknown>) => {
      const residentObj = Array.isArray(row.resident) ? row.resident[0] : row.resident;
      const communityObj = Array.isArray(row.community) ? row.community[0] : row.community;
      const collectorObj = Array.isArray(row.collector) ? row.collector[0] : row.collector;
      return {
        id: String(row.id),
        residentId: String(row.resident_id),
        communityId: String(row.community_id),
        collectorId: row.collector_id ? String(row.collector_id) : null,
        status: row.status as CollectionRequestDTO['status'],
        requestedAt: String(row.requested_at),
        completedAt: row.completed_at ? String(row.completed_at) : null,
        residentName: (residentObj as { name?: string })?.name,
        communityName: (communityObj as { name?: string })?.name,
        collectorName: (collectorObj as { name?: string })?.name,
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
