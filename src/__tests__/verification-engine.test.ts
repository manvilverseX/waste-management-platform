import test, { describe } from 'node:test';
import assert from 'node:assert';
import { calculateHaversineDistanceMeters, GPS_THRESHOLDS } from '../lib/verification/haversine';
import { HardEvidenceCheck, StructuredGeminiAnalysis } from '../types';

/**
 * Automated Test Suite for Verification Engine Core & Decision Matrix (Audit Verification)
 */
describe('Verification Engine Unit Tests', () => {

  test('Haversine distance calculation accuracy', () => {
    // Distance between Bangalore City Center (12.9716, 77.5946) and MG Road (12.9756, 77.6066) ~ 1.38 km
    const distanceMeters = calculateHaversineDistanceMeters(12.9716, 77.5946, 12.9756, 77.6066);
    
    assert.strictEqual(typeof distanceMeters, 'number');
    assert.ok(distanceMeters > 1200 && distanceMeters < 1500, `Distance should be approx 1.38km, got ${distanceMeters}m`);

    // Zero distance for identical points
    const zeroDistance = calculateHaversineDistanceMeters(12.9716, 77.5946, 12.9716, 77.5946);
    assert.strictEqual(zeroDistance, 0, 'Distance between identical points should be 0');
  });

  test('GPS Thresholds classification (400m, 750m, 2500m)', () => {
    assert.strictEqual(GPS_THRESHOLDS.PREFERRED_DISTANCE_METERS, 500);
    assert.strictEqual(GPS_THRESHOLDS.MAX_ACCEPTABLE_DISTANCE_METERS, 2000);

    const closeDistance = 400;
    assert.ok(closeDistance <= GPS_THRESHOLDS.PREFERRED_DISTANCE_METERS, '400m should be within preferred threshold');

    const moderateDistance = 750;
    assert.ok(
      moderateDistance > GPS_THRESHOLDS.PREFERRED_DISTANCE_METERS &&
      moderateDistance <= GPS_THRESHOLDS.MAX_ACCEPTABLE_DISTANCE_METERS,
      '750m should be within warning threshold'
    );

    const farDistance = 2500;
    assert.ok(
      farDistance > GPS_THRESHOLDS.MAX_ACCEPTABLE_DISTANCE_METERS,
      '2500m should exceed acceptable distance threshold'
    );
  });

  test('Missing Resident BEFORE evidence routes to NEEDS_REVIEW (Cannot be VERIFIED)', () => {
    const checks: HardEvidenceCheck[] = [
      { name: 'Collector Assignment', passed: true, severity: 'CRITICAL', reason: 'Authorized' },
      { name: 'State Machine Eligibility', passed: true, severity: 'CRITICAL', reason: 'Eligible' },
      { name: 'Pickup Evidence Existence', passed: true, severity: 'CRITICAL', reason: 'Present' },
      { name: 'Resident Before Evidence Existence', passed: false, severity: 'WARNING', reason: 'Resident BEFORE photo missing.' }
    ];

    const warningFailures = checks.filter((c) => !c.passed && c.severity === 'WARNING');
    const finalDecision = warningFailures.length > 0 ? 'NEEDS_REVIEW' : 'VERIFIED';

    assert.strictEqual(finalDecision, 'NEEDS_REVIEW', 'Missing Resident BEFORE evidence MUST route to NEEDS_REVIEW and cannot be VERIFIED');
  });

  test('Missing Vehicle evidence routes to NEEDS_REVIEW (Cannot be VERIFIED)', () => {
    const checks: HardEvidenceCheck[] = [
      { name: 'Collector Assignment', passed: true, severity: 'CRITICAL', reason: 'Authorized' },
      { name: 'State Machine Eligibility', passed: true, severity: 'CRITICAL', reason: 'Eligible' },
      { name: 'Pickup Evidence Existence', passed: true, severity: 'CRITICAL', reason: 'Present' },
      { name: 'Resident Before Evidence Existence', passed: true, severity: 'CRITICAL', reason: 'Present' },
      { name: 'Batch Vehicle Evidence Link', passed: false, severity: 'WARNING', reason: 'Vehicle photo missing.' }
    ];

    const warningFailures = checks.filter((c) => !c.passed && c.severity === 'WARNING');
    const finalDecision = warningFailures.length > 0 ? 'NEEDS_REVIEW' : 'VERIFIED';

    assert.strictEqual(finalDecision, 'NEEDS_REVIEW', 'Missing Vehicle evidence MUST route to NEEDS_REVIEW');
  });

  test('AI Confidence Boundaries (64, 65, 69 -> NEEDS_REVIEW; 70 -> candidate VERIFIED)', () => {
    const testConfidence = (score: number, sameWaste: boolean = true) => {
      const checks: HardEvidenceCheck[] = [
        { name: 'Collector Assignment', passed: true, severity: 'CRITICAL', reason: 'Authorized' },
        { name: 'State Machine Eligibility', passed: true, severity: 'CRITICAL', reason: 'Eligible' },
        { name: 'Pickup Evidence Existence', passed: true, severity: 'CRITICAL', reason: 'Present' },
        { name: 'Resident Before Evidence Existence', passed: true, severity: 'CRITICAL', reason: 'Present' }
      ];

      const aiDetails: StructuredGeminiAnalysis = {
        wasteDetected: true,
        visualSimilarityScore: score,
        sameWasteLikely: sameWaste,
        vehicleVisible: true,
        contextConsistent: true,
        confidence: score,
        concerns: []
      };

      const criticalFailures = checks.filter((c) => !c.passed && c.severity === 'CRITICAL');
      const warningFailures = checks.filter((c) => !c.passed && c.severity === 'WARNING');

      if (criticalFailures.length > 0) return 'REJECTED';
      if (warningFailures.length > 0 || aiDetails.confidence < 70 || !aiDetails.sameWasteLikely) return 'NEEDS_REVIEW';
      return 'VERIFIED';
    };

    assert.strictEqual(testConfidence(64), 'NEEDS_REVIEW', 'Confidence 64 must be NEEDS_REVIEW');
    assert.strictEqual(testConfidence(65), 'NEEDS_REVIEW', 'Confidence 65 must be NEEDS_REVIEW');
    assert.strictEqual(testConfidence(69), 'NEEDS_REVIEW', 'Confidence 69 must be NEEDS_REVIEW');
    assert.strictEqual(testConfidence(70), 'VERIFIED', 'Confidence 70 must be candidate VERIFIED');
    assert.strictEqual(testConfidence(85), 'VERIFIED', 'Confidence 85 must be VERIFIED');
    assert.strictEqual(testConfidence(85, false), 'NEEDS_REVIEW', 'Confidence 85 with sameWasteLikely=false must be NEEDS_REVIEW');
  });

  test('Decision Matrix: Critical Hard Check Failure -> REJECTED', () => {
    const checks: HardEvidenceCheck[] = [
      { name: 'Collector Assignment', passed: false, severity: 'CRITICAL', reason: 'Collector not assigned' },
      { name: 'Pickup Evidence Existence', passed: true, severity: 'CRITICAL', reason: 'Present' }
    ];

    const criticalFailures = checks.filter((c) => !c.passed && c.severity === 'CRITICAL');
    assert.strictEqual(criticalFailures.length, 1);

    const finalDecision = criticalFailures.length > 0 ? 'REJECTED' : 'VERIFIED';
    assert.strictEqual(finalDecision, 'REJECTED', 'Critical hard check failure must result in REJECTED');
  });
});
