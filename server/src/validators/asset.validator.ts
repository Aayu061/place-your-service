import { z } from 'zod';

const acTypeEnum = z.enum([
  'SPLIT',
  'WINDOW',
  'CASSETTE',
  'PACKAGE',
  'TOWER',
  'DUCTABLE',
  'VRV_VRF',
  'OTHER',
]);

const warrantyStatusEnum = z.enum([
  'UNDER_WARRANTY',
  'EXPIRED',
  'AMC_COVERED',
  'OUT_OF_WARRANTY',
]);

export const listSiteAssetsSchema = {
  params: z.object({
    siteId: z.string().uuid('Invalid site UUID identifier'),
  }),
  query: z.object({
    search: z.string().trim().optional(),
    acType: z.enum(['ALL', 'SPLIT', 'WINDOW', 'CASSETTE', 'PACKAGE', 'TOWER', 'DUCTABLE', 'VRV_VRF', 'OTHER']).optional().default('ALL'),
    warrantyStatus: z.enum(['ALL', 'UNDER_WARRANTY', 'EXPIRED', 'AMC_COVERED', 'OUT_OF_WARRANTY']).optional().default('ALL'),
    status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).optional().default('ALL'),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  }),
};

export const assetIdParamSchema = {
  params: z.object({
    id: z.string().uuid('Invalid asset UUID identifier'),
  }),
};

export const createAcAssetSchema = {
  params: z.object({
    siteId: z.string().uuid('Invalid site UUID identifier'),
  }),
  body: z.object({
    assetTag: z.string().min(2).max(50).trim().optional(),
    brand: z.string().min(1, 'Brand is required').max(100).trim(),
    modelNumber: z.string().max(100).trim().optional().nullable(),
    serialNumber: z.string().max(100).trim().optional().nullable(),
    acType: acTypeEnum,
    capacityTons: z.coerce.number().positive('Capacity must be greater than 0 tons').max(100).optional().nullable(),
    installationDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Installation date must be in YYYY-MM-DD format')
      .optional()
      .nullable(),
    floorLocation: z.string().max(100).trim().optional().nullable(),
    roomLocation: z.string().max(100).trim().optional().nullable(),
    refrigerantType: z.string().max(50).trim().optional().nullable(),
    warrantyStatus: warrantyStatusEnum.optional().default('UNDER_WARRANTY'),
    notes: z.string().max(1000).trim().optional().nullable(),
  }),
};

export const updateAcAssetSchema = {
  params: z.object({
    id: z.string().uuid('Invalid asset UUID identifier'),
  }),
  body: z
    .object({
      brand: z.string().min(1, 'Brand cannot be empty').max(100).trim().optional(),
      modelNumber: z.string().max(100).trim().optional().nullable(),
      serialNumber: z.string().max(100).trim().optional().nullable(),
      acType: acTypeEnum.optional(),
      capacityTons: z.coerce.number().positive('Capacity must be greater than 0 tons').max(100).optional().nullable(),
      installationDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Installation date must be in YYYY-MM-DD format')
        .optional()
        .nullable(),
      floorLocation: z.string().max(100).trim().optional().nullable(),
      roomLocation: z.string().max(100).trim().optional().nullable(),
      refrigerantType: z.string().max(50).trim().optional().nullable(),
      warrantyStatus: warrantyStatusEnum.optional(),
      notes: z.string().max(1000).trim().optional().nullable(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
};

export const updateAcAssetStatusSchema = {
  params: z.object({
    id: z.string().uuid('Invalid asset UUID identifier'),
  }),
  body: z.object({
    isActive: z.boolean({ required_error: 'isActive boolean flag is required' }),
  }),
};
