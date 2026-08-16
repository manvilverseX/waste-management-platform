import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';

interface VerificationResultDTO {
  id: string;
  collectionRequestId: string;
  decision: 'verified' | 'rejected';
  analysis: string;
  verifiedAt: string;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    const supabase = createServerSupabaseClient(token);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      };
      return NextResponse.json(response, { status: 401 });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User profile does not exist.'
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    if (!['collector', 'municipality'].includes(userData.role)) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Only collectors or municipality can verify collections.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    let body: { collectionRequestId: string; decision?: 'verified' | 'rejected'; notes?: string };
    try {
      body = await request.json();
    } catch {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { collectionRequestId, decision: manualDecision, notes } = body;

    if (!collectionRequestId) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'collectionRequestId is required.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { data: requestData, error: requestError } = await supabase
      .from('collection_requests')
      .select('id, status, resident_id, community_id, collector_id')
      .eq('id', collectionRequestId)
      .maybeSingle();

    if (requestError || !requestData) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'COLLECTION_REQUEST_NOT_FOUND',
          message: 'The specified collection request was not found.'
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    if (requestData.status !== 'COLLECTED') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'INVALID_REQUEST_STATE',
          message: 'Verification can only be performed on requests with COLLECTED status.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { data: beforeEvidence, error: beforeError } = await supabase
      .from('evidence')
      .select('id, image_url, uploaded_at, verification_status')
      .eq('collection_request_id', collectionRequestId)
      .eq('evidence_type', 'RESIDENT_BEFORE')
      .maybeSingle();

    const { data: afterEvidence, error: afterError } = await supabase
      .from('evidence')
      .select('id, image_url, uploaded_at, verification_status')
      .eq('collection_request_id', collectionRequestId)
      .eq('evidence_type', 'COLLECTOR_AFTER')
      .maybeSingle();

    if (beforeError || afterError) {
      console.error('[Verification] Evidence fetch error:', beforeError || afterError);
    }

    if (!beforeEvidence) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'MISSING_EVIDENCE',
          message: 'RESIDENT_BEFORE evidence is missing for this request.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (!afterEvidence) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'MISSING_EVIDENCE',
          message: 'COLLECTOR_AFTER evidence is missing for this request.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    let decision: 'verified' | 'rejected';
    let analysis: string;
    let confidenceScore: number;

    if (manualDecision) {
      decision = manualDecision;
      analysis = notes || `Manual verification by ${userData.role}: ${manualDecision}`;
      confidenceScore = decision === 'verified' ? 100 : 0;
    } else {
      const beforeUrl = beforeEvidence.image_url;
      const afterUrl = afterEvidence.image_url;

      if (beforeUrl === afterUrl) {
        decision = 'rejected';
        analysis = 'Automated check failed: BEFORE and AFTER images are identical (same URL). Possible duplicate upload.';
        confidenceScore = 90;
      } else {
        decision = 'verified';
        analysis = 'Automated verification: Both BEFORE and AFTER evidence images are present and distinct. Waste collection appears to have occurred.';
        confidenceScore = 75;
      }
    }

    const { data: verificationResult, error: verificationError } = await supabase
      .from('verification_results')
      .insert({
        evidence_id: afterEvidence.id,
        decision,
        confidence_score: confidenceScore,
        analysis
      })
      .select('id, evidence_id, decision, confidence_score, analysis, verified_at')
      .single();

    if (verificationError || !verificationResult) {
      console.error('[Verification] Database insert error:', verificationError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to record verification result.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    const { error: evidenceUpdateError } = await supabase
      .from('evidence')
      .update({ verification_status: decision })
      .eq('id', afterEvidence.id);

    if (evidenceUpdateError) {
      console.error('[Verification] Evidence status update error:', evidenceUpdateError);
    }

    const newStatus = decision === 'verified' ? 'VERIFIED' : 'REJECTED';
    const { error: requestUpdateError } = await supabase
      .from('collection_requests')
      .update({ status: newStatus })
      .eq('id', collectionRequestId);

    if (requestUpdateError) {
      console.error('[Verification] Collection request status update error:', requestUpdateError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to update collection request status.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    const formattedData: VerificationResultDTO = {
      id: verificationResult.id,
      collectionRequestId,
      decision: verificationResult.decision,
      analysis: verificationResult.analysis,
      verifiedAt: verificationResult.verified_at
    };

    const response: ApiResponse<VerificationResultDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 201 });

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