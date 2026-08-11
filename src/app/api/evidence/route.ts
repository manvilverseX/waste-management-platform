import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createEvidenceSchema } from '@/lib/validations/evidence';
import { ApiResponse, EvidenceDTO } from '@/types';

/**
 * POST /api/evidence
 * Allows uploading evidence (RESIDENT_BEFORE or COLLECTOR_AFTER) for a collection request.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 1. Validate incoming JSON payload using Zod
    const validationResult = createEvidenceSchema.safeParse(body);
    if (!validationResult.success) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: validationResult.error.issues[0]?.message || 'Invalid evidence data'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { collectionRequestId, evidenceType, imageUrl } = validationResult.data;
    const supabase = createServerSupabaseClient();

    // 2. Fetch authenticated user (or use system fallback if auth session is mock)
    const { data: { user } } = await supabase.auth.getUser();
    const uploadedBy = user?.id || '00000000-0000-0000-0000-000000000000'; // fallback placeholder for dev testing

    // 3. Verify collection request exists
    const { data: reqExists, error: reqError } = await supabase
      .from('collection_requests')
      .select('id')
      .eq('id', collectionRequestId)
      .single();

    if (reqError || !reqExists) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'COLLECTION_REQUEST_NOT_FOUND',
          message: `Collection request with ID '${collectionRequestId}' does not exist.`
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    // 4. Insert evidence record into Supabase
    const { data: newEvidence, error: insertError } = await supabase
      .from('evidence')
      .insert({
        collection_request_id: collectionRequestId,
        evidence_type: evidenceType,
        image_url: imageUrl,
        uploaded_by: uploadedBy,
        verification_status: 'pending'
      })
      .select()
      .single();

    if (insertError || !newEvidence) {
      console.error('[POST /api/evidence Database Error]:', insertError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to insert evidence record into database.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 5. Return formatted DTO response
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
