import { z } from 'zod';

export const createCollectionRequestSchema = z.object({
  communityId: z.string().uuid({
    message: 'Invalid communityId UUID format'
  })
});

export type CreateCollectionRequestInput = z.infer<typeof createCollectionRequestSchema>;

export const uploadEvidenceSchema = z.object({
  collectionRequestId: z.string().uuid({
    message: 'Invalid collectionRequestId UUID format'
  }),
  imageUrl: z.string().url({
    message: 'Invalid imageUrl format'
  }),
  evidenceType: z.literal('RESIDENT_BEFORE', {
    message: 'Only RESIDENT_BEFORE evidence type is accepted on this endpoint'
  })
});

export type UploadEvidenceInput = z.infer<typeof uploadEvidenceSchema>;

