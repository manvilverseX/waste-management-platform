export type UserRole = 'resident' | 'collector' | 'municipality';

export type CollectionStatus = 
  | 'PENDING' 
  | 'ASSIGNED' 
  | 'COLLECTED' 
  | 'VERIFIED' 
  | 'REJECTED' 
  | 'CANCELLED';

export type EvidenceType = 'RESIDENT_BEFORE' | 'COLLECTOR_AFTER';

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface CollectionRequestDTO {
  id: string;
  residentId: string;
  communityId: string;
  status: CollectionStatus;
  requestedAt: string;
  completedAt: string | null;
  residentName?: string;
  communityName?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
}

