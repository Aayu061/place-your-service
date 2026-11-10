import { z } from 'zod';
import { calculateAmcCadenceDates } from '../utils/amcCadence.js';

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
    .enum(['ALL', 'MONTHLY', 'BI_MONTHLY', 'QUARTERLY', 'FOUR_MONTHLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM', 'ON_DEMAND'])
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
    frequency: z.enum(['MONTHLY', 'BI_MONTHLY', 'QUARTERLY', 'FOUR_MONTHLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM', 'ON_DEMAND']),
    totalAmount: z.coerce.number().min(0, 'Total amount cannot be negative'),
    totalVisits: z.coerce.number().int().min(1, 'Total visits must be at least 1'),
    dryServiceVisits: z
      .coerce.number()
      .int('Dry service visits must be a whole number')
      .min(0, 'Dry service visits cannot be negative')
      .optional()
      .nullable(),
    jetServiceVisits: z
      .coerce.number()
      .int('Jet service visits must be a whole number')
      .min(0, 'Jet service visits cannot be negative')
      .optional()
      .nullable(),
    pumpdownServiceVisits: z
      .coerce.number()
      .int('Pumpdown service visits must be a whole number')
      .min(0, 'Pumpdown service visits cannot be negative')
      .optional()
      .nullable(),
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
  )
  .refine(
    (data) => {
      return (
        (data.dryServiceVisits ?? 0) +
          (data.jetServiceVisits ?? 0) +
          (data.pumpdownServiceVisits ?? 0) ===
        data.totalVisits
      );
    },
    {
      message: 'The total allocation across Dry, Jet, and Pumpdown visits must exactly equal total included visits',
      path: ['dryServiceVisits'],
    }
  )
  .refine(
    (data) => {
      try {
        return data.totalVisits === calculateAmcCadenceDates(data.startDate, data.endDate, data.frequency).length;
      } catch {
        return false;
      }
    },
    {
      message: 'Included visits must match the cadence dates within the contract term',
      path: ['totalVisits'],
    }
  );

