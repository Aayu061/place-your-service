import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { normalizePhone } from '../utils/customerAuth.js';
import {
  CUSTOMER_STATUSES,
  CustomerStatus,
  customerStatusFor,
  fromIntakeStatus,
} from '../domain/customerStatus.js';
import { firstNameOnly } from './notifications/customerEmailTemplates.js';
import type { PriceSnapshot } from './basketPricing.js';

/**
 * Read-only data the ESS website needs (signed /api/v1/ess routes): products with seller
 * disclosure, published content, pincode serviceability and "track my request".
 * Nothing here returns addresses, technician phone numbers or internal notes.
 */

/* ------------------------------------------------------------------ products */

export interface EssSellerDisclosure {
  code: string;
  name: string;
  legalName: string;
  gstin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  grievanceOfficer: { name: string | null; email: string | null; phone: string | null };
  returnPolicy: string | null;
  isFirstParty: boolean;
}

export interface EssProductDto {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  modelNumber: string | null;
  tonnage: string | null;
  starRating: string | null;
  /** Selling price incl. GST (null = price on request). */
  price: number | null;
  mrp: number | null;
  inStock: boolean;
  isCustomQuote: boolean;
  description: string | null;
  specs: {
    coolingCapacity: string | null;
    powerConsumption: string | null;
    refrigerant: string | null;
    noiseLevel: string | null;
    dimensions: string | null;
  };
  warranty: string | null;
  keyFeatures: string[];
  imageUrl: string | null;
  spaceType: string | null;
  idealFor: string | null;
  countryOfOrigin: string | null;
  displayOrder: number;
  seller: EssSellerDisclosure;
}

const PRODUCT_SELECT =
  'id, name, category, brand, model_number, tonnage, star_rating, price, mrp, in_stock, is_custom_quote, description, ' +
  'cooling_capacity, power_consumption, refrigerant, noise_level, dimensions, warranty, key_features, image_url, ' +
  'space_type, ideal_for, country_of_origin, display_order, is_published, ' +
  'seller:sellers!ess_products_seller_id_fkey(seller_code, legal_name, trade_name, gstin, address, phone, email, ' +
  'grievance_officer_name, grievance_officer_email, grievance_officer_phone, return_policy, is_first_party, status)';

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function mapSeller(s: any): EssSellerDisclosure {
  return {
    code: s.seller_code,
    name: s.trade_name || s.legal_name,
    legalName: s.legal_name,
    gstin: s.gstin ?? null,
    address: s.address ?? null,
    phone: s.phone ?? null,
    email: s.email ?? null,
    grievanceOfficer: {
      name: s.grievance_officer_name ?? null,
      email: s.grievance_officer_email ?? null,
      phone: s.grievance_officer_phone ?? null,
    },
    returnPolicy: s.return_policy ?? null,
    isFirstParty: Boolean(s.is_first_party),
  };
}

export function mapProduct(row: any): EssProductDto | null {
  const seller = one(row.seller) as any;
  if (!seller || seller.status !== 'ACTIVE' || row.is_published === false) return null;
  const price = numOrNull(row.price);
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    brand: row.brand ?? null,
    modelNumber: row.model_number ?? null,
    tonnage: row.tonnage ?? null,
    starRating: row.star_rating ?? null,
    price: price && price > 0 ? price : null,
    mrp: numOrNull(row.mrp),
    inStock: Boolean(row.in_stock),
    isCustomQuote: Boolean(row.is_custom_quote),
    description: row.description ?? null,
    specs: {
      coolingCapacity: row.cooling_capacity ?? null,
      powerConsumption: row.power_consumption ?? null,
      refrigerant: row.refrigerant ?? null,
      noiseLevel: row.noise_level ?? null,
      dimensions: row.dimensions ?? null,
    },
    warranty: row.warranty ?? null,
    keyFeatures: Array.isArray(row.key_features) ? row.key_features : [],
    imageUrl: row.image_url ?? null,
    spaceType: row.space_type ?? null,
    idealFor: row.ideal_for ?? null,
    countryOfOrigin: row.country_of_origin ?? null,
    displayOrder: Number(row.display_order ?? 100),
    seller: mapSeller(seller),
  };
}

/* ------------------------------------------------------------------ tracking */

export const TRACK_MAX_FAILURES = 10;
export const TRACK_LOCK_MINUTES = 30;
const TRACKING_CODE_RE = /^ESS-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

export class TooManyAttemptsError extends AppError {
  constructor(message = 'Too many attempts. Please try again in 30 minutes.') {
    super(429, 'TOO_MANY_ATTEMPTS', message);
  }
}

const NO_MATCH = 'No request matches this tracking code and mobile number.';

export interface TrackItemDto {
  type: string;
  name: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'SELLER_WILL_QUOTE' | 'QUOTED' | 'DONE' | 'NOT_ACCEPTED' | 'CANCELLED';
  price: PriceSnapshot | null;
}

