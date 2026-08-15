import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters long'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  communityId: z.string().uuid('Invalid community ID format')
});

export type RegisterInput = z.infer<typeof registerSchema>;
