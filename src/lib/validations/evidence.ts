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
  }).optional(),
  imageBase64: z.string().optional(),
  latitude: z.number().min(-90).max(90, {
    message: 'Latitude must be between -90 and 90 degrees'
  }),
  longitude: z.number().min(-180).max(180, {
    message: 'Longitude must be between -180 and 180 degrees'
  }),
  capturedAt: z.string().optional()
}).refine((data) => data.imageBase64 || data.imageUrl, {
  message: 'Either imageBase64 or imageUrl must be provided',
  path: ['imageBase64']
});

export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;
