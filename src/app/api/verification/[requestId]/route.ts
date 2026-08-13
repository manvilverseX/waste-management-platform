import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUserAndProfile, requireCollectorAuth } from '@/lib/supabase/server';
import { analyzeEvidenceWithGemini } from '@/lib/gemini/client';
import { validateStatusTransition } from '@/lib/collector/state-machine';
import { ApiResponse, VerificationResultDTO } from '@/types';

/**
 * POST /api/verification/:requestId
 * Executes AI Evidence Verification using server-side Gemini API call.
 * Enforces authentication, collector assignment authorization, and strict state machine rules.
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
    const supabase = createServerSupabaseClient();

    // 2. Fetch collection request details
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
          message: `Collection request with ID '${requestId}' not found.`
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // 3. Verify collector assignment
    if (targetReq.collector_id && targetReq.collector_id !== user!.id) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not assigned to this collection request.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // 4. Fetch evidence list for the request
    const { data: evidenceList, error: evidenceError } = await supabase
      .from('evidence')
      .select('*')
      .eq('collection_request_id', requestId);

    if (evidenceError || !evidenceList || evidenceList.length === 0) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'EVIDENCE_NOT_FOUND',
          message: `No evidence found for collection request '${requestId}'.`
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // 5. Identify RESIDENT_BEFORE and COLLECTOR_AFTER evidence items
    const beforeEvidence = evidenceList.find((e) => e.evidence_type === 'RESIDENT_BEFORE');
    const afterEvidence = evidenceList.find((e) => e.evidence_type === 'COLLECTOR_AFTER');

    if (!beforeEvidence) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'MISSING_BEFORE_EVIDENCE',
          message: 'Resident before-collection evidence photo is missing.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (!afterEvidence) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'MISSING_AFTER_EVIDENCE',
          message: 'Collector after-collection evidence photo is missing.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // 6. Transition state machine to VERIFICATION_IN_PROGRESS
    const inProgressTransition = validateStatusTransition(targetReq.status, 'VERIFICATION_IN_PROGRESS');
    if (!inProgressTransition.valid) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: inProgressTransition.reason || `Cannot verify request in '${targetReq.status}' state.`
        }
      };
      return NextResponse.json(response, { status: 422 });
    }

    await supabase
      .from('collection_requests')
      .update({ status: 'VERIFICATION_IN_PROGRESS' })
      .eq('id', requestId);

    // 7. Call server-side Gemini AI service
    const aiResult = await analyzeEvidenceWithGemini(
      beforeEvidence.image_url,
      afterEvidence.image_url
    );

    // 8. Save verification result to database (associated with collector's evidence)
    const { data: savedVerification, error: insertError } = await supabase
      .from('verification_results')
      .insert({
        evidence_id: afterEvidence.id,
        decision: aiResult.decision,
        confidence_score: aiResult.confidenceScore,
        analysis: aiResult.analysis
      })
      .select()
      .single();

    if (insertError || !savedVerification) {
      console.error('[POST /api/verification Database Error]:', insertError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to save verification results to database.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 9. Determine final target status based on decision
    let finalRequestStatus: 'VERIFIED' | 'REJECTED' | 'NEEDS_REVIEW' = 'VERIFIED';
    if (aiResult.decision === 'rejected') {
      finalRequestStatus = 'REJECTED';
    } else if (aiResult.decision === 'inconclusive') {
      finalRequestStatus = 'NEEDS_REVIEW';
    }

    const evidenceTargetStatus = finalRequestStatus === 'VERIFIED' ? 'verified' : 'rejected';

    // Update evidence table status
    await supabase
      .from('evidence')
      .update({ verification_status: evidenceTargetStatus })
      .in('id', [beforeEvidence.id, afterEvidence.id]);

    // Update collection request status via state machine
    await supabase
      .from('collection_requests')
      .update({ 
        status: finalRequestStatus,
        completed_at: new Date().toISOString()
      })
      .eq('id', requestId);

    // 10. Return response formatted as camelCase DTO
    const formattedData: VerificationResultDTO = {
      id: savedVerification.id,
      evidenceId: savedVerification.evidence_id,
      decision: savedVerification.decision,
      confidenceScore: Number(savedVerification.confidence_score),
      analysis: savedVerification.analysis,
      verifiedAt: savedVerification.verified_at
    };

    const response: ApiResponse<VerificationResultDTO> = {
      success: true,
      data: formattedData,
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
 * Returns latest verification result for a given collection request.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    // Authenticate user
    const { errorResponse } = await getAuthUserAndProfile(request);
    if (errorResponse) {
      return errorResponse;
    }

    const { requestId } = await params;
    const supabase = createServerSupabaseClient();

    // Fetch evidence items for request
    const { data: evidenceList } = await supabase
      .from('evidence')
      .select('id')
      .eq('collection_request_id', requestId);

    if (!evidenceList || evidenceList.length === 0) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: `No verification results found for collection request '${requestId}'.`
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    const evidenceIds = evidenceList.map((e) => e.id);

    // Fetch latest verification result
    const { data: verificationData, error: vError } = await supabase
      .from('verification_results')
      .select('*')
      .in('evidence_id', evidenceIds)
      .order('verified_at', { ascending: false })
      .limit(1)
      .single();

    if (vError || !verificationData) {
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
      decision: verificationData.decision,
      confidenceScore: Number(verificationData.confidence_score),
      analysis: verificationData.analysis,
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
