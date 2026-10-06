import { z } from 'zod';

export const bootstrapAdminSchema = {
  body: z.object({
    email: z.string().email('Valid email address is required').trim().toLowerCase(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100).trim(),
    phone: z.string().trim().optional(),
  }),
};

export const loginSchema = {
  body: z.object({
    email: z.string().email('Valid email address is required').trim().toLowerCase(),
    password: z.string().min(1, 'Password is required'),
  }),
};

