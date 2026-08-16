import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateImageBuffer } from '@/lib/validations/image';
import { ApiResponse, EvidenceDTO } from '@/types';

/**
 * POST /api/evidence
 * Allows authenticated residents or collectors to upload evidence for collection requests.
 * Expects multipart/form-data containing 'file', 'collectionRequestId', and 'evidenceType'.
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

    // 2. Parse and validate multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request format. Expected multipart/form-data.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    const file = formData.get('file');
    const collectionRequestId = formData.get('collectionRequestId');
    const evidenceType = formData.get('evidenceType');

    if (!file || !(file instanceof File)) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'An evidence photo file is required.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (!collectionRequestId || typeof collectionRequestId !== 'string') {
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

    if (!evidenceType || typeof evidenceType !== 'string') {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'evidenceType is required.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // 3. Verify user exists in public.users
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

    // Role and Evidence Type Enforcement
    if (evidenceType === 'RESIDENT_BEFORE') {
      if (userData.role !== 'resident') {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'FORBIDDEN',
            message: 'Only accounts with the resident role can upload RESIDENT_BEFORE evidence.'
          }
        };
        return NextResponse.json(response, { status: 403 });
      }
    } else if (evidenceType === 'COLLECTOR_AFTER') {
      if (userData.role !== 'collector') {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'FORBIDDEN',
            message: 'Only accounts with the collector role can upload COLLECTOR_AFTER evidence.'
          }
        };
        return NextResponse.json(response, { status: 403 });
      }
    } else {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid evidenceType.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // 4. Verify collection request exists, check permissions, and check status
    const { data: requestData, error: requestError } = await supabase
      .from('collection_requests')
      .select('resident_id, collector_id, status')
      .eq('id', collectionRequestId)
      .maybeSingle();

    if (requestError) {
      console.error('[POST /api/evidence] Database request fetch error:', requestError);
    }

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

    if (evidenceType === 'RESIDENT_BEFORE') {
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

      if (requestData.status !== 'PENDING') {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'INVALID_REQUEST_STATE',
            message: 'Evidence can only be uploaded for requests in PENDING status.'
          }
        };
        return NextResponse.json(response, { status: 400 });
      }
    } else if (evidenceType === 'COLLECTOR_AFTER') {
      if (requestData.collector_id !== user.id) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only upload AFTER evidence for requests assigned to you.'
          }
        };
        return NextResponse.json(response, { status: 403 });
      }

      if (requestData.status !== 'ASSIGNED') {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'INVALID_REQUEST_STATE',
            message: 'AFTER Evidence can only be uploaded for requests in ASSIGNED status.'
          }
        };
        return NextResponse.json(response, { status: 400 });
      }
    }

    // 5. Independent server-side image validation (magic bytes, size, dimensions)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const validationResult = validateImageBuffer(buffer);
    if (!validationResult.isValid) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: validationResult.error || 'Invalid image file integrity or format.'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    // 6. Prevent duplicate evidence of the same type for this collection request
    const { data: existingEvidence, error: evidenceCheckError } = await supabase
      .from('evidence')
      .select('id')
      .eq('collection_request_id', collectionRequestId)
      .eq('evidence_type', evidenceType)
      .maybeSingle();

    if (evidenceCheckError) {
      console.error('[POST /api/evidence Duplicate Check Error]:', evidenceCheckError);
    }

    if (existingEvidence) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DUPLICATE_EVIDENCE',
          message: 'Evidence of this type has already been submitted for this request.'
        }
      };
      return NextResponse.json(response, { status: 409 });
    }

    // 7. Secure storage path generation and upload
    const fileExt = validationResult.format || 'jpg';
    const fileNameSuffix = evidenceType === 'RESIDENT_BEFORE' ? 'before' : 'after';
    const uploadedPath = `${user.id}/${collectionRequestId}/${fileNameSuffix}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('evidence')
      .upload(uploadedPath, buffer, {
        contentType: file.type || `image/${fileExt}`,
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error('[POST /api/evidence Storage Upload Error]:', uploadError);
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'STORAGE_ERROR',
          message: 'Failed to upload evidence image to secure storage.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage
      .from('evidence')
      .getPublicUrl(uploadedPath);

    // 8. Insert new evidence record
    const { data: newEvidence, error: insertError } = await supabase
      .from('evidence')
      .insert({
        collection_request_id: collectionRequestId,
        evidence_type: evidenceType,
        image_url: publicUrl,
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
          message: 'Failed to register evidence in the database.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 9. Update collection request state if COLLECTOR_AFTER
    if (evidenceType === 'COLLECTOR_AFTER') {
      const { error: requestUpdateError } = await supabase
        .from('collection_requests')
        .update({
          status: 'COLLECTED',
          completed_at: new Date().toISOString()
        })
        .eq('id', collectionRequestId);

      if (requestUpdateError) {
        console.error('[POST /api/evidence Status Update Error]:', requestUpdateError);
      }
    }

    // 10. Return response formatted as DTO
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

  } catch (err: unknown) {
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
