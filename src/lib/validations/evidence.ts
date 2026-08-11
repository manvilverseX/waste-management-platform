import { z } from 'zod';

export const evidenceTypeEnum = z.enum(['RESIDENT_BEFORE', 'COLLECTOR_AFTER']);
export const verificationStatusEnum = z.enum(['pending', 'verified', 'rejected']);

export const createEvidenceSchema = z.object({
  collectionRequestId: z.string().uuid({
    message: 'Invalid collectionRequestId UUID format'
  }),
  evidenceType: evidenceTypeEnum,
  imageUrl: z.string().url({
    message: 'imageUrl must be a valid HTTP or HTTPS URL'
  })
});

export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;
