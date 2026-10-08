import { z } from 'zod';

const acTypeEnum = z.enum([
  'SPLIT',
  'WINDOW',
  'CASSETTE',
  'PACKAGE',
  'TOWER',
  'DUCTABLE',
  'VRV_VRF',
  'FLOOR_STANDING',
  'CEILING_SUSPENDED',
  'PORTABLE',
  'CENTRAL',
  'OTHER',
  'Split AC',
  'Window AC',
  'Cassette AC',
  'Floor Standing AC',
  'Tower AC',
  'Ductable AC',
  'Ceiling Suspended AC',
  'Portable AC',
  'Central AC',
  'Package AC',
  'VRF System',
  'VRV System',
  'AHU / FCU Connected System',
  'Other',
]);

const warrantyStatusEnum = z.enum([
  'UNDER_WARRANTY',
  'EXPIRING_SOON',
  'EXPIRED',
  'AMC_COVERED',
  'OUT_OF_WARRANTY',
]);

const assetStatusEnum = z.enum([
  'Active',
  'Under Service',
  'Under Repair',
  'Temporarily Inactive',
  'Decommissioned',
  'Replaced',
  'Scrapped',
]);

const assetConditionEnum = z.enum([
  'Excellent',
  'Good',
  'Fair',
  'Needs Maintenance',
  'Poor',
  'Critical',
]);

export const listSiteAssetsSchema = {
  params: z.object({
    siteId: z.string().uuid('Invalid site UUID identifier'),
  }),
  query: z.object({
    search: z.string().trim().optional(),
    acType: z.string().optional().default('ALL'),
    warrantyStatus: z.enum(['ALL', 'UNDER_WARRANTY', 'EXPIRING_SOON', 'EXPIRED', 'AMC_COVERED', 'OUT_OF_WARRANTY']).optional().default('ALL'),
    status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).optional().default('ALL'),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  }),
};

export const listGlobalAssetsSchema = {
  query: z.object({
    siteId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    search: z.string().trim().optional(),
    acType: z.string().optional().default('ALL'),
    warrantyStatus: z.enum(['ALL', 'UNDER_WARRANTY', 'EXPIRING_SOON', 'EXPIRED', 'AMC_COVERED', 'OUT_OF_WARRANTY']).optional().default('ALL'),
    status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).optional().default('ALL'),
    assetStatus: z.string().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  }),
};

export const assetIdParamSchema = {
  params: z.object({
    id: z.string().uuid('Invalid asset UUID identifier'),
  }),
};

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const baseAssetBody = z.object({
  assetTag: z.string().min(2).max(50).trim().optional(),
  brand: z.string().min(1, 'Brand is required').max(100).trim(),
  brandId: z.string().uuid('Invalid brand UUID').optional().nullable(),
  modelNumber: z.string().max(100).trim().optional().nullable(),
  modelId: z.string().uuid('Invalid model UUID').optional().nullable(),
  serialNumber: z.string().max(100).trim().optional().nullable(),
  indoorSerialNumber: z.string().max(100).trim().optional().nullable(),
  outdoorSerialNumber: z.string().max(100).trim().optional().nullable(),
  acType: acTypeEnum,
  technology: z.string().max(50).trim().optional().nullable(),
  capacityTons: z.coerce.number().positive('Capacity must be greater than 0 tons').max(100).optional().nullable(),
  starRating: z.string().max(50).trim().optional().nullable(),
  purchaseDate: z.string().regex(dateRegex, 'Purchase date must be in YYYY-MM-DD format').optional().nullable(),
  installationDate: z.string().regex(dateRegex, 'Installation date must be in YYYY-MM-DD format').optional().nullable(),
  warrantyStartDate: z.string().regex(dateRegex, 'Warranty start date must be in YYYY-MM-DD format').optional().nullable(),
  warrantyEndDate: z.string().regex(dateRegex, 'Warranty end date must be in YYYY-MM-DD format').optional().nullable(),
  floorLocation: z.string().max(100).trim().optional().nullable(),
  roomLocation: z.string().max(100).trim().optional().nullable(),
  refrigerantType: z.string().max(50).trim().optional().nullable(),
  warrantyStatus: warrantyStatusEnum.optional().default('UNDER_WARRANTY'),
  assetStatus: assetStatusEnum.optional().default('Active'),
  assetCondition: assetConditionEnum.optional().default('Good'),
  notes: z.string().max(1000).trim().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.purchaseDate && data.installationDate && data.purchaseDate > data.installationDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Purchase date cannot be later than installation date.',
      path: ['purchaseDate'],
    });
  }
  if (data.warrantyStartDate && data.warrantyEndDate && data.warrantyEndDate < data.warrantyStartDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Warranty end date cannot be earlier than warranty start date.',
      path: ['warrantyEndDate'],
    });
  }
});

export const createAcAssetSchema = {
  params: z.object({
    siteId: z.string().uuid('Invalid site UUID identifier'),
  }),
  body: baseAssetBody,
};

export const createDirectAcAssetSchema = {
  body: baseAssetBody.and(
    z.object({
      siteId: z.string().uuid('Valid site ID is required'),
    })
  ),
};

export const updateAcAssetSchema = {
  params: z.object({
    id: z.string().uuid('Invalid asset UUID identifier'),
  }),
  body: z
    .object({
      brand: z.string().min(1, 'Brand cannot be empty').max(100).trim().optional(),
      brandId: z.string().uuid('Invalid brand UUID').optional().nullable(),
      modelNumber: z.string().max(100).trim().optional().nullable(),
      modelId: z.string().uuid('Invalid model UUID').optional().nullable(),
      serialNumber: z.string().max(100).trim().optional().nullable(),
      indoorSerialNumber: z.string().max(100).trim().optional().nullable(),
      outdoorSerialNumber: z.string().max(100).trim().optional().nullable(),
      acType: acTypeEnum.optional(),
      technology: z.string().max(50).trim().optional().nullable(),
      capacityTons: z.coerce.number().positive('Capacity must be greater than 0 tons').max(100).optional().nullable(),
      starRating: z.string().max(50).trim().optional().nullable(),
      purchaseDate: z.string().regex(dateRegex, 'Purchase date must be in YYYY-MM-DD format').optional().nullable(),
      installationDate: z.string().regex(dateRegex, 'Installation date must be in YYYY-MM-DD format').optional().nullable(),
      warrantyStartDate: z.string().regex(dateRegex, 'Warranty start date must be in YYYY-MM-DD format').optional().nullable(),
      warrantyEndDate: z.string().regex(dateRegex, 'Warranty end date must be in YYYY-MM-DD format').optional().nullable(),
      floorLocation: z.string().max(100).trim().optional().nullable(),
      roomLocation: z.string().max(100).trim().optional().nullable(),
      refrigerantType: z.string().max(50).trim().optional().nullable(),
      warrantyStatus: warrantyStatusEnum.optional(),
      assetStatus: assetStatusEnum.optional(),
      assetCondition: assetConditionEnum.optional(),
      notes: z.string().max(1000).trim().optional().nullable(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    })
    .superRefine((data, ctx) => {
      if (data.purchaseDate && data.installationDate && data.purchaseDate > data.installationDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Purchase date cannot be later than installation date.',
          path: ['purchaseDate'],
        });
      }
      if (data.warrantyStartDate && data.warrantyEndDate && data.warrantyEndDate < data.warrantyStartDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Warranty end date cannot be earlier than warranty start date.',
          path: ['warrantyEndDate'],
        });
      }
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
