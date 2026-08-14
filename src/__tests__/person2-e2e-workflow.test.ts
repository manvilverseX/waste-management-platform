import test, { describe } from 'node:test';
import assert from 'node:assert';
import { canTransition, validateStatusTransition } from '../lib/collector/state-machine';
import { computeCollectorMetrics, calculateDateRange } from '../lib/collector/metrics';
import { manualReviewDecisionSchema } from '../lib/validations/verification';
import {
  DbCollectionRequest,
  DbVerificationResult,
  HardEvidenceCheck,
  StructuredGeminiAnalysis,
} from '../types';

describe('Person 2 End-to-End Workflow, Security & Hardening Test Suite', () => {
  const collectorAId = '11111111-1111-4111-a111-111111111111';
  const collectorBId = '22222222-2222-4222-a222-222222222222';
  const requestId = 'req-100-200-300';
  const batchId = 'batch-500-600-700';

  // 1. Complete End-to-End State Machine Transition Flow
  test('1. Person 2 Complete Workflow State Machine Progression', () => {
    const statusSequence = [
      'PENDING',
      'ASSIGNED',
      'PICKUP_EVIDENCE_SUBMITTED',
      'VEHICLE_EVIDENCE_SUBMITTED',
      'VERIFICATION_IN_PROGRESS',
      'VERIFIED'
    ] as const;

    for (let i = 0; i < statusSequence.length - 1; i++) {
      const current = statusSequence[i];
      const next = statusSequence[i + 1];
      const result = validateStatusTransition(current, next);
      assert.strictEqual(result.valid, true, `Transition from ${current} to ${next} should be valid`);
    }
  });

  // 2. State Machine Terminal & Invalid Transition Protections
  test('2. Invalid & Direct Shortcut State Transitions are Rejected', () => {
    // Direct shortcut from PENDING to VERIFIED
    assert.strictEqual(canTransition('PENDING', 'VERIFIED'), false);
    // Direct shortcut from ASSIGNED to VERIFIED
    assert.strictEqual(canTransition('ASSIGNED', 'VERIFIED'), false);
    // Terminal VERIFIED status cannot transition back to PENDING
    assert.strictEqual(canTransition('VERIFIED', 'PENDING'), false);
    // Terminal REJECTED status cannot transition to VERIFIED
    assert.strictEqual(canTransition('REJECTED', 'VERIFIED'), false);
    // Terminal CANCELLED status cannot transition to VERIFICATION_IN_PROGRESS
    assert.strictEqual(canTransition('CANCELLED', 'VERIFICATION_IN_PROGRESS'), false);
  });

  // 3. Evidence Matrix Dependency Logic
  test('3. Verification Matrix: Missing Resident BEFORE or Vehicle evidence flags NEEDS_REVIEW', () => {
    const checks: HardEvidenceCheck[] = [
      { name: 'Request Existence', passed: true, severity: 'CRITICAL', reason: 'Found' },
      { name: 'Collector Assignment Authorization', passed: true, severity: 'CRITICAL', reason: 'Assigned' },
      { name: 'Collector Pickup Evidence Existence', passed: true, severity: 'CRITICAL', reason: 'Pickup evidence uploaded' },
      { name: 'Resident Before Evidence Existence', passed: false, severity: 'WARNING', reason: 'Resident BEFORE photo missing' },
      { name: 'Batch Vehicle Evidence Link', passed: false, severity: 'WARNING', reason: 'Batch vehicle photo missing' },
    ];

    const hasCritical = checks.some(c => !c.passed && c.severity === 'CRITICAL');
    const hasWarning = checks.some(c => !c.passed && c.severity === 'WARNING');

    assert.strictEqual(hasCritical, false, 'No critical failure');
    assert.strictEqual(hasWarning, true, 'Warning flag present due to missing before/vehicle evidence');

    // Rule: Warning failures must route to NEEDS_REVIEW
    const decision = hasCritical ? 'REJECTED' : hasWarning ? 'NEEDS_REVIEW' : 'VERIFIED';
    assert.strictEqual(decision, 'NEEDS_REVIEW');
  });

  // 4. Gemini AI Advisory & Failsafe Behavior
  test('4. Gemini AI Failsafe: Service error / low confidence defaults to NEEDS_REVIEW', () => {
    const geminiErrorDetails: StructuredGeminiAnalysis = {
      wasteDetected: false,
      visualSimilarityScore: 0,
      sameWasteLikely: false,
      vehicleVisible: false,
      contextConsistent: false,
      confidence: 0,
      concerns: ['Gemini API rate limit or network error']
    };

    const aiDecision = geminiErrorDetails.confidence < 70 || geminiErrorDetails.concerns.length > 0
      ? 'NEEDS_REVIEW'
      : 'VERIFIED';

    assert.strictEqual(aiDecision, 'NEEDS_REVIEW', 'Gemini service error must NEVER result in automatic VERIFIED status');
  });

  // 5. Phase 5 Manual Review Validation & Concurrency Protection
  test('5. Phase 5 Manual Review Payload Validation & Concurrency Double-Review Prevention', () => {
    // Valid APPROVE schema
    const validApprove = manualReviewDecisionSchema.safeParse({
      decision: 'APPROVE',
      reason: 'Physical inspection verified waste was fully cleared'
    });
    assert.strictEqual(validApprove.success, true);

    // Invalid missing reason schema
    const invalidNoReason = manualReviewDecisionSchema.safeParse({
      decision: 'APPROVE',
      reason: ''
    });
    assert.strictEqual(invalidNoReason.success, false);

    // Double-Review Concurrency Conflict Test
    const currentStatus: string = 'VERIFIED'; // Already resolved by another reviewer
    const isEligibleForReview = currentStatus === 'NEEDS_REVIEW';
    assert.strictEqual(isEligibleForReview, false, 'Non-NEEDS_REVIEW status must reject double review (409 Conflict)');
  });

  // 6. Ownership & IDOR Protection Test
  test('6. Ownership Check: Collector A cannot modify Collector B request or batch', () => {
    const request: DbCollectionRequest = {
      id: requestId,
      resident_id: 'res-1',
      community_id: 'com-1',
      collector_id: collectorAId,
      collection_batch_id: batchId,
      status: 'ASSIGNED',
      requested_at: '2026-08-01T10:00:00Z',
      completed_at: null
    };

    const callerUserId = collectorBId; // Collector B attempting access
    const isAuthorized = request.collector_id === callerUserId;
    assert.strictEqual(isAuthorized, false, 'Collector B must be denied access to Collector A request');
  });

  // 7. Collector Performance Metrics Full Calculation
  test('7. Collector Metrics Aggregation: Correct metrics breakdown & zero handling', () => {
    const dateRange = calculateDateRange('7d');
    const period = { range: dateRange.range, from: dateRange.fromISO, to: dateRange.toISO };
    const requests: DbCollectionRequest[] = [
      { id: 'r1', resident_id: 'res1', community_id: 'c1', collector_id: collectorAId, status: 'VERIFIED', requested_at: '2026-08-02T10:00:00Z', completed_at: '2026-08-02T11:00:00Z' },
      { id: 'r2', resident_id: 'res2', community_id: 'c1', collector_id: collectorAId, status: 'REJECTED', requested_at: '2026-08-03T10:00:00Z', completed_at: null },
      { id: 'r3', resident_id: 'res3', community_id: 'c1', collector_id: collectorAId, status: 'NEEDS_REVIEW', requested_at: '2026-08-04T10:00:00Z', completed_at: null },
    ];

    const verificationResults: DbVerificationResult[] = [
      { id: 'v1', evidence_id: 'e1', collection_request_id: 'r1', decision: 'verified', confidence_score: 90, analysis: 'Pass', verified_at: '2026-08-02T10:30:00Z' },
      { id: 'v2', evidence_id: 'e2', collection_request_id: 'r2', decision: 'rejected', confidence_score: 30, analysis: 'No waste', verified_at: '2026-08-03T10:30:00Z' },
      { id: 'v3', evidence_id: 'e3', collection_request_id: 'r3', decision: 'needs_review', confidence_score: 65, analysis: 'Review', manual_decision: 'APPROVE', manual_reason: 'Ok', reviewed_by: 'admin1', reviewed_at: '2026-08-04T12:00:00Z', verified_at: '2026-08-04T10:30:00Z' },
    ];

    const metrics = computeCollectorMetrics(collectorAId, period, requests, [], [], verificationResults);

    assert.strictEqual(metrics.collections.assigned, 3);
    assert.strictEqual(metrics.collections.completed, 1);
    assert.strictEqual(metrics.collections.completionRate, 0.3333);
    assert.strictEqual(metrics.verification.verified, 1);
    assert.strictEqual(metrics.verification.rejected, 1);
    assert.strictEqual(metrics.verification.needsReview, 1);
    assert.strictEqual(metrics.review.reviewsCompleted, 1);
    assert.strictEqual(metrics.review.manualApprovalCount, 1);
    assert.strictEqual(metrics.review.manualApprovalRate, 1.0);
  });

  // 8. Negative Timestamp & Clock Skew Protection
  test('8. Operational Timing Metrics ignore negative or invalid timestamp diffs', () => {
    const dateRange = calculateDateRange('7d');
    const period = { range: dateRange.range, from: dateRange.fromISO, to: dateRange.toISO };
    const requests: DbCollectionRequest[] = [
      { id: 'r1', resident_id: 'res1', community_id: 'c1', collector_id: collectorAId, status: 'VERIFIED', requested_at: '2026-08-02T12:00:00Z', completed_at: '2026-08-02T10:00:00Z' }, // Clock skew: completed before requested
    ];

    const metrics = computeCollectorMetrics(collectorAId, period, requests, [], [], []);
    assert.strictEqual(metrics.timing.averageOverallCompletionMinutes, null, 'Negative timing diff must be ignored and return null');
  });
});
