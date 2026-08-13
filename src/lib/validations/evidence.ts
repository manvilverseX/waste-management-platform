import { z } from 'zod';

export const evidenceTypeEnum = z.enum(['RESIDENT_BEFORE', 'COLLECTOR_AFTER', 'VEHICLE']);
export const verificationStatusEnum = z.enum(['pending', 'verified', 'rejected']);

export const createEvidenceSchema = z.object({
  collectionRequestId: z.string().uuid({
    message: 'Invalid collectionRequestId UUID format'
  }).optional(),
  collectionBatchId: z.string().uuid({
    message: 'Invalid collectionBatchId UUID format'
  }).optional(),
  evidenceType: evidenceTypeEnum,
  imageUrl: z.string().url({
    message: 'imageUrl must be a valid HTTP or HTTPS URL'
  }).optional(),
  imageBase64: z.string()
    .max(15_000_000, { message: 'Image payload size exceeds 10MB limit' })
    .refine((val) => /^data:image\/(jpeg|jpg|png|webp);base64,/.test(val) || val.length > 0, {
      message: 'Image must be a valid base64 encoded data URL (jpeg, jpg, png, webp)'
    })
    .optional(),
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
}).refine((data) => {
  if (data.evidenceType === 'VEHICLE') {
    return Boolean(data.collectionBatchId);
  }
  return Boolean(data.collectionRequestId);
}, {
  message: 'VEHICLE evidence requires collectionBatchId; household pickup evidence requires collectionRequestId',
  path: ['collectionBatchId']
});

export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;
