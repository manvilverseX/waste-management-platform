import { z } from 'zod';

export const createCollectionRequestSchema = z.object({
  communityId: z.string().uuid({
    message: 'Invalid communityId UUID format'
  })
});

export type CreateCollectionRequestInput = z.infer<typeof createCollectionRequestSchema>;
