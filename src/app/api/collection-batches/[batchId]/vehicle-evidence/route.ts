import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, requireCollectorAuth } from '@/lib/supabase/server';
import { createEvidenceSchema } from '@/lib/validations/evidence';
import { ApiResponse, EvidenceDTO } from '@/types';

/**
 * POST /api/collection-batches/:batchId/vehicle-evidence
 * Handles camera vehicle photo upload to Supabase Storage and PostgreSQL database.
 * Updates batch status to VEHICLE_EVIDENCE_SUBMITTED and transitions all included requests.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    // 1. Authenticate user & verify collector role
    const { user, errorResponse } = await requireCollectorAuth(request);
    if (errorResponse) {
      return errorResponse;
    }

    const { batchId } = await params;
    const body = await request.json();

    // 2. Validate incoming JSON payload using Zod
    const validationResult = createEvidenceSchema.safeParse({
      ...body,
      collectionBatchId: batchId,
      evidenceType: 'VEHICLE'
    });

    if (!validationResult.success) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: validationResult.error.issues[0]?.message || 'Invalid vehicle evidence data'
        }
      };
      return NextResponse.json(response, { status: 400 });
    }

    const {
      imageUrl,
      imageBase64,
      latitude,
      longitude,
      capturedAt
    } = validationResult.data;

    const supabase = createServerSupabaseClient();

    // 3. Fetch batch details & verify collector ownership
    const { data: targetBatch, error: batchError } = await supabase
      .from('collection_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (batchError || !targetBatch) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: `Collection batch with ID '${batchId}' not found.`
        }
      };
      return NextResponse.json(response, { status: 404 });
    }

    if (targetBatch.collector_id !== user!.id) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to submit vehicle evidence for another collector\'s batch.'
        }
      };
      return NextResponse.json(response, { status: 403 });
    }

    // 4. Verify batch is not empty and contains eligible requests
    const { data: batchRequests, error: reqsFetchError } = await supabase
      .from('collection_requests')
      .select('id, status')
      .eq('collection_batch_id', batchId);

    if (reqsFetchError || !batchRequests || batchRequests.length === 0) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'EMPTY_BATCH',
          message: 'Cannot submit vehicle evidence for an empty batch. Please add pickup requests to the batch first.'
        }
      };
      return NextResponse.json(response, { status: 422 });
    }

    // 4.5. Verify vehicle evidence has not already been submitted for this batch (Single vehicle evidence per batch)
    const { data: existingVehicleEv } = await supabase
      .from('evidence')
      .select('id')
      .eq('collection_batch_id', batchId)
      .eq('evidence_type', 'VEHICLE')
      .maybeSingle();

    if (existingVehicleEv) {
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DUPLICATE_VEHICLE_EVIDENCE',
          message: 'Vehicle evidence has already been submitted for this batch.'
        }
      };
      return NextResponse.json(response, { status: 409 });
    }

    // 5. Upload vehicle camera image to Supabase Storage
    let finalImageUrl = imageUrl || '';
    let uploadedStoragePath: string | null = null;

    if (imageBase64) {
      const fileId = crypto.randomUUID();
      const storagePath = `collection-evidence/batches/${batchId}/${fileId}.jpg`;
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(cleanBase64, 'base64');

      const { error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(storagePath, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) {
        console.warn('[POST vehicle-evidence Supabase Storage Warning]:', uploadError.message);
        const { data: publicUrlData } = supabase.storage.from('evidence').getPublicUrl(storagePath);
        finalImageUrl = publicUrlData?.publicUrl || storagePath;
      } else {
        uploadedStoragePath = storagePath;
        const { data: publicUrlData } = supabase.storage.from('evidence').getPublicUrl(storagePath);
        finalImageUrl = publicUrlData.publicUrl;
      }
    }

    // 6. Insert VEHICLE evidence record into PostgreSQL
    const { data: newEvidence, error: insertError } = await supabase
      .from('evidence')
      .insert({
        collection_batch_id: batchId,
        evidence_type: 'VEHICLE',
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
      console.error('[POST vehicle-evidence Database Insert Error]:', insertError);

      // Compensation cleanup: remove uploaded file if DB insert fails
      if (uploadedStoragePath) {
        try {
          await supabase.storage.from('evidence').remove([uploadedStoragePath]);
        } catch (cleanupErr) {
          console.error('[POST vehicle-evidence Storage Cleanup Error]:', cleanupErr);
        }
      }

      const response: ApiResponse<null> = {
        success: false,
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to insert vehicle evidence record into database.'
        }
      };
      return NextResponse.json(response, { status: 500 });
    }

    // 7. Update batch status to VEHICLE_EVIDENCE_SUBMITTED
    await supabase
      .from('collection_batches')
      .update({
        status: 'VEHICLE_EVIDENCE_SUBMITTED',
        updated_at: new Date().toISOString()
      })
      .eq('id', batchId);

    // 8. Update all collection requests belonging to this batch to VEHICLE_EVIDENCE_SUBMITTED
    const batchRequestIds = batchRequests.map((r) => r.id);
    await supabase
      .from('collection_requests')
      .update({ status: 'VEHICLE_EVIDENCE_SUBMITTED' })
      .in('id', batchRequestIds);

    // 9. Return formatted DTO response
    const formattedData: EvidenceDTO = {
      id: newEvidence.id,
      collectionBatchId: newEvidence.collection_batch_id,
      evidenceType: 'VEHICLE',
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
    console.error('[POST vehicle-evidence Unexpected Error]:', err);
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
