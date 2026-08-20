import { SupabaseClient } from '@supabase/supabase-js';

export interface VerifyCollectionOptions {
  manualDecision?: 'verified' | 'rejected';
  notes?: string;
}

export interface VerifyCollectionResult {
  decision: 'verified' | 'rejected';
  verificationResultId: string;
  analysis: string;
  confidenceScore: number;
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
  let decision: 'verified' | 'rejected';
  let analysis: string;
  let confidenceScore: number;

  if (manualDecision) {
    decision = manualDecision;
    analysis = notes || `Manual verification: ${manualDecision}`;
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

  // 6. Update the relevant evidence verification status
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

  return {
    decision: verificationResult.decision,
    verificationResultId: verificationResult.id,
    analysis: verificationResult.analysis,
    confidenceScore: verificationResult.confidence_score
  };
}