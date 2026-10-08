import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const amcIdParamSchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Invalid AMC contract ID format'),
});

export const amcAssetParamSchema = z.object({
  id: z.string().regex(UUID_REGEX, 'Invalid AMC contract ID format'),
  assetId: z.string().regex(UUID_REGEX, 'Invalid AC asset ID format'),
});

export const listAmcQuerySchema = z.object({
  search: z.string().optional(),
  status: z
    .enum(['ALL', 'DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'CANCELLED', 'RENEWED', 'HISTORY'])
    .optional()
    .default('ALL'),
  frequency: z
    .enum(['ALL', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'])
    .optional()
    .default('ALL'),
  planId: z.string().regex(UUID_REGEX, 'Invalid Plan ID format').optional(),
  customerId: z.string().regex(UUID_REGEX, 'Invalid Customer ID format').optional(),
  isExpiringSoon: z
    .union([z.boolean(), z.string().transform((val) => val === 'true')])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createAmcContractSchema = z
  .object({
    customerId: z.string().regex(UUID_REGEX, 'Invalid Customer ID format'),
    planId: z.string().regex(UUID_REGEX, 'Invalid Plan ID format').optional().nullable(),
    startDate: z.string().regex(DATE_REGEX, 'Start date must be in YYYY-MM-DD format'),
    endDate: z.string().regex(DATE_REGEX, 'End date must be in YYYY-MM-DD format'),
    frequency: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']),
    totalAmount: z.coerce.number().min(0, 'Total amount cannot be negative'),
    totalVisits: z.coerce.number().int().min(1, 'Total visits must be at least 1'),
    coveredAssetIds: z.array(z.string().regex(UUID_REGEX, 'Invalid Asset ID format')).optional().default([]),
    status: z
      .enum(['DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'CANCELLED', 'RENEWED'])
      .optional()
      .default('ACTIVE'),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine(
    (data) => {
      return data.endDate >= data.startDate;
    },
    {
      message: 'AMC contract end date cannot precede start date',
      path: ['endDate'],
    }
  );

export const updateAmcContractSchema = z
  .object({
    planId: z.string().regex(UUID_REGEX, 'Invalid Plan ID format').optional().nullable(),
    startDate: z.string().regex(DATE_REGEX, 'Start date must be in YYYY-MM-DD format').optional(),
    endDate: z.string().regex(DATE_REGEX, 'End date must be in YYYY-MM-DD format').optional(),
    frequency: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']).optional(),
    totalAmount: z.coerce.number().min(0, 'Total amount cannot be negative').optional(),
    totalVisits: z.coerce.number().int().min(1, 'Total visits must be at least 1').optional(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'AMC contract end date cannot precede start date',
      path: ['endDate'],
    }
  );

export const updateAmcStatusSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'CANCELLED', 'RENEWED']),
  reason: z.string().max(500).optional(),
});

export const cancelAmcSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required').max(1000),
});

export const addAmcAssetsSchema = z.object({
  assetIds: z
    .array(z.string().regex(UUID_REGEX, 'Invalid Asset ID format'))
    .min(1, 'At least one asset must be selected'),
});

export const generatePmSchema = z.object({
  assetIds: z
    .array(z.string().regex(UUID_REGEX, 'Invalid Asset ID format'))
    .optional(),
});

export const renewAmcContractSchema = z
  .object({
    startDate: z.string().regex(DATE_REGEX, 'Start date must be in YYYY-MM-DD format'),
    endDate: z.string().regex(DATE_REGEX, 'End date must be in YYYY-MM-DD format'),
    frequency: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']).optional(),
    totalAmount: z.coerce.number().min(0, 'Total amount cannot be negative').optional(),
    totalVisits: z.coerce.number().int().min(1, 'Total visits must be at least 1').optional(),
    coveredAssetIds: z.array(z.string().regex(UUID_REGEX, 'Invalid Asset ID format')).optional(),
    planId: z.string().regex(UUID_REGEX, 'Invalid Plan ID format').optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine(
    (data) => {
      return data.endDate >= data.startDate;
    },
    {
      message: 'AMC contract end date cannot precede start date',
      path: ['endDate'],
    }
  );
