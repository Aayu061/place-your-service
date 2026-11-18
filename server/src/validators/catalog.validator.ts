import { z } from 'zod';

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,40}$/, 'Use capital letters, digits and dashes (e.g. SVC-JET-WASH)');

const acType = z.enum(['ANY', 'SPLIT', 'WINDOW', 'CASSETTE', 'TOWER', 'DUCTABLE', 'VRF']);
const money = z.number().finite().min(0).max(10_000_000);
const shortText = z.string().trim().min(1).max(120);

const itemFields = {
  name: z.string().trim().min(2).max(120),
  shortDescription: z.string().trim().max(300).nullable(),
  includes: z.array(shortText).max(20),
  excludes: z.array(shortText).max(20),
  category: z.enum(['CLEANING', 'REPAIR', 'GAS', 'INSTALLATION', 'DIAGNOSIS']),
  requestType: z.enum([
    'BREAKDOWN', 'COMPLAINT', 'REPAIR', 'EMERGENCY', 'INSTALLATION', 'UNINSTALLATION',
    'GENERAL_SERVICE', 'INSPECTION', 'PREVENTIVE_MAINTENANCE', 'UNPLANNED_OTHER', 'OTHER',
  ]),
  serviceType: z.enum([
    'DRY_SERVICE', 'JET_SERVICE', 'JACKET_SERVICE', 'PUMPDOWN_SERVICE', 'DIAGNOSTIC_INSPECTION',
    'GAS_RECHARGE', 'CAPACITOR_REPLACE', 'PCB_REPAIR', 'MOTOR_REPAIR', 'COMPRESSOR_REPAIR',
    'WATER_LEAK_FIX', 'ELECTRICAL_FIX', 'COIL_BRAZING', 'GENERAL_REPAIR',
  ]),
  pricingModel: z.enum(['FIXED', 'FROM', 'QUOTE_AFTER_DIAGNOSIS']),
  basePrice: money.nullable(),
  gstRatePercent: z.number().min(0).max(28),
  sacCode: z.string().trim().regex(/^[0-9]{4,8}$/, 'SAC code is 4–8 digits').nullable(),
  durationMinutes: z.number().int().min(5).max(1440).nullable(),
  warrantyDays: z.number().int().min(0).max(3650).nullable(),
  appliesToAcTypes: z.array(acType).min(1).max(7),
  formSchema: z.object({ blocks: z.array(z.enum(['contact', 'address', 'ac', 'request', 'consent'])).min(1) }),
  isPublic: z.boolean(),
  isActive: z.boolean(),
  displayOrder: z.number().int().min(0).max(10_000),
};

const needsPrice = (v: { pricingModel?: string; basePrice?: number | null }) =>
  v.pricingModel === undefined || v.pricingModel === 'QUOTE_AFTER_DIAGNOSIS' || (v.basePrice !== null && v.basePrice !== undefined);

export const catalogCodeParamSchema = z.object({ code });

export const createCatalogItemSchema = z
  .object({
    code,
    ...itemFields,
    shortDescription: itemFields.shortDescription.optional(),
    includes: itemFields.includes.optional(),
    excludes: itemFields.excludes.optional(),
    basePrice: itemFields.basePrice.optional(),
    gstRatePercent: itemFields.gstRatePercent.optional(),
    sacCode: itemFields.sacCode.optional(),
    durationMinutes: itemFields.durationMinutes.optional(),
    warrantyDays: itemFields.warrantyDays.optional(),
    appliesToAcTypes: itemFields.appliesToAcTypes.optional(),
    formSchema: itemFields.formSchema.optional(),
    isPublic: itemFields.isPublic.optional(),
    isActive: itemFields.isActive.optional(),
    displayOrder: itemFields.displayOrder.optional(),
  })
  .strict()
  .refine(needsPrice, { message: 'A price is required unless the service is quoted after diagnosis', path: ['basePrice'] });

export const updateCatalogItemSchema = z
  .object(itemFields)
  .partial()
  .strict()
  .refine((v) => !(v.pricingModel && v.pricingModel !== 'QUOTE_AFTER_DIAGNOSIS' && v.basePrice === null), {
    message: 'A price is required unless the service is quoted after diagnosis',
    path: ['basePrice'],
  });

export const replaceCatalogPricesSchema = z
  .object({
    prices: z
      .array(
        z
          .object({
            acType,
            tonnageMin: z.number().min(0).max(99),
            tonnageMax: z.number().min(0).max(99),
            price: money,
          })
          .strict()
          .refine((p) => p.tonnageMax >= p.tonnageMin, { message: 'tonnageMax must be ≥ tonnageMin' })
      )
      .max(50),
  })
  .strict();
