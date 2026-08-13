import { createServerSupabaseClient } from '@/lib/supabase/server';
import { analyzeEvidenceWithGemini } from '@/lib/gemini/client';
import { canTransition } from '@/lib/collector/state-machine';
import { calculateHaversineDistanceMeters, GPS_THRESHOLDS } from './haversine';
import {
  DbCollectionRequest,
  DbEvidence,
  HardEvidenceCheck,
  StructuredGeminiAnalysis,
  VerificationResultDTO
} from '@/types';

export interface VerificationEngineResult {
  decision: 'VERIFIED' | 'NEEDS_REVIEW' | 'REJECTED';
  confidenceScore: number;
  reason: string;
  hardEvidenceChecks: HardEvidenceCheck[];
  aiAnalysisDetails: StructuredGeminiAnalysis;
  dto: VerificationResultDTO;
}

export class VerificationEngine {
  /**
   * Executes multi-factor evidence verification for a collection request.
   * Hard Evidence Rules + Structured AI Vision -> Rule-Based Business Decision.
   */
  static async verifyCollectionRequest(
    requestId: string,
    callerUserId: string
  ): Promise<VerificationEngineResult> {
    const supabase = createServerSupabaseClient();
    const checks: HardEvidenceCheck[] = [];

    // 1. Fetch collection request
    const { data: requestData, error: reqError } = await supabase
      .from('collection_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqError || !requestData) {
      checks.push({
        name: 'Request Existence',
        passed: false,
        severity: 'CRITICAL',
        reason: `Collection request '${requestId}' does not exist.`
      });
      return this.buildRejectedResult('REJECTED', 0, 'Collection request not found.', checks, requestId);
    }

    const req: DbCollectionRequest = requestData;

    // 2. Collector Assignment Check
    if (req.collector_id && req.collector_id !== callerUserId) {
      checks.push({
        name: 'Collector Assignment Authorization',
        passed: false,
        severity: 'CRITICAL',
        reason: `Caller '${callerUserId}' is not assigned to collection request '${requestId}'.`
      });
      return this.buildRejectedResult('REJECTED', 0, 'Collector assignment unauthorized.', checks, requestId);
    } else {
      checks.push({
        name: 'Collector Assignment Authorization',
        passed: true,
        severity: 'CRITICAL',
        reason: 'Authenticated collector is assigned to this request.'
      });
    }

    // 3. State Machine Eligibility Check
    const isEligible = canTransition(req.status, 'VERIFICATION_IN_PROGRESS') ||
      req.status === 'PICKUP_EVIDENCE_SUBMITTED' ||
      req.status === 'VEHICLE_EVIDENCE_SUBMITTED' ||
      req.status === 'VERIFICATION_IN_PROGRESS' ||
      req.status === 'NEEDS_REVIEW';

    if (!isEligible) {
      checks.push({
        name: 'State Machine Verification Eligibility',
        passed: false,
        severity: 'CRITICAL',
        reason: `Request is in invalid state '${req.status}' for verification.`
      });
      return this.buildRejectedResult('REJECTED', 0, `Invalid request state '${req.status}'.`, checks, requestId);
    } else {
      checks.push({
        name: 'State Machine Verification Eligibility',
        passed: true,
        severity: 'CRITICAL',
        reason: `Request status '${req.status}' is eligible for verification.`
      });
    }

    // Transition state to VERIFICATION_IN_PROGRESS
    await supabase
      .from('collection_requests')
      .update({ status: 'VERIFICATION_IN_PROGRESS' })
      .eq('id', requestId);

    // 4. Fetch evidence list associated with request
    const { data: evidenceRows } = await supabase
      .from('evidence')
      .select('*')
      .eq('collection_request_id', requestId);

    const evidenceList: DbEvidence[] = evidenceRows || [];

    const beforeEvidence = evidenceList.find((e) => e.evidence_type === 'RESIDENT_BEFORE');
    const afterEvidence = evidenceList.find((e) => e.evidence_type === 'COLLECTOR_AFTER');

    // Structurally Required Evidence Checks
    if (!afterEvidence) {
      checks.push({
        name: 'Collector Pickup Evidence Existence',
        passed: false,
        severity: 'CRITICAL',
        reason: 'Collector pickup evidence photo (COLLECTOR_AFTER) is missing.'
      });
      return this.buildRejectedResult('REJECTED', 0, 'Collector pickup evidence photo missing.', checks, requestId);
    } else {
      checks.push({
        name: 'Collector Pickup Evidence Existence',
        passed: true,
        severity: 'CRITICAL',
        reason: 'Collector pickup evidence photo present.'
      });
    }

    let effectiveBeforeImageUrl = afterEvidence.image_url;
    if (!beforeEvidence) {
      checks.push({
        name: 'Resident Before Evidence Existence',
        passed: false,
        severity: 'WARNING',
        reason: 'Resident BEFORE photo is missing. Final VERIFIED status requires resident before evidence.'
      });
    } else {
      effectiveBeforeImageUrl = beforeEvidence.image_url;
      checks.push({
        name: 'Resident Before Evidence Existence',
        passed: true,
        severity: 'CRITICAL',
        reason: 'Resident BEFORE photo present.'
      });
    }

    // 5. Batch & Vehicle Evidence Checks
    let vehicleEvidenceUrl: string | null = null;
    let vehicleEvidence: DbEvidence | null = null;

    if (req.collection_batch_id) {
      const { data: batchEvRows } = await supabase
        .from('evidence')
        .select('*')
        .eq('collection_batch_id', req.collection_batch_id)
        .eq('evidence_type', 'VEHICLE')
        .limit(1);

      if (batchEvRows && batchEvRows.length > 0) {
        vehicleEvidence = batchEvRows[0];
        vehicleEvidenceUrl = vehicleEvidence?.image_url || null;
        checks.push({
          name: 'Batch Vehicle Evidence Link',
          passed: true,
          severity: 'INFO',
          reason: `Associated batch vehicle photo present for Batch ID '${req.collection_batch_id.slice(0, 8)}'.`
        });
      } else {
        checks.push({
          name: 'Batch Vehicle Evidence Link',
          passed: false,
          severity: 'WARNING',
          reason: 'Request belongs to collection batch, but batch vehicle photo has not been submitted.'
        });
      }
    } else {
      checks.push({
        name: 'Batch Vehicle Evidence Link',
        passed: false,
        severity: 'WARNING',
        reason: 'Request has not been associated with a collection batch with vehicle evidence.'
      });
    }

    // 6. GPS Proximity Haversine Check
    if (beforeEvidence?.latitude && beforeEvidence?.longitude && afterEvidence.latitude && afterEvidence.longitude) {
      const distanceMeters = calculateHaversineDistanceMeters(
        beforeEvidence.latitude,
        beforeEvidence.longitude,
        afterEvidence.latitude,
        afterEvidence.longitude
      );

      if (distanceMeters <= GPS_THRESHOLDS.PREFERRED_DISTANCE_METERS) {
        checks.push({
          name: 'GPS Haversine Proximity',
          passed: true,
          severity: 'INFO',
          reason: `Pickup GPS is within preferred proximity (${distanceMeters}m <= ${GPS_THRESHOLDS.PREFERRED_DISTANCE_METERS}m).`
        });
      } else if (distanceMeters <= GPS_THRESHOLDS.MAX_ACCEPTABLE_DISTANCE_METERS) {
        checks.push({
          name: 'GPS Haversine Proximity',
          passed: false,
          severity: 'WARNING',
          reason: `Pickup GPS is moderately distant (${distanceMeters}m from resident location).`
        });
      } else {
        checks.push({
          name: 'GPS Haversine Proximity',
          passed: false,
          severity: 'WARNING',
          reason: `Pickup GPS exceeds acceptable distance threshold (${distanceMeters}m > ${GPS_THRESHOLDS.MAX_ACCEPTABLE_DISTANCE_METERS}m).`
        });
      }
    }

    // 7. Timestamp Chronology Check
    if (beforeEvidence?.captured_at && afterEvidence.captured_at) {
      const tBefore = new Date(beforeEvidence.captured_at).getTime();
      const tAfter = new Date(afterEvidence.captured_at).getTime();
      const TOLERANCE_MS = 15 * 60 * 1000; // 15-minute tolerance

      if (tBefore <= tAfter + TOLERANCE_MS) {
        checks.push({
          name: 'Timestamp Chronology Ordering',
          passed: true,
          severity: 'INFO',
          reason: 'Pickup capture timestamp is chronologically consistent.'
        });
      } else {
        checks.push({
          name: 'Timestamp Chronology Ordering',
          passed: false,
          severity: 'WARNING',
          reason: 'Pickup capture timestamp appears earlier than resident submission timestamp.'
        });
      }
    }

    // 8. Call Gemini AI Vision Multimodal Analysis
    const aiResult = await analyzeEvidenceWithGemini(
      effectiveBeforeImageUrl,
      afterEvidence.image_url,
      vehicleEvidenceUrl
    );

    // 9. Explicit Decision Matrix Evaluation (0 Undefined Threshold Gaps)
    const criticalFailures = checks.filter((c) => !c.passed && c.severity === 'CRITICAL');
    const warningFailures = checks.filter((c) => !c.passed && c.severity === 'WARNING');

    let finalDecision: 'VERIFIED' | 'NEEDS_REVIEW' | 'REJECTED' = 'VERIFIED';
    let explanationReason = 'Evidence signals support the collection: all hard evidence checks passed and AI visual analysis supports completion.';

    if (criticalFailures.length > 0) {
      finalDecision = 'REJECTED';
      explanationReason = `Deterministic hard evidence failure: ${criticalFailures[0].reason}`;
    } else if (warningFailures.length > 0) {
      finalDecision = 'NEEDS_REVIEW';
      explanationReason = `Evidence flag present: ${warningFailures[0].reason}`;
    } else if (aiResult.decision === 'rejected') {
      finalDecision = 'REJECTED';
      explanationReason = `AI visual analysis determined collection was invalid: ${aiResult.analysis}`;
    } else if (
      aiResult.decision === 'inconclusive' ||
      aiResult.confidenceScore < 70 ||
      !aiResult.structuredDetails.sameWasteLikely ||
      (aiResult.structuredDetails.concerns && aiResult.structuredDetails.concerns.length > 0)
    ) {
      finalDecision = 'NEEDS_REVIEW';
      if (!aiResult.structuredDetails.sameWasteLikely) {
        explanationReason = 'AI visual inspection flagged waste similarity discrepancy between photos.';
      } else if (aiResult.confidenceScore < 70) {
        explanationReason = `AI confidence score (${aiResult.confidenceScore}%) is below verification threshold (70%).`;
      } else {
        explanationReason = `AI visual analysis inconclusive: ${aiResult.analysis}`;
      }
    } else {
      finalDecision = 'VERIFIED';
    }

    // 10. Database Persistence & Audit Log
    const dbStatus = finalDecision === 'VERIFIED' ? 'verified' : finalDecision === 'REJECTED' ? 'rejected' : 'pending';

    // Update evidence table verification_status
    const evidenceIdsToUpdate = evidenceList.map((e) => e.id);
    if (evidenceIdsToUpdate.length > 0) {
      await supabase
        .from('evidence')
        .update({ verification_status: dbStatus })
        .in('id', evidenceIdsToUpdate);
    }

    // Update collection request status
    await supabase
      .from('collection_requests')
      .update({
        status: finalDecision,
        completed_at: finalDecision === 'VERIFIED' ? new Date().toISOString() : null
      })
      .eq('id', requestId);

    // Insert structured audit log into verification_results
    const { data: savedLog, error: logError } = await supabase
      .from('verification_results')
      .insert({
        evidence_id: afterEvidence.id,
        collection_request_id: requestId,
        decision: finalDecision.toLowerCase(),
        confidence_score: aiResult.confidenceScore,
        analysis: aiResult.analysis,
        hard_evidence_checks: checks,
        ai_analysis_details: aiResult.structuredDetails,
        reason: explanationReason
      })
      .select()
      .single();

    if (logError) {
      console.error('[Verification Engine Log Persistence Error]:', logError);
    }

    const dto: VerificationResultDTO = {
      id: savedLog?.id || crypto.randomUUID(),
      evidenceId: afterEvidence.id,
      collectionRequestId: requestId,
      decision: finalDecision.toLowerCase(),
      confidenceScore: aiResult.confidenceScore,
      analysis: aiResult.analysis,
      hardEvidenceChecks: checks,
      aiAnalysisDetails: aiResult.structuredDetails,
      reason: explanationReason,
      verifiedAt: savedLog?.verified_at || new Date().toISOString()
    };

    return {
      decision: finalDecision,
      confidenceScore: aiResult.confidenceScore,
      reason: explanationReason,
      hardEvidenceChecks: checks,
      aiAnalysisDetails: aiResult.structuredDetails,
      dto
    };
  }

  private static buildRejectedResult(
    decision: 'REJECTED',
    confidenceScore: number,
    reason: string,
    checks: HardEvidenceCheck[],
    requestId: string
  ): VerificationEngineResult {
    const aiDetails: StructuredGeminiAnalysis = {
      wasteDetected: false,
      visualSimilarityScore: 0,
      sameWasteLikely: false,
      vehicleVisible: false,
      contextConsistent: false,
      confidence: 0,
      concerns: [reason]
    };

    const dto: VerificationResultDTO = {
      id: crypto.randomUUID(),
      evidenceId: crypto.randomUUID(),
      collectionRequestId: requestId,
      decision: 'rejected',
      confidenceScore: 0,
      analysis: reason,
      hardEvidenceChecks: checks,
      aiAnalysisDetails: aiDetails,
      reason,
      verifiedAt: new Date().toISOString()
    };

    return {
      decision,
      confidenceScore,
      reason,
      hardEvidenceChecks: checks,
      aiAnalysisDetails: aiDetails,
      dto
    };
  }
}
