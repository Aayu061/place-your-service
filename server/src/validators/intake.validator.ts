import { z } from 'zod';
import { normalizePhone } from '../utils/customerAuth.js';

/**
 * Website request intake (M5).
 * - createIntakeSchema: body of the signed ESS call POST /api/v1/ess/intakes
 * - staff schemas for /api/v1/intakes (list, approve, reject)
 */

export const INTAKE_KINDS = [
  'SERVICE_BOOKING', 'AMC_REQUEST', 'PRODUCT_ENQUIRY', 'CONTACT', 'BASKET', 'SELLER_INTEREST',
] as const;
/** S11b: kinds only PYS creates for a signed-in customer (never accepted from the public intake form). */
export const PORTAL_INTAKE_KINDS = ['AMC_RENEWAL', 'PROFILE_CHANGE'] as const;
/** Every kind the staff approval inbox can list / filter by. */
export const STAFF_INTAKE_KINDS = [...INTAKE_KINDS, ...PORTAL_INTAKE_KINDS] as const;
export const INTAKE_ITEM_TYPES = ['SERVICE', 'AMC', 'PRODUCT'] as const;
export const MAX_BASKET_ITEMS = 30;
/** An AC enquiry asks about up to 10 ACs (plan 3). */
export const MAX_ENQUIRY_ITEMS = 10;
export const INTAKE_STATUSES = [
  'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'DUPLICATE', 'SPAM', 'WITHDRAWN', 'IMPORTED_ARCHIVE',
] as const;
export const INTAKE_AC_TYPES = ['SPLIT', 'WINDOW', 'CASSETTE', 'TOWER', 'DUCTABLE', 'VRF', 'UNKNOWN'] as const;
export const INTAKE_SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
export const SERVICE_REQUEST_TYPES = [
  'BREAKDOWN', 'COMPLAINT', 'REPAIR', 'EMERGENCY', 'INSTALLATION', 'UNINSTALLATION',
  'GENERAL_SERVICE', 'INSPECTION', 'PREVENTIVE_MAINTENANCE', 'UNPLANNED_OTHER', 'OTHER',
] as const;
export const SERVICE_REQUEST_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'EMERGENCY'] as const;

/** Kinds that become a customer + site + service request on approval. */
export const SERVICE_KINDS: ReadonlyArray<string> = ['SERVICE_BOOKING', 'AMC_REQUEST'];

/** Today's date (YYYY-MM-DD) in India time. */
export function todayIst(now = Date.now()): string {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}

const isRealDate = (s: string): boolean => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Empty strings from web forms count as "not given". */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().min(1).max(max).optional());

/** Indian mobile: accepts +91 / 91 / 0 prefixes, spaces and dashes; normalised to 10 digits. */
export const indianMobile = z
  .string()
  .trim()
  .max(20)
  .transform((v) => normalizePhone(v))
  .refine((v) => /^[6-9][0-9]{9}$/.test(v), { message: 'Enter a valid 10-digit Indian mobile number' });

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(isRealDate, { message: 'Not a valid date' });

const serviceCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,40}$/, 'Unknown service code');

/** One basket line: a catalog service, an AMC plan or a product, with optional AC details. */
export const intakeItemSchema = z
  .object({
    type: z.enum(INTAKE_ITEM_TYPES),
    serviceCode: z.preprocess(blankToUndefined, serviceCodeField.optional()),
    amcPlanCode: optionalText(60),
    productId: z.preprocess(blankToUndefined, z.string().trim().min(1).max(100).optional()),
    quantity: z.number().int().min(1).max(20).optional(),
    ac: z
      .object({
        type: z.enum(INTAKE_AC_TYPES).optional(),
        tonnage: z.number().finite().positive().max(50).optional(),
        brand: optionalText(60),
      })
      .strict()
      .optional(),
    notes: optionalText(500),
  })
  .strict()
  .superRefine((v, ctx) => {
    const need = { SERVICE: 'serviceCode', AMC: 'amcPlanCode', PRODUCT: 'productId' } as const;
    const field = need[v.type];
    if (!v[field]) ctx.addIssue({ code: 'custom', path: [field], message: `${field} is required for a ${v.type} line` });
    for (const other of Object.values(need)) {
      if (other !== field && v[other]) {
        ctx.addIssue({ code: 'custom', path: [other], message: `${other} does not belong on a ${v.type} line` });
      }
    }
  });
export type IntakeItemInput = z.infer<typeof intakeItemSchema>;

