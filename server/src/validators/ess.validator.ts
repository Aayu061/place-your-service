import { z } from 'zod';
import { indianMobile } from './intake.validator.js';

/**
 * Inputs of the signed ESS website API (/api/v1/ess): public reads, tracking and the ESS admin area.
 * Validation errors answer 422 like the rest of /api/v1/ess.
 */

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().min(1).max(max).optional());
const nullableText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullable().optional());

export const CONTENT_KEY_RE = /^[a-z0-9]+(\.[a-z0-9-]+)*$/;
export const contentKey = z.string().trim().max(80).regex(CONTENT_KEY_RE, 'Invalid content key');

/* ------------------------------------------------------------- public reads */

export const contentQuerySchema = z.object({
  keys: z
    .string()
    .trim()
    .min(1, 'keys is required')
    .transform((v) => [...new Set(v.split(',').map((k) => k.trim()).filter(Boolean))])
    .pipe(z.array(contentKey).min(1).max(20)),
});

export const pincodeParamSchema = z.object({
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Pincode is 6 digits'),
});

export const productIdParamSchema = z.object({
  id: z.string().trim().min(1).max(100),
});

export const trackSchema = z
  .object({
    code: z.string().trim().min(6).max(20),
    phone: indianMobile,
    clientIpHash: optionalText(128),
  })
  .strict();
export type TrackInput = z.infer<typeof trackSchema>;

/* ------------------------------------------------------------- ESS admin */

const money = z.number().finite().min(0).max(10_000_000);

const productBase = z
  .object({
    id: z.preprocess(blankToUndefined, z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,80}$/, 'Use lowercase letters, digits and -').optional()),
    name: z.string().trim().min(2).max(200),
    category: z.string().trim().regex(/^[a-z_]{2,40}$/).default('new_ac'),
    brand: nullableText(60),
    modelNumber: nullableText(80),
    tonnage: nullableText(20),
    starRating: nullableText(20),
    price: money.nullable().optional(),
    mrp: money.nullable().optional(),
    stock: z.number().int().min(0).max(100_000).optional(),
    isCustomQuote: z.boolean().optional(),
    description: nullableText(4000),
    coolingCapacity: nullableText(60),
    powerConsumption: nullableText(60),
    refrigerant: nullableText(40),
    noiseLevel: nullableText(40),
    dimensions: nullableText(120),
    warranty: nullableText(200),
    keyFeatures: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    imageUrl: z.preprocess(blankToUndefined, z.string().trim().url().max(1000).nullable().optional()),
    spaceType: nullableText(60),
    idealFor: nullableText(120),
    countryOfOrigin: nullableText(80),
    isPublished: z.boolean().optional(),
    displayOrder: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

const priceNotAboveMrp = (v: { price?: number | null; mrp?: number | null }, ctx: z.RefinementCtx) => {
  if (v.mrp != null && v.price != null && v.price > v.mrp) {
    ctx.addIssue({ code: 'custom', path: ['price'], message: 'Selling price cannot be above the MRP' });
  }
};
export const productInputSchema = productBase.superRefine(priceNotAboveMrp);
export type ProductInput = z.infer<typeof productInputSchema>;
export const productPatchSchema = productBase.omit({ id: true }).partial().superRefine(priceNotAboveMrp);
export type ProductPatch = z.infer<typeof productPatchSchema>;

/** Draft body of a content block: any JSON object, size-limited (checked again in the service). */
export const contentDraftSchema = z
  .object({ body: z.record(z.string(), z.unknown()) })
  .strict();

/** The business details block drives the footer, legal pages and emails; its shape is fixed. */
export const businessIdentitySchema = z
  .object({
    legalName: z.string().trim().min(2).max(200),
    tradeName: z.string().trim().min(2).max(200),
    proprietorName: z.string().trim().max(120).nullable(),
    gstin: z.string().trim().regex(/^[0-9]{2}[A-Z0-9]{13}$/, 'GSTIN is 15 characters').nullable(),
    address: z.string().trim().min(5).max(500),
    phone: z.string().trim().min(6).max(20),
    whatsapp: z.string().trim().max(20).nullable(),
    email: z.string().trim().email().max(254),
    hours: z.string().trim().min(2).max(120),
    warrantyDays: z.number().int().min(0).max(3650),
    grievanceOfficer: z
      .object({
        name: z.string().trim().max(120).nullable(),
        email: z.string().trim().email().max(254).nullable(),
        phone: z.string().trim().max(20).nullable(),
      })
      .strict(),
  })
  .strict();

export const catalogDisplayPatchSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            type: z.enum(['SERVICE', 'AMC']),
            code: z.string().trim().regex(/^[A-Za-z0-9-]{1,60}$/, 'Invalid code'),
            isPublic: z.boolean().optional(),
            displayOrder: z.number().int().min(0).max(100_000).optional(),
          })
          .strict()
      )
      .min(1)
      .max(200),
  })
  .strict();

export const serviceAreaSchema = z
  .object({
    pincodePrefix: z.string().trim().regex(/^[1-9][0-9]{1,5}$/, 'Use 2–6 digits of the pincode'),
    label: z.string().trim().min(2).max(120),
    isActive: z.boolean().default(true),
    notes: nullableText(300),
  })
  .strict();

/** Seller's price for one AC enquiry line (per unit, GST included). */
export const enquiryQuoteSchema = z
  .object({ total: money.refine((n) => n > 0, 'Enter the price'), note: nullableText(1000) })
  .strict();
export const enquiryCloseSchema = z.object({ result: z.enum(['SOLD', 'NOT_TAKEN']) }).strict();
export const enquiryLineParamSchema = z.object({ lineId: z.string().trim().min(1).max(100) });

export const roleGrantSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    fullName: optionalText(120),
    role: z.enum(['ESS_ADMIN', 'ESS_STAFF']),
  })
  .strict();

export const grantIdParamSchema = z.object({ id: z.string().uuid() });
export const contentKeyParamSchema = z.object({ key: contentKey });
export const prefixParamSchema = z.object({ prefix: z.string().regex(/^[1-9][0-9]{1,5}$/) });

export const leadsQuerySchema = z.object({
  status: z.preprocess(blankToUndefined, z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'DUPLICATE', 'SPAM']).optional()),
  kind: z.preprocess(
    blankToUndefined,
    z.enum(['SERVICE_BOOKING', 'AMC_REQUEST', 'PRODUCT_ENQUIRY', 'CONTACT', 'BASKET', 'SELLER_INTEREST']).optional()
  ),
  search: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  page: z.preprocess((v) => (v === undefined || v === '' ? 1 : Number(v)), z.number().int().min(1).max(10_000)),
  pageSize: z.preprocess((v) => (v === undefined || v === '' ? 25 : Number(v)), z.number().int().min(1).max(100)),
});
