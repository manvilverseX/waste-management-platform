import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { uploadEvidenceSchema } from '@/lib/validations/resident';
import { ApiResponse, EvidenceDTO } from '@/types';

/**
 * POST /api/evidence
 * Allows authenticated residents to upload evidence for their collection requests.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user using Authorization Bearer token
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

    // 2. Validate request body
    const body = await request.json();
    const validationResult = uploadEvidenceSchema.safeParse(body);
    if (!validationResult.success) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: validationResult.error.issues[0]?.message || 'Invalid request body.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { collectionRequestId, imageUrl, evidenceType } = validationResult.data;

    // 3. Verify user exists in public.users and has 'resident' role
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
          message: 'User profile does not exist in the system.'
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    if (userData.role !== 'resident') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Only accounts with the resident role can upload evidence on this endpoint.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // 4. Verify collection request exists and belongs to the authenticated resident
    const { data: requestData, error: requestError } = await supabase
      .from('collection_requests')
      .select('resident_id')
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

    if (requestData.resident_id !== user.id) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only upload evidence for your own collection requests.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // 5. Insert new evidence record
    const { data: newEvidence, error: insertError } = await supabase
      .from('evidence')
      .insert({
        collection_request_id: collectionRequestId,
        evidence_type: evidenceType,
        image_url: imageUrl,
        uploaded_by: user.id,
        verification_status: 'pending'
      })
      .select(`
        id,
        collection_request_id,
        evidence_type,
        image_url,
        uploaded_by,
        uploaded_at,
        verification_status
      `)
      .single();

    if (insertError || !newEvidence) {
      console.error('[POST /api/evidence Database Error]:', insertError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to save evidence.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 6. Return response formatted as DTO
    const formattedData: EvidenceDTO = {
      id: newEvidence.id,
      collectionRequestId: newEvidence.collection_request_id,
      evidenceType: newEvidence.evidence_type,
      imageUrl: newEvidence.image_url,
      uploadedBy: newEvidence.uploaded_by,
      uploadedAt: newEvidence.uploaded_at,
      verificationStatus: newEvidence.verification_status
    };

    const response: ApiResponse<EvidenceDTO> = {
      success: true,
      data: formattedData,
      error: null
    };

    return NextResponse.json(response, { status: 201 });

  } catch (err: any) {
    console.error('[POST /api/evidence Unexpected Error]:', err);
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
