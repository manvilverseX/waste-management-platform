import {
  CollectorMetricsDTO,
  MetricPeriodDTO,
  DbCollectionRequest,
  DbCollectionBatch,
  DbEvidence,
  DbVerificationResult,
} from '@/types';
import { MetricsQueryInput } from '@/lib/validations/metrics';

export function calculateDateRange(
  range: MetricsQueryInput['range'] = '7d',
  from?: string | null,
  to?: string | null
): { fromISO: string | null; toISO: string | null; range: MetricPeriodDTO['range'] } {
  if (range === 'custom' && (from || to)) {
    return {
      fromISO: from || null,
      toISO: to || null,
      range: 'custom',
    };
  }

  if (range === 'all') {
    return { fromISO: null, toISO: null, range: 'all' };
  }

  const now = new Date();
  const toISO = now.toISOString();

  if (range === 'today') {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      fromISO: startOfDay.toISOString(),
      toISO,
      range: 'today',
    };
  }

  if (range === '30d') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      fromISO: start.toISOString(),
      toISO,
      range: '30d',
    };
  }

  // Default '7d'
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    fromISO: start.toISOString(),
    toISO,
    range: '7d',
  };
}

export function computeCollectorMetrics(
  collectorId: string,
  period: MetricPeriodDTO,
  requests: DbCollectionRequest[],
  batches: DbCollectionBatch[],
  evidences: DbEvidence[],
  verificationResults: DbVerificationResult[]
): CollectorMetricsDTO {
  // 1. Collection Metrics
  const assigned = requests.length;
  const completed = requests.filter(r => r.status === 'COLLECTED' || r.status === 'VERIFIED').length;
  const active = requests.filter(r =>
    ['ASSIGNED', 'PICKUP_EVIDENCE_SUBMITTED', 'VEHICLE_EVIDENCE_SUBMITTED', 'VERIFICATION_IN_PROGRESS', 'NEEDS_REVIEW'].includes(r.status)
  ).length;
  const cancelled = requests.filter(r => r.status === 'CANCELLED').length;
  const completionRate = assigned > 0 ? Number((completed / assigned).toFixed(4)) : 0;

  // 2. Evidence Metrics
  const pickupSubmitted = evidences.filter(e => e.evidence_type === 'COLLECTOR_AFTER').length;
  const vehicleSubmitted = evidences.filter(e => e.evidence_type === 'VEHICLE').length;
  
  // Count requests assigned to collector that have pickup evidence
  const requestsWithPickupEvidence = new Set(
    evidences
      .filter(e => e.evidence_type === 'COLLECTOR_AFTER' && e.collection_request_id)
      .map(e => e.collection_request_id)
  );
  const complianceCount = requests.filter(r => requestsWithPickupEvidence.has(r.id)).length;
  const complianceRate = assigned > 0 ? Number((complianceCount / assigned).toFixed(4)) : 0;

  // 3. Verification Metrics
  const verified = requests.filter(r => r.status === 'VERIFIED').length;
  const rejected = requests.filter(r => r.status === 'REJECTED').length;
  const needsReview = requests.filter(r => r.status === 'NEEDS_REVIEW').length;

  const automaticVerified = verificationResults.filter(v => v.decision === 'VERIFIED').length;
  const automaticNeedsReview = verificationResults.filter(v => v.decision === 'NEEDS_REVIEW').length;
  const automaticRejected = verificationResults.filter(v => v.decision === 'REJECTED').length;

  const totalEvaluated = verified + rejected + needsReview;

  const rawSuccessRate = totalEvaluated > 0 ? verified / totalEvaluated : 0;
  const rawRejectionRate = totalEvaluated > 0 ? rejected / totalEvaluated : 0;
  const rawReviewRate = totalEvaluated > 0 ? needsReview / totalEvaluated : 0;

  const verificationSuccessRate = Number(Math.min(1.0, Math.max(0.0, rawSuccessRate)).toFixed(4));
  const rejectionRate = Number(Math.min(1.0, Math.max(0.0, rawRejectionRate)).toFixed(4));
  const reviewRate = Number(Math.min(1.0, Math.max(0.0, rawReviewRate)).toFixed(4));

  // 4. Manual Review Metrics (Phase 5 fields)
  const reviewedResults = verificationResults.filter(v => v.manual_decision != null || v.reviewed_at != null);
  const reviewsCompleted = reviewedResults.length;
  const reviewsPending = requests.filter(r => r.status === 'NEEDS_REVIEW' && !verificationResults.some(v => v.collection_request_id === r.id && v.manual_decision != null)).length;
  const manualApprovalCount = verificationResults.filter(v => v.manual_decision === 'APPROVE').length;
  const manualRejectionCount = verificationResults.filter(v => v.manual_decision === 'REJECT').length;
  const rawManualRate = reviewsCompleted > 0 ? manualApprovalCount / reviewsCompleted : 0;
  const manualApprovalRate = Number(Math.min(1.0, Math.max(0.0, rawManualRate)).toFixed(4));

  // 5. Batch Metrics
  const createdBatches = batches.length;
  const completedBatchesList = batches.filter(b => b.status === 'VEHICLE_EVIDENCE_SUBMITTED');
  const completedBatches = completedBatchesList.length;
  const activeBatches = batches.filter(b => ['CREATED', 'COLLECTING', 'READY_FOR_VEHICLE_EVIDENCE'].includes(b.status)).length;
  
  const completedBatchIds = new Set(completedBatchesList.map(b => b.id));
  const requestsInCompletedBatches = requests.filter(r => r.collection_batch_id && completedBatchIds.has(r.collection_batch_id)).length;
  const averageRequestsPerBatch = completedBatches > 0 ? Number((requestsInCompletedBatches / completedBatches).toFixed(2)) : 0;

  // 6. Timing Metrics
  // assignmentToPickup: null (missing assigned_at in schema)
  const averageAssignmentToPickupMinutes = null;

  // Pickup -> Vehicle timing: difference between pickup evidence uploaded_at and vehicle evidence uploaded_at
  const pickupToVehicleDiffs: number[] = [];
  const vehicleEvidenceMap = new Map<string, string>(); // batch_id -> uploaded_at
  evidences.forEach(e => {
    if (e.evidence_type === 'VEHICLE' && e.collection_batch_id && e.uploaded_at) {
      vehicleEvidenceMap.set(e.collection_batch_id, e.uploaded_at);
    }
  });

  evidences.forEach(e => {
    if (e.evidence_type === 'COLLECTOR_AFTER' && e.uploaded_at) {
      // Find request's batch
      const req = requests.find(r => r.id === e.collection_request_id);
      if (req && req.collection_batch_id && vehicleEvidenceMap.has(req.collection_batch_id)) {
        const vehicleTime = Date.parse(vehicleEvidenceMap.get(req.collection_batch_id)!);
        const pickupTime = Date.parse(e.uploaded_at);
        if (!isNaN(vehicleTime) && !isNaN(pickupTime) && vehicleTime > pickupTime) {
          pickupToVehicleDiffs.push((vehicleTime - pickupTime) / (1000 * 60));
        }
      }
    }
  });

  const averagePickupToVehicleMinutes = pickupToVehicleDiffs.length > 0
    ? Number((pickupToVehicleDiffs.reduce((a, b) => a + b, 0) / pickupToVehicleDiffs.length).toFixed(1))
    : null;

  // Vehicle -> Verification timing: difference between vehicle evidence uploaded_at and verified_at
  const vehicleToVerifDiffs: number[] = [];
  verificationResults.forEach(vr => {
    if (vr.verified_at && vr.collection_request_id) {
      const req = requests.find(r => r.id === vr.collection_request_id);
      if (req && req.collection_batch_id && vehicleEvidenceMap.has(req.collection_batch_id)) {
        const vehicleTime = Date.parse(vehicleEvidenceMap.get(req.collection_batch_id)!);
        const verifTime = Date.parse(vr.verified_at);
        if (!isNaN(vehicleTime) && !isNaN(verifTime) && verifTime > vehicleTime) {
          vehicleToVerifDiffs.push((verifTime - vehicleTime) / (1000 * 60));
        }
      }
    }
  });

  const averageVehicleToVerificationMinutes = vehicleToVerifDiffs.length > 0
    ? Number((vehicleToVerifDiffs.reduce((a, b) => a + b, 0) / vehicleToVerifDiffs.length).toFixed(1))
    : null;

  // Overall completion timing: requested_at -> completed_at
  const overallDiffs: number[] = [];
  requests.forEach(r => {
    if (r.completed_at && r.requested_at) {
      const reqTime = Date.parse(r.requested_at);
      const compTime = Date.parse(r.completed_at);
      if (!isNaN(reqTime) && !isNaN(compTime) && compTime > reqTime) {
        overallDiffs.push((compTime - reqTime) / (1000 * 60));
      }
    }
  });

  const averageOverallCompletionMinutes = overallDiffs.length > 0
    ? Number((overallDiffs.reduce((a, b) => a + b, 0) / overallDiffs.length).toFixed(1))
    : null;

  return {
    period,
    collections: {
      assigned,
      completed,
      active,
      cancelled,
      completionRate: Number(Math.min(1.0, Math.max(0.0, completionRate)).toFixed(4)),
    },
    verification: {
      verified,
      rejected,
      needsReview,
      automaticVerified,
      automaticNeedsReview,
      automaticRejected,
      verificationSuccessRate,
      rejectionRate,
      reviewRate,
    },
    review: {
      reviewsCompleted,
      reviewsPending,
      manualApprovalCount,
      manualRejectionCount,
      manualApprovalRate,
    },
    evidence: {
      pickupSubmitted,
      vehicleSubmitted,
      complianceRate: Number(Math.min(1.0, Math.max(0.0, complianceRate)).toFixed(4)),
    },
    batches: {
      created: createdBatches,
      completed: completedBatches,
      active: activeBatches,
      averageRequestsPerBatch,
    },
    timing: {
      averageAssignmentToPickupMinutes,
      averagePickupToVehicleMinutes,
      averageVehicleToVerificationMinutes,
      averageOverallCompletionMinutes,
    },
  };
}
