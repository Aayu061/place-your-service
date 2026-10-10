import { z } from 'zod';

export const brandIdParamSchema = {
  params: z.object({
    id: z.string().uuid('Invalid brand UUID identifier'),
  }),
};

export const modelIdParamSchema = {
  params: z.object({
    id: z.string().uuid('Invalid model UUID identifier'),
  }),
};

export const listBrandsQuerySchema = {
  query: z.object({
    search: z.string().trim().optional(),
    activeOnly: z
      .union([z.boolean(), z.string().transform((val) => val === 'true' || val === '1')])
      .optional(),
    status: z
      .enum(['ALL', 'ACTIVE', 'INACTIVE', 'all', 'active', 'inactive'])
      .optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  }),
};

export const createBrandSchema = {
  body: z.object({
    name: z.string().min(1, 'Brand name is required').max(100).trim(),
    code: z.string().max(50).trim().optional(),
    isActive: z.boolean().optional().default(true),
  }),
};

export const updateBrandSchema = {
  params: z.object({
    id: z.string().uuid('Invalid brand UUID identifier'),
  }),
  body: z
    .object({
      name: z.string().min(1, 'Brand name cannot be empty').max(100).trim().optional(),
      code: z.string().max(50).trim().optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
};

export const updateBrandStatusSchema = {
  params: z.object({
    id: z.string().uuid('Invalid brand UUID identifier'),
  }),
  body: z.object({
    isActive: z.boolean({ required_error: 'isActive boolean flag is required' }),
  }),
};

export const listModelsQuerySchema = {
  query: z.object({
    brandId: z.string().uuid('Invalid brand UUID').optional(),
    search: z.string().trim().optional(),
    activeOnly: z
      .union([z.boolean(), z.string().transform((val) => val === 'true' || val === '1')])
      .optional(),
    status: z
      .enum(['ALL', 'ACTIVE', 'INACTIVE', 'all', 'active', 'inactive'])
      .optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  }),
};

export const createModelSchema = {
  body: z.object({
    brandId: z.string().uuid('Brand ID is required'),
    modelNumber: z.string().min(1, 'Model number is required').max(100).trim(),
    acType: z.string().max(100).trim().optional().nullable(),
    technology: z.string().max(50).trim().optional().nullable(),
    capacityTons: z.coerce.number().positive('Capacity must be greater than 0 tons').max(100).optional().nullable(),
    rating: z.string().max(50).trim().optional().nullable(),
    refrigerant: z.string().max(50).trim().optional().nullable(),
    isActive: z.boolean().optional().default(true),
  }),
};

export const updateModelSchema = {
  params: z.object({
    id: z.string().uuid('Invalid model UUID identifier'),
  }),
  body: z
    .object({
      modelNumber: z.string().min(1, 'Model number cannot be empty').max(100).trim().optional(),
      acType: z.string().max(100).trim().optional().nullable(),
      technology: z.string().max(50).trim().optional().nullable(),
      capacityTons: z.coerce.number().positive('Capacity must be greater than 0 tons').max(100).optional().nullable(),
      rating: z.string().max(50).trim().optional().nullable(),
      refrigerant: z.string().max(50).trim().optional().nullable(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
};

export const updateModelStatusSchema = {
  params: z.object({
    id: z.string().uuid('Invalid model UUID identifier'),
  }),
  body: z.object({
    isActive: z.boolean({ required_error: 'isActive boolean flag is required' }),
  }),
};

export const variantIdParamSchema = {
  params: z.object({
    id: z.string().uuid('Invalid variant UUID identifier'),
  }),
};

export const createVariantSchema = {
  params: z.object({
    id: z.string().uuid('Invalid model UUID identifier'),
  }),
  body: z.object({
    variantCode: z.string().max(100).trim().optional(),
    capacityTons: z.coerce.number().positive('Capacity must be greater than 0 tons').max(100),
    capacityDisplay: z.string().max(50).trim().optional(),
    starRating: z.string().max(50).trim().optional().default('3 Star'),
    acType: z.string().max(100).trim().optional().default('Split AC'),
    technology: z.string().max(50).trim().optional().default('Inverter'),
    refrigerant: z.string().max(50).trim().optional().nullable(),
    series: z.string().max(100).trim().optional().nullable(),
    sourceProvenance: z.string().max(100).trim().optional().default('ADMIN_SPEC'),
    isActive: z.boolean().optional().default(true),
  }),
};

export const updateVariantSchema = {
  params: z.object({
    id: z.string().uuid('Invalid variant UUID identifier'),
  }),
  body: z
    .object({
      variantCode: z.string().max(100).trim().optional().nullable(),
      capacityTons: z.coerce.number().positive('Capacity must be greater than 0 tons').max(100).optional(),
      capacityDisplay: z.string().max(50).trim().optional().nullable(),
      starRating: z.string().max(50).trim().optional(),
      acType: z.string().max(100).trim().optional(),
      technology: z.string().max(50).trim().optional(),
      refrigerant: z.string().max(50).trim().optional().nullable(),
      series: z.string().max(100).trim().optional().nullable(),
      sourceProvenance: z.string().max(100).trim().optional().nullable(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
};

export const updateVariantStatusSchema = {
  params: z.object({
    id: z.string().uuid('Invalid variant UUID identifier'),
  }),
  body: z.object({
    isActive: z.boolean({ required_error: 'isActive boolean flag is required' }),
  }),
};

