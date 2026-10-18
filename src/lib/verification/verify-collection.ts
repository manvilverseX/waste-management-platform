import { SupabaseClient } from '@supabase/supabase-js';

export interface VerifyCollectionOptions {
  manualDecision?: 'verified' | 'rejected';
  notes?: string;
}

export interface VerifyCollectionResult {
  decision: 'verified' | 'rejected' | 'needs_review';
  verificationResultId: string;
  analysis: string;
  confidenceScore: number;
}

// Configurable constants for GPS matching thresholds (in meters)
export const GPS_THRESHOLD = {
  MATCH: 100,
  NEAR: 300
};

// Haversine formula to compute geographic distance in meters
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getPathFromUrl(url: string): string {
  const parts = url.split('/storage/v1/object/public/evidence/');
  if (parts.length > 1) {
    return parts[1];
  }
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/evidence/');
  if (pathParts.length > 1) {
    return decodeURIComponent(pathParts[1]);
  }
  throw new Error(`Unable to extract storage path from URL: ${url}`);
}

async function downloadEvidenceImage(supabase: SupabaseClient, imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  const path = getPathFromUrl(imageUrl);

  const { data: fileData, error } = await supabase.storage
    .from('evidence')
    .download(path);

  if (error || !fileData) {
    throw new Error(`IMAGE_DOWNLOAD_FAILED: Failed to download evidence image at ${path}. ${error?.message || ''}`);
  }

  const mimeType = fileData.type || 'image/jpeg';
  if (!mimeType.startsWith('image/')) {
    throw new Error(`UNSUPPORTED_IMAGE_FORMAT: Stored file is not a valid image format. Mime type: ${mimeType}`);
  }

  const sizeMb = fileData.size / (1024 * 1024);
  if (sizeMb > 10) {
    throw new Error(`IMAGE_OVERSIZED: Image size ${sizeMb.toFixed(2)}MB exceeds safety limit of 10MB.`);
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  return { base64, mimeType };
}

export async function verifyCollectionRequest(
  supabase: SupabaseClient,
  collectionRequestId: string,
  options: VerifyCollectionOptions = {}
): Promise<VerifyCollectionResult> {
  const { manualDecision, notes } = options;

  // 1. Retrieve the collection request
  const { data: requestData, error: requestError } = await supabase
    .from('collection_requests')
    .select('id, status, resident_id, community_id, collector_id')
    .eq('id', collectionRequestId)
    .maybeSingle();

  if (requestError || !requestData) {
    throw new Error('COLLECTION_REQUEST_NOT_FOUND: The specified collection request was not found.');
  }

  // 2. Confirm it is currently eligible for verification (COLLECTED)
  if (requestData.status !== 'COLLECTED') {
    throw new Error('INVALID_REQUEST_STATE: Verification can only be performed on requests with COLLECTED status.');
  }

  // 3. Retrieve the associated evidence records
  const { data: beforeEvidence, error: beforeError } = await supabase
    .from('evidence')
    .select('id, image_url, uploaded_at, verification_status, latitude, longitude')
    .eq('collection_request_id', collectionRequestId)
    .eq('evidence_type', 'RESIDENT_BEFORE')
    .maybeSingle();

  const { data: afterEvidence, error: afterError } = await supabase
    .from('evidence')
    .select('id, image_url, uploaded_at, verification_status, latitude, longitude')
    .eq('collection_request_id', collectionRequestId)
    .eq('evidence_type', 'COLLECTOR_AFTER')
    .maybeSingle();

  if (beforeError || afterError) {
    console.error('[verifyCollectionRequest] Evidence fetch error:', beforeError || afterError);
  }

  if (!beforeEvidence) {
    throw new Error('MISSING_EVIDENCE: RESIDENT_BEFORE evidence is missing for this request.');
  }

  if (!afterEvidence) {
    throw new Error('MISSING_EVIDENCE: COLLECTOR_AFTER evidence is missing for this request.');
  }

  // 4. Calculate GPS Distance Verification Signal
  let gpsDistance: number | null = null;
  let gpsDecision: 'MATCH' | 'NEAR' | 'MISMATCH' | 'UNAVAILABLE' = 'UNAVAILABLE';

  if (
    beforeEvidence.latitude !== null && beforeEvidence.longitude !== null &&
    afterEvidence.latitude !== null && afterEvidence.longitude !== null
  ) {
    gpsDistance = calculateHaversineDistance(
      beforeEvidence.latitude,
      beforeEvidence.longitude,
      afterEvidence.latitude,
      afterEvidence.longitude
    );

    if (gpsDistance <= GPS_THRESHOLD.MATCH) {
      gpsDecision = 'MATCH';
    } else if (gpsDistance <= GPS_THRESHOLD.NEAR) {
      gpsDecision = 'NEAR';
    } else {
      gpsDecision = 'MISMATCH';
    }
  }

  // 5. Perform image verification logic
  let imageDecision: 'verified' | 'rejected' | 'needs_review' = 'needs_review';
  let imageAnalysis = '';
  let confidenceScore = 0;

  if (manualDecision) {
    imageDecision = manualDecision;
    imageAnalysis = notes || `Manual verification: ${manualDecision}`;
    confidenceScore = imageDecision === 'verified' ? 100 : 0;
  } else {
    // Automated Grok vision verification flow
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      console.warn('[verifyCollectionRequest] XAI_API_KEY environment variable is not defined. Defaulting to safe review.');
      imageDecision = 'needs_review';
      imageAnalysis = 'Verification requires manual review. Reason: Grok API key is not configured on the server.';
      confidenceScore = 0;
    } else {
      try {
        const beforeUrl = beforeEvidence.image_url;
        const afterUrl = afterEvidence.image_url;

        // Always compare the actual evidence images. Identical URLs are not proof
        // that waste was removed, so never auto-verify based on URL equality.
        const [imgBefore, imgAfter] = await Promise.all([
          downloadEvidenceImage(supabase, beforeUrl),
          downloadEvidenceImage(supabase, afterUrl)
        ]);

        const PROMPT = `You are an expert system verifying waste collection requests.
Analyze two attached images of a waste collection site:
1. First image: BEFORE evidence (should contain waste/garbage).
2. Second image: AFTER evidence (should be clean/empty after collection).

Determine whether the waste was successfully collected and removed.

Rules:
- Do not assume collection occurred merely because images are different.
- Compare visible waste between BEFORE and AFTER and look for meaningful evidence of removal.
- Do not treat different camera angles, lighting, or image differences alone as proof.
- If either image is dark, blurry, obstructed, unrelated, or ambiguous, return "needs_review" with low confidence.
- Do not perform facial recognition or infer anyone's identity. Focus only on waste and collection evidence.
- Return only a valid JSON object with this exact shape:
{
  "decision": "verified" | "rejected" | "needs_review",
  "confidence": number from 0 to 1,
  "before_assessment": { "waste_visible": boolean, "summary": string },
  "after_assessment": { "waste_removed": boolean, "summary": string },
  "same_location_likelihood": number from 0 to 1,
  "reasoning": string
}
Use "verified" only when there is clear visual evidence that the waste was removed and both images likely show the same location. Use "rejected" only when the evidence clearly indicates collection was not completed or is fraudulent; otherwise prefer "needs_review".`;

        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'grok-4.7',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${imgBefore.mimeType};base64,${imgBefore.base64}`,
                      detail: 'high'
                    }
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${imgAfter.mimeType};base64,${imgAfter.base64}`,
                      detail: 'high'
                    }
                  },
                  { type: 'text', text: PROMPT }
                ]
              }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1
          })
        });

        if (!response.ok) {
          throw new Error(`GROK_API_ERROR: Grok service responded with HTTP status ${response.status}`);
        }

        const responseJson = await response.json();
        const responseText = responseJson.choices?.[0]?.message?.content;
        if (typeof responseText !== 'string' || !responseText.trim()) {
          throw new Error('MALFORMED_MODEL_RESPONSE: Missing text content in Grok response.');
        }

        const resultObj = JSON.parse(responseText);
        const validDecisions = ['verified', 'rejected', 'needs_review'];
        if (
          !validDecisions.includes(resultObj.decision) ||
          typeof resultObj.confidence !== 'number' ||
          !Number.isFinite(resultObj.confidence) ||
          resultObj.confidence < 0 ||
          resultObj.confidence > 1 ||
          typeof resultObj.same_location_likelihood !== 'number' ||
          !Number.isFinite(resultObj.same_location_likelihood)
        ) {
          throw new Error('SCHEMA_VALIDATION_FAILURE: Grok response has invalid decision or confidence values.');
        }

        const parsedDecision = resultObj.decision as 'verified' | 'rejected' | 'needs_review';
        const confidence = resultObj.confidence;
        const sameLocation = resultObj.same_location_likelihood;

        if (parsedDecision === 'verified' && confidence >= 0.70 && sameLocation >= 0.60) {
          imageDecision = 'verified';
        } else {
          // Conservative policy: model rejection is also sent to a human reviewer.
          imageDecision = 'needs_review';
        }

        imageAnalysis = `Grok Analysis: Decision=${parsedDecision}, Confidence=${confidence * 100}%, SameLocation=${sameLocation * 100}%. Reasoning: ${String(resultObj.reasoning || 'No reasoning provided.')}`;
        confidenceScore = confidence * 100;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('[verifyCollectionRequest] Automated Grok verification failed, falling back to manual review:', err);
        imageDecision = 'needs_review';
        imageAnalysis = `Automated Grok verification error (falling back to manual review): ${errorMessage}`;
        confidenceScore = 0;
      }
    }
  }

  // 6. Combine Image & GPS verification signals
  let decision: 'verified' | 'rejected' | 'needs_review' = imageDecision;
  let analysis = imageAnalysis;

  if (!manualDecision) {
    if (imageDecision === 'verified') {
      if (gpsDecision === 'MISMATCH') {
        decision = 'needs_review'; // GPS discrepancy triggers manual review!
        analysis = `${imageAnalysis} | [GPS Verification failed: MISMATCH (distance: ${gpsDistance?.toFixed(1)}m exceeds threshold). Gated for manual review]`;
      } else if (gpsDecision === 'NEAR') {
        analysis = `${imageAnalysis} | [GPS Verification: NEAR (distance: ${gpsDistance?.toFixed(1)}m. Auto-verified)]`;
      } else if (gpsDecision === 'MATCH') {
        analysis = `${imageAnalysis} | [GPS Verification: MATCH (distance: ${gpsDistance?.toFixed(1)}m. Auto-verified)]`;
      } else {
        analysis = `${imageAnalysis} | [GPS Verification: UNAVAILABLE (Missing location coordinates. Defaulting to image-only verification)]`;
      }
    } else {
      if (gpsDecision !== 'UNAVAILABLE') {
        analysis = `${imageAnalysis} | [GPS: ${gpsDecision} (distance: ${gpsDistance?.toFixed(1)}m)]`;
      }
    }
  }

  // 7. Insert the verification result
  const { data: verificationResult, error: verificationError } = await supabase
    .from('verification_results')
    .insert({
      evidence_id: afterEvidence.id,
      decision,
      confidence_score: confidenceScore,
      analysis,
      gps_distance: gpsDistance,
      gps_decision: gpsDecision
    })
    .select('id, evidence_id, decision, confidence_score, analysis, verified_at, gps_distance, gps_decision')
    .single();

  if (verificationError || !verificationResult) {
    console.error('[verifyCollectionRequest] Database insert error:', verificationError);
    throw new Error('DATABASE_ERROR: Failed to record verification result.');
  }

  // 8. Update the relevant evidence verification status (only if verified or rejected)
  if (decision === 'verified' || decision === 'rejected') {
    const { error: evidenceUpdateError } = await supabase
      .from('evidence')
      .update({ verification_status: decision })
      .eq('id', afterEvidence.id);

    if (evidenceUpdateError) {
      console.error('[verifyCollectionRequest] Evidence status update error:', evidenceUpdateError);
    }

    // 9. Update the collection request status to VERIFIED or REJECTED
    const newStatus = decision === 'verified' ? 'VERIFIED' : 'REJECTED';
    const { error: requestUpdateError } = await supabase
      .from('collection_requests')
      .update({ status: newStatus })
      .eq('id', collectionRequestId);

    if (requestUpdateError) {
      console.error('[verifyCollectionRequest] Collection request status update error:', requestUpdateError);
      throw new Error('DATABASE_ERROR: Failed to update collection request status.');
    }
  } else {
    console.log(`[verifyCollectionRequest] Request ${collectionRequestId} requires manual review. Status remains COLLECTED.`);
  }

  return {
    decision,
    verificationResultId: verificationResult.id,
    analysis: verificationResult.analysis,
    confidenceScore: Number(verificationResult.confidence_score)
  };
}