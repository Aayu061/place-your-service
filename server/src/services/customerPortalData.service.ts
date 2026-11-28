import { getSupabaseClient } from '../lib/supabase.js';
import { logger } from '../utils/logger.js';
import { addDaysIstIso, getIstTodayIso } from '../utils/date.js';
import { calculateWarrantyStatus } from '../utils/warranty.js';
import {
  CUSTOMER_STATUSES,
  type CustomerStatusCode,
  customerStatusFor,
  fromRequestStatus,
  fromScheduleStatus,
  isRequestStatus,
  isScheduleStatus,
} from '../domain/customerStatus.js';
import { isCountedAmcVisit, visitsFromCounted } from './customerAccount.service.js';
import { buildUpiPayLink } from './email/emailTemplates.service.js';
import { essSiteService } from './essSite.service.js';
import { SERVICE_REPORT_MEDIA_BUCKET } from './mediaStorage.service.js';
import { formatCustomerDate } from './notifications/customerEmailTemplates.js';

/**
 * S11b customer portal v2: everything a signed-in customer sees about their own ACs, AMC contracts, requests,
 * service reports and bills (contract: PYS-ESS-docs/S11b-API-CONTRACT.md).
 *
 * Security rules (plan section 4):
 * - The customer id comes only from the session (the route resolves it). Every lookup filters by it in the query:
 *   sites/contracts/requests/payments by customer_id, ACs through the customer's own sites, schedules through the
 *   customer's own requests/contracts, reports by customer_id or the customer's own request/contract.
 * - Not owned and missing are the same answer (null -> the route's one 404 body). Bad id/number formats too.
 * - Output objects are built field by field (whitelists). Never: staff names (technician first name only), phones of
 *   staff, technician remarks, correction / deviation reasons, signature image, payment notes, notes columns, part
 *   costs or prices.
 * - Photos: only from the customer's own final reports, as 10-minute signed links; a link that cannot be signed is left out.
 */

/** Report statuses a customer may see. DRAFT never; SUBMITTED = issued by the technician, VERIFIED = checked by staff. */
export const FINAL_REPORT_STATUSES = ['SUBMITTED', 'VERIFIED'] as const;
export const PHOTO_LINK_SECONDS = 600;
export const PROFILE_CHANGES_PER_DAY = 5;
export const RECOMMENDATION_DAYS = 180;
export const ALERT_DAYS = 30;
export const RENEW_BEFORE_DAYS = 30;
export const RENEW_AFTER_EXPIRY_DAYS = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,59}$/;
export const isPortalUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
export const isPortalNumber = (v: unknown): v is string => typeof v === 'string' && NUMBER_RE.test(v);

const ACTIVE_AMC = new Set(['ACTIVE', 'EXPIRING_SOON']);
const DONE_REQUEST = new Set(['RESOLVED', 'COMPLETED', 'CLOSED', 'PAYMENT', 'CANCELLED']);
const LIVE_SCHEDULE = new Set(['SCHEDULED', 'PLANNED', 'DUE', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);
const TENTATIVE_SCHEDULE = new Set(['PLANNED', 'DUE']);
const DEAD_SCHEDULE = new Set(['CANCELLED', 'SKIPPED', 'RESCHEDULED']);
const AMC_SERVICE_TYPES = ['DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE'] as const;
type AmcServiceType = (typeof AMC_SERVICE_TYPES)[number];

export class PortalInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalInputError';
  }
}
export class PortalRateLimitedError extends Error {
  constructor() {
    super('You have sent several change requests today. Please try again tomorrow or call us.');
    this.name = 'PortalRateLimitedError';
  }
}
export class NotRenewableError extends Error {
  constructor() {
    super('This contract cannot be renewed online right now. Please call us.');
    this.name = 'NotRenewableError';
  }
}

type Row = Record<string, any>;
type Coverage = 'UNDER_WARRANTY' | 'AMC_COVERED' | 'EXPIRING_SOON' | 'OUT_OF_WARRANTY' | 'EXPIRED' | null;
type BillStatus = 'PAID' | 'PART_PAID' | 'DUE';
interface AcRef {
  id: string;
  label: string;
}

// ---------------------------------------------------------------------------------------------------------------
// small helpers

async function rows(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new Error(`Customer website: ${what} lookup failed: ${error.message}`);
  return (Array.isArray(data) ? data : data ? [data] : []) as Row[];
}

const db = () => getSupabaseClient();
const uniq = <T>(xs: Array<T | null | undefined>): T[] => [...new Set(xs.filter((x): x is T => x !== null && x !== undefined))];
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const money = (v: unknown): number => Math.round((Number(v) || 0) * 100) / 100;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const firstName = (name: unknown): string | null => (typeof name === 'string' && name.trim() ? name.trim().split(/\s+/)[0] : null);
/** A timestamp's calendar date in India time (dates stay as they are). */
export function istDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}
const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

function billNumbers(p: Row): { total: number; paid: number; balance: number; status: BillStatus } {
  const total = money(p.total_amount_due);
  const paid = money(p.total_amount_paid);
  const balance = money(Math.max(0, total - paid));
  return { total, paid, balance, status: balance <= 0 ? 'PAID' : paid > 0 ? 'PART_PAID' : 'DUE' };
}

/** "Daikin 1.5 ton · Living room" (brand, tonnage, room; whatever is known). */
export function acLabel(a: Row): string {
  const tons = num(a.capacity_tons);
  const main = [str(a.brand), tons !== null ? `${tons} ton` : null].filter(Boolean).join(' ');
  const room = str(a.room_location);
  return [main || null, room].filter(Boolean).join(' · ') || 'AC';
}

/** Last 4 of the indoor serial, else the unit serial, else the outdoor serial. */
function serialLast4(a: Row): string | null {
  const s = str(a.indoor_serial_number) ?? str(a.serial_number) ?? str(a.outdoor_serial_number);
  return s ? s.trim().slice(-4) : null;
}

/** A stored photo value -> a path inside the private bucket, or null (data: URIs, links elsewhere, odd paths). */
export function photoPath(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  let p = v.trim();
  if (p.startsWith('data:')) return null;
  if (/^https?:\/\//i.test(p)) {
    const marker = `/${SERVICE_REPORT_MEDIA_BUCKET}/`;
    const i = p.indexOf(marker);
    if (i < 0) return null;
    p = decodeURIComponent(p.slice(i + marker.length).split('?')[0]);
  }
  p = p.replace(/^\/+/, '');
  if (!p || p.includes('..')) return null;
  return p;
}

