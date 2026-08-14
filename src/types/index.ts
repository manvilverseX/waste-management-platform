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

export interface EvidenceDTO {
  id: string;
  collectionRequestId: string;
  evidenceType: EvidenceType;
  imageUrl: string;
  uploadedBy: string;
  uploadedAt: string;
  verificationStatus: VerificationStatus;
}

export interface RewardTransactionDTO {
  id: string;
  points: number;
  reason: string;
  referenceType: string;
  referenceId?: string | null;
  createdAt: string;
}

export interface RewardSummaryDTO {
  balancePoints: number;
  lifetimePoints: number;
  rank: number | null;
}

export interface CommunityProfileDTO {
  id: string;
  name: string;
  address: string;
  membersCount: number;
}

export interface CommunityScorecardDTO {
  id: string;
  communityId: string;
  score: number;
  period: string;
  breakdown: {
    segregation: number;
    participation: number;
    cleanliness: number;
  };
  calculatedAt: string;
}