export interface TrackResultDto {
  trackingCode: string;
  intakeNumber: string;
  kind: string;
  receivedAt: string;
  requestNumber: string | null;
  status: CustomerStatus;
  /** The six main steps, so the website can draw the progress bar without its own copy. */
  steps: Array<{ step: number; label: string }>;
  preferred: { date: string | null; slot: string | null };
  visit: { date: string; startTime: string | null; endTime: string | null; technicianFirstName: string | null } | null;
  area: string | null;
  items: TrackItemDto[];
}

const MAIN_STEPS = [
  { step: 1, label: CUSTOMER_STATUSES.RECEIVED.label },
  { step: 2, label: CUSTOMER_STATUSES.CONFIRMED.label },
  { step: 3, label: CUSTOMER_STATUSES.SCHEDULED.label },
  { step: 4, label: CUSTOMER_STATUSES.TECHNICIAN_ASSIGNED.label },
  { step: 5, label: CUSTOMER_STATUSES.IN_PROGRESS.label },
  { step: 6, label: CUSTOMER_STATUSES.COMPLETED.label },
];

const LINE_STATUS_FOR_CUSTOMER: Record<string, TrackItemDto['status']> = {
  PENDING: 'PENDING',
  APPROVED: 'CONFIRMED',
  QUOTE_PENDING: 'SELLER_WILL_QUOTE',
  QUOTED: 'QUOTED',
  FULFILLED: 'DONE',
  REJECTED: 'NOT_ACCEPTED',
  CANCELLED: 'CANCELLED',
};

/** Visit statuses where the date still describes an upcoming or current visit. */
const LIVE_VISIT_STATUSES = new Set(['SCHEDULED', 'PLANNED', 'DUE', 'OVERDUE', 'ASSIGNED', 'RESCHEDULED', 'EN_ROUTE', 'IN_PROGRESS']);

export const hashKey = (kind: string, value: string): string =>
  createHash('sha256').update(`track:${kind}:${value}`).digest('hex');

/* ------------------------------------------------------------------ service */