const BUSINESS_FALLBACK = {
  legalName: 'Extreme Sales And Services',
  gstin: '27ANTPP9778J1ZO',
  address: '1/1, Samrat Ashok Nagar, Chembur, Mumbai - 400043',
  phone: '+91 7977805245',
  email: 'extremess0121@gmail.com',
};

/** The published ESS block business.identity (what the website footer shows); the invoice email's details if unpublished. */
async function businessIdentity() {
  try {
    const content = await essSiteService.getContent(['business.identity']);
    const b = content['business.identity']?.body as Row | undefined;
    if (b && typeof b === 'object') {
      return {
        legalName: str(b.legalName) ?? BUSINESS_FALLBACK.legalName,
        gstin: str(b.gstin),
        address: str(b.address),
        phone: str(b.phone),
        email: str(b.email),
      };
    }
  } catch {
    logger.warn('Customer website: business identity lookup failed', { outcome: 'portal_identity_failed' });
  }
  return { ...BUSINESS_FALLBACK };
}

// ---------------------------------------------------------------------------------------------------------------
// the customer's own records (every query filtered by the session customer)

interface Scope {
  customerId: string;
  customer: Row;
  sites: Row[];
  siteById: Map<string, Row>;
  assets: Row[];
  assetById: Map<string, Row>;
  contracts: Row[];
  contractById: Map<string, Row>;
  /** amc_id -> asset ids (only the customer's own ACs) */
  contractAssets: Map<string, string[]>;
  planById: Map<string, Row>;
  requests: Row[];
  requestById: Map<string, Row>;
}

const ASSET_COLUMNS =
  'id, site_id, brand, model_number, ac_type, capacity_tons, technology, star_rating, room_location, floor_location, ' +
  'installation_date, purchase_date, serial_number, indoor_serial_number, outdoor_serial_number, warranty_status, ' +
  'warranty_start_date, warranty_end_date, total_warranty_services, asset_condition, created_at';
const CONTRACT_COLUMNS =
  'id, contract_number, customer_id, plan_id, status, start_date, end_date, frequency, total_amount, total_visits, ' +
  'dry_service_visits, jet_service_visits, pumpdown_service_visits, created_at';
const REQUEST_COLUMNS = 'id, request_number, customer_id, asset_id, request_type, status, description, created_at';
const SCHEDULE_COLUMNS =
  'id, service_request_id, amc_id, asset_id, scheduled_date, start_time, status, technician_id, visit_number, ' +
  'planned_service_type, rescheduled_from_id';
const REPORT_COLUMNS =
  'id, report_number, status, customer_id, service_request_id, service_schedule_id, amc_id, site_id, technician_id, ' +
  'visit_type, service_date, start_time, end_time, primary_outcome, planned_service_type, performed_service_type, ' +
  'work_description, observations, action_taken, recommendation, before_photo_url, after_photo_url';
const PAYMENT_COLUMNS = 'id, payment_number, customer_id, service_request_id, amc_id, total_amount_due, total_amount_paid, status, created_at';

async function loadScope(customerId: string): Promise<Scope | null> {
  const [customer] = await rows(
    db().from('customers').select('id, customer_code, name, company_name, email, phone, address, city, state, postal_code').eq('id', customerId).maybeSingle(),
    'customer'
  );
  if (!customer) return null;
  const [sites, contracts, requests] = await Promise.all([
    rows(db().from('customer_sites').select('id, customer_id, site_name, address, is_active').eq('customer_id', customerId), 'sites'),
    rows(db().from('amc_contracts').select(CONTRACT_COLUMNS).eq('customer_id', customerId), 'contracts'),
    rows(db().from('service_requests').select(REQUEST_COLUMNS).eq('customer_id', customerId).order('created_at', { ascending: false }), 'requests'),
  ]);
  const siteIds = sites.map((s) => s.id);
  const contractIds = contracts.map((c) => c.id);
  const planIds = uniq<string>(contracts.map((c) => c.plan_id));
  const [assets, amcAssets, plans] = await Promise.all([
    siteIds.length
      ? rows(db().from('ac_assets').select(ASSET_COLUMNS).in('site_id', siteIds).eq('is_active', true).order('created_at', { ascending: false }), 'ACs')
      : Promise.resolve([]),
    contractIds.length ? rows(db().from('amc_assets').select('amc_id, asset_id').in('amc_id', contractIds), 'contract ACs') : Promise.resolve([]),
    planIds.length
      ? rows(
          db().from('amc_plans').select('id, plan_code, name, coverage_summary, has_gas_charging, has_spare_parts, has_unlimited_complaints').in('id', planIds),
          'plans'
        )
      : Promise.resolve([]),
  ]);
  const assetById = new Map(assets.map((a) => [a.id as string, a]));
  const contractAssets = new Map<string, string[]>();
  for (const c of contracts) contractAssets.set(c.id, []);
  for (const aa of amcAssets) {
    if (assetById.has(aa.asset_id) && contractAssets.has(aa.amc_id)) contractAssets.get(aa.amc_id)!.push(aa.asset_id);
  }
  return {
    customerId,
    customer,
    sites,
    siteById: new Map(sites.map((s) => [s.id as string, s])),
    assets,
    assetById,
    contracts,
    contractById: new Map(contracts.map((c) => [c.id as string, c])),
    contractAssets,
    planById: new Map(plans.map((p) => [p.id as string, p])),
    requests,
    requestById: new Map(requests.map((r) => [r.id as string, r])),
  };
}

const acRef = (scope: Scope, assetId: unknown): AcRef | null => {
  const a = typeof assetId === 'string' ? scope.assetById.get(assetId) : undefined;
  return a ? { id: a.id, label: acLabel(a) } : null;
};

/** Schedules of the customer's own requests and contracts (nothing else). */
async function ownSchedules(scope: Scope, only?: { requestIds?: string[]; contractIds?: string[] }): Promise<Row[]> {
  // Narrowing never widens: only ids already in the customer's scope are used.
  const reqIds = (only ? (only.requestIds ?? []) : [...scope.requestById.keys()]).filter((id) => scope.requestById.has(id));
  const amcIds = (only ? (only.contractIds ?? []) : [...scope.contractById.keys()]).filter((id) => scope.contractById.has(id));
  const [a, b] = await Promise.all([
    reqIds.length ? rows(db().from('service_schedules').select(SCHEDULE_COLUMNS).in('service_request_id', reqIds), 'visits') : Promise.resolve([]),
    amcIds.length ? rows(db().from('service_schedules').select(SCHEDULE_COLUMNS).in('amc_id', amcIds), 'AMC visits') : Promise.resolve([]),
  ]);
  const byId = new Map<string, Row>();
  for (const s of [...a, ...b]) byId.set(s.id, s);
  return [...byId.values()];
}

