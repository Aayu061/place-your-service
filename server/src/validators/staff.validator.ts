import { z } from 'zod';

export const createStaffSchema = {
  body: z.object({
    email: z.string().email('Valid email address is required').trim().toLowerCase(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100).trim(),
    phone: z.string().trim().optional(),
  }),
};

export const updateStaffSchema = {
  params: z.object({
    id: z.string().uuid('Invalid staff UUID identifier'),
  }),
  body: z
    .object({
      fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100).trim().optional(),
      phone: z.string().trim().optional(),
    })
    .refine((data) => data.fullName !== undefined || data.phone !== undefined, {
      message: 'At least one field (fullName or phone) must be provided for update',
    }),
};

export const updateStaffStatusSchema = {
  params: z.object({
    id: z.string().uuid('Invalid staff UUID identifier'),
  }),
  body: z.object({
    isActive: z.boolean({ required_error: 'isActive boolean flag is required' }),
  }),
};

export const getStaffByIdSchema = {
  params: z.object({
    id: z.string().uuid('Invalid staff UUID identifier'),
  }),
};
