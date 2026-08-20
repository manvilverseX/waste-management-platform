import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/types';
import { verifyCollectionRequest } from '@/lib/verification/verify-collection';

interface VerificationResultDTO {
  id: string;
  collectionRequestId: string;
  decision: 'verified' | 'rejected' | 'needs_review';
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

    let body: { collectionRequestId: string; decision?: 'verified' | 'rejected'; manualDecision?: 'verified' | 'rejected'; notes?: string };
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

    const { collectionRequestId, decision, manualDecision: bodyManualDecision, notes } = body;
    const manualDecision = decision || bodyManualDecision;

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

    // Fetch the collection request to check status and owner (for authorization validation)
    const { data: requestData, error: requestError } = await supabase
      .from('collection_requests')
      .select('id, status, collector_id')
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

    // Check request state: must be COLLECTED
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

    // Authenticated user with role "collector" must be the assigned collector
    if (userData.role === 'collector' && requestData.collector_id !== user.id) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to verify this collection request.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Use shared verification function with service role client to allow status updates
    const supabaseService = createServerSupabaseClient();
    const result = await verifyCollectionRequest(supabaseService, collectionRequestId, {
      manualDecision,
      notes: notes || `Manual verification by ${userData.role}: ${manualDecision}`
    });

    const formattedData: VerificationResultDTO = {
      id: result.verificationResultId,
      collectionRequestId,
      decision: result.decision,
      analysis: result.analysis,
      verifiedAt: new Date().toISOString()
    };

    const response: ApiResponse<VerificationResultDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 201 });

  } catch (err: unknown) {
    console.error('[POST /api/verification Unexpected Error]:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred during verification.';

    // Map known errors to appropriate status codes
    let status = 500;
    let code = 'INTERNAL_SERVER_ERROR';

    if (message.includes('COLLECTION_REQUEST_NOT_FOUND')) {
      status = 404;
      code = 'COLLECTION_REQUEST_NOT_FOUND';
    } else if (message.includes('INVALID_REQUEST_STATE')) {
      status = 400;
      code = 'INVALID_REQUEST_STATE';
    } else if (message.includes('MISSING_EVIDENCE')) {
      status = 400;
      code = 'MISSING_EVIDENCE';
    } else if (message.includes('DATABASE_ERROR')) {
      status = 500;
      code = 'DATABASE_ERROR';
    }

    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code,
        message: message.replace(/^[A-Z_]+: /, '')
      }
    };
    return NextResponse.json(response, { status });
  }
}