/**
 * The customer's own final reports: report.customer_id = the customer, or the report's request / contract is the
 * customer's (a report that names another customer is never included). `reportNumber` narrows to one report.
 */
async function ownReports(scope: Scope, reportNumber?: string): Promise<Row[]> {
  const base = () => {
    let q = db().from('service_reports').select(REPORT_COLUMNS).in('status', [...FINAL_REPORT_STATUSES]);
    if (reportNumber) q = q.eq('report_number', reportNumber);
    return q;
  };
  const reqIds = [...scope.requestById.keys()];
  const amcIds = [...scope.contractById.keys()];
  const found = await Promise.all([
    rows(base().eq('customer_id', scope.customerId), 'reports'),
    reqIds.length ? rows(base().in('service_request_id', reqIds), 'request reports') : Promise.resolve([]),
    amcIds.length ? rows(base().in('amc_id', amcIds), 'AMC reports') : Promise.resolve([]),
  ]);
  const byId = new Map<string, Row>();
  for (const r of found.flat()) {
    if (r.customer_id && r.customer_id !== scope.customerId) continue;
    if (!(FINAL_REPORT_STATUSES as readonly string[]).includes(r.status)) continue;
    byId.set(r.id, r);
  }
  return [...byId.values()].sort((x, y) => (x.service_date < y.service_date ? 1 : x.service_date > y.service_date ? -1 : 0));
}

async function reportDetails(reportIds: string[]) {
  if (!reportIds.length) return { assets: [] as Row[], items: [] as Row[], parts: [] as Row[], partNames: new Map<string, string>() };
  const [assets, items, parts] = await Promise.all([
    rows(
      db()
        .from('service_report_assets')
        .select('report_id, asset_id, brand, capacity_tons, room_location, fault_reported, diagnosis_findings, work_performed, asset_outcome, final_condition, refrigerant_qty_kg')
        .in('report_id', reportIds),
      'report ACs'
    ),
    rows(db().from('service_report_items').select('report_id, asset_id, recommended_action, is_resolved, created_at').in('report_id', reportIds), 'report items'),
    rows(db().from('service_parts').select('service_report_id, part_id, quantity').in('service_report_id', reportIds), 'parts used'),
  ]);
  const partIds = uniq<string>(parts.map((p) => p.part_id));
  const names = partIds.length ? await rows(db().from('parts').select('id, name').in('id', partIds), 'part names') : [];
  return { assets, items, parts, partNames: new Map(names.map((n) => [n.id as string, String(n.name ?? 'Part')])) };
}

const partsOf = (reportId: string, d: Awaited<ReturnType<typeof reportDetails>>) =>
  d.parts.filter((p) => p.service_report_id === reportId).map((p) => ({ name: d.partNames.get(p.part_id) ?? 'Part', quantity: Number(p.quantity) || 0 }));

async function technicianFirstNames(ids: Array<string | null | undefined>): Promise<Map<string, string | null>> {
  const list = uniq<string>(ids);
  if (!list.length) return new Map();
  const techs = await rows(db().from('technicians').select('id, name').in('id', list), 'technicians');
  return new Map(techs.map((t) => [t.id as string, firstName(t.name)]));
}

function visitKind(r: Row): 'AMC' | 'REQUEST' | 'OTHER' {
  if (r.amc_id || r.visit_type === 'PREVENTIVE') return 'AMC';
  if (r.service_request_id) return 'REQUEST';
  return 'OTHER';
}

function coverageFor(scope: Scope, asset: Row): Coverage {
  for (const [amcId, ids] of scope.contractAssets) {
    const c = scope.contractById.get(amcId);
    if (c && ACTIVE_AMC.has(c.status) && ids.includes(asset.id) && c.end_date >= getIstTodayIso()) return 'AMC_COVERED';
  }
  return calculateWarrantyStatus(asset.warranty_end_date, asset.warranty_start_date, asset.warranty_status, getIstTodayIso()) as Coverage;
}

/** G1: visits used / left for each of the customer's contracts (counted schedules / ACs on the contract). */
async function contractVisitCounts(scope: Scope, schedules: Row[]) {
  const amcSchedules = schedules.filter((s) => s.amc_id && scope.contractById.has(s.amc_id));
  const ids = amcSchedules.map((s) => s.id);
  const reports = ids.length
    ? await rows(db().from('service_reports').select('service_schedule_id, primary_outcome, resolution_status').in('service_schedule_id', ids), 'visit results')
    : [];
  const reportsBySchedule = new Map<string, Row[]>();
  for (const r of reports) reportsBySchedule.set(r.service_schedule_id, [...(reportsBySchedule.get(r.service_schedule_id) ?? []), r]);
  const counted = new Map<string, Row[]>();
  for (const s of amcSchedules) {
    if (isCountedAmcVisit(s as { status: string }, reportsBySchedule.get(s.id) ?? [])) counted.set(s.amc_id, [...(counted.get(s.amc_id) ?? []), s]);
  }
  return {
    counted,
    usage(c: Row) {
      const acCount = scope.contractAssets.get(c.id)?.length ?? 0;
      return visitsFromCounted(counted.get(c.id)?.length ?? 0, acCount, num(c.total_visits));
    },
  };
}

/** The open AMC_RENEWAL intake for a contract, if any. */
async function openRenewal(customerId: string, contractId: string): Promise<Row | null> {
  const [r] = await rows(
    db()
      .from('web_intakes')
      .select('id, tracking_code, created_at')
      .eq('kind', 'AMC_RENEWAL')
      .eq('customer_id', customerId)
      .eq('amc_contract_id', contractId)
      .eq('status', 'PENDING_REVIEW')
      .order('created_at', { ascending: false })
      .limit(1),
    'renewal requests'
  );
  return r ?? null;
}

export function renewWindowOpen(c: Row, today = getIstTodayIso()): boolean {
  if (!c.end_date) return false;
  const days = daysBetween(today, c.end_date);
  if (ACTIVE_AMC.has(c.status)) return days <= RENEW_BEFORE_DAYS && days >= -RENEW_AFTER_EXPIRY_DAYS;
  if (c.status === 'EXPIRED') return days >= -RENEW_AFTER_EXPIRY_DAYS && days <= RENEW_BEFORE_DAYS;
  return false;
}

const contractSort = (a: Row, b: Row) => {
  const ca = ACTIVE_AMC.has(a.status) ? 0 : 1;
  const cb = ACTIVE_AMC.has(b.status) ? 0 : 1;
  if (ca !== cb) return ca - cb;
  return a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0;
};

