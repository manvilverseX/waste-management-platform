import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUserAndProfile } from '@/lib/supabase/server';
import { metricsQuerySchema } from '@/lib/validations/metrics';
import { calculateDateRange, computeCollectorMetrics } from '@/lib/collector/metrics';
import { ApiResponse, CollectorMetricsDTO, DbVerificationResult } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectorId: string }> }
) {
  try {
    // 1. Authenticate user
    const { profile, errorResponse } = await getAuthUserAndProfile(request);
    if (errorResponse) {
      return errorResponse;
    }

    // Role check: ONLY municipality role is authorized to view specified collector metrics
    if (!profile || profile.role !== 'municipality') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Access restricted to authorized municipality administrators.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    const { collectorId } = await params;
    if (!collectorId) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'collectorId parameter is required' }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // 2. Validate query parameters
    const { searchParams } = new URL(request.url);
    const queryResult = metricsQuerySchema.safeParse({
      range: searchParams.get('range') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
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

    const { range, from, to } = queryResult.data;
    const { fromISO, toISO, range: computedRange } = calculateDateRange(range, from, to);

    const supabase = createServerSupabaseClient();

    // 3. Query Collection Requests for specified collector
    let reqQuery = supabase
      .from('collection_requests')
      .select('id, resident_id, community_id, collector_id, collection_batch_id, status, requested_at, completed_at')
      .eq('collector_id', collectorId);

    if (fromISO) {
      reqQuery = reqQuery.gte('requested_at', fromISO);
    }
    if (toISO) {
      reqQuery = reqQuery.lte('requested_at', toISO);
    }

    const { data: requests, error: reqErr } = await reqQuery;
    if (reqErr) {
      console.error('Admin collector metrics requests error:', reqErr);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DB_ERROR', message: 'Failed to fetch collection requests' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 4. Query Collection Batches for specified collector
    let batchQuery = supabase
      .from('collection_batches')
      .select('id, collector_id, status, created_at, updated_at')
      .eq('collector_id', collectorId);

    if (fromISO) {
      batchQuery = batchQuery.gte('created_at', fromISO);
    }
    if (toISO) {
      batchQuery = batchQuery.lte('created_at', toISO);
    }

    const { data: batches, error: batchErr } = await batchQuery;
    if (batchErr) {
      console.error('Admin collector metrics batches error:', batchErr);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DB_ERROR', message: 'Failed to fetch collection batches' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 5. Query Evidence uploaded by specified collector
    let evidenceQuery = supabase
      .from('evidence')
      .select('id, collection_request_id, collection_batch_id, evidence_type, image_url, uploaded_by, uploaded_at, verification_status, latitude, longitude, captured_at')
      .eq('uploaded_by', collectorId);

    if (fromISO) {
      evidenceQuery = evidenceQuery.gte('uploaded_at', fromISO);
    }
    if (toISO) {
      evidenceQuery = evidenceQuery.lte('uploaded_at', toISO);
    }

    const { data: evidences, error: evErr } = await evidenceQuery;
    if (evErr) {
      console.error('Admin collector metrics evidence error:', evErr);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: { code: 'DB_ERROR', message: 'Failed to fetch evidence records' }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 6. Query Verification Results for collector's requests
    const requestIds = (requests || []).map(r => r.id);
    let verifResults: DbVerificationResult[] = [];
    if (requestIds.length > 0) {
      let verifQuery = supabase
        .from('verification_results')
        .select('id, evidence_id, collection_request_id, decision, confidence_score, analysis, hard_evidence_checks, ai_analysis_details, reason, manual_decision, manual_reason, reviewed_by, reviewed_at, verified_at')
        .in('collection_request_id', requestIds);

      if (fromISO) {
        verifQuery = verifQuery.gte('verified_at', fromISO);
      }
      if (toISO) {
        verifQuery = verifQuery.lte('verified_at', toISO);
      }

      const { data: verifs, error: verifErr } = await verifQuery;
      if (verifErr) {
        console.error('Admin collector metrics verification error:', verifErr);
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: { code: 'DB_ERROR', message: 'Failed to fetch verification results' }
        };
        return NextResponse.json(response, { status: 500 });
      }
      verifResults = verifs || [];
    }

    // 7. Compute metrics DTO
    const metrics: CollectorMetricsDTO = computeCollectorMetrics(
      collectorId,
      { range: computedRange, from: fromISO, to: toISO },
      requests || [],
      batches || [],
      evidences || [],
      verifResults
    );

    const response: ApiResponse<CollectorMetricsDTO> = {
      success: true,
      data: metrics,
      error: null
    };
    return NextResponse.json(response, { status: 200 });
  } catch (err: unknown) {
    console.error('GET /api/collector/metrics/[collectorId] handler error:', err);
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'INTERNAL_ERROR', message }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
