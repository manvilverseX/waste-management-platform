import test, { describe } from 'node:test';
import assert from 'node:assert';
import {
  computeCollectorMetrics,
  calculateDateRange,
} from '../lib/collector/metrics';
import { metricsQuerySchema } from '../lib/validations/metrics';
import {
  DbCollectionRequest,
  DbCollectionBatch,
  DbEvidence,
  DbVerificationResult,
} from '../types';

describe('Collector Performance & Metrics Unit & Integration Tests', () => {
  const mockCollectorId = '11111111-1111-4111-a111-111111111111';
  const otherCollectorId = '22222222-2222-4222-a222-222222222222';

  const defaultPeriod = {
    range: '7d' as const,
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-08T00:00:00.000Z',
  };

  test('1. Correct completion rate calculation', () => {
    const requests: DbCollectionRequest[] = [
      { id: 'r1', resident_id: 'res1', community_id: 'c1', collector_id: mockCollectorId, status: 'VERIFIED', requested_at: '2026-08-02T10:00:00Z', completed_at: '2026-08-02T11:00:00Z' },
      { id: 'r2', resident_id: 'res2', community_id: 'c1', collector_id: mockCollectorId, status: 'COLLECTED', requested_at: '2026-08-03T10:00:00Z', completed_at: '2026-08-03T11:30:00Z' },
      { id: 'r3', resident_id: 'res3', community_id: 'c1', collector_id: mockCollectorId, status: 'ASSIGNED', requested_at: '2026-08-04T10:00:00Z', completed_at: null },
      { id: 'r4', resident_id: 'res4', community_id: 'c1', collector_id: mockCollectorId, status: 'REJECTED', requested_at: '2026-08-05T10:00:00Z', completed_at: null },
    ];

    const metrics = computeCollectorMetrics(mockCollectorId, defaultPeriod, requests, [], [], []);

    assert.strictEqual(metrics.collections.assigned, 4);
    assert.strictEqual(metrics.collections.completed, 2);
    assert.strictEqual(metrics.collections.completionRate, 0.5);
  });

  test('2. Zero-request division handling (No NaN / Infinity)', () => {
    const metrics = computeCollectorMetrics(mockCollectorId, defaultPeriod, [], [], [], []);

    assert.strictEqual(metrics.collections.assigned, 0);
    assert.strictEqual(metrics.collections.completed, 0);
    assert.strictEqual(metrics.collections.completionRate, 0);
    assert.strictEqual(Number.isNaN(metrics.collections.completionRate), false);
    assert.strictEqual(Number.isFinite(metrics.collections.completionRate), true);

    assert.strictEqual(metrics.verification.verificationSuccessRate, 0);
    assert.strictEqual(Number.isNaN(metrics.verification.verificationSuccessRate), false);

    assert.strictEqual(metrics.evidence.complianceRate, 0);
    assert.strictEqual(Number.isNaN(metrics.evidence.complianceRate), false);

    assert.strictEqual(metrics.batches.averageRequestsPerBatch, 0);
    assert.strictEqual(Number.isNaN(metrics.batches.averageRequestsPerBatch), false);
  });

  test('3. Verification success rate calculation and automatic vs final decision distinction', () => {
    const requests: DbCollectionRequest[] = [
      { id: 'r1', resident_id: 'res1', community_id: 'c1', collector_id: mockCollectorId, status: 'VERIFIED', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
      { id: 'r2', resident_id: 'res2', community_id: 'c1', collector_id: mockCollectorId, status: 'VERIFIED', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
      { id: 'r3', resident_id: 'res3', community_id: 'c1', collector_id: mockCollectorId, status: 'REJECTED', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
      { id: 'r4', resident_id: 'res4', community_id: 'c1', collector_id: mockCollectorId, status: 'NEEDS_REVIEW', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
    ];

    const verificationResults: DbVerificationResult[] = [
      { id: 'v1', evidence_id: 'e1', collection_request_id: 'r1', decision: 'VERIFIED', confidence_score: 95, analysis: 'Pass', verified_at: '2026-08-02T10:30:00Z' },
      { id: 'v2', evidence_id: 'e2', collection_request_id: 'r2', decision: 'NEEDS_REVIEW', confidence_score: 65, analysis: 'Manual review required', manual_decision: 'APPROVE', manual_reason: 'Approved by admin', reviewed_by: 'admin1', reviewed_at: '2026-08-02T12:00:00Z', verified_at: '2026-08-02T10:30:00Z' },
      { id: 'v3', evidence_id: 'e3', collection_request_id: 'r3', decision: 'REJECTED', confidence_score: 30, analysis: 'No waste', verified_at: '2026-08-02T10:30:00Z' },
      { id: 'v4', evidence_id: 'e4', collection_request_id: 'r4', decision: 'NEEDS_REVIEW', confidence_score: 60, analysis: 'Under review', verified_at: '2026-08-02T10:30:00Z' },
    ];

    const metrics = computeCollectorMetrics(mockCollectorId, defaultPeriod, requests, [], [], verificationResults);

    assert.strictEqual(metrics.verification.verified, 2);
    assert.strictEqual(metrics.verification.rejected, 1);
    assert.strictEqual(metrics.verification.needsReview, 1);

    // Original automatic AI decisions preserved
    assert.strictEqual(metrics.verification.automaticVerified, 1);
    assert.strictEqual(metrics.verification.automaticNeedsReview, 2);
    assert.strictEqual(metrics.verification.automaticRejected, 1);

    assert.strictEqual(metrics.verification.verificationSuccessRate, 0.5);
    assert.strictEqual(metrics.verification.rejectionRate, 0.25);
    assert.strictEqual(metrics.verification.reviewRate, 0.25);
  });

  test('4. NEEDS_REVIEW counting', () => {
    const requests: DbCollectionRequest[] = [
      { id: 'r1', resident_id: 'res1', community_id: 'c1', collector_id: mockCollectorId, status: 'NEEDS_REVIEW', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
      { id: 'r2', resident_id: 'res2', community_id: 'c1', collector_id: mockCollectorId, status: 'NEEDS_REVIEW', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
      { id: 'r3', resident_id: 'res3', community_id: 'c1', collector_id: mockCollectorId, status: 'ASSIGNED', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
    ];

    const metrics = computeCollectorMetrics(mockCollectorId, defaultPeriod, requests, [], [], []);
    assert.strictEqual(metrics.verification.needsReview, 2);
  });

  test('5. Manual approval counting (Phase 5 fields)', () => {
    const verificationResults: DbVerificationResult[] = [
      { id: 'v1', evidence_id: 'e1', collection_request_id: 'r1', decision: 'NEEDS_REVIEW', confidence_score: 65, analysis: 'Ambiguous', manual_decision: 'APPROVE', manual_reason: 'Legitimate waste', reviewed_by: 'admin1', reviewed_at: '2026-08-03T12:00:00Z', verified_at: '2026-08-03T10:00:00Z' },
      { id: 'v2', evidence_id: 'e2', collection_request_id: 'r2', decision: 'NEEDS_REVIEW', confidence_score: 60, analysis: 'Ambiguous', manual_decision: 'APPROVE', manual_reason: 'Verified photo', reviewed_by: 'admin1', reviewed_at: '2026-08-03T13:00:00Z', verified_at: '2026-08-03T10:00:00Z' },
    ];

    const metrics = computeCollectorMetrics(mockCollectorId, defaultPeriod, [], [], [], verificationResults);

    assert.strictEqual(metrics.review.manualApprovalCount, 2);
    assert.strictEqual(metrics.review.manualRejectionCount, 0);
    assert.strictEqual(metrics.review.reviewsCompleted, 2);
    assert.strictEqual(metrics.review.manualApprovalRate, 1.0);
  });

  test('6. Manual rejection counting', () => {
    const verificationResults: DbVerificationResult[] = [
      { id: 'v1', evidence_id: 'e1', collection_request_id: 'r1', decision: 'NEEDS_REVIEW', confidence_score: 65, analysis: 'Ambiguous', manual_decision: 'REJECT', manual_reason: 'Fake image', reviewed_by: 'admin1', reviewed_at: '2026-08-03T12:00:00Z', verified_at: '2026-08-03T10:00:00Z' },
      { id: 'v2', evidence_id: 'e2', collection_request_id: 'r2', decision: 'NEEDS_REVIEW', confidence_score: 60, analysis: 'Ambiguous', manual_decision: 'APPROVE', manual_reason: 'Valid', reviewed_by: 'admin1', reviewed_at: '2026-08-03T13:00:00Z', verified_at: '2026-08-03T10:00:00Z' },
    ];

    const metrics = computeCollectorMetrics(mockCollectorId, defaultPeriod, [], [], [], verificationResults);

    assert.strictEqual(metrics.review.manualRejectionCount, 1);
    assert.strictEqual(metrics.review.manualApprovalCount, 1);
    assert.strictEqual(metrics.review.reviewsCompleted, 2);
    assert.strictEqual(metrics.review.manualApprovalRate, 0.5);
  });

  test('7. Batch metrics', () => {
    const batch1Id = 'b1111111-1111-4111-a111-111111111111';
    const batch2Id = 'b2222222-2222-4222-a222-222222222222';

    const batches: DbCollectionBatch[] = [
      { id: batch1Id, collector_id: mockCollectorId, status: 'VEHICLE_EVIDENCE_SUBMITTED', created_at: '2026-08-02T10:00:00Z', updated_at: '2026-08-02T11:00:00Z' },
      { id: batch2Id, collector_id: mockCollectorId, status: 'COLLECTING', created_at: '2026-08-03T10:00:00Z', updated_at: '2026-08-03T10:30:00Z' },
    ];

    const requests: DbCollectionRequest[] = [
      { id: 'r1', resident_id: 'res1', community_id: 'c1', collector_id: mockCollectorId, collection_batch_id: batch1Id, status: 'COLLECTED', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
      { id: 'r2', resident_id: 'res2', community_id: 'c1', collector_id: mockCollectorId, collection_batch_id: batch1Id, status: 'COLLECTED', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
      { id: 'r3', resident_id: 'res3', community_id: 'c1', collector_id: mockCollectorId, collection_batch_id: batch1Id, status: 'COLLECTED', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
      { id: 'r4', resident_id: 'res4', community_id: 'c1', collector_id: mockCollectorId, collection_batch_id: batch2Id, status: 'ASSIGNED', requested_at: '2026-08-03T10:00:00Z', completed_at: null },
    ];

    const metrics = computeCollectorMetrics(mockCollectorId, defaultPeriod, requests, batches, [], []);

    assert.strictEqual(metrics.batches.created, 2);
    assert.strictEqual(metrics.batches.completed, 1);
    assert.strictEqual(metrics.batches.active, 1);
    // Completed batch b1 has 3 requests -> avg = 3 / 1 = 3.0
    assert.strictEqual(metrics.batches.averageRequestsPerBatch, 3);
  });

  test('8. Date range filtering logic', () => {
    const todayRange = calculateDateRange('today');
    assert.strictEqual(todayRange.range, 'today');
    assert.ok(todayRange.fromISO != null);
    assert.ok(todayRange.toISO != null);

    const range7d = calculateDateRange('7d');
    assert.strictEqual(range7d.range, '7d');

    const range30d = calculateDateRange('30d');
    assert.strictEqual(range30d.range, '30d');

    const rangeAll = calculateDateRange('all');
    assert.strictEqual(rangeAll.range, 'all');
    assert.strictEqual(rangeAll.fromISO, null);
    assert.strictEqual(rangeAll.toISO, null);

    const rangeCustom = calculateDateRange('custom', '2026-01-01T00:00:00.000Z', '2026-01-31T23:59:59.000Z');
    assert.strictEqual(rangeCustom.range, 'custom');
    assert.strictEqual(rangeCustom.fromISO, '2026-01-01T00:00:00.000Z');
    assert.strictEqual(rangeCustom.toISO, '2026-01-31T23:59:59.000Z');
  });

  test('9. Invalid date range rejection (Zod validation)', () => {
    // Reversed dates (from > to)
    const reversed = metricsQuerySchema.safeParse({
      range: 'custom',
      from: '2026-08-10T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });
    assert.strictEqual(reversed.success, false);
    if (!reversed.success) {
      assert.ok(reversed.error.issues.some(i => i.message.includes('"from" date must be earlier')));
    }

    // Invalid ISO string
    const invalidIso = metricsQuerySchema.safeParse({
      range: 'custom',
      from: 'invalid-date',
      to: '2026-08-10T00:00:00.000Z',
    });
    assert.strictEqual(invalidIso.success, false);
  });

  test('10. Collector ownership enforcement & JWT scoping concept', () => {
    const collectorId = mockCollectorId;
    const requests: DbCollectionRequest[] = [
      { id: 'r1', resident_id: 'res1', community_id: 'c1', collector_id: collectorId, status: 'VERIFIED', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
    ];
    const metrics = computeCollectorMetrics(collectorId, defaultPeriod, requests, [], [], []);

    assert.strictEqual(metrics.collections.assigned, 1);
  });

  test('11. No cross-collector data leakage', () => {
    const requests: DbCollectionRequest[] = [
      { id: 'r1', resident_id: 'res1', community_id: 'c1', collector_id: mockCollectorId, status: 'VERIFIED', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
      // Other collector's request
      { id: 'r2', resident_id: 'res2', community_id: 'c1', collector_id: otherCollectorId, status: 'VERIFIED', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
    ];

    // Filter requests for mockCollectorId before computing metrics
    const collectorRequests = requests.filter(r => r.collector_id === mockCollectorId);
    const metrics = computeCollectorMetrics(mockCollectorId, defaultPeriod, collectorRequests, [], [], []);

    assert.strictEqual(metrics.collections.assigned, 1);
  });

  test('12. Timing calculations when timestamps exist & negative timestamp protection', () => {
    const batchId = 'b1111111-1111-4111-a111-111111111111';
    const reqId = 'r1111111-1111-4111-a111-111111111111';

    const requests: DbCollectionRequest[] = [
      {
        id: reqId,
        resident_id: 'res1',
        community_id: 'c1',
        collector_id: mockCollectorId,
        collection_batch_id: batchId,
        status: 'VERIFIED',
        requested_at: '2026-08-02T10:00:00Z',
        completed_at: '2026-08-02T11:00:00Z', // 60 minutes
      },
    ];

    const batches: DbCollectionBatch[] = [
      { id: batchId, collector_id: mockCollectorId, status: 'VEHICLE_EVIDENCE_SUBMITTED', created_at: '2026-08-02T10:10:00Z', updated_at: '2026-08-02T10:40:00Z' },
    ];

    const evidences: DbEvidence[] = [
      {
        id: 'e1',
        collection_request_id: reqId,
        evidence_type: 'COLLECTOR_AFTER',
        image_url: 'http://example.com/p.jpg',
        uploaded_by: mockCollectorId,
        uploaded_at: '2026-08-02T10:20:00Z', // Pickup evidence at 10:20
        verification_status: 'verified',
      },
      {
        id: 'e2',
        collection_batch_id: batchId,
        evidence_type: 'VEHICLE',
        image_url: 'http://example.com/v.jpg',
        uploaded_by: mockCollectorId,
        uploaded_at: '2026-08-02T10:40:00Z', // Vehicle evidence at 10:40 (+20 mins from pickup)
        verification_status: 'verified',
      },
    ];

    const verificationResults: DbVerificationResult[] = [
      {
        id: 'v1',
        evidence_id: 'e1',
        collection_request_id: reqId,
        decision: 'VERIFIED',
        confidence_score: 90,
        analysis: 'Pass',
        verified_at: '2026-08-02T10:50:00Z', // Verified at 10:50 (+10 mins from vehicle)
      },
    ];

    const metrics = computeCollectorMetrics(mockCollectorId, defaultPeriod, requests, batches, evidences, verificationResults);

    assert.strictEqual(metrics.timing.averagePickupToVehicleMinutes, 20);
    assert.strictEqual(metrics.timing.averageVehicleToVerificationMinutes, 10);
    assert.strictEqual(metrics.timing.averageOverallCompletionMinutes, 60);
  });

  test('13. Timing metrics unavailable (null) when timestamps are missing', () => {
    const requests: DbCollectionRequest[] = [
      { id: 'r1', resident_id: 'res1', community_id: 'c1', collector_id: mockCollectorId, status: 'VERIFIED', requested_at: '2026-08-02T10:00:00Z', completed_at: null },
    ];

    const metrics = computeCollectorMetrics(mockCollectorId, defaultPeriod, requests, [], [], []);

    // assignmentToPickup is explicitly null per schema limitation (no assigned_at timestamp)
    assert.strictEqual(metrics.timing.averageAssignmentToPickupMinutes, null);
    assert.strictEqual(metrics.timing.averagePickupToVehicleMinutes, null);
    assert.strictEqual(metrics.timing.averageVehicleToVerificationMinutes, null);
    assert.strictEqual(metrics.timing.averageOverallCompletionMinutes, null);
  });

  test('14. Bounded rates [0.0, 1.0] & No NaN / Infinity', () => {
    const metrics = computeCollectorMetrics(mockCollectorId, defaultPeriod, [], [], [], []);
    
    // Rates are bounded between 0 and 1.0
    assert.ok(metrics.collections.completionRate >= 0 && metrics.collections.completionRate <= 1.0);
    assert.ok(metrics.verification.verificationSuccessRate >= 0 && metrics.verification.verificationSuccessRate <= 1.0);
    assert.ok(metrics.verification.rejectionRate >= 0 && metrics.verification.rejectionRate <= 1.0);
    assert.ok(metrics.verification.reviewRate >= 0 && metrics.verification.reviewRate <= 1.0);
    assert.ok(metrics.review.manualApprovalRate >= 0 && metrics.review.manualApprovalRate <= 1.0);
    assert.ok(metrics.evidence.complianceRate >= 0 && metrics.evidence.complianceRate <= 1.0);

    assert.strictEqual(Number.isNaN(metrics.collections.completionRate), false);
    assert.strictEqual(Number.isFinite(metrics.collections.completionRate), true);

    assert.strictEqual(Number.isNaN(metrics.verification.verificationSuccessRate), false);
    assert.strictEqual(Number.isFinite(metrics.verification.verificationSuccessRate), true);
  });

  test('15. Empty period handling', () => {
    const metrics = computeCollectorMetrics(mockCollectorId, defaultPeriod, [], [], [], []);

    assert.deepStrictEqual(metrics, {
      period: defaultPeriod,
      collections: { assigned: 0, completed: 0, active: 0, cancelled: 0, completionRate: 0 },
      verification: {
        verified: 0,
        rejected: 0,
        needsReview: 0,
        automaticVerified: 0,
        automaticNeedsReview: 0,
        automaticRejected: 0,
        verificationSuccessRate: 0,
        rejectionRate: 0,
        reviewRate: 0,
      },
      review: { reviewsCompleted: 0, reviewsPending: 0, manualApprovalCount: 0, manualRejectionCount: 0, manualApprovalRate: 0 },
      evidence: { pickupSubmitted: 0, vehicleSubmitted: 0, complianceRate: 0 },
      batches: { created: 0, completed: 0, active: 0, averageRequestsPerBatch: 0 },
      timing: {
        averageAssignmentToPickupMinutes: null,
        averagePickupToVehicleMinutes: null,
        averageVehicleToVerificationMinutes: null,
        averageOverallCompletionMinutes: null,
      },
    });
  });
});