function contractTypeTotals(c: Row): Record<AmcServiceType, number> {
  const total = num(c.total_visits) ?? 0;
  const dry = num(c.dry_service_visits);
  const jet = num(c.jet_service_visits);
  const pump = num(c.pumpdown_service_visits);
  // Legacy contracts without an allocation alternate dry / jet (amc.service computePlannedServiceTypes).
  if (dry === null && jet === null && pump === null) return { DRY_SERVICE: Math.ceil(total / 2), JET_SERVICE: Math.floor(total / 2), PUMPDOWN_SERVICE: 0 };
  return { DRY_SERVICE: dry ?? 0, JET_SERVICE: jet ?? 0, PUMPDOWN_SERVICE: pump ?? 0 };
}

function latestLiveSchedule(schedules: Row[]): Row | null {
  const live = schedules.filter((s) => !DEAD_SCHEDULE.has(s.status));
  const pool = live.length ? live : schedules;
  return [...pool].sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : a.scheduled_date > b.scheduled_date ? -1 : 0))[0] ?? null;
}

function statusOf(request: Row, schedules: Row[]) {
  const latest = latestLiveSchedule(schedules);
  const s = customerStatusFor({ status: request.status }, latest ? { status: latest.status, technician_id: latest.technician_id } : null);
  return { code: s.code, label: s.label, step: s.step, tone: s.tone };
}

const isOpenRequest = (r: Row) => !DONE_REQUEST.has(r.status);

function forLabel(scope: Scope, p: Row): string {
  const sr = p.service_request_id ? scope.requestById.get(p.service_request_id) : undefined;
  if (sr) return `Service request ${sr.request_number}`;
  const c = p.amc_id ? scope.contractById.get(p.amc_id) : undefined;
  if (c) return `AMC ${c.contract_number}`;
  return 'Service';
}

/** The customer's own payment entries (successful payments and reversals) for these bills. */
async function billTransactions(paymentIds: string[]): Promise<Row[]> {
  if (!paymentIds.length) return [];
  const tx = await rows(
    db()
      .from('payment_transactions')
      .select('payment_id, payment_method, amount, payment_status, entry_type, external_payment_reference, created_at')
      .in('payment_id', paymentIds)
      .order('created_at', { ascending: true }),
    'payments received'
  );
  return tx.filter((t) => t.payment_status !== 'FAILED' && t.payment_status !== 'PENDING');
}

const txAmount = (t: Row) => (t.entry_type === 'REVERSAL' ? -1 : 1) * money(t.amount);

/** Start of the Indian financial year (1 April) containing today. */
export function financialYearStart(today = getIstTodayIso()): string {
  const [y, m] = today.split('-').map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}

function customerName(c: Row) {
  return { name: c.name, companyName: c.company_name ?? null, email: c.email ?? null, phone: c.phone ?? null, city: c.city ?? null };
}

// ---------------------------------------------------------------------------------------------------------------

