// Core Database Enums
export type UserRole = 'resident' | 'collector' | 'municipality';

export type CollectionStatus = 
  | 'PENDING' 
  | 'WASTE_READY'
  | 'ASSIGNED' 
  | 'PICKUP_EVIDENCE_SUBMITTED'
  | 'VEHICLE_EVIDENCE_SUBMITTED'
  | 'VERIFICATION_IN_PROGRESS'
  | 'NEEDS_REVIEW'
  | 'COLLECTED' 
  | 'VERIFIED' 
  | 'REJECTED' 
  | 'CANCELLED';

export type EvidenceType = 'RESIDENT_BEFORE' | 'COLLECTOR_AFTER' | 'VEHICLE';

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export type BatchStatus = 
  | 'CREATED'
  | 'COLLECTING'
  | 'READY_FOR_VEHICLE_EVIDENCE'
  | 'VEHICLE_EVIDENCE_SUBMITTED'
  | 'CANCELLED';

export interface HardEvidenceCheck {
  name: string;
  passed: boolean;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  reason: string;
}

export interface StructuredGeminiAnalysis {
  wasteDetected: boolean;
  visualSimilarityScore: number;
  sameWasteLikely: boolean;
  vehicleVisible?: boolean;
  contextConsistent?: boolean;
  confidence: number;
  concerns: string[];
}

// Database Models (Snake Case - database native)
export interface DbUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface DbCommunity {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

export interface DbCommunityMembership {
  id: string;
  user_id: string;
  community_id: string;
  membership_role: string;
  joined_at: string;
}

export interface DbCollectionRequest {
  id: string;
  resident_id: string;
  community_id: string;
  collector_id?: string | null;
  collection_batch_id?: string | null;
  status: CollectionStatus;
  requested_at: string;
  completed_at: string | null;
}

export interface DbCollectionBatch {
  id: string;
  collector_id: string;
  status: BatchStatus;
  created_at: string;
  updated_at: string;
}

export interface DbEvidence {
  id: string;
  collection_request_id?: string | null;
  collection_batch_id?: string | null;
  evidence_type: EvidenceType;
  image_url: string;
  uploaded_by: string;
  uploaded_at: string;
  verification_status: VerificationStatus;
  latitude?: number | null;
  longitude?: number | null;
  captured_at?: string | null;
}

export interface DbVerificationResult {
  id: string;
  evidence_id: string;
  collection_request_id?: string | null;
  decision: string;
  confidence_score: number;
  analysis: string;
  hard_evidence_checks?: HardEvidenceCheck[];
  ai_analysis_details?: StructuredGeminiAnalysis;
  reason?: string;
  manual_decision?: string | null;
  manual_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  verified_at: string;
}

// API DTOs (camelCase - according to ARCHITECTURE.md API rules)
export interface CollectionRequestDTO {
  id: string;
  residentId: string;
  communityId: string;
  collectorId?: string | null;
  collectionBatchId?: string | null;
  status: CollectionStatus;
  requestedAt: string;
  completedAt: string | null;
  residentName?: string;
  communityName?: string;
  collectorName?: string;
  evidence?: EvidenceDTO[];
}

export interface CollectionBatchDTO {
  id: string;
  collectorId: string;
  collectorName?: string;
  status: BatchStatus;
  createdAt: string;
  updatedAt: string;
  requestCount?: number;
  requests?: CollectionRequestDTO[];
  vehicleEvidence?: EvidenceDTO | null;
}

export interface EvidenceDTO {
  id: string;
  collectionRequestId?: string | null;
  collectionBatchId?: string | null;
  evidenceType: EvidenceType;
  imageUrl: string;
  uploadedBy: string;
  uploadedAt: string;
  verificationStatus: VerificationStatus;
  latitude?: number | null;
  longitude?: number | null;
  capturedAt?: string | null;
}

export interface VerificationResultDTO {
  id: string;
  evidenceId: string;
  collectionRequestId?: string | null;
  decision: string;
  confidenceScore: number;
  analysis: string;
  hardEvidenceChecks?: HardEvidenceCheck[];
  aiAnalysisDetails?: StructuredGeminiAnalysis;
  reason?: string;
  manualDecision?: string | null;
  manualReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  verifiedAt: string;
}

export interface ReviewQueueItemDTO {
  requestId: string;
  residentName?: string;
  communityName?: string;
  collectorName?: string;
  collectionBatchId?: string | null;
  status: CollectionStatus;
  requestedAt: string;
  automaticDecision?: string;
  confidenceScore?: number;
  reason?: string;
}

export interface ReviewDetailDTO {
  request: CollectionRequestDTO;
  batch?: CollectionBatchDTO | null;
  beforeEvidence?: EvidenceDTO | null;
  afterEvidence?: EvidenceDTO | null;
  vehicleEvidence?: EvidenceDTO | null;
  hardEvidenceChecks?: HardEvidenceCheck[];
  aiAnalysisDetails?: StructuredGeminiAnalysis;
  automaticDecision?: string;
  automaticReason?: string;
  confidenceScore?: number;
  latestResult?: VerificationResultDTO | null;
}

// Collector Metrics DTOs
export interface MetricPeriodDTO {
  range: 'today' | '7d' | '30d' | 'all' | 'custom';
  from: string | null;
  to: string | null;
}

export interface CollectionMetricsDTO {
  assigned: number;
  completed: number;
  active: number;
  cancelled: number;
  completionRate: number;
}

export interface VerificationMetricsDTO {
  verified: number;
  rejected: number;
  needsReview: number;
  automaticVerified: number;
  automaticNeedsReview: number;
  automaticRejected: number;
  verificationSuccessRate: number;
  rejectionRate: number;
  reviewRate: number;
}

export interface ManualReviewMetricsDTO {
  reviewsCompleted: number;
  reviewsPending: number;
  manualApprovalCount: number;
  manualRejectionCount: number;
  manualApprovalRate: number;
}

export interface EvidenceMetricsDTO {
  pickupSubmitted: number;
  vehicleSubmitted: number;
  complianceRate: number;
}

export interface BatchMetricsDTO {
  created: number;
  completed: number;
  active: number;
  averageRequestsPerBatch: number;
}

export interface TimingMetricsDTO {
  averageAssignmentToPickupMinutes: number | null;
  averagePickupToVehicleMinutes: number | null;
  averageVehicleToVerificationMinutes: number | null;
  averageOverallCompletionMinutes: number | null;
}

export interface CollectorMetricsDTO {
  period: MetricPeriodDTO;
  collections: CollectionMetricsDTO;
  verification: VerificationMetricsDTO;
  review: ManualReviewMetricsDTO;
  evidence: EvidenceMetricsDTO;
  batches: BatchMetricsDTO;
  timing: TimingMetricsDTO;
}

// Standard API Response Wrappers
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
}

