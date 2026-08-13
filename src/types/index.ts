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
  decision: string;
  confidence_score: number;
  analysis: string;
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
  decision: string;
  confidenceScore: number;
  analysis: string;
  verifiedAt: string;
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