export const customerPortalDataService = {
  async overview(customerId: string) {
    const scope = await loadScope(customerId);
    if (!scope) return null;
    const today = getIstTodayIso();
    const soon = addDaysIstIso(today, ALERT_DAYS);
    const [schedules, payments, reports] = await Promise.all([
      ownSchedules(scope),
      rows(db().from('payments').select(PAYMENT_COLUMNS).eq('customer_id', customerId).order('created_at', { ascending: false }), 'bills'),
      ownReports(scope),
    ]);
    const visits = await contractVisitCounts(scope, schedules);

    // Next visit: the earliest live visit from today on.
    const next = schedules
      .filter((s) => LIVE_SCHEDULE.has(s.status) && s.scheduled_date >= today)
      .sort((a, b) => (a.scheduled_date + (a.start_time ?? '') < b.scheduled_date + (b.start_time ?? '') ? -1 : 1))[0];
    const techNames = await technicianFirstNames([next?.technician_id]);
    const nextVisit = next
      ? {
          date: next.scheduled_date,
          startTime: TENTATIVE_SCHEDULE.has(next.status) ? null : (next.start_time ?? null),
          technicianFirstName: next.technician_id ? (techNames.get(next.technician_id) ?? null) : null,
          requestNumber: next.service_request_id ? (scope.requestById.get(next.service_request_id)?.request_number ?? null) : null,
          ac: acRef(scope, next.asset_id),
        }
      : null;

    const active = scope.contracts.filter((c) => ACTIVE_AMC.has(c.status)).sort((a, b) => (a.end_date < b.end_date ? -1 : 1));
    const c0 = active[0];
    const amc = c0
      ? {
          id: c0.id,
          contractNumber: c0.contract_number,
          plan: scope.planById.get(c0.plan_id)?.name ?? null,
          endDate: c0.end_date,
          totalVisits: num(c0.total_visits),
          ...visits.usage(c0),
        }
      : null;

    const bills = payments.map((p) => ({ p, ...billNumbers(p) }));
    const due = bills.filter((b) => b.balance > 0);

    const alerts: Array<{ kind: string; text: string; link: { kind: 'amc' | 'ac' | 'bill' | 'report'; id: string } | null }> = [];
    for (const c of active) {
      if (c.end_date >= today && c.end_date <= soon) {
        alerts.push({ kind: 'AMC_ENDING', text: `Your AMC ${c.contract_number} ends on ${formatCustomerDate(c.end_date)}. Renew it to stay covered.`, link: { kind: 'amc', id: c.id } });
      }
    }
    if (!active.length) {
      const lapsed = scope.contracts
        .filter((c) => (c.status === 'EXPIRED' || (ACTIVE_AMC.has(c.status) && c.end_date < today)) && daysBetween(c.end_date, today) <= RENEW_AFTER_EXPIRY_DAYS)
        .sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0];
      if (lapsed) alerts.push({ kind: 'AMC_EXPIRED', text: `Your AMC ${lapsed.contract_number} ended on ${formatCustomerDate(lapsed.end_date)}. Renew it to get covered again.`, link: { kind: 'amc', id: lapsed.id } });
    }
    for (const a of scope.assets) {
      if (a.warranty_end_date && a.warranty_end_date >= today && a.warranty_end_date <= soon) {
        alerts.push({ kind: 'WARRANTY_ENDING', text: `The warranty on your ${acLabel(a)} AC ends on ${formatCustomerDate(a.warranty_end_date)}.`, link: { kind: 'ac', id: a.id } });
      }
    }
    const since = addDaysIstIso(today, -RECOMMENDATION_DAYS);
    const recent = reports.filter((r) => r.service_date >= since);
    if (recent.length) {
      const items = await rows(
        db().from('service_report_items').select('report_id, asset_id, recommended_action, is_resolved, created_at').in('report_id', recent.map((r) => r.id)),
        'recommendations'
      );
      const byId = new Map(recent.map((r) => [r.id as string, r]));
      const open = items
        .filter((i) => !i.is_resolved && str(i.recommended_action))
        .sort((x, y) => (byId.get(x.report_id)!.service_date < byId.get(y.report_id)!.service_date ? 1 : -1))
        .slice(0, 3);
      for (const i of open) {
        const ac = acRef(scope, i.asset_id);
        alerts.push({
          kind: 'RECOMMENDATION',
          text: `${String(i.recommended_action).trim()}${ac ? ` (${ac.label} AC)` : ''}`,
          link: { kind: 'report', id: byId.get(i.report_id)!.report_number },
        });
      }
    }
    for (const b of due.slice(0, 3)) {
      alerts.push({ kind: 'BILL_DUE', text: `Bill ${b.p.payment_number}: ₹${b.balance.toFixed(2)} to pay.`, link: { kind: 'bill', id: b.p.payment_number } });
    }

    return {
      customer: customerName(scope.customer),
      nextVisit,
      amc,
      billing: { amountDue: money(due.reduce((n, b) => n + b.balance, 0)), unpaidBills: due.length },
      openRequests: scope.requests.filter(isOpenRequest).length,
      alerts,
    };
  },

  async listAcs(customerId: string) {
    const scope = await loadScope(customerId);
    if (!scope) return null;
    const reports = await ownReports(scope);
    const d = await reportDetails(reports.map((r) => r.id));
    const reportById = new Map(reports.map((r) => [r.id as string, r]));
    return {
      acs: scope.assets.map((a) => {
        const dates = d.assets.filter((x) => x.asset_id === a.id).map((x) => reportById.get(x.report_id)?.service_date).filter(Boolean) as string[];
        return {
          id: a.id,
          label: acLabel(a),
          brand: a.brand ?? null,
          model: a.model_number ?? null,
          type: a.ac_type ?? null,
          tons: num(a.capacity_tons),
          room: a.room_location ?? null,
          floor: a.floor_location ?? null,
          coverage: coverageFor(scope, a),
          serialLast4: serialLast4(a),
          lastServiceDate: dates.sort().at(-1) ?? null,
          openRecommendations: d.items.filter((i) => i.asset_id === a.id && !i.is_resolved && str(i.recommended_action)).length,
        };
      }),
    };
  },

  async getAc(customerId: string, assetId: string) {
    if (!isPortalUuid(assetId)) return null;
    const scope = await loadScope(customerId);
    // Only ACs on the customer's own sites are in the scope.
    const a = scope?.assetById.get(assetId);
    if (!scope || !a) return null;
    const reports = await ownReports(scope);
    const d = await reportDetails(reports.map((r) => r.id));
    const mine = d.assets.filter((x) => x.asset_id === a.id);
    const reportById = new Map(reports.map((r) => [r.id as string, r]));
    const techs = await technicianFirstNames(mine.map((x) => reportById.get(x.report_id)?.technician_id));
    const site = scope.siteById.get(a.site_id);
    const history = mine
      .map((x) => ({ x, r: reportById.get(x.report_id)! }))
      .filter(({ r }) => r)
      .sort((p, q) => (p.r.service_date < q.r.service_date ? 1 : p.r.service_date > q.r.service_date ? -1 : 0))
      .map(({ x, r }) => ({
        reportNumber: r.report_number,
        date: r.service_date,
        serviceType: r.performed_service_type ?? r.planned_service_type ?? null,
        visitKind: visitKind(r),
        faultReported: x.fault_reported ?? null,
        findings: x.diagnosis_findings ?? null,
        workDone: x.work_performed ?? null,
        outcome: x.asset_outcome ?? null,
        conditionAfter: x.final_condition ?? null,
        refrigerantKg: num(x.refrigerant_qty_kg),
        parts: partsOf(r.id, d),
        technicianFirstName: r.technician_id ? (techs.get(r.technician_id) ?? null) : null,
        photoCount: [r.before_photo_url, r.after_photo_url].filter((p) => photoPath(p)).length,
      }));
    const recommendations = d.items
      .filter((i) => i.asset_id === a.id && !i.is_resolved && str(i.recommended_action) && reportById.has(i.report_id))
      .map((i) => ({ text: String(i.recommended_action).trim(), date: reportById.get(i.report_id)!.service_date, reportNumber: reportById.get(i.report_id)!.report_number }))
      .sort((p, q) => (p.date < q.date ? 1 : -1));
    const contracts = [...scope.contractAssets.entries()]
      .filter(([, ids]) => ids.includes(a.id))
      .map(([id]) => scope.contractById.get(id)!)
      .sort(contractSort);
    return {
      ac: {
        id: a.id,
        label: acLabel(a),
        brand: a.brand ?? null,
        model: a.model_number ?? null,
        type: a.ac_type ?? null,
        tons: num(a.capacity_tons),
        technology: a.technology ?? null,
        starRating: a.star_rating ?? null,
        room: a.room_location ?? null,
        floor: a.floor_location ?? null,
        installedOn: a.installation_date ?? null,
        purchasedOn: a.purchase_date ?? null,
        serials: { indoor: str(a.indoor_serial_number), outdoor: str(a.outdoor_serial_number), unit: str(a.serial_number) },
        condition: a.asset_condition ?? null,
        site: site ? { name: site.site_name, address: site.address } : null,
        warranty: {
          status: calculateWarrantyStatus(a.warranty_end_date, a.warranty_start_date, a.warranty_status, getIstTodayIso()) as Coverage,
          start: a.warranty_start_date ?? null,
          end: a.warranty_end_date ?? null,
          visitsTotal: num(a.total_warranty_services),
          // PYS does not count warranty visits used yet.
          visitsUsed: null,
        },
      },
      amc: contracts.map((c) => ({ id: c.id, contractNumber: c.contract_number, plan: scope.planById.get(c.plan_id)?.name ?? null, status: c.status, endDate: c.end_date })),
      history,
      recommendations,
    };
  },

  async listContracts(customerId: string) {
    const scope = await loadScope(customerId);
    if (!scope) return null;
    const visits = await contractVisitCounts(scope, await ownSchedules(scope, { contractIds: [...scope.contractById.keys()] }));
    return {
      contracts: [...scope.contracts].sort(contractSort).map((c) => ({
        id: c.id,
        contractNumber: c.contract_number,
        plan: scope.planById.get(c.plan_id)?.name ?? null,
        status: c.status,
        startDate: c.start_date,
        endDate: c.end_date,
        totalVisits: num(c.total_visits),
        ...visits.usage(c),
        acCount: scope.contractAssets.get(c.id)?.length ?? 0,
      })),
    };
  },

  async getContract(customerId: string, contractId: string) {
    if (!isPortalUuid(contractId)) return null;
    const scope = await loadScope(customerId);
    const c = scope?.contractById.get(contractId);
    if (!scope || !c) return null;
    const today = getIstTodayIso();
    const schedules = await ownSchedules(scope, { contractIds: [c.id] });
    const visits = await contractVisitCounts(scope, schedules);
    const usage = visits.usage(c);
    const acIds = scope.contractAssets.get(c.id) ?? [];
    const acCount = acIds.length;
    const plan = scope.planById.get(c.plan_id);

    const totals = contractTypeTotals(c);
    const counted = visits.counted.get(c.id) ?? [];
    const byType = AMC_SERVICE_TYPES.filter((t) => totals[t] > 0).map((t) => {
      const raw = counted.filter((s) => s.planned_service_type === t).length;
      return { type: t, total: totals[t], used: Math.min(totals[t], acCount > 0 ? Math.floor(raw / acCount) : raw) };
    });

    // Timeline: one entry per visit number; every AC's schedule for that visit number is grouped.
    const reports = await ownReports(scope);
    const reportBySchedule = new Map(reports.filter((r) => r.service_schedule_id).map((r) => [r.service_schedule_id as string, r]));
    const techs = await technicianFirstNames(schedules.map((s) => s.technician_id));
    const countedIds = new Set(counted.map((s) => s.id));
    const total = num(c.total_visits) ?? 0;
    const numbers = uniq<number>([...Array.from({ length: total }, (_, i) => i + 1), ...schedules.filter((s) => !s.rescheduled_from_id && num(s.visit_number)).map((s) => Number(s.visit_number))]).sort((a, b) => a - b);
    const timeline = numbers.map((visitNumber) => {
      const group = schedules.filter((s) => Number(s.visit_number) === visitNumber && !s.rescheduled_from_id);
      const live = group.filter((s) => !DEAD_SCHEDULE.has(s.status));
      const empty = { visitNumber, date: null, month: null, startTime: null, technicianFirstName: null, serviceType: null, reportNumber: null };
      if (!live.length) return { ...empty, state: 'PLANNED' as const };
      const serviceType = live[0].planned_service_type ?? null;
      const done = live.every((s) => countedIds.has(s.id));
      if (done) {
        const last = [...live].sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1))[0];
        const report = live.map((s) => reportBySchedule.get(s.id)).find(Boolean);
        return {
          visitNumber,
          date: (report?.service_date as string | undefined) ?? last.scheduled_date,
          month: null,
          state: 'DONE' as const,
          startTime: report?.start_time ?? last.start_time ?? null,
          technicianFirstName: (report?.technician_id ? techs.get(report.technician_id) : null) ?? (last.technician_id ? techs.get(last.technician_id) : null) ?? null,
          serviceType: report?.performed_service_type ?? serviceType,
          reportNumber: report?.report_number ?? null,
        };
      }
      const pending = live.filter((s) => !countedIds.has(s.id)).sort((a, b) => (a.scheduled_date < b.scheduled_date ? -1 : 1));
      const first = pending[0];
      if (first.scheduled_date < today) {
        return { ...empty, date: first.scheduled_date, state: 'MISSED' as const, serviceType };
      }
      if (TENTATIVE_SCHEDULE.has(first.status)) {
        return { ...empty, month: String(first.scheduled_date).slice(0, 7), state: 'PLANNED' as const, serviceType };
      }
      return {
        ...empty,
        date: first.scheduled_date,
        state: 'UPCOMING' as const,
        startTime: first.start_time ?? null,
        technicianFirstName: first.technician_id ? (techs.get(first.technician_id) ?? null) : null,
        serviceType,
      };
    });

    const renewal = await openRenewal(customerId, c.id);
    return {
      contract: {
        id: c.id,
        contractNumber: c.contract_number,
        plan: plan?.name ?? null,
        planCode: plan?.plan_code ?? null,
        status: c.status,
        startDate: c.start_date,
        endDate: c.end_date,
        frequency: c.frequency,
        amount: money(c.total_amount),
        includes: { gasCharging: plan?.has_gas_charging === true, spareParts: plan?.has_spare_parts === true, unlimitedComplaints: plan?.has_unlimited_complaints === true },
        coverageSummary: plan?.coverage_summary ?? null,
        acs: acIds.map((id) => acRef(scope, id)!).filter(Boolean),
        visits: { total: num(c.total_visits), used: usage.visitsUsed, left: usage.visitsLeft, byType },
        timeline,
        canRenew: !renewal && renewWindowOpen(c, today),
        renewalRequestedAt: renewal?.created_at ?? null,
      },
    };
  },

  /** null = not the customer's contract. Throws NotRenewableError outside the renewal window. */
  async requestRenewal(customerId: string, contractId: string, rawNote: unknown): Promise<{ created: boolean; reference: string } | null> {
    if (!isPortalUuid(contractId)) return null;
    if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') throw new PortalInputError('The note must be text.');
    const note = typeof rawNote === 'string' ? rawNote.trim() : '';
    if (note.length > 500) throw new PortalInputError('The note can be at most 500 characters.');
    const scope = await loadScope(customerId);
    const c = scope?.contractById.get(contractId);
    if (!scope || !c) return null;

    const existing = await openRenewal(customerId, c.id);
    if (existing) return { created: false, reference: existing.tracking_code };
    if (!renewWindowOpen(c)) throw new NotRenewableError();

    const plan = scope.planById.get(c.plan_id);
    const message = [
      `AMC renewal request from the customer website for contract ${c.contract_number}${plan?.name ? ` (${plan.name})` : ''}, ending ${c.end_date}.`,
      note ? `Customer note: ${note}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const inserted = await insertPortalIntake(scope.customer, 'AMC_RENEWAL', message, { amc_contract_id: c.id, amc_plan_code: plan?.plan_code ?? null });
    if (inserted) return { created: true, reference: inserted.tracking_code };
    // Lost a race with a parallel click: the one open request wins.
    const winner = await openRenewal(customerId, c.id);
    if (winner) return { created: false, reference: winner.tracking_code };
    throw new Error('Failed to store the renewal request');
  },

  async listRequests(customerId: string, filter: unknown) {
    const scope = await loadScope(customerId);
    if (!scope) return null;
    const f = filter === 'open' || filter === 'completed' ? filter : 'all';
    const [schedules, reports, payments] = await Promise.all([
      ownSchedules(scope, { requestIds: [...scope.requestById.keys()] }),
      ownReports(scope),
      rows(db().from('payments').select(PAYMENT_COLUMNS).eq('customer_id', customerId), 'bills'),
    ]);
    const techs = await technicianFirstNames(schedules.map((s) => s.technician_id));
    const list = scope.requests.filter((r) => (f === 'all' ? true : f === 'open' ? isOpenRequest(r) : !isOpenRequest(r)));
    return {
      requests: list.map((r) => {
        const mine = schedules.filter((s) => s.service_request_id === r.id);
        const latest = latestLiveSchedule(mine);
        return {
          number: r.request_number,
          type: r.request_type ?? null,
          createdAt: r.created_at,
          status: statusOf(r, mine),
          ac: acRef(scope, r.asset_id),
          visit: latest?.scheduled_date
            ? { date: latest.scheduled_date, startTime: latest.start_time ?? null, technicianFirstName: latest.technician_id ? (techs.get(latest.technician_id) ?? null) : null }
            : null,
          hasReport: reports.some((x) => x.service_request_id === r.id),
          billNumber: payments.find((p) => p.service_request_id === r.id)?.payment_number ?? null,
        };
      }),
    };
  },

  async getRequest(customerId: string, number: string) {
    if (!isPortalNumber(number)) return null;
    const scope = await loadScope(customerId);
    // The customer's own requests only (loaded by customer_id).
    const r = scope?.requests.find((x) => x.request_number === number);
    if (!scope || !r) return null;
    const [schedules, history, reports, payments] = await Promise.all([
      ownSchedules(scope, { requestIds: [r.id] }),
      rows(
        db().from('service_request_status_history').select('entity, to_status, schedule_id, changed_at').eq('service_request_id', r.id).order('changed_at', { ascending: true }),
        'request history'
      ),
      ownReports(scope),
      rows(db().from('payments').select(PAYMENT_COLUMNS).eq('customer_id', customerId).eq('service_request_id', r.id), 'bill'),
    ]);
    const techs = await technicianFirstNames(schedules.map((s) => s.technician_id));

    // Customer-facing steps only: each status change mapped to its customer status, repeats dropped.
    const timeline: Array<{ label: string; at: string }> = [{ label: CUSTOMER_STATUSES.RECEIVED.label, at: r.created_at }];
    let lastCode: CustomerStatusCode = 'RECEIVED';
    for (const h of history) {
      let code: CustomerStatusCode | null = null;
      if (h.entity === 'REQUEST' && isRequestStatus(h.to_status)) code = fromRequestStatus(h.to_status).code;
      if (h.entity === 'SCHEDULE' && isScheduleStatus(h.to_status)) {
        code = fromScheduleStatus(h.to_status, { technicianAssigned: false })?.code ?? null;
      }
      if (!code || code === lastCode) continue;
      timeline.push({ label: CUSTOMER_STATUSES[code].label, at: h.changed_at });
      lastCode = code;
    }

    const bill = payments[0];
    return {
      request: {
        number: r.request_number,
        type: r.request_type ?? null,
        description: r.description ?? null,
        createdAt: r.created_at,
        status: statusOf(r, schedules),
        ac: acRef(scope, r.asset_id),
        timeline,
        visits: [...schedules]
          .sort((a, b) => (a.scheduled_date < b.scheduled_date ? -1 : 1))
          .map((s) => ({
            date: s.scheduled_date,
            startTime: s.start_time ?? null,
            state: isScheduleStatus(s.status)
              ? (fromScheduleStatus(s.status, { technicianAssigned: Boolean(s.technician_id) })?.code ?? (s.status === 'RESCHEDULED' ? 'RESCHEDULED' : 'CANCELLED'))
              : 'SCHEDULED',
            technicianFirstName: s.technician_id ? (techs.get(s.technician_id) ?? null) : null,
          })),
        reports: reports.filter((x) => x.service_request_id === r.id).map((x) => ({ reportNumber: x.report_number, date: x.service_date })),
        bill: bill ? { number: bill.payment_number, ...pick(billNumbers(bill), ['total', 'balance', 'status']) } : null,
      },
    };
  },

  async getReport(customerId: string, number: string) {
    if (!isPortalNumber(number)) return null;
    const scope = await loadScope(customerId);
    if (!scope) return null;
    const [r] = await ownReports(scope, number);
    if (!r || r.report_number !== number) return null;
    const d = await reportDetails([r.id]);
    const techs = await technicianFirstNames([r.technician_id]);
    const site = r.site_id ? scope.siteById.get(r.site_id) : undefined;

    const expiresAt = new Date(Date.now() + PHOTO_LINK_SECONDS * 1000).toISOString();
    const photos: Array<{ kind: 'BEFORE' | 'AFTER'; url: string; expiresAt: string }> = [];
    for (const [kind, value] of [['BEFORE', r.before_photo_url], ['AFTER', r.after_photo_url]] as const) {
      const path = photoPath(value);
      if (!path) continue;
      try {
        const { data, error } = await db().storage.from(SERVICE_REPORT_MEDIA_BUCKET).createSignedUrl(path, PHOTO_LINK_SECONDS);
        if (error || !data?.signedUrl) throw new Error(error?.message ?? 'no link');
        photos.push({ kind, url: data.signedUrl, expiresAt });
      } catch {
        logger.warn('Customer website: a report photo could not be signed', { outcome: 'portal_photo_sign_failed' });
      }
    }

    return {
      report: {
        number: r.report_number,
        date: r.service_date,
        startTime: r.start_time ?? null,
        endTime: r.end_time ?? null,
        serviceType: r.performed_service_type ?? r.planned_service_type ?? null,
        visitKind: visitKind(r),
        requestNumber: r.service_request_id ? (scope.requestById.get(r.service_request_id)?.request_number ?? null) : null,
        contractNumber: r.amc_id ? (scope.contractById.get(r.amc_id)?.contract_number ?? null) : null,
        technicianFirstName: r.technician_id ? (techs.get(r.technician_id) ?? null) : null,
        outcome: r.primary_outcome ?? null,
        workDescription: r.work_description ?? null,
        observations: r.observations ?? null,
        actionTaken: r.action_taken ?? null,
        recommendation: r.recommendation ?? null,
        acs: d.assets.map((x) => ({
          ac: acRef(scope, x.asset_id),
          label: acLabel(x),
          faultReported: x.fault_reported ?? null,
          findings: x.diagnosis_findings ?? null,
          workDone: x.work_performed ?? null,
          outcome: x.asset_outcome ?? null,
          conditionAfter: x.final_condition ?? null,
          refrigerantKg: num(x.refrigerant_qty_kg),
        })),
        parts: partsOf(r.id, d),
        photos,
        site: site ? { name: site.site_name, address: site.address } : null,
      },
      business: await businessIdentity(),
    };
  },

  async listBills(customerId: string) {
    const scope = await loadScope(customerId);
    if (!scope) return null;
    const payments = await rows(db().from('payments').select(PAYMENT_COLUMNS).eq('customer_id', customerId).order('created_at', { ascending: false }), 'bills');
    const tx = await billTransactions(payments.map((p) => p.id));
    const fyStart = financialYearStart();
    const bills = payments.map((p) => ({
      number: p.payment_number,
      date: istDate(p.created_at),
      forLabel: forLabel(scope, p),
      ...pick(billNumbers(p), ['total', 'paid', 'balance', 'status']),
    }));
    return {
      totals: {
        due: money(bills.reduce((n, b) => n + b.balance, 0)),
        paidThisYear: money(tx.filter((t) => (istDate(t.created_at) ?? '') >= fyStart).reduce((n, t) => n + txAmount(t), 0)),
      },
      bills,
    };
  },

  async getBill(customerId: string, number: string) {
    if (!isPortalNumber(number)) return null;
    const scope = await loadScope(customerId);
    if (!scope) return null;
    const [p] = await rows(
      db().from('payments').select(PAYMENT_COLUMNS).eq('customer_id', customerId).eq('payment_number', number).limit(1),
      'bill'
    );
    if (!p || p.customer_id !== customerId) return null;
    const tx = await billTransactions([p.id]);
    const n = billNumbers(p);
    const taxable = money(n.total / 1.18);
    const c = scope.customer;
    return {
      bill: {
        number: p.payment_number,
        date: istDate(p.created_at),
        forLabel: forLabel(scope, p),
        requestNumber: p.service_request_id ? (scope.requestById.get(p.service_request_id)?.request_number ?? null) : null,
        contractNumber: p.amc_id ? (scope.contractById.get(p.amc_id)?.contract_number ?? null) : null,
        customer: {
          name: c.name,
          code: c.customer_code ?? null,
          phone: c.phone ?? null,
          address: [c.address, c.city, c.state, c.postal_code].filter((v) => str(v)).join(', ') || null,
        },
        total: n.total,
        taxable,
        gstRate: 18 as const,
        gst: money(n.total - taxable),
        paid: n.paid,
        balance: n.balance,
        status: n.status,
        payments: tx.map((t) => {
          const ref = str(t.external_payment_reference);
          return {
            date: istDate(t.created_at),
            method: t.payment_method,
            amount: txAmount(t),
            referenceLast4: ref ? ref.trim().slice(-4) : null,
            kind: t.entry_type === 'REVERSAL' ? ('REVERSAL' as const) : ('PAYMENT' as const),
          };
        }),
        upiLink: n.balance > 0 ? buildUpiPayLink(p.payment_number, n.balance) : null,
      },
      business: await businessIdentity(),
    };
  },

  /** Throws PortalInputError (bad message) or PortalRateLimitedError (over 5 in 24 hours). */
  async requestProfileChange(customerId: string, rawMessage: unknown): Promise<{ reference: string } | null> {
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    if (message.length < 5 || message.length > 1000) throw new PortalInputError('Please write between 5 and 1000 characters.');
    const [customer] = await rows(db().from('customers').select('id, name, email, phone, alternate_phone').eq('id', customerId).maybeSingle(), 'customer');
    if (!customer) return null;
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const recent = async () => {
      const { count, error } = await db()
        .from('web_intakes')
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'PROFILE_CHANGE')
        .eq('customer_id', customerId)
        .gte('created_at', since);
      if (error) throw new Error(`Failed to check recent change requests: ${error.message}`);
      return count ?? 0;
    };
    // Cheap early refusal, then insert-and-recount: two requests at the same moment can never both get past the
    // limit (at worst both are refused, and the customer tries again).
    if ((await recent()) >= PROFILE_CHANGES_PER_DAY) throw new PortalRateLimitedError();
    const inserted = await insertPortalIntake(customer, 'PROFILE_CHANGE', `Change of details requested on the customer website:\n${message}`, {});
    if (!inserted) throw new Error('Failed to store the change request');
    if ((await recent()) > PROFILE_CHANGES_PER_DAY) {
      const { error: dErr } = await db().from('web_intakes').delete().eq('id', inserted.id).eq('status', 'PENDING_REVIEW');
      if (dErr) throw new Error(`Failed to undo an extra change request: ${dErr.message}`);
      throw new PortalRateLimitedError();
    }
    return { reference: inserted.tracking_code };
  },
};

function pick<T extends object, K extends keyof T>(o: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = o[k];
  return out;
}

/**
 * One approval-inbox row for a signed-in customer (kinds AMC_RENEWAL / PROFILE_CHANGE, migration 20261128000000).
 * Linked to the customer (customer_id + matched_customer_id); approving it only closes the review (no visit).
 * Returns null on a unique clash (an open renewal for the same contract already exists).
 */
async function insertPortalIntake(customer: Row, kind: 'AMC_RENEWAL' | 'PROFILE_CHANGE', message: string, extra: Row): Promise<{ id: string; tracking_code: string } | null> {
  const rawPhone = str(customer.phone) ?? str(customer.alternate_phone);
  const phone = rawPhone && rawPhone.length >= 6 && rawPhone.length <= 20 ? rawPhone : '000000';
  const email = str(customer.email);
  const { data, error } = await db()
    .from('web_intakes')
    .insert({
      kind,
      status: 'PENDING_REVIEW',
      source_channel: 'EXTREME_SALES_SERVICES',
      contact_name: String(customer.name ?? 'Customer').trim().slice(0, 120) || 'Customer',
      contact_phone: phone,
      contact_email: email && email.length <= 254 ? email : null,
      message: message.slice(0, 2000),
      // Signed-in customer acting on their own account; no new consent was asked for on this form.
      consent_privacy: false,
      consent_marketing: false,
      privacy_notice_version: 'CUSTOMER_PORTAL',
      customer_id: customer.id,
      matched_customer_id: customer.id,
      ...extra,
    })
    .select('id, tracking_code')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') return null;
    throw new Error(`Failed to store the request: ${error.message}`);
  }
  logger.info('Customer website request stored', { kind, outcome: 'portal_intake_created' });
  return data as { id: string; tracking_code: string };
}
