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

export const createDumpingReportSchema = z.object({
  imageUrl: z.string().url({
    message: 'Invalid imageUrl format'
  }),
  latitude: z.number().min(-90).max(90, {
    message: 'Latitude must be between -90 and 90'
  }),
  longitude: z.number().min(-180).max(180, {
    message: 'Longitude must be between -180 and 180'
  }),
  description: z.string().min(5, {
    message: 'Description must be at least 5 characters long'
  }),
  gpsAccuracy: z.number().optional().nullable(),
  gpsCapturedAt: z.string().optional().nullable()
});

export type CreateDumpingReportInput = z.infer<typeof createDumpingReportSchema>;


