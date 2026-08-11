import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { collectionFilterQuerySchema } from '@/lib/validations/collector';
import { ApiResponse, CollectionRequestDTO } from '@/types';

/**
 * GET /api/collection-requests
 * Allows collectors and authorized users to view collection requests with optional filtering.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    // 1. Validate query parameters using Zod
    const queryResult = collectionFilterQuerySchema.safeParse({
      status: searchParams.get('status') || undefined,
      communityId: searchParams.get('communityId') || undefined,
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

    const { status, communityId, limit, page } = queryResult.data;
    const offset = (page - 1) * limit;

    // 2. Query Supabase database
    let query = supabase
      .from('collection_requests')
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
      .order('requested_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (communityId) {
      query = query.eq('community_id', communityId);
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

    // 3. Format response data into camelCase DTOs
    const formattedData: CollectionRequestDTO[] = (data || []).map((row: any) => {
      const residentObj = Array.isArray(row.resident) ? row.resident[0] : row.resident;
      const communityObj = Array.isArray(row.community) ? row.community[0] : row.community;
      return {
        id: row.id,
        residentId: row.resident_id,
        communityId: row.community_id,
        status: row.status,
        requestedAt: row.requested_at,
        completedAt: row.completed_at,
        residentName: residentObj?.name,
        communityName: communityObj?.name,
      };
    });

    const response: ApiResponse<CollectionRequestDTO[]> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: any) {
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
