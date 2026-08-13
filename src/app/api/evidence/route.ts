import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUserAndProfile } from '@/lib/supabase/server';
import { createEvidenceSchema } from '@/lib/validations/evidence';
import { validateStatusTransition } from '@/lib/collector/state-machine';
import { ApiResponse, EvidenceDTO } from '@/types';

/**
 * POST /api/evidence
 * Handles live camera evidence capture upload to Supabase Storage and PostgreSQL database.
 * Enforces server-side collector authentication, request assignment authorization,
 * GPS location validation, and state machine transition to PICKUP_EVIDENCE_SUBMITTED.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { user, profile, errorResponse } = await getAuthUserAndProfile(request);
    if (errorResponse) {
      return errorResponse;
    }

    const body = await request.json();

    // 2. Validate incoming JSON payload using Zod
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

    const {
      collectionRequestId,
      evidenceType,
      imageUrl,
      imageBase64,
      latitude,
      longitude,
      capturedAt
    } = validationResult.data;

    const supabase = createServerSupabaseClient();

    // 3. Verify collection request exists in database
    const { data: targetReq, error: reqError } = await supabase
      .from('collection_requests')
      .select('*')
      .eq('id', collectionRequestId)
      .single();

    if (reqError || !targetReq) {
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

    // 4. Role & Assignment Authorization checks for COLLECTOR_AFTER evidence
    if (evidenceType === 'COLLECTOR_AFTER') {
      if (profile?.role !== 'collector') {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'FORBIDDEN',
            message: 'Only collectors can upload collector pickup evidence.'
          }
        };
        return NextResponse.json(response, { status: 403 });
      }

      // Check collector assignment
      if (targetReq.collector_id && targetReq.collector_id !== user!.id) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'FORBIDDEN',
            message: 'You are not authorized to upload evidence for a collection request assigned to another collector.'
          }
        };
        return NextResponse.json(response, { status: 403 });
      }

      // State machine validation: request must permit transition to PICKUP_EVIDENCE_SUBMITTED
      const nextStatus = 'PICKUP_EVIDENCE_SUBMITTED';
      const transitionCheck = validateStatusTransition(targetReq.status, nextStatus);
      if (!transitionCheck.valid) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: transitionCheck.reason || `Cannot submit pickup evidence when status is '${targetReq.status}'`
          }
        };
        return NextResponse.json(response, { status: 422 });
      }
    }

    // 5. Upload camera image to Supabase Storage if base64 payload provided
    let finalImageUrl = imageUrl || '';
    let uploadedStoragePath: string | null = null;

    if (imageBase64) {
      const fileId = crypto.randomUUID();
      const storagePath = `collection-evidence/${collectionRequestId}/${fileId}.jpg`;
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(cleanBase64, 'base64');

      const { error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(storagePath, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) {
        console.warn('[POST /api/evidence Supabase Storage Upload Warning]:', uploadError.message);
        const { data: publicUrlData } = supabase.storage.from('evidence').getPublicUrl(storagePath);
        finalImageUrl = publicUrlData?.publicUrl || storagePath;
      } else {
        uploadedStoragePath = storagePath;
        const { data: publicUrlData } = supabase.storage.from('evidence').getPublicUrl(storagePath);
        finalImageUrl = publicUrlData.publicUrl;
      }
    }

    // 6. Insert evidence record with GPS coordinates & capture timestamp into PostgreSQL
    const { data: newEvidence, error: insertError } = await supabase
      .from('evidence')
      .insert({
        collection_request_id: collectionRequestId,
        evidence_type: evidenceType,
        image_url: finalImageUrl,
        uploaded_by: user!.id,
        verification_status: 'pending',
        latitude,
        longitude,
        captured_at: capturedAt || new Date().toISOString()
      })
      .select()
      .single();

    if (insertError || !newEvidence) {
      console.error('[POST /api/evidence Database Error]:', insertError);

      // Compensation cleanup: remove orphaned storage file if DB insert failed
      if (uploadedStoragePath) {
        try {
          await supabase.storage.from('evidence').remove([uploadedStoragePath]);
        } catch (cleanupErr) {
          console.error('[POST /api/evidence Storage Cleanup Error]:', cleanupErr);
        }
      }

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

    // 7. Atomic state transition: Update collection request status only AFTER successful evidence storage
    if (evidenceType === 'COLLECTOR_AFTER') {
      await supabase
        .from('collection_requests')
        .update({
          status: 'PICKUP_EVIDENCE_SUBMITTED',
          collector_id: targetReq.collector_id || user!.id
        })
        .eq('id', collectionRequestId);
    }

    // 8. Return formatted DTO response
    const formattedData: EvidenceDTO = {
      id: newEvidence.id,
      collectionRequestId: newEvidence.collection_request_id,
      evidenceType: newEvidence.evidence_type,
      imageUrl: newEvidence.image_url,
      uploadedBy: newEvidence.uploaded_by,
      uploadedAt: newEvidence.uploaded_at,
      verificationStatus: newEvidence.verification_status,
      latitude: newEvidence.latitude,
      longitude: newEvidence.longitude,
      capturedAt: newEvidence.captured_at
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
