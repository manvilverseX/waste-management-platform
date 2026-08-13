import { z } from 'zod';

export const collectionStatusEnum = z.enum([
  'PENDING',
  'WASTE_READY',
  'ASSIGNED',
  'PICKUP_EVIDENCE_SUBMITTED',
  'VEHICLE_EVIDENCE_SUBMITTED',
  'VERIFICATION_IN_PROGRESS',
  'NEEDS_REVIEW',
  'COLLECTED',
  'VERIFIED',
  'REJECTED',
  'CANCELLED'
]);

export const updateCollectionStatusSchema = z.object({
  status: collectionStatusEnum
});

export const collectionFilterQuerySchema = z.object({
  status: collectionStatusEnum.optional(),
  communityId: z.string().uuid().optional(),
  collectorId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  page: z.coerce.number().min(1).default(1)
});

export type UpdateCollectionStatusInput = z.infer<typeof updateCollectionStatusSchema>;
export type CollectionFilterQueryInput = z.infer<typeof collectionFilterQuerySchema>;