class EssSiteService {
  async listProducts(): Promise<EssProductDto[]> {
    const { data, error } = await getSupabaseClient()
      .from('ess_products')
      .select(PRODUCT_SELECT)
      .eq('is_published', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw new Error(`Failed to load products: ${error.message}`);
    return (data ?? []).map(mapProduct).filter((p): p is EssProductDto => p !== null);
  }

  async getProduct(id: string): Promise<EssProductDto> {
    const { data, error } = await getSupabaseClient().from('ess_products').select(PRODUCT_SELECT).eq('id', id).maybeSingle();
    if (error) throw new Error(`Failed to load product: ${error.message}`);
    const product = data ? mapProduct(data) : null;
    if (!product) throw new NotFoundError('Product not found');
    return product;
  }

  /** Published website content for the given keys; unknown or never-published keys are omitted. */
  async getContent(keys: string[]): Promise<Record<string, { version: number; body: unknown; publishedAt: string | null }>> {
    const { data, error } = await getSupabaseClient()
      .from('site_content_blocks')
      .select('key, published_body, published_version, published_at')
      .in('key', keys);
    if (error) throw new Error(`Failed to load content: ${error.message}`);
    const out: Record<string, { version: number; body: unknown; publishedAt: string | null }> = {};
    for (const row of (data ?? []) as any[]) {
      if (row.published_body === null || row.published_body === undefined) continue;
      out[row.key] = { version: Number(row.published_version), body: row.published_body, publishedAt: row.published_at ?? null };
    }
    return out;
  }

  /** Longest active pincode prefix wins (e.g. a "400088" exclusion row could later sit under "400"). */
  async checkServiceability(pincode: string): Promise<{ pincode: string; serviceable: boolean; area: string | null }> {
    const { data, error } = await getSupabaseClient()
      .from('service_areas')
      .select('pincode_prefix, label, is_active');
    if (error) throw new Error(`Failed to load service areas: ${error.message}`);
    const match = ((data ?? []) as any[])
      .filter((a) => pincode.startsWith(a.pincode_prefix))
      .sort((a, b) => b.pincode_prefix.length - a.pincode_prefix.length)[0];
    return { pincode, serviceable: Boolean(match?.is_active), area: match?.is_active ? match.label : null };
  }

  async listServiceAreas(): Promise<Array<{ pincodePrefix: string; label: string }>> {
    const { data, error } = await getSupabaseClient()
      .from('service_areas')
      .select('pincode_prefix, label')
      .eq('is_active', true)
      .order('pincode_prefix');
    if (error) throw new Error(`Failed to load service areas: ${error.message}`);
    return ((data ?? []) as any[]).map((a) => ({ pincodePrefix: a.pincode_prefix, label: a.label }));
  }

  private async isLocked(keyHashes: string[]): Promise<boolean> {
    const { data, error } = await getSupabaseClient()
      .from('tracking_lookup_failures')
      .select('locked_until')
      .in('key_hash', keyHashes);
    if (error) throw new Error(`Failed to check tracking lockout: ${error.message}`);
    const now = Date.now();
    return ((data ?? []) as any[]).some((r) => r.locked_until && new Date(r.locked_until).getTime() > now);
  }

  private async recordFailure(keyHashes: string[]): Promise<void> {
    for (const key of keyHashes) {
      const { error } = await getSupabaseClient().rpc('record_tracking_failure', {
        p_key_hash: key,
        p_max: TRACK_MAX_FAILURES,
        p_lock_minutes: TRACK_LOCK_MINUTES,
      });
      if (error) throw new Error(`Failed to record tracking attempt: ${error.message}`);
    }
  }

  /**
   * Exact tracking code + the mobile number used on the request. Wrong pairs count towards a
   * lockout per tracking code and per visitor (ESS passes a hash of the visitor's IP).
   */
  async track(input: { code: string; phone: string; clientIpHash?: string }): Promise<TrackResultDto> {
    const code = input.code.trim().toUpperCase();
    const phone = normalizePhone(input.phone);
    const keys = [hashKey('code', code), ...(input.clientIpHash ? [hashKey('ip', input.clientIpHash)] : [])];
    if (await this.isLocked(keys)) throw new TooManyAttemptsError();

    const supabase = getSupabaseClient();
    const { data: row, error } = TRACKING_CODE_RE.test(code)
      ? await supabase
          .from('web_intakes')
          .select(
            'id, intake_number, tracking_code, kind, status, phone_normalized, area, city, preferred_date, preferred_slot, created_at, service_request_id, ' +
              'items:web_intake_items(line_no, item_type, item_name, quantity, line_status, price_snapshot, quote_total), ' +
              'sr:service_requests!web_intakes_service_request_id_fkey(id, request_number, status)'
          )
          .eq('tracking_code', code)
          .maybeSingle()
      : { data: null, error: null };
    if (error) throw new Error(`Failed to look up request: ${error.message}`);

    const intake = row as any;
    if (!intake || !phone || intake.phone_normalized !== phone.slice(-10) || intake.status === 'SPAM') {
      await this.recordFailure(keys);
      throw new NotFoundError(NO_MATCH);
    }
    // A correct pair clears the per-code counter (the per-visitor one keeps counting).
    await supabase.from('tracking_lookup_failures').delete().eq('key_hash', keys[0]);

    const sr = one(intake.sr) as any;
    let status: CustomerStatus;
    let visit: TrackResultDto['visit'] = null;
    if (intake.status === 'APPROVED' && sr) {
      const { data: schedules, error: schErr } = await supabase
        .from('service_schedules')
        .select('status, scheduled_date, start_time, end_time, technician_id')
        .eq('service_request_id', sr.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (schErr) throw new Error(`Failed to load visit: ${schErr.message}`);
      const schedule = (schedules ?? [])[0] as any;
      status = customerStatusFor({ status: sr.status }, schedule ?? null);
      if (schedule?.scheduled_date && LIVE_VISIT_STATUSES.has(schedule.status) && status.step >= 3 && status.step <= 5) {
        let technicianFirstName: string | null = null;
        if (schedule.technician_id && status.step >= 4) {
          const { data: tech } = await supabase.from('technicians').select('name').eq('id', schedule.technician_id).maybeSingle();
          technicianFirstName = firstNameOnly((tech as any)?.name);
        }
        visit = {
          date: schedule.scheduled_date,
          startTime: schedule.start_time ? String(schedule.start_time).slice(0, 5) : null,
          endTime: schedule.end_time ? String(schedule.end_time).slice(0, 5) : null,
          technicianFirstName,
        };
      }
    } else {
      status = fromIntakeStatus(intake.status);
    }

    return {
      trackingCode: intake.tracking_code,
      intakeNumber: intake.intake_number,
      kind: intake.kind,
      receivedAt: intake.created_at,
      requestNumber: sr?.request_number ?? null,
      status,
      steps: MAIN_STEPS,
      preferred: { date: intake.preferred_date ?? null, slot: intake.preferred_slot ?? null },
      visit,
      area: [intake.area, intake.city].filter(Boolean).join(', ') || null,
      items: ((intake.items ?? []) as any[])
        .sort((a, b) => a.line_no - b.line_no)
        .map((i) => ({
          type: i.item_type,
          name: i.item_name,
          quantity: Number(i.quantity ?? 1),
          status: LINE_STATUS_FOR_CUSTOMER[i.line_status] ?? 'PENDING',
          // Once the seller has sent a price, the customer sees that price instead of the listed one.
          price:
            i.line_status === 'QUOTED' && i.quote_total != null
              ? { total: Number(i.quote_total), label: 'Price from the seller' }
              : ((i.price_snapshot as PriceSnapshot | null) ?? null),
        })),
    };
  }
}

export const essSiteService = new EssSiteService();
