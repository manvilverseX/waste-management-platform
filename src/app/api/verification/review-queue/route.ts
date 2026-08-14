import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUserAndProfile } from '@/lib/supabase/server';
import { ApiResponse, CollectionStatus, DbVerificationResult, ReviewQueueItemDTO } from '@/types';

interface JoinedRequestRow {
  id: string;
  resident_id: string;
  community_id: string;
  collector_id?: string | null;
  collection_batch_id?: string | null;
  status: CollectionStatus;
  requested_at: string;
  resident?: { name: string } | { name: string }[] | null;
  community?: { name: string } | { name: string }[] | null;
  collector?: { name: string } | { name: string }[] | null;
}

/**
 * GET /api/verification/review-queue
 * Returns paginated list of collection requests requiring manual review (status = 'NEEDS_REVIEW').
 * Protected: Requires authenticated user with collector or municipality role.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user and profile role
    const { user, profile, errorResponse } = await getAuthUserAndProfile(request);
    if (errorResponse) {
      return errorResponse;
    }

    if (!user || !profile || !['collector', 'municipality'].includes(profile.role)) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Only authorized reviewers can access the manual review queue.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    const supabase = createServerSupabaseClient();

    // 2. Query requests in NEEDS_REVIEW state
    const { data: requests, error: reqError } = await supabase
      .from('collection_requests')
      .select(`
        id,
        resident_id,
        community_id,
        collector_id,
        collection_batch_id,
        status,
        requested_at,
        resident:users!collection_requests_resident_id_fkey(name),
        community:communities(name),
        collector:users!collection_requests_collector_id_fkey(name)
      `)
      .eq('status', 'NEEDS_REVIEW')
      .order('requested_at', { ascending: false });

    if (reqError) {
      console.error('[GET /api/verification/review-queue DB Error]:', reqError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch review queue from database.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    if (!requests || requests.length === 0) {
      const response: ApiResponse<ReviewQueueItemDTO[]> = {
        success: true,
        data: [],
        error: null
      };
      return NextResponse.json(response, { status: 200 });
    }

    const typedRequests = requests as unknown as JoinedRequestRow[];
    const requestIds = typedRequests.map((r) => r.id);

    // 3. Fetch latest verification result logs for these requests
    const { data: vResults } = await supabase
      .from('verification_results')
      .select('*')
      .in('collection_request_id', requestIds)
      .order('verified_at', { ascending: false });

    const resultMap = new Map<string, DbVerificationResult>();
    if (vResults) {
      for (const res of (vResults as DbVerificationResult[])) {
        if (res.collection_request_id && !resultMap.has(res.collection_request_id)) {
          resultMap.set(res.collection_request_id, res);
        }
      }
    }

    // 4. Format DTOs
    const items: ReviewQueueItemDTO[] = typedRequests.map((r) => {
      const v = resultMap.get(r.id);

      const residentName = Array.isArray(r.resident) ? r.resident[0]?.name : r.resident?.name;
      const communityName = Array.isArray(r.community) ? r.community[0]?.name : r.community?.name;
      const collectorName = Array.isArray(r.collector) ? r.collector[0]?.name : r.collector?.name;

      return {
        requestId: r.id,
        residentName: residentName || 'Resident',
        communityName: communityName || 'Community',
        collectorName: collectorName || 'Unassigned',
        collectionBatchId: r.collection_batch_id,
        status: r.status,
        requestedAt: r.requested_at,
        automaticDecision: v?.decision || 'needs_review',
        confidenceScore: v?.confidence_score ? Number(v.confidence_score) : undefined,
        reason: v?.reason || v?.analysis || 'Automatic verification flagged review requirement.'
      };
    });

    const response: ApiResponse<ReviewQueueItemDTO[]> = {
      success: true,
      data: items,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[GET /api/verification/review-queue Error]:', err);
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