export const createIntakeSchema = z
  .object({
    kind: z.enum(INTAKE_KINDS),
    items: z.array(intakeItemSchema).min(1).max(MAX_BASKET_ITEMS).optional(),
    externalReferenceId: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .max(200)
        .regex(/^[A-Za-z0-9_.:\/-]+$/, 'Use letters, digits and _ . : / -')
        .optional()
    ),
    contact: z
      .object({
        name: z.string().trim().min(2).max(120),
        phone: indianMobile,
        email: z.preprocess(blankToUndefined, z.string().trim().toLowerCase().max(254).email().optional()),
      })
      .strict(),
    address: z
      .object({
        line: z.string().trim().min(3).max(300),
        area: optionalText(120),
        landmark: optionalText(120),
        city: z.string().trim().min(2).max(80),
        pincode: z.preprocess(
          blankToUndefined,
          z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Pincode is 6 digits').optional()
        ),
      })
      .strict()
      .optional(),
    ac: z
      .object({
        type: z.enum(INTAKE_AC_TYPES).optional(),
        brand: optionalText(60),
        tonnage: z.number().finite().positive().max(50).optional(),
        inverter: z.enum(['YES', 'NO', 'UNKNOWN']).optional(),
        ageYears: z.number().int().min(0).max(60).optional(),
        units: z.number().int().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
    request: z
      .object({
        serviceCode: z.preprocess(
          blankToUndefined,
          z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,40}$/, 'Unknown service code').optional()
        ),
        amcPlanCode: optionalText(60),
        message: optionalText(2000),
        preferredDate: dateString
          .refine((d) => d >= todayIst(), { message: 'Preferred date cannot be in the past' })
          .optional(),
        preferredSlot: z.enum(INTAKE_SLOTS).optional(),
      })
      .strict()
      .optional(),
    consent: z
      .object({
        privacy: z.literal(true, { message: 'Privacy consent is required' }),
        marketing: z.boolean().optional(),
        noticeVersion: optionalText(40),
      })
      .strict(),
    meta: z
      .object({
        clientIpHash: optionalText(128),
        honeypot: z.string().max(500).optional(),
        elapsedMs: z.number().int().min(0).max(86_400_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind === 'BASKET') {
      if (!v.items) ctx.addIssue({ code: 'custom', path: ['items'], message: 'A basket needs at least one item' });
    } else if (v.kind === 'PRODUCT_ENQUIRY' && v.items) {
      // AC enquiry basket: several ACs, nothing else.
      if (v.items.length > MAX_ENQUIRY_ITEMS) {
        ctx.addIssue({ code: 'custom', path: ['items'], message: `An enquiry can have up to ${MAX_ENQUIRY_ITEMS} ACs` });
      }
      v.items.forEach((it, i) => {
        if (it.type !== 'PRODUCT') ctx.addIssue({ code: 'custom', path: ['items', i, 'type'], message: 'Only ACs can be enquired about' });
      });
    } else if (v.items) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Items are only allowed on a basket or an AC enquiry' });
    }
    if (needsVisitAddress(v) && !v.address) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'Address (line and city) is required for this request' });
    }
  });

/** Requests that lead to a technician visit need an address. */
export function needsVisitAddress(v: { kind: string; items?: Array<{ type: string }> }): boolean {
  if (v.kind === 'BASKET') return (v.items ?? []).some((i) => i.type === 'SERVICE' || i.type === 'AMC');
  return SERVICE_KINDS.includes(v.kind);
}

export type CreateIntakeInput = z.infer<typeof createIntakeSchema>;

const intFromQuery = (def: number, min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? def : Number(v)),
    z.number().int().min(min).max(max)
  );

export const listIntakesQuerySchema = z.object({
  status: z.preprocess(blankToUndefined, z.enum(INTAKE_STATUSES).optional()),
  kind: z.preprocess(blankToUndefined, z.enum(STAFF_INTAKE_KINDS).optional()),
  search: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  page: intFromQuery(1, 1, 10_000),
  pageSize: intFromQuery(25, 1, 100),
});
export type ListIntakesQuery = z.infer<typeof listIntakesQuerySchema>;

export const intakeIdParamSchema = z.object({
  id: z.string().uuid('Invalid intake id'),
});

export const approveIntakeSchema = z
  .object({
    customerId: z.string().uuid().optional(),
    requestType: z.enum(SERVICE_REQUEST_TYPES).optional(),
    priority: z.enum(SERVICE_REQUEST_PRIORITIES).optional(),
    notes: optionalText(1000),
    schedule: z
      .object({
        date: dateString,
        slot: z.enum(INTAKE_SLOTS),
        technicianId: z.string().uuid().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ApproveIntakeInput = z.infer<typeof approveIntakeSchema>;

export const rejectIntakeSchema = z
  .object({
    status: z.enum(['REJECTED', 'SPAM', 'DUPLICATE']),
    reason: optionalText(500),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === 'REJECTED' && !v.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required to reject a request' });
    }
  });
export type RejectIntakeInput = z.infer<typeof rejectIntakeSchema>;
