import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUserAndProfile } from '@/lib/supabase/server';
import { manualReviewDecisionSchema } from '@/lib/validations/verification';
import { validateStatusTransition } from '@/lib/collector/state-machine';
import { ApiResponse, DbCollectionBatch, DbEvidence, DbVerificationResult, ReviewDetailDTO, VerificationResultDTO } from '@/types';

/**
 * GET /api/verification/review/:requestId
 * Returns complete evidence context (Resident BEFORE, Collector AFTER, Vehicle),
 * hard-evidence check logs, and Gemini AI details for a manual review case.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    // 1. Authenticate user
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
          message: 'Only authorized reviewers can view review details.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    const { requestId } = await params;
    const supabase = createServerSupabaseClient();

    // 2. Fetch target collection request with joins
    const { data: reqData, error: reqError } = await supabase
      .from('collection_requests')
      .select(`
        id,
        resident_id,
        community_id,
        collector_id,
        collection_batch_id,
        status,
        requested_at,
        completed_at,
        resident:users!collection_requests_resident_id_fkey(name),
        community:communities(name),
        collector:users!collection_requests_collector_id_fkey(name)
      `)
      .eq('id', requestId)
      .single();

    if (reqError || !reqData) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: `Collection request '${requestId}' not found.`
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // 3. Fetch evidence associated with request
    const { data: evidenceRows } = await supabase
      .from('evidence')
      .select('*')
      .eq('collection_request_id', requestId);

    const evidenceList = evidenceRows || [];
    const beforeEv = evidenceList.find((e) => e.evidence_type === 'RESIDENT_BEFORE');
    const afterEv = evidenceList.find((e) => e.evidence_type === 'COLLECTOR_AFTER');

    // 4. Fetch batch details & vehicle evidence if batched
    let batchData: DbCollectionBatch | null = null;
    let vehicleEv: DbEvidence | null = null;

    if (reqData.collection_batch_id) {
      const { data: bData } = await supabase
        .from('collection_batches')
        .select('*')
        .eq('id', reqData.collection_batch_id)
        .single();
      batchData = bData;

      const { data: vEvRows } = await supabase
        .from('evidence')
        .select('*')
        .eq('collection_batch_id', reqData.collection_batch_id)
        .eq('evidence_type', 'VEHICLE')
        .limit(1);

      if (vEvRows && vEvRows.length > 0) {
        vehicleEv = vEvRows[0];
      }
    }

    // 5. Fetch latest verification audit result log
    const { data: vResult } = await supabase
      .from('verification_results')
      .select('*')
      .eq('collection_request_id', requestId)
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();

interface NameCarrier { name: string }
function getJoinedName(obj: unknown): string | undefined {
  if (!obj) return undefined;
  if (Array.isArray(obj)) {
    return (obj[0] as NameCarrier)?.name;
  }
  return (obj as NameCarrier).name;
}

    const detailDTO: ReviewDetailDTO = {
      request: {
        id: reqData.id,
        residentId: reqData.resident_id,
        communityId: reqData.community_id,
        collectorId: reqData.collector_id,
        collectionBatchId: reqData.collection_batch_id,
        status: reqData.status,
        requestedAt: reqData.requested_at,
        completedAt: reqData.completed_at,
        residentName: getJoinedName(reqData.resident),
        communityName: getJoinedName(reqData.community),
        collectorName: getJoinedName(reqData.collector)
      },
      batch: batchData
        ? {
            id: batchData.id,
            collectorId: batchData.collector_id,
            status: batchData.status,
            createdAt: batchData.created_at,
            updatedAt: batchData.updated_at
          }
        : null,
      beforeEvidence: beforeEv
        ? {
            id: beforeEv.id,
            collectionRequestId: beforeEv.collection_request_id,
            evidenceType: beforeEv.evidence_type,
            imageUrl: beforeEv.image_url,
            uploadedBy: beforeEv.uploaded_by,
            uploadedAt: beforeEv.uploaded_at,
            verificationStatus: beforeEv.verification_status,
            latitude: beforeEv.latitude,
            longitude: beforeEv.longitude,
            capturedAt: beforeEv.captured_at
          }
        : null,
      afterEvidence: afterEv
        ? {
            id: afterEv.id,
            collectionRequestId: afterEv.collection_request_id,
            evidenceType: afterEv.evidence_type,
            imageUrl: afterEv.image_url,
            uploadedBy: afterEv.uploaded_by,
            uploadedAt: afterEv.uploaded_at,
            verificationStatus: afterEv.verification_status,
            latitude: afterEv.latitude,
            longitude: afterEv.longitude,
            capturedAt: afterEv.captured_at
          }
        : null,
      vehicleEvidence: vehicleEv
        ? {
            id: vehicleEv.id,
            collectionBatchId: vehicleEv.collection_batch_id,
            evidenceType: vehicleEv.evidence_type,
            imageUrl: vehicleEv.image_url,
            uploadedBy: vehicleEv.uploaded_by,
            uploadedAt: vehicleEv.uploaded_at,
            verificationStatus: vehicleEv.verification_status,
            latitude: vehicleEv.latitude,
            longitude: vehicleEv.longitude,
            capturedAt: vehicleEv.captured_at
          }
        : null,
      hardEvidenceChecks: vResult?.hard_evidence_checks || [],
      aiAnalysisDetails: vResult?.ai_analysis_details || undefined,
      automaticDecision: vResult?.decision || 'needs_review',
      automaticReason: vResult?.reason || vResult?.analysis || 'Automatic verification flagged review requirement.',
      confidenceScore: vResult?.confidence_score ? Number(vResult.confidence_score) : undefined,
      latestResult: vResult
        ? {
            id: vResult.id,
            evidenceId: vResult.evidence_id,
            collectionRequestId: vResult.collection_request_id,
            decision: vResult.decision,
            confidenceScore: Number(vResult.confidence_score),
            analysis: vResult.analysis,
            hardEvidenceChecks: vResult.hard_evidence_checks || [],
            aiAnalysisDetails: vResult.ai_analysis_details || undefined,
            reason: vResult.reason,
            manualDecision: vResult.manual_decision,
            manualReason: vResult.manual_reason,
            reviewedBy: vResult.reviewed_by,
            reviewedAt: vResult.reviewed_at,
            verifiedAt: vResult.verified_at
          }
        : null
    };

    const response: ApiResponse<ReviewDetailDTO> = {
      success: true,
      data: detailDTO,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[GET /api/verification/review/[requestId] Error]:', err);
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
 * POST /api/verification/review/:requestId
 * Submits manual reviewer decision (APPROVE or REJECT) with required reason.
 * Enforces double-review concurrency check (409 REVIEW_ALREADY_RESOLVED if state is no longer NEEDS_REVIEW).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    // 1. Authenticate reviewer role
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
          message: 'Only authorized reviewers can submit manual decisions.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    const { requestId } = await params;
    const body = await request.json();

    // 2. Validate input body via Zod
    const validation = manualReviewDecisionSchema.safeParse(body);
    if (!validation.success) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error.issues[0]?.message || 'Invalid manual review payload.'
        }
      };
      return NextResponse.json(response, { status: 422 });
    }

    const { decision, reason } = validation.data;
    const supabase = createServerSupabaseClient();

    // 3. Double-Review Concurrency Check
    const { data: targetReq, error: reqError } = await supabase
      .from('collection_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqError || !targetReq) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: `Collection request '${requestId}' not found.`
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    if (targetReq.status !== 'NEEDS_REVIEW') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'REVIEW_ALREADY_RESOLVED',
          message: `Request '${requestId}' is currently in state '${targetReq.status}' and has already been reviewed or resolved.`
        }
      };
      return NextResponse.json(response, { status: 409 });
    }

    const nextStatus = decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
    const transitionCheck = validateStatusTransition('NEEDS_REVIEW', nextStatus);
    if (!transitionCheck.valid) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: transitionCheck.reason || 'Invalid state transition for manual review.'
        }
      };
      return NextResponse.json(response, { status: 422 });
    }

    const evidenceTargetStatus = decision === 'APPROVE' ? 'verified' : 'rejected';
    const reviewedAt = new Date().toISOString();

    // 4. Update evidence rows
    await supabase
      .from('evidence')
      .update({ verification_status: evidenceTargetStatus })
      .eq('collection_request_id', requestId);

    // 5. Update collection_requests status
    await supabase
      .from('collection_requests')
      .update({
        status: nextStatus,
        completed_at: decision === 'APPROVE' ? reviewedAt : null
      })
      .eq('id', requestId);

    // 6. Update latest verification_results audit log row
    const { data: existingLog } = await supabase
      .from('verification_results')
      .select('*')
      .eq('collection_request_id', requestId)
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let savedResult: DbVerificationResult | null = null;

    if (existingLog) {
      const { data: updatedLog } = await supabase
        .from('verification_results')
        .update({
          manual_decision: decision,
          manual_reason: reason,
          reviewed_by: user.id,
          reviewed_at: reviewedAt
        })
        .eq('id', existingLog.id)
        .select()
        .single();
      savedResult = updatedLog;
    } else {
      // Fallback: create new record if no automatic log existed
      const { data: insertedLog } = await supabase
        .from('verification_results')
        .insert({
          collection_request_id: requestId,
          evidence_id: crypto.randomUUID(),
          decision: 'needs_review',
          confidence_score: 50.0,
          analysis: 'Manual reviewer decision recorded.',
          manual_decision: decision,
          manual_reason: reason,
          reviewed_by: user.id,
          reviewed_at: reviewedAt
        })
        .select()
        .single();
      savedResult = insertedLog;
    }

    const resultDTO: VerificationResultDTO = {
      id: savedResult?.id || crypto.randomUUID(),
      evidenceId: savedResult?.evidence_id || crypto.randomUUID(),
      collectionRequestId: requestId,
      decision: savedResult?.decision || 'needs_review',
      confidenceScore: savedResult?.confidence_score ? Number(savedResult.confidence_score) : 50,
      analysis: savedResult?.analysis || 'Manual review completed.',
      hardEvidenceChecks: savedResult?.hard_evidence_checks || [],
      aiAnalysisDetails: savedResult?.ai_analysis_details || undefined,
      reason: savedResult?.reason,
      manualDecision: decision,
      manualReason: reason,
      reviewedBy: user.id,
      reviewedAt: reviewedAt,
      verifiedAt: savedResult?.verified_at || reviewedAt
    };

    const response: ApiResponse<VerificationResultDTO> = {
      success: true,
      data: resultDTO,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[POST /api/verification/review/[requestId] Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred during manual review.'
      }
    };
    return NextResponse.json(response, { status: 500 });
  }
}
