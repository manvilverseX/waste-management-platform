import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUserAndProfile, requireCollectorAuth } from '@/lib/supabase/server';
import { VerificationEngine } from '@/lib/verification/engine';
import { ApiResponse, VerificationResultDTO } from '@/types';

/**
 * POST /api/verification/:requestId
 * Triggers multi-factor verification engine (Hard Evidence Validation + Gemini Vision Analysis).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    // 1. Authenticate user and verify collector role
    const { user, errorResponse } = await requireCollectorAuth(request);
    if (errorResponse) {
      return errorResponse;
    }

    const { requestId } = await params;

    // 2. Delegate verification execution to Verification Engine
    const result = await VerificationEngine.verifyCollectionRequest(requestId, user!.id);

    const response: ApiResponse<VerificationResultDTO> = {
      success: true,
      data: result.dto,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[POST /api/verification Unexpected Error]:', err);
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred during verification.'
      }
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * GET /api/verification/:requestId
 * Returns latest verification result and audit log for a given collection request.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    // 1. Authenticate user
    const { errorResponse } = await getAuthUserAndProfile(request);
    if (errorResponse) {
      return errorResponse;
    }

    const { requestId } = await params;
    const supabase = createServerSupabaseClient();

    // 2. Fetch latest verification result by collection_request_id
    const { data: verificationData, error: vError } = await supabase
      .from('verification_results')
      .select('*')
      .eq('collection_request_id', requestId)
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (vError || !verificationData) {
      // Fallback: try fetching by evidence ID list if collection_request_id is unindexed in legacy rows
      const { data: evidenceList } = await supabase
        .from('evidence')
        .select('id')
        .eq('collection_request_id', requestId);

      if (evidenceList && evidenceList.length > 0) {
        const evidenceIds = evidenceList.map((e) => e.id);
        const { data: legacyData } = await supabase
          .from('verification_results')
          .select('*')
          .in('evidence_id', evidenceIds)
          .order('verified_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (legacyData) {
          const formattedLegacy: VerificationResultDTO = {
            id: legacyData.id,
            evidenceId: legacyData.evidence_id,
            collectionRequestId: legacyData.collection_request_id || requestId,
            decision: legacyData.decision,
            confidenceScore: Number(legacyData.confidence_score),
            analysis: legacyData.analysis,
            hardEvidenceChecks: legacyData.hard_evidence_checks || [],
            aiAnalysisDetails: legacyData.ai_analysis_details || undefined,
            reason: legacyData.reason || legacyData.analysis,
            verifiedAt: legacyData.verified_at
          };

          const res: ApiResponse<VerificationResultDTO> = {
            success: true,
            data: formattedLegacy,
            error: null
          };
          return NextResponse.json(res, { status: 200 });
        }
      }

      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: `No verification result record found for request '${requestId}'.`
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    const formattedData: VerificationResultDTO = {
      id: verificationData.id,
      evidenceId: verificationData.evidence_id,
      collectionRequestId: verificationData.collection_request_id || requestId,
      decision: verificationData.decision,
      confidenceScore: Number(verificationData.confidence_score),
      analysis: verificationData.analysis,
      hardEvidenceChecks: verificationData.hard_evidence_checks || [],
      aiAnalysisDetails: verificationData.ai_analysis_details || undefined,
      reason: verificationData.reason || verificationData.analysis,
      verifiedAt: verificationData.verified_at
    };

    const response: ApiResponse<VerificationResultDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 200 });

  } catch (err: unknown) {
    console.error('[GET /api/verification Error]:', err);
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
