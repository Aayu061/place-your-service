import { z } from 'zod';

export const listCustomerSitesSchema = {
  params: z.object({
    customerId: z.string().uuid('Invalid customer UUID identifier'),
  }),
  query: z.object({
    search: z.string().trim().optional(),
    status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).optional().default('ALL'),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  }),
};

export const siteIdParamSchema = {
  params: z.object({
    id: z.string().uuid('Invalid site UUID identifier'),
  }),
};

export const createSiteSchema = {
  params: z.object({
    customerId: z.string().uuid('Invalid customer UUID identifier'),
  }),
  body: z.object({
    siteName: z.string().min(2, 'Site name must be at least 2 characters').max(150).trim(),
    address: z.string().min(3, 'Address must be at least 3 characters').max(255).trim(),
    contactPerson: z.string().max(100).trim().optional().nullable(),
    contactPhone: z.string().max(20).trim().optional().nullable(),
    contactEmail: z
      .string()
      .email('Invalid contact email format')
      .trim()
      .toLowerCase()
      .optional()
      .nullable()
      .or(z.literal(''))
      .transform((val) => (val === '' ? null : val)),
    isPrimary: z.boolean().optional().default(false),
    notes: z.string().max(1000).trim().optional().nullable(),
  }),
};

export const updateSiteSchema = {
  params: z.object({
    id: z.string().uuid('Invalid site UUID identifier'),
  }),
  body: z
    .object({
      siteName: z.string().min(2, 'Site name must be at least 2 characters').max(150).trim().optional(),
      address: z.string().min(3, 'Address must be at least 3 characters').max(255).trim().optional(),
      contactPerson: z.string().max(100).trim().optional().nullable(),
      contactPhone: z.string().max(20).trim().optional().nullable(),
      contactEmail: z
        .string()
        .email('Invalid contact email format')
        .trim()
        .toLowerCase()
        .optional()
        .nullable()
        .or(z.literal(''))
        .transform((val) => (val === '' ? null : val)),
      isPrimary: z.boolean().optional(),
      notes: z.string().max(1000).trim().optional().nullable(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
};

export const updateSiteStatusSchema = {
  params: z.object({
    id: z.string().uuid('Invalid site UUID identifier'),
  }),
  body: z.object({
    isActive: z.boolean({ required_error: 'isActive boolean flag is required' }),
  }),
};
