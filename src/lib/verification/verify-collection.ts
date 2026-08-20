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
    console.error('[verifyCollectionRequest] Evidence fetch error:', beforeError || afterError);
  }

  if (!beforeEvidence) {
    throw new Error('MISSING_EVIDENCE: RESIDENT_BEFORE evidence is missing for this request.');
  }

  if (!afterEvidence) {
    throw new Error('MISSING_EVIDENCE: COLLECTOR_AFTER evidence is missing for this request.');
  }

  // 4. Perform verification logic
  let decision: 'verified' | 'rejected' | 'needs_review';
  let analysis: string;
  let confidenceScore: number;

  if (manualDecision) {
    decision = manualDecision;
    analysis = notes || `Manual verification: ${manualDecision}`;
    confidenceScore = decision === 'verified' ? 100 : 0;
  } else {
    // Automated Gemini Verification Flow
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[verifyCollectionRequest] GEMINI_API_KEY environment variable is not defined. Defaulting to safe review.');
      decision = 'needs_review';
      analysis = 'Verification requires manual review. Reason: Gemini API Key is not configured on the server.';
      confidenceScore = 0;
    } else {
      try {
        const beforeUrl = beforeEvidence.image_url;
        const afterUrl = afterEvidence.image_url;

        // Fast-path duplicate check
        if (beforeUrl === afterUrl) {
          decision = 'rejected';
          analysis = 'Automated check failed: BEFORE and AFTER images are identical (same URL). Possible duplicate upload.';
          confidenceScore = 90;
        } else {
          // Fetch images and send to Gemini
          const [imgBefore, imgAfter] = await Promise.all([
            downloadEvidenceImage(supabase, beforeUrl),
            downloadEvidenceImage(supabase, afterUrl)
          ]);

          const PROMPT = `You are an expert system verifying waste collection requests.
Analyze the two attached images of a waste collection site:
1. First image: BEFORE evidence (should contain waste/garbage).
2. Second image: AFTER evidence (should be clean/empty after waste collection).

Your task is to determine if the waste has been successfully collected and removed.

Rules:
1. Do not assume collection occurred merely because images are different.
2. Compare the visible waste between BEFORE and AFTER.
3. Look for meaningful visual evidence of removal (e.g. empty container, clean ground where garbage was piled).
4. Do not treat image differences or simple angles as proof.
5. If the images are too dark, blurry, obstructed, unrelated, or too ambiguous to compare, return decision "needs_review" and a low confidence score.
6. Do not perform facial recognition or infer the identity of any people.
7. Focus only on waste/evidence relevant to collection.

Output a structured JSON response matching the schema.`;

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        inlineData: {
                          mimeType: imgBefore.mimeType,
                          data: imgBefore.base64
                        }
                      },
                      {
                        inlineData: {
                          mimeType: imgAfter.mimeType,
                          data: imgAfter.base64
                        }
                      },
                      {
                        text: PROMPT
                      }
                    ]
                  }
                ],
                generationConfig: {
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: 'object',
                    properties: {
                      decision: {
                        type: 'string',
                        enum: ['verified', 'rejected', 'needs_review']
                      },
                      confidence: {
                        type: 'number'
                      },
                      before_assessment: {
                        type: 'object',
                        properties: {
                          waste_visible: { type: 'boolean' },
                          summary: { type: 'string' }
                        },
                        required: ['waste_visible', 'summary']
                      },
                      after_assessment: {
                        type: 'object',
                        properties: {
                          waste_removed: { type: 'boolean' },
                          summary: { type: 'string' }
                        },
                        required: ['waste_removed', 'summary']
                      },
                      same_location_likelihood: {
                        type: 'number'
                      },
                      reasoning: {
                        type: 'string'
                      }
                    },
                    required: [
                      'decision',
                      'confidence',
                      'before_assessment',
                      'after_assessment',
                      'same_location_likelihood',
                      'reasoning'
                    ]
                  }
                }
              })
            }
          );

          if (!response.ok) {
            throw new Error(`GEMINI_API_ERROR: Gemini service responded with HTTP status ${response.status}`);
          }

          const responseJson = await response.json();
          const responseText = responseJson.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!responseText) {
            throw new Error('MALFORMED_MODEL_RESPONSE: Missing text content in Gemini response.');
          }

          const resultObj = JSON.parse(responseText);

          // Validate fields exist
          if (!resultObj.decision || typeof resultObj.confidence !== 'number') {
            throw new Error('SCHEMA_VALIDATION_FAILURE: Gemini response missing decision or confidence.');
          }

          // Apply decision policy
          const parsedDecision = resultObj.decision;
          const confidence = resultObj.confidence;
          const sameLocation = resultObj.same_location_likelihood ?? 1.0;

          if (parsedDecision === 'verified' && confidence >= 0.70 && sameLocation >= 0.60) {
            decision = 'verified';
          } else if (parsedDecision === 'rejected') {
            decision = 'rejected';
          } else {
            decision = 'needs_review';
          }

          analysis = `Gemini Analysis: Decision=${resultObj.decision}, Confidence=${resultObj.confidence * 100}%, SameLocation=${sameLocation * 100}%. Reasoning: ${resultObj.reasoning}`;
          confidenceScore = confidence * 100;
        }
      } catch (err: any) {
        console.error('[verifyCollectionRequest] Automated verification failed, falling back to manual review:', err);
        decision = 'needs_review';
        analysis = `Automated verification error (falling back to manual review): ${err.message || 'Unknown error'}`;
        confidenceScore = 0;
      }
    }
  }

  // 5. Insert the verification result
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
    console.error('[verifyCollectionRequest] Database insert error:', verificationError);
    throw new Error('DATABASE_ERROR: Failed to record verification result.');
  }

  // 6. Update the relevant evidence verification status (only if verified or rejected)
  if (decision === 'verified' || decision === 'rejected') {
    const { error: evidenceUpdateError } = await supabase
      .from('evidence')
      .update({ verification_status: decision })
      .eq('id', afterEvidence.id);

    if (evidenceUpdateError) {
      console.error('[verifyCollectionRequest] Evidence status update error:', evidenceUpdateError);
    }

    // 7. Update the collection request status to VERIFIED or REJECTED
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
    // If it is 'needs_review', we leave evidence status as 'pending' and request status as 'COLLECTED'
    // This allows collectors or municipality to review and manually override/verify it later.
    console.log(`[verifyCollectionRequest] Request ${collectionRequestId} requires manual review. Status remains COLLECTED.`);
  }

  return {
    decision,
    verificationResultId: verificationResult.id,
    analysis: verificationResult.analysis,
    confidenceScore: Number(verificationResult.confidence_score)
  };
}