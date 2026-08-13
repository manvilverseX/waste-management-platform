import test, { describe } from 'node:test';
import assert from 'node:assert';
import { canTransition, validateStatusTransition } from '../lib/collector/state-machine';
import { createEvidenceSchema } from '../lib/validations/evidence';
import { CollectionStatus } from '../types';

/**
 * Automated Test Suite for Collector State Machine & Evidence Validation Logic
 */
describe('Collector State Machine & Evidence Validation Tests', () => {

  test('Valid state transitions', () => {
    const validTransitions: [CollectionStatus, CollectionStatus][] = [
      ['PENDING', 'ASSIGNED'],
      ['WASTE_READY', 'ASSIGNED'],
      ['ASSIGNED', 'PICKUP_EVIDENCE_SUBMITTED'],
      ['ASSIGNED', 'COLLECTED'],
      ['PICKUP_EVIDENCE_SUBMITTED', 'VERIFICATION_IN_PROGRESS'],
      ['PICKUP_EVIDENCE_SUBMITTED', 'VERIFIED'],
      ['VERIFICATION_IN_PROGRESS', 'VERIFIED'],
      ['VERIFICATION_IN_PROGRESS', 'REJECTED'],
      ['VERIFICATION_IN_PROGRESS', 'NEEDS_REVIEW'],
      ['NEEDS_REVIEW', 'VERIFIED'],
      ['NEEDS_REVIEW', 'REJECTED'],
      ['PENDING', 'CANCELLED'],
      ['ASSIGNED', 'CANCELLED'],
    ];

    for (const [from, to] of validTransitions) {
      assert.strictEqual(canTransition(from, to), true, `Expected ${from} -> ${to} to be valid`);
      const res = validateStatusTransition(from, to);
      assert.strictEqual(res.valid, true);
    }
  });

  test('Invalid state transitions are rejected', () => {
    const invalidTransitions: [CollectionStatus, CollectionStatus][] = [
      ['PENDING', 'VERIFIED'],
      ['PENDING', 'VEHICLE_EVIDENCE_SUBMITTED'],
      ['ASSIGNED', 'VERIFIED'],
      ['VERIFIED', 'PENDING'],
      ['VERIFIED', 'ASSIGNED'],
      ['REJECTED', 'ASSIGNED'],
      ['CANCELLED', 'ASSIGNED'],
    ];

    for (const [from, to] of invalidTransitions) {
      assert.strictEqual(canTransition(from, to), false, `Expected ${from} -> ${to} to be invalid`);
      const res = validateStatusTransition(from, to);
      assert.strictEqual(res.valid, false);
      assert.notStrictEqual(res.reason, undefined);
    }
  });

  test('Evidence payload Zod validation with camera base64 image and GPS coordinates', () => {
    const validPayload = {
      collectionRequestId: '123e4567-e89b-12d3-a456-426614174000',
      evidenceType: 'COLLECTOR_AFTER',
      imageBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
      latitude: 12.9716,
      longitude: 77.5946,
      capturedAt: new Date().toISOString()
    };

    const result = createEvidenceSchema.safeParse(validPayload);
    assert.strictEqual(result.success, true, 'Valid evidence payload should pass Zod validation');
  });

  test('Evidence payload rejects invalid GPS latitude or missing image', () => {
    const invalidGpsPayload = {
      collectionRequestId: '123e4567-e89b-12d3-a456-426614174000',
      evidenceType: 'COLLECTOR_AFTER',
      imageBase64: 'data:image/jpeg;base64,...',
      latitude: 195.0, // Invalid latitude > 90
      longitude: 77.5946
    };

    const gpsResult = createEvidenceSchema.safeParse(invalidGpsPayload);
    assert.strictEqual(gpsResult.success, false, 'Invalid latitude should fail validation');

    const missingImagePayload = {
      collectionRequestId: '123e4567-e89b-12d3-a456-426614174000',
      evidenceType: 'COLLECTOR_AFTER',
      latitude: 12.9716,
      longitude: 77.5946
    };

    const imageResult = createEvidenceSchema.safeParse(missingImagePayload);
    assert.strictEqual(imageResult.success, false, 'Missing image payload should fail validation');
  });
});
