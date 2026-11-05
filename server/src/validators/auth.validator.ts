import { z } from 'zod';

export const loginSchema = {
  body: z.object({
    email: z.string().email('Valid email address is required').trim().toLowerCase(),
    password: z.string().min(1, 'Password is required'),
  }),
};