export const updateAmcContractSchema = z
  .object({
    planId: z.string().regex(UUID_REGEX, 'Invalid Plan ID format').optional().nullable(),
    startDate: z.string().regex(DATE_REGEX, 'Start date must be in YYYY-MM-DD format').optional(),
    endDate: z.string().regex(DATE_REGEX, 'End date must be in YYYY-MM-DD format').optional(),
    frequency: z.enum(['MONTHLY', 'BI_MONTHLY', 'QUARTERLY', 'FOUR_MONTHLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM', 'ON_DEMAND']).optional(),
    totalAmount: z.coerce.number().min(0, 'Total amount cannot be negative').optional(),
    totalVisits: z.coerce.number().int().min(1, 'Total visits must be at least 1').optional(),
    dryServiceVisits: z
      .coerce.number()
      .int('Dry service visits must be a whole number')
      .min(0, 'Dry service visits cannot be negative')
      .optional()
      .nullable(),
    jetServiceVisits: z
      .coerce.number()
      .int('Jet service visits must be a whole number')
      .min(0, 'Jet service visits cannot be negative')
      .optional()
      .nullable(),
    pumpdownServiceVisits: z
      .coerce.number()
      .int('Pumpdown service visits must be a whole number')
      .min(0, 'Pumpdown service visits cannot be negative')
      .optional()
      .nullable(),
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
  )
  .refine(
    (data) => {
      if (
        data.totalVisits != null &&
        (data.dryServiceVisits != null ||
          data.jetServiceVisits != null ||
          data.pumpdownServiceVisits != null)
      ) {
        const dry = data.dryServiceVisits ?? 0;
        const jet = data.jetServiceVisits ?? 0;
        const pumpdown = data.pumpdownServiceVisits ?? 0;
        return dry + jet + pumpdown === data.totalVisits;
      }
      return true;
    },
    {
      message: 'The total allocation across Dry, Jet, and Pumpdown visits must exactly equal total included visits',
      path: ['dryServiceVisits'],
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
    frequency: z.enum(['MONTHLY', 'BI_MONTHLY', 'QUARTERLY', 'FOUR_MONTHLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM', 'ON_DEMAND']).optional(),
    totalAmount: z.coerce.number().min(0, 'Total amount cannot be negative').optional(),
    totalVisits: z.coerce.number().int().min(1, 'Total visits must be at least 1').optional(),
    dryServiceVisits: z
      .coerce.number()
      .int('Dry service visits must be a whole number')
      .min(0, 'Dry service visits cannot be negative')
      .optional()
      .nullable(),
    jetServiceVisits: z
      .coerce.number()
      .int('Jet service visits must be a whole number')
      .min(0, 'Jet service visits cannot be negative')
      .optional()
      .nullable(),
    pumpdownServiceVisits: z
      .coerce.number()
      .int('Pumpdown service visits must be a whole number')
      .min(0, 'Pumpdown service visits cannot be negative')
      .optional()
      .nullable(),
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
  )
  .refine(
    (data) => {
      if (
        data.totalVisits != null &&
        (data.dryServiceVisits != null ||
          data.jetServiceVisits != null ||
          data.pumpdownServiceVisits != null)
      ) {
        const dry = data.dryServiceVisits ?? 0;
        const jet = data.jetServiceVisits ?? 0;
        const pumpdown = data.pumpdownServiceVisits ?? 0;
        return dry + jet + pumpdown === data.totalVisits;
      }
      return true;
    },
    {
      message: 'The total allocation across Dry, Jet, and Pumpdown visits must exactly equal total included visits',
      path: ['dryServiceVisits'],
    }
  );

export const sendQuotationSchema = z.object({
  recipientEmail: z.string().email('Valid recipient email address is required'),
});

export const clearPaymentSchema = z.object({
  paymentMethod: z.enum(['CASH', 'ONLINE', 'CHEQUE']),
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  externalPaymentReference: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const planIdParamSchema = z.object({
  id: z.string().guid('Invalid plan UUID'),
});

export const createPlanSchema = z.object({
  planCode: z.string().trim().min(2, 'Plan code is required').max(50),
  name: z.string().trim().min(2, 'Plan name is required').max(150),
  category: z.enum(['SPECIAL_COMPREHENSIVE', 'SEMI_COMPREHENSIVE', 'ORDINARY', 'PREMIUM_JACKET', 'STANDALONE']).default('ORDINARY'),
  description: z.string().trim().nullable().optional(),
  coverageSummary: z.string().trim().nullable().optional(),
  defaultFrequency: z.enum(['MONTHLY', 'BI_MONTHLY', 'QUARTERLY', 'FOUR_MONTHLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM', 'ON_DEMAND']),
  defaultVisitsPerYear: z.coerce.number().int().min(1).max(52),
  pricingModel: z.enum(['TIERED_TONNAGE', 'FLAT_PER_UNIT', 'PER_SERVICE']).default('TIERED_TONNAGE'),
  rateSplitSmall: z.coerce.number().min(0).nullable().optional(),
  rateSplitLarge: z.coerce.number().min(0).nullable().optional(),
  rateWindowSmall: z.coerce.number().min(0).nullable().optional(),
  rateWindowLarge: z.coerce.number().min(0).nullable().optional(),
  rateFlat: z.coerce.number().min(0).nullable().optional(),
  gstRatePercent: z.coerce.number().min(0).max(100).default(0),
  maxEquipmentAgeYears: z.coerce.number().int().min(1).max(30).nullable().optional(),
  hasGasCharging: z.boolean().default(false),
  hasSpareParts: z.boolean().default(false),
  hasUnlimitedComplaints: z.boolean().default(true),
  isActive: z.boolean().default(true),
  rateMetadata: z.record(z.string(), z.any()).nullable().optional(),
});

export const updatePlanSchema = createPlanSchema.partial();

