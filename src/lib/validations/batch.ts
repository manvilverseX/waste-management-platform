import { z } from 'zod';

export const batchStatusEnum = z.enum([
  'CREATED',
  'COLLECTING',
  'READY_FOR_VEHICLE_EVIDENCE',
  'VEHICLE_EVIDENCE_SUBMITTED',
  'CANCELLED'
]);

export const createBatchSchema = z.object({});

export const addRequestsToBatchSchema = z.object({
  requestIds: z.array(z.string().uuid({
    message: 'Each request ID must be a valid UUID'
  })).min(1, {
    message: 'At least one request ID must be provided to add to batch'
  })
});

export const batchFilterQuerySchema = z.object({
  status: batchStatusEnum.optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  page: z.coerce.number().min(1).default(1)
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type AddRequestsToBatchInput = z.infer<typeof addRequestsToBatchSchema>;
export type BatchFilterQueryInput = z.infer<typeof batchFilterQuerySchema>;
