import { z } from 'zod';

export const listCustomersSchema = {
  query: z.object({
    search: z.string().trim().optional(),
    type: z.enum(['ALL', 'TEMPORARY', 'PERMANENT']).optional().default('ALL'),
    status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).optional().default('ALL'),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    sortBy: z.enum(['created_at', 'name', 'customer_code']).optional().default('created_at'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),
};

export const createCustomerSchema = {
  body: z.object({
    name: z.string().min(2, 'Customer name must be at least 2 characters').max(150).trim(),
    customerType: z.enum(['TEMPORARY', 'PERMANENT']).optional().default('TEMPORARY'),
    companyName: z.string().max(150).trim().optional(),
    gstNumber: z
      .string()
      .trim()
      .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i, 'Invalid GSTIN format (e.g. 27AAPCA1234F1Z5)')
      .optional()
      .or(z.literal(''))
      .transform((val) => (val === '' ? undefined : val)),
    email: z
      .string()
      .email('Invalid email address format')
      .trim()
      .toLowerCase()
      .optional()
      .or(z.literal(''))
      .transform((val) => (val === '' ? undefined : val)),
    phone: z.string().min(7, 'Primary phone must be at least 7 characters').max(20).trim(),
    alternatePhone: z.string().max(20).trim().optional(),
    address: z.string().min(3, 'Address must be at least 3 characters').max(255).trim(),
    city: z.string().max(100).trim().optional(),
    state: z.string().max(100).trim().optional(),
    postalCode: z.string().max(20).trim().optional(),
    notes: z.string().max(1000).trim().optional(),
    siteName: z.string().max(150).trim().optional(),
    siteContactPerson: z.string().max(100).trim().optional(),
    siteContactPhone: z.string().max(20).trim().optional(),
  }),
};

export const updateCustomerSchema = {
  params: z.object({
    id: z.string().guid('Invalid customer UUID identifier'),
  }),
  body: z
    .object({
      name: z.string().min(2, 'Customer name must be at least 2 characters').max(150).trim().optional(),
      companyName: z.string().max(150).trim().optional().nullable(),
      gstNumber: z
        .string()
        .trim()
        .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i, 'Invalid GSTIN format (e.g. 27AAPCA1234F1Z5)')
        .optional()
        .nullable()
        .or(z.literal(''))
        .transform((val) => (val === '' ? null : val)),
      email: z
        .string()
        .email('Invalid email address format')
        .trim()
        .toLowerCase()
        .optional()
        .nullable()
        .or(z.literal(''))
        .transform((val) => (val === '' ? null : val)),
      phone: z.string().min(7, 'Primary phone must be at least 7 characters').max(20).trim().optional(),
      alternatePhone: z.string().max(20).trim().optional().nullable(),
      address: z.string().min(3, 'Address must be at least 3 characters').max(255).trim().optional(),
      city: z.string().max(100).trim().optional().nullable(),
      state: z.string().max(100).trim().optional().nullable(),
      postalCode: z.string().max(20).trim().optional().nullable(),
      notes: z.string().max(1000).trim().optional().nullable(),
      siteName: z.string().max(150).trim().optional().nullable(),
      siteContactPerson: z.string().max(100).trim().optional().nullable(),
      siteContactPhone: z.string().max(20).trim().optional().nullable(),
    })
    .refine(
      (data) => Object.values(data).some((val) => val !== undefined),
      {
        message: 'At least one field must be provided for update',
      }
    ),
};

export const updateCustomerStatusSchema = {
  params: z.object({
    id: z.string().guid('Invalid customer UUID identifier'),
  }),
  body: z.object({
    isActive: z.boolean({ error: 'isActive boolean flag is required' }),
  }),
};

export const customerIdParamSchema = {
  params: z.object({
    id: z.string().guid('Invalid customer UUID identifier'),
  }),
};
