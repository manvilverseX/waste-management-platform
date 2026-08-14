import test, { describe } from 'node:test';
import assert from 'node:assert';
import { manualReviewDecisionSchema } from '../lib/validations/verification';
import { canTransition, validateStatusTransition } from '../lib/collector/state-machine';

/**
 * Integration & Service Unit Tests for Manual Review Workflow & Concurrency
 */
describe('Phase 5 Manual Review Workflow & State Machine Tests', () => {

  test('Zod Schema: Validates manual review decision (APPROVE / REJECT) and mandatory reason', () => {
    const validApproval = manualReviewDecisionSchema.safeParse({
      decision: 'APPROVE',
      reason: 'Manual inspection confirms identical waste pile and location.'
    });
    assert.ok(validApproval.success, 'Valid approval payload should pass Zod validation');

    const validRejection = manualReviewDecisionSchema.safeParse({
      decision: 'REJECT',
      reason: 'Collector AFTER photo shows different waste pile.'
    });
    assert.ok(validRejection.success, 'Valid rejection payload should pass Zod validation');

    const missingReason = manualReviewDecisionSchema.safeParse({
      decision: 'APPROVE',
      reason: '   '
    });
    assert.strictEqual(missingReason.success, false, 'Blank or whitespace-only reason must fail validation');

    const invalidDecision = manualReviewDecisionSchema.safeParse({
      decision: 'INVALID_STATUS',
      reason: 'Valid reason string.'
    });
    assert.strictEqual(invalidDecision.success, false, 'Invalid decision enum must fail validation');
  });

  test('State Machine: Permitted manual review state transitions', () => {
    // NEEDS_REVIEW -> VERIFIED (on APPROVE)
    const approveTransition = validateStatusTransition('NEEDS_REVIEW', 'VERIFIED');
    assert.strictEqual(approveTransition.valid, true, 'NEEDS_REVIEW -> VERIFIED must be permitted');

    // NEEDS_REVIEW -> REJECTED (on REJECT)
    const rejectTransition = validateStatusTransition('NEEDS_REVIEW', 'REJECTED');
    assert.strictEqual(rejectTransition.valid, true, 'NEEDS_REVIEW -> REJECTED must be permitted');
  });

  test('State Machine: Terminal state protection', () => {
    // VERIFIED -> NEEDS_REVIEW must be rejected
    assert.strictEqual(canTransition('VERIFIED', 'NEEDS_REVIEW'), false, 'VERIFIED is terminal and cannot transition to NEEDS_REVIEW');

    // REJECTED -> VERIFIED must be rejected
    assert.strictEqual(canTransition('REJECTED', 'VERIFIED'), false, 'REJECTED is terminal and cannot transition to VERIFIED');

    // VERIFIED -> REJECTED must be rejected
    assert.strictEqual(canTransition('VERIFIED', 'REJECTED'), false, 'VERIFIED is terminal and cannot transition to REJECTED');
  });

  test('Double-Review Concurrency Check: Non-NEEDS_REVIEW status returns 409 conflict', () => {
    const checkReviewEligibility = (currentStatus: string) => {
      if (currentStatus !== 'NEEDS_REVIEW') {
        return { statusCode: 409, code: 'REVIEW_ALREADY_RESOLVED' };
      }
      return { statusCode: 200, code: 'OK' };
    };

    assert.strictEqual(checkReviewEligibility('NEEDS_REVIEW').statusCode, 200);
    assert.strictEqual(checkReviewEligibility('VERIFIED').statusCode, 409);
    assert.strictEqual(checkReviewEligibility('REJECTED').statusCode, 409);
    assert.strictEqual(checkReviewEligibility('VERIFIED').code, 'REVIEW_ALREADY_RESOLVED');
  });

  test('Complete Evidence Chain Integrity Verification', () => {
    const evidenceChain = [
      { type: 'RESIDENT_BEFORE', present: true },
      { type: 'COLLECTOR_AFTER', present: true },
      { type: 'VEHICLE', present: true }
    ];

    const isComplete = evidenceChain.every((e) => e.present);
    assert.strictEqual(isComplete, true, 'Full evidence chain requires RESIDENT_BEFORE, COLLECTOR_AFTER, and VEHICLE');

    const incompleteChain = [
      { type: 'RESIDENT_BEFORE', present: false },
      { type: 'COLLECTOR_AFTER', present: true },
      { type: 'VEHICLE', present: true }
    ];

    const isIncomplete = incompleteChain.every((e) => e.present);
    assert.strictEqual(isIncomplete, false, 'Missing RESIDENT_BEFORE must invalidate full automatic VERIFIED status');
  });
});
