import { CollectionStatus } from '@/types';

/**
 * Map of allowed status transitions for the collection request state machine.
 * 
 * Target workflow:
 * CREATED / PENDING / WASTE_READY
 *   ↓
 * ASSIGNED
 *   ↓
 * PICKUP_EVIDENCE_SUBMITTED / COLLECTED
 *   ↓
 * VEHICLE_EVIDENCE_SUBMITTED
 *   ↓
 * VERIFICATION_IN_PROGRESS
 *   ↓
 * VERIFIED / REJECTED
 * 
 * Suspicious flow:
 * VERIFICATION_IN_PROGRESS → NEEDS_REVIEW → VERIFIED / REJECTED
 */
const ALLOWED_TRANSITIONS: Record<CollectionStatus, CollectionStatus[]> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  WASTE_READY: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKUP_EVIDENCE_SUBMITTED', 'COLLECTED', 'CANCELLED'],
  PICKUP_EVIDENCE_SUBMITTED: ['VEHICLE_EVIDENCE_SUBMITTED', 'VERIFICATION_IN_PROGRESS', 'VERIFIED', 'REJECTED'],
  COLLECTED: ['VEHICLE_EVIDENCE_SUBMITTED', 'VERIFICATION_IN_PROGRESS', 'VERIFIED', 'REJECTED'], // legacy status
  VEHICLE_EVIDENCE_SUBMITTED: ['VERIFICATION_IN_PROGRESS', 'VERIFIED', 'REJECTED'],
  VERIFICATION_IN_PROGRESS: ['VERIFIED', 'REJECTED', 'NEEDS_REVIEW'],
  NEEDS_REVIEW: ['VERIFIED', 'REJECTED'],
  VERIFIED: [], // Terminal
  REJECTED: [], // Terminal
  CANCELLED: []  // Terminal
};

/**
 * Checks whether transitioning from `currentStatus` to `nextStatus` is permitted.
 */
export function canTransition(currentStatus: CollectionStatus, nextStatus: CollectionStatus): boolean {
  if (currentStatus === nextStatus) return true;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(nextStatus) : false;
}

/**
 * Validates a status transition and returns a detailed result object.
 */
export function validateStatusTransition(
  currentStatus: CollectionStatus,
  nextStatus: CollectionStatus
): { valid: boolean; reason?: string } {
  if (!canTransition(currentStatus, nextStatus)) {
    return {
      valid: false,
      reason: `Invalid status transition from '${currentStatus}' to '${nextStatus}'.`
    };
  }
  return { valid: true };
}
