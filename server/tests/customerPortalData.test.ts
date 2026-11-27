import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import * as supabaseLib from '../src/lib/supabase.js';
import { addDaysIstIso, getIstTodayIso } from '../src/utils/date.js';
import { buildUpiPayLink } from '../src/services/email/emailTemplates.service.js';
import { financialYearStart, photoPath } from '../src/services/customerPortalData.service.js';
import { createFakeDb, type FakeDb, type Row } from './helpers/portalFakeDb.js';

// The signed-request check is covered in integrationLink tests; here every request counts as a signed ESS call.
vi.mock('../src/middleware/integrationAuth.js', () => ({
  requireIntegrationClient: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const { essPortalRouter } = await import('../src/routes/ess/portal.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/portal', essPortalRouter);
  return app;
}

const today = getIstTodayIso();
const day = (n: number) => addDaysIstIso(today, n);
const uid = (k: 'a' | 'b', n: number) => `${k.repeat(8)}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MISSING_UUID = '12345678-1234-4123-8123-123456789abc';

/** Two complete customers. Every internal / forbidden value carries a marker so whitelists can be checked. */
function customerData(k: 'a' | 'b') {
  const K = k.toUpperCase();
  const name = k === 'a' ? 'Asha Mehta' : 'Bharat Rao';
  const tech = k === 'a' ? { first: 'Sunil', full: 'Sunil Patil', phone: '9999911111' } : { first: 'Imran', full: 'Imran Shaikh', phone: '9999922222' };
  const ids = {
    customer: uid(k, 1),
    site: uid(k, 2),
    ac1: uid(k, 3),
    ac2: uid(k, 4),
    plan: uid(k, 5),
    amc: uid(k, 6),
    oldAmc: uid(k, 7),
    sr: uid(k, 8),
    srDone: uid(k, 9),
    tech: uid(k, 10),
    pay: uid(k, 11),
    payAmc: uid(k, 12),
  };
  const sched = (n: number, extra: Row) => ({
    id: uid(k, 100 + n),
    customer_id: ids.customer,
    notes: `INTERNAL-NOTE-SCHED-${K}`,
    rescheduled_from_id: null,
    technician_id: ids.tech,
    start_time: '10:00',
    ...extra,
  });
  const report = (n: number, extra: Row) => ({
    id: uid(k, 200 + n),
    customer_id: ids.customer,
    site_id: ids.site,
    technician_id: ids.tech,
    start_time: '10:00',
    end_time: '11:00',
    primary_outcome: 'COMPLETED',
    resolution_status: 'OPEN',
    work_description: `Work done ${K}`,
    observations: `Observed ${K}`,
    action_taken: `Action ${K}`,
    recommendation: `Recommend ${K}`,
    technician_remarks: `INTERNAL-REMARK-${K}`,
    last_correction_reason: `INTERNAL-CORRECTION-${K}`,
    service_type_deviation_reason: `INTERNAL-DEVIATION-${K}`,
    customer_signature_url: `signature-${K}.png`,
    payment_notes: `INTERNAL-PAYNOTE-${K}`,
    assistant_name: `Ramesh Assistant ${K}`,
    created_by: `profile-${K}`,
    ...extra,
  });
  return {
    customers: [
      { id: ids.customer, customer_code: `C-${K}`, name, company_name: `${name} Pvt Ltd`, email: `${k}@example.com`, phone: `98200000${k === 'a' ? '01' : '02'}`, address: `${K} Street 1`, city: k === 'a' ? 'Andheri' : 'Borivali', state: 'MH', postal_code: '400001', customer_type: 'PERMANENT', is_active: true, notes: `INTERNAL-NOTE-CUST-${K}` },
    ],
    customer_portal_accounts: [{ customer_id: ids.customer, enabled: true }],
    customer_sites: [{ id: ids.site, customer_id: ids.customer, site_name: `Home ${K}`, address: `${K} Street 1, Mumbai`, is_active: true, is_primary: true, notes: `INTERNAL-NOTE-SITE-${K}`, contact_phone: '9000000000' }],
    ac_assets: [
      { id: ids.ac1, site_id: ids.site, is_active: true, asset_tag: `TAG-${K}-1`, brand: k === 'a' ? 'Daikin' : 'Voltas', model_number: `MODEL-${K}`, ac_type: 'SPLIT', capacity_tons: 1.5, technology: 'INVERTER', star_rating: '5', room_location: 'Living room', floor_location: '2', installation_date: '2025-01-10', purchase_date: '2025-01-05', serial_number: `UNITSER${K}9876`, indoor_serial_number: `INDSER${K}1234`, outdoor_serial_number: `OUTSER${K}5555`, warranty_status: 'UNDER_WARRANTY', warranty_start_date: '2025-01-10', warranty_end_date: day(10), total_warranty_services: 2, asset_condition: 'Good', notes: `INTERNAL-NOTE-AC-${K}`, created_at: '2025-01-10T00:00:00Z' },
      { id: ids.ac2, site_id: ids.site, is_active: true, asset_tag: `TAG-${K}-2`, brand: 'LG', model_number: `MODEL2-${K}`, ac_type: 'WINDOW', capacity_tons: 1, room_location: 'Bedroom', serial_number: null, indoor_serial_number: null, outdoor_serial_number: `OUT2${K}4321`, warranty_status: 'OUT_OF_WARRANTY', warranty_end_date: null, asset_condition: 'Fair', created_at: '2025-02-10T00:00:00Z' },
    ],
    amc_plans: [{ id: ids.plan, plan_code: `PLAN-${K}`, name: `Comprehensive ${K}`, coverage_summary: `Cover ${K}`, has_gas_charging: true, has_spare_parts: false, has_unlimited_complaints: true }],
    amc_contracts: [
      { id: ids.amc, customer_id: ids.customer, plan_id: ids.plan, contract_number: `AMC-${K}-2026`, status: 'ACTIVE', start_date: day(-345), end_date: day(20), frequency: 'HALF_YEARLY', total_amount: 7998, total_visits: 2, dry_service_visits: 1, jet_service_visits: 1, pumpdown_service_visits: null, notes: `INTERNAL-NOTE-AMC-${K}`, created_at: '2025-12-01T00:00:00Z' },
      { id: ids.oldAmc, customer_id: ids.customer, plan_id: ids.plan, contract_number: `AMC-${K}-2025`, status: 'RENEWED', start_date: day(-710), end_date: day(-346), frequency: 'YEARLY', total_amount: 5000, total_visits: 1, created_at: '2024-12-01T00:00:00Z' },
    ],
    amc_assets: [
      { id: uid(k, 20), amc_id: ids.amc, asset_id: ids.ac1, notes: `INTERNAL-NOTE-AA-${K}` },
      { id: uid(k, 21), amc_id: ids.oldAmc, asset_id: ids.ac1 },
    ],
    technicians: [{ id: ids.tech, name: tech.full, phone: tech.phone, technician_code: `T-${K}` }],
    service_requests: [
      { id: ids.sr, customer_id: ids.customer, site_id: ids.site, asset_id: ids.ac1, request_number: `SR-${K}-0001`, request_type: 'BREAKDOWN', status: 'ASSIGNED', description: `Not cooling ${K}`, notes: `INTERNAL-NOTE-SR-${K}`, created_at: `${day(-3)}T04:00:00.000Z` },
      { id: ids.srDone, customer_id: ids.customer, site_id: ids.site, asset_id: ids.ac2, request_number: `SR-${K}-0002`, request_type: 'REPAIR', status: 'COMPLETED', description: `Noise ${K}`, created_at: `${day(-40)}T04:00:00.000Z` },
    ],
    service_request_status_history: [
      { id: uid(k, 30), service_request_id: ids.sr, entity: 'REQUEST', from_status: null, to_status: 'PENDING', changed_by: `profile-${K}`, changed_at: `${day(-3)}T04:00:01.000Z` },
      { id: uid(k, 31), service_request_id: ids.sr, entity: 'SCHEDULE', schedule_id: uid(k, 103), from_status: null, to_status: 'SCHEDULED', changed_at: `${day(-2)}T04:00:00.000Z` },
      { id: uid(k, 32), service_request_id: ids.sr, entity: 'REQUEST', from_status: 'PENDING', to_status: 'ASSIGNED', changed_at: `${day(-1)}T04:00:00.000Z` },
      { id: uid(k, 33), service_request_id: ids.sr, entity: 'SCHEDULE', schedule_id: uid(k, 103), from_status: 'SCHEDULED', to_status: 'ASSIGNED', changed_at: `${day(-1)}T04:00:05.000Z` },
    ],
    service_schedules: [
      // AMC visit 1: done (report), visit 2: upcoming with a technician.
      sched(1, { amc_id: ids.amc, asset_id: ids.ac1, service_request_id: null, visit_number: 1, scheduled_date: day(-100), status: 'COMPLETED', planned_service_type: 'DRY_SERVICE' }),
      sched(2, { amc_id: ids.amc, asset_id: ids.ac1, service_request_id: null, visit_number: 2, scheduled_date: day(5), status: 'SCHEDULED', planned_service_type: 'JET_SERVICE', start_time: '14:30' }),
      // The open request's visit (tomorrow) and the finished request's visit.
      sched(3, { amc_id: null, asset_id: ids.ac1, service_request_id: ids.sr, scheduled_date: day(1), status: 'ASSIGNED', start_time: '09:30' }),
      sched(4, { amc_id: null, asset_id: ids.ac2, service_request_id: ids.srDone, scheduled_date: day(-40), status: 'COMPLETED' }),
    ],
    service_reports: [
      report(1, { report_number: `RPT-${K}-0001`, status: 'VERIFIED', visit_type: 'PREVENTIVE', amc_id: ids.amc, service_request_id: null, service_schedule_id: uid(k, 101), service_date: day(-100), planned_service_type: 'DRY_SERVICE', performed_service_type: 'DRY_SERVICE', before_photo_url: `before-photo/${K}/one.jpg`, after_photo_url: `https://x.supabase.co/storage/v1/object/public/service-report-media/after-photo/${K}/two.jpg` }),
      report(2, { report_number: `RPT-${K}-0002`, status: 'SUBMITTED', visit_type: 'SERVICE_REQUEST', amc_id: null, service_request_id: ids.srDone, service_schedule_id: uid(k, 104), service_date: day(-40), before_photo_url: `before-photo/${K}/fail.jpg`, after_photo_url: null }),
      // Never shown: a draft.
      report(3, { report_number: `RPT-${K}-DRAFT`, status: 'DRAFT', visit_type: 'SERVICE_REQUEST', service_request_id: ids.sr, service_schedule_id: uid(k, 103), service_date: day(-1), before_photo_url: `before-photo/${K}/draft.jpg` }),
    ],
    service_report_assets: [
      { id: uid(k, 40), report_id: uid(k, 201), asset_id: ids.ac1, brand: k === 'a' ? 'Daikin' : 'Voltas', capacity_tons: 1.5, room_location: 'Living room', fault_reported: null, diagnosis_findings: `Dusty filter ${K}`, work_performed: `Dry service ${K}`, asset_outcome: 'COMPLETED', final_condition: 'Good', refrigerant_qty_kg: 0.5, notes: `INTERNAL-NOTE-SRA-${K}` },
      { id: uid(k, 41), report_id: uid(k, 202), asset_id: ids.ac2, brand: 'LG', capacity_tons: 1, room_location: 'Bedroom', fault_reported: `Noise ${K}`, diagnosis_findings: 'Loose fan', work_performed: 'Tightened', asset_outcome: 'COMPLETED', final_condition: 'Good', refrigerant_qty_kg: null },
      { id: uid(k, 42), report_id: uid(k, 203), asset_id: ids.ac1, diagnosis_findings: `DRAFT-FINDING-${K}` },
    ],
    service_report_items: [
      { id: uid(k, 50), report_id: uid(k, 201), asset_id: ids.ac1, item_type: 'REPAIR_REQUIRED', item_name: 'Gas', reason: 'Low', recommended_action: `Gas top-up advised ${K}`, is_resolved: false, follow_up_notes: `INTERNAL-NOTE-ITEM-${K}`, created_at: `${day(-100)}T05:00:00Z` },
      { id: uid(k, 51), report_id: uid(k, 203), asset_id: ids.ac1, item_type: 'PART_REQUIRED', item_name: 'x', reason: 'y', recommended_action: `DRAFT-RECOMMEND-${K}`, is_resolved: false },
    ],
    parts: [{ id: uid(k, 60), part_code: `P-${K}`, name: `Capacitor ${K}`, unit_cost: 111.11, unit_price: 1234.5 }],
    service_parts: [{ id: uid(k, 61), service_report_id: uid(k, 202), part_id: uid(k, 60), quantity: 2, unit_price: 1234.5, total_price: 2469 }],
    payments: [
      { id: ids.pay, customer_id: ids.customer, payment_number: `PAY-2026-${K}00001`, service_request_id: ids.srDone, amc_id: null, total_amount_due: 1180, total_amount_paid: 500, status: 'PARTIALLY_PAID', payment_notes: `INTERNAL-PAYNOTE-BILL-${K}`, created_at: `${day(-39)}T06:00:00.000Z` },
      { id: ids.payAmc, customer_id: ids.customer, payment_number: `PAY-2026-${K}00002`, service_request_id: null, amc_id: ids.amc, total_amount_due: 7998, total_amount_paid: 7998, status: 'PAID', created_at: `${day(-345)}T06:00:00.000Z` },
    ],
    payment_transactions: [
      { id: uid(k, 70), payment_id: ids.pay, payment_method: 'ONLINE', amount: 600, payment_status: 'SUCCESS', entry_type: 'PAYMENT', external_payment_reference: `UPIREF${K}778899`, transaction_reference: `TXN-INTERNAL-${K}`, recorded_by: `profile-${K}`, notes: `INTERNAL-NOTE-TX-${K}`, created_at: `${today}T03:00:00.000Z` },
      { id: uid(k, 71), payment_id: ids.pay, payment_method: 'ONLINE', amount: 100, payment_status: 'SUCCESS', entry_type: 'REVERSAL', reverses_transaction_id: uid(k, 70), external_payment_reference: null, created_at: `${today}T04:00:00.000Z` },
      { id: uid(k, 72), payment_id: ids.pay, payment_method: 'CASH', amount: 999, payment_status: 'FAILED', entry_type: 'PAYMENT', created_at: `${today}T05:00:00.000Z` },
    ],
    ids,
    tech,
  };
}

function seed(): Record<string, Row[]> {
  const A = customerData('a');
  const B = customerData('b');
  const out: Record<string, Row[]> = {
    customer_login_otps: [],
    customer_portal_sessions: [],
    email_deliveries: [],
    web_intakes: [],
    site_content_blocks: [
      { key: 'business.identity', published_version: 3, published_at: '2026-11-01T00:00:00Z', published_body: { legalName: 'Extreme Sales And Services', gstin: '27ANTPP9778J1ZO', address: 'Chembur, Mumbai', phone: '+91 7977805245', email: 'extremess0121@gmail.com', proprietorName: 'Owner Name' } },
    ],
  };
  for (const X of [A, B]) {
    for (const [table, list] of Object.entries(X)) {
      if (table === 'ids' || table === 'tech') continue;
      (out[table] ??= []).push(...(list as Row[]));
    }
  }
  return out;
}

const A = customerData('a');
const B = customerData('b');
const FORBIDDEN = (K: string, x: ReturnType<typeof customerData>) => [
  x.tech.full,
  x.tech.full.split(' ')[1],
  x.tech.phone,
  `INTERNAL-REMARK-${K}`,
  `INTERNAL-CORRECTION-${K}`,
  `INTERNAL-DEVIATION-${K}`,
  `signature-${K}.png`,
  `INTERNAL-PAYNOTE`,
  `INTERNAL-NOTE`,
  'Ramesh',
  `profile-${K}`,
  `TXN-INTERNAL-${K}`,
  '1234.5',
  '111.11',
  '2469',
  'DRAFT',
  '9000000000',
  'Owner Name',
];
const FORBIDDEN_KEYS = ['technician_remarks', 'last_correction_reason', 'service_type_deviation_reason', 'customer_signature_url', 'payment_notes', 'notes', 'unit_cost', 'unit_price', 'total_price', 'customer_id', 'phone_number'];
const B_MARKERS = [B.ids.customer, 'Bharat', 'b@example.com', 'Borivali', 'Voltas', 'MODEL-B', 'AMC-B-2026', 'SR-B-0001', 'RPT-B-0001', 'PAY-2026-B00001', 'Imran', '9820000002', 'INDSERB'];

let fake: FakeDb;
let db: Record<string, Row[]>;
const originalPortal = process.env.PORTAL_ENABLED;

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.PORTAL_ENABLED = 'true';
  fake = createFakeDb(seed());
  db = fake.db;
  vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(fake.client as never);
});
afterEach(() => {
  if (originalPortal === undefined) delete process.env.PORTAL_ENABLED;
  else process.env.PORTAL_ENABLED = originalPortal;
});

/** A live session for the customer (stored as a hash, as the sign-in flow does). */
function session(customerId: string): string {
  const token = randomBytes(32).toString('base64url');
  db.customer_portal_sessions.push({
    id: `sess-${db.customer_portal_sessions.length + 1}`,
    customer_id: customerId,
    token_hash: createHash('sha256').update(token).digest('hex'),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
  });
  return token;
}

const get = (app: express.Express, url: string, token?: string) => {
  const r = request(app).get(url);
  return token ? r.set('X-PYS-Customer-Session', token) : r;
};
const post = (app: express.Express, url: string, token: string | undefined, body: Row = {}) => {
  const r = request(app).post(url);
  return (token ? r.set('X-PYS-Customer-Session', token) : r).send(body);
};

function expectClean(body: unknown, K: 'A' | 'B') {
  const x = K === 'A' ? A : B;
  const s = JSON.stringify(body);
  for (const f of FORBIDDEN(K, x)) expect(s, `forbidden value ${f}`).not.toContain(f);
  for (const key of FORBIDDEN_KEYS) expect(s, `forbidden key ${key}`).not.toContain(`"${key}"`);
  if (K === 'A') for (const m of B_MARKERS) expect(s, `B marker ${m}`).not.toContain(m);
}

const NOT_FOUND = { success: false, error: { code: 'NOT_FOUND', message: 'We could not find that.' } };

const ROUTES_WITH_IDS: Array<{ name: string; method: 'get' | 'post'; url: (v: string) => string; own: string; other: string; missing: string; body?: Row }> = [
  { name: 'GET /acs/:id', method: 'get', url: (v) => `/portal/acs/${v}`, own: A.ids.ac1, other: B.ids.ac1, missing: MISSING_UUID },
  { name: 'GET /amc/:id', method: 'get', url: (v) => `/portal/amc/${v}`, own: A.ids.amc, other: B.ids.amc, missing: MISSING_UUID },
  { name: 'POST /amc/:id/renew', method: 'post', url: (v) => `/portal/amc/${v}/renew`, own: A.ids.amc, other: B.ids.amc, missing: MISSING_UUID, body: {} },
  { name: 'GET /requests/:number', method: 'get', url: (v) => `/portal/requests/${v}`, own: 'SR-A-0001', other: 'SR-B-0001', missing: 'SR-Z-9999' },
  { name: 'GET /reports/:number', method: 'get', url: (v) => `/portal/reports/${v}`, own: 'RPT-A-0001', other: 'RPT-B-0001', missing: 'RPT-Z-9999' },
  { name: 'GET /billing/:number', method: 'get', url: (v) => `/portal/billing/${v}`, own: 'PAY-2026-A00001', other: 'PAY-2026-B00001', missing: 'PAY-2026-Z99999' },
];
const BAD_FORMATS = ['not-a-uuid', '..%2F..%2Fetc', 'a%20b', "x'%3Bdrop", '%3Cscript%3E', 'a'.repeat(80), '-leading'];

const ALL_SESSION_ROUTES: Array<{ method: 'get' | 'post'; url: string; body?: Row }> = [
  { method: 'get', url: '/portal/overview' },
  { method: 'get', url: '/portal/acs' },
  { method: 'get', url: `/portal/acs/${A.ids.ac1}` },
  { method: 'get', url: '/portal/amc' },
  { method: 'get', url: `/portal/amc/${A.ids.amc}` },
  { method: 'post', url: `/portal/amc/${A.ids.amc}/renew`, body: {} },
  { method: 'get', url: '/portal/requests' },
  { method: 'get', url: '/portal/requests/SR-A-0001' },
  { method: 'get', url: '/portal/reports/RPT-A-0001' },
  { method: 'get', url: '/portal/billing' },
  { method: 'get', url: '/portal/billing/PAY-2026-A00001' },
  { method: 'post', url: '/portal/profile/change-request', body: { message: 'Please update my phone' } },
  { method: 'post', url: '/portal/sign-out-all' },
];

describe('S11b portal v2: access', () => {
  it('every new route answers 401 SESSION_ENDED without a live session, and nothing is written', async () => {
    const app = makeApp();
    const revoked = session(A.ids.customer);
    db.customer_portal_sessions[0].revoked_at = new Date().toISOString();
    for (const r of ALL_SESSION_ROUTES) {
      for (const t of [undefined, revoked, 'x'.repeat(43)]) {
        const res = r.method === 'get' ? await get(app, r.url, t) : await post(app, r.url, t, r.body);
        expect(res.status, `${r.method} ${r.url}`).toBe(401);
        expect(res.body).toEqual({ success: false, error: { code: 'SESSION_ENDED', message: 'Please sign in again.' } });
      }
    }
    expect(db.web_intakes).toHaveLength(0);
  });

  it('every new route answers 503 PORTAL_OFF when the switch is off', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    process.env.PORTAL_ENABLED = 'false';
    for (const r of ALL_SESSION_ROUTES) {
      const res = r.method === 'get' ? await get(app, r.url, t) : await post(app, r.url, t, r.body);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('PORTAL_OFF');
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(db.web_intakes).toHaveLength(0);
  });

  it('every answer is Cache-Control: no-store (data and 404 alike)', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    for (const r of ALL_SESSION_ROUTES.filter((x) => x.method === 'get')) {
      const res = await get(app, r.url, t);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect((await get(app, `/portal/acs/${MISSING_UUID}`, t)).headers['cache-control']).toBe('no-store');
  });
});

describe('S11b portal v2: customer A can never reach B (ids, numbers, formats)', () => {
  for (const r of ROUTES_WITH_IDS) {
    it(`${r.name}: B's record and a missing one give the identical 404; A's own works`, async () => {
      const app = makeApp();
      const t = session(A.ids.customer);
      const call = (v: string) => (r.method === 'get' ? get(app, r.url(v), t) : post(app, r.url(v), t, r.body));
      const other = await call(r.other);
      const missing = await call(r.missing);
      expect(other.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(other.body).toEqual(NOT_FOUND);
      expect(missing.body).toEqual(other.body);
      expect(other.headers['content-length']).toBe(missing.headers['content-length']);
      for (const bad of BAD_FORMATS) {
        const res = await call(bad);
        expect(res.status, bad).toBe(404);
        expect(res.body).toEqual(NOT_FOUND);
      }
      const own = await call(r.own);
      expect([200, 201]).toContain(own.status);
      expectClean(own.body, 'A');
      // B's own session sees B's record (so the 404 above was ownership, not a broken fixture).
      const tb = session(B.ids.customer);
      const asB = r.method === 'get' ? await get(app, r.url(r.other), tb) : await post(app, r.url(r.other), tb, r.body);
      expect([200, 201]).toContain(asB.status);
      expect(JSON.stringify(asB.body)).not.toContain('Asha');
    });
  }

  it("B's ids are ignored in query strings, bodies and headers: lists only ever hold A's rows", async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    for (const url of ['/portal/overview', '/portal/acs', '/portal/amc', '/portal/requests', '/portal/billing']) {
      const res = await get(app, `${url}?customerId=${B.ids.customer}&customer_id=${B.ids.customer}`, t).set('X-Customer-Id', B.ids.customer);
      expect(res.status).toBe(200);
      expectClean(res.body, 'A');
    }
  });

  it("A's draft report is not found, and B's reports never appear even when B's report points at A's request", async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    expect((await get(app, '/portal/reports/RPT-A-DRAFT', t)).body).toEqual(NOT_FOUND);
    // A report that names customer B but (by a data slip) points at A's request stays B's.
    db.service_reports.find((r) => r.report_number === 'RPT-B-0002')!.service_request_id = A.ids.srDone;
    expect((await get(app, '/portal/reports/RPT-B-0002', t)).body).toEqual(NOT_FOUND);
    const reqs = await get(app, '/portal/requests/SR-A-0002', t);
    expect(reqs.body.data.request.reports.map((x: Row) => x.reportNumber)).toEqual(['RPT-A-0002']);
  });

  it('an AC on a site that is not the customer\'s is not found even if the AC id is known', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    // Inactive ACs are hidden too.
    db.ac_assets.find((a) => a.id === A.ids.ac2)!.is_active = false;
    expect((await get(app, `/portal/acs/${A.ids.ac2}`, t)).body).toEqual(NOT_FOUND);
    expect((await get(app, `/portal/acs/${B.ids.ac2}`, t)).body).toEqual(NOT_FOUND);
  });
});

describe('S11b portal v2: pages', () => {
  it('GET /overview: customer, next visit, AMC visits, amount due, open requests and alerts', async () => {
    const app = makeApp();
    const res = await get(app, '/portal/overview', session(A.ids.customer));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.customer).toEqual({ name: 'Asha Mehta', companyName: 'Asha Mehta Pvt Ltd', email: 'a@example.com', phone: '9820000001', city: 'Andheri' });
    expect(d.nextVisit).toEqual({ date: day(1), startTime: '09:30', technicianFirstName: 'Sunil', requestNumber: 'SR-A-0001', ac: { id: A.ids.ac1, label: 'Daikin 1.5 ton · Living room' } });
    expect(d.amc).toEqual({ id: A.ids.amc, contractNumber: 'AMC-A-2026', plan: 'Comprehensive A', endDate: day(20), totalVisits: 2, visitsUsed: 1, visitsLeft: 1 });
    expect(d.billing).toEqual({ amountDue: 680, unpaidBills: 1 });
    expect(d.openRequests).toBe(1);
    const kinds = d.alerts.map((a: Row) => a.kind);
    expect(kinds).toEqual(['AMC_ENDING', 'WARRANTY_ENDING', 'RECOMMENDATION', 'BILL_DUE']);
    expect(d.alerts[0].link).toEqual({ kind: 'amc', id: A.ids.amc });
    expect(d.alerts[1].link).toEqual({ kind: 'ac', id: A.ids.ac1 });
    expect(d.alerts[2]).toEqual({ kind: 'RECOMMENDATION', text: 'Gas top-up advised A (Daikin 1.5 ton · Living room AC)', link: { kind: 'report', id: 'RPT-A-0001' } });
    expect(d.alerts[3].link).toEqual({ kind: 'bill', id: 'PAY-2026-A00001' });
    expectClean(res.body, 'A');
  });

  it('GET /overview: recommendations older than 180 days and resolved ones are not alerts; an expired AMC is', async () => {
    const app = makeApp();
    db.service_reports.find((r) => r.report_number === 'RPT-A-0001')!.service_date = day(-181);
    db.amc_contracts.find((c) => c.id === A.ids.amc)!.status = 'EXPIRED';
    db.amc_contracts.find((c) => c.id === A.ids.amc)!.end_date = day(-10);
    const res = await get(app, '/portal/overview', session(A.ids.customer));
    const kinds = res.body.data.alerts.map((a: Row) => a.kind);
    expect(kinds).not.toContain('RECOMMENDATION');
    expect(kinds).toContain('AMC_EXPIRED');
    expect(res.body.data.amc).toBeNull();
  });

  it('GET /acs: one card per AC with coverage, last 4 of the serial, last service and open recommendations', async () => {
    const app = makeApp();
    const res = await get(app, '/portal/acs', session(A.ids.customer));
    expect(res.status).toBe(200);
    const [ac2, ac1] = [res.body.data.acs.find((a: Row) => a.id === A.ids.ac2), res.body.data.acs.find((a: Row) => a.id === A.ids.ac1)];
    expect(ac1).toEqual({ id: A.ids.ac1, label: 'Daikin 1.5 ton · Living room', brand: 'Daikin', model: 'MODEL-A', type: 'SPLIT', tons: 1.5, room: 'Living room', floor: '2', coverage: 'AMC_COVERED', serialLast4: '1234', lastServiceDate: day(-100), openRecommendations: 1 });
    expect(ac2).toMatchObject({ coverage: 'OUT_OF_WARRANTY', serialLast4: '4321', lastServiceDate: day(-40), openRecommendations: 0 });
    expect(JSON.stringify(res.body)).not.toContain('INDSERA1234'); // full serials only on the detail page
    expectClean(res.body, 'A');
  });

  it('GET /acs/:id: full serials, warranty, AMC, history newest first (final reports only) and recommendations', async () => {
    const app = makeApp();
    const res = await get(app, `/portal/acs/${A.ids.ac1}`, session(A.ids.customer));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.ac.serials).toEqual({ indoor: 'INDSERA1234', outdoor: 'OUTSERA5555', unit: 'UNITSERA9876' });
    expect(d.ac.site).toEqual({ name: 'Home A', address: 'A Street 1, Mumbai' });
    expect(d.ac.warranty).toEqual({ status: 'EXPIRING_SOON', start: '2025-01-10', end: day(10), visitsTotal: 2, visitsUsed: null });
    expect(d.amc.map((c: Row) => c.contractNumber)).toEqual(['AMC-A-2026', 'AMC-A-2025']);
    expect(d.history).toEqual([
      { reportNumber: 'RPT-A-0001', date: day(-100), serviceType: 'DRY_SERVICE', visitKind: 'AMC', faultReported: null, findings: 'Dusty filter A', workDone: 'Dry service A', outcome: 'COMPLETED', conditionAfter: 'Good', refrigerantKg: 0.5, parts: [], technicianFirstName: 'Sunil', photoCount: 2 },
    ]);
    expect(d.recommendations).toEqual([{ text: 'Gas top-up advised A', date: day(-100), reportNumber: 'RPT-A-0001' }]);
    expect(JSON.stringify(d)).not.toContain('DRAFT-');
    expectClean(res.body, 'A');
  });

  it('GET /amc: current contracts first, then old ones, with G1 visits', async () => {
    const app = makeApp();
    const res = await get(app, '/portal/amc', session(A.ids.customer));
    expect(res.body.data.contracts).toEqual([
      { id: A.ids.amc, contractNumber: 'AMC-A-2026', plan: 'Comprehensive A', status: 'ACTIVE', startDate: day(-345), endDate: day(20), totalVisits: 2, visitsUsed: 1, visitsLeft: 1, acCount: 1 },
      { id: A.ids.oldAmc, contractNumber: 'AMC-A-2025', plan: 'Comprehensive A', status: 'RENEWED', startDate: day(-710), endDate: day(-346), totalVisits: 1, visitsUsed: 0, visitsLeft: 1, acCount: 1 },
    ]);
    expectClean(res.body, 'A');
  });

  it('GET /amc/:id: plan cover, visits by type, timeline per visit number, renewal state', async () => {
    const app = makeApp();
    const res = await get(app, `/portal/amc/${A.ids.amc}`, session(A.ids.customer));
    const c = res.body.data.contract;
    expect(c).toMatchObject({
      contractNumber: 'AMC-A-2026',
      plan: 'Comprehensive A',
      planCode: 'PLAN-A',
      frequency: 'HALF_YEARLY',
      amount: 7998,
      includes: { gasCharging: true, spareParts: false, unlimitedComplaints: true },
      coverageSummary: 'Cover A',
      acs: [{ id: A.ids.ac1, label: 'Daikin 1.5 ton · Living room' }],
      visits: { total: 2, used: 1, left: 1, byType: [{ type: 'DRY_SERVICE', total: 1, used: 1 }, { type: 'JET_SERVICE', total: 1, used: 0 }] },
      canRenew: true,
      renewalRequestedAt: null,
    });
    expect(c.timeline).toEqual([
      { visitNumber: 1, date: day(-100), month: null, state: 'DONE', startTime: '10:00', technicianFirstName: 'Sunil', serviceType: 'DRY_SERVICE', reportNumber: 'RPT-A-0001' },
      { visitNumber: 2, date: day(5), month: null, state: 'UPCOMING', startTime: '14:30', technicianFirstName: 'Sunil', serviceType: 'JET_SERVICE', reportNumber: null },
    ]);
    expectClean(res.body, 'A');
  });

  it('GET /amc/:id timeline: planned visits show the month only, missed ones their date, missing numbers are PLANNED', async () => {
    const app = makeApp();
    const s2 = db.service_schedules.find((s) => s.id === uid('a', 102))!;
    s2.status = 'PLANNED';
    s2.scheduled_date = day(40);
    db.amc_contracts.find((c) => c.id === A.ids.amc)!.total_visits = 3;
    let res = await get(app, `/portal/amc/${A.ids.amc}`, session(A.ids.customer));
    expect(res.body.data.contract.timeline.slice(1)).toEqual([
      { visitNumber: 2, date: null, month: day(40).slice(0, 7), state: 'PLANNED', startTime: null, technicianFirstName: null, serviceType: 'JET_SERVICE', reportNumber: null },
      { visitNumber: 3, date: null, month: null, state: 'PLANNED', startTime: null, technicianFirstName: null, serviceType: null, reportNumber: null },
    ]);
    s2.status = 'OVERDUE';
    s2.scheduled_date = day(-3);
    res = await get(app, `/portal/amc/${A.ids.amc}`, session(A.ids.customer));
    expect(res.body.data.contract.timeline[1]).toMatchObject({ visitNumber: 2, date: day(-3), state: 'MISSED' });
  });

  it('canRenew: only within 30 days of the end (or up to 60 days after expiry)', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    const c = db.amc_contracts.find((x) => x.id === A.ids.amc)!;
    const check = async () => (await get(app, `/portal/amc/${A.ids.amc}`, t)).body.data.contract.canRenew;
    c.end_date = day(31);
    expect(await check()).toBe(false);
    c.end_date = day(30);
    expect(await check()).toBe(true);
    c.status = 'EXPIRED';
    c.end_date = day(-60);
    expect(await check()).toBe(true);
    c.end_date = day(-61);
    expect(await check()).toBe(false);
    c.status = 'RENEWED';
    c.end_date = day(5);
    expect(await check()).toBe(false);
    expect((await post(app, `/portal/amc/${A.ids.amc}/renew`, t)).status).toBe(409);
  });

  it('POST /amc/:id/renew: one AMC_RENEWAL intake linked to the customer; repeats while open give the same reference', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    const first = await post(app, `/portal/amc/${A.ids.amc}/renew`, t, { note: 'Please call after 6pm' });
    expect(first.status).toBe(201);
    expect(first.body.data).toEqual({ requested: true, reference: expect.stringMatching(/^ESS-/) });
    const again = await post(app, `/portal/amc/${A.ids.amc}/renew`, t, {});
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual(first.body.data);
    expect(db.web_intakes).toHaveLength(1);
    const row = db.web_intakes[0];
    expect(row).toMatchObject({ kind: 'AMC_RENEWAL', status: 'PENDING_REVIEW', customer_id: A.ids.customer, matched_customer_id: A.ids.customer, amc_contract_id: A.ids.amc, contact_name: 'Asha Mehta', contact_phone: '9820000001', contact_email: 'a@example.com', amc_plan_code: 'PLAN-A' });
    expect(row.message).toContain('AMC-A-2026');
    expect(row.message).toContain('Please call after 6pm');
    // The contract page now shows the request and no renew button.
    const page = await get(app, `/portal/amc/${A.ids.amc}`, t);
    expect(page.body.data.contract.canRenew).toBe(false);
    expect(page.body.data.contract.renewalRequestedAt).toBe(row.created_at);
    // Once staff close it, a new request can be made.
    row.status = 'APPROVED';
    expect((await post(app, `/portal/amc/${A.ids.amc}/renew`, t)).status).toBe(201);
    expect(db.web_intakes).toHaveLength(2);
  });

  it('POST /amc/:id/renew: a lost race (unique index) answers the winning reference; notes over 500 chars are refused', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    const [x, y] = await Promise.all([post(app, `/portal/amc/${A.ids.amc}/renew`, t), post(app, `/portal/amc/${A.ids.amc}/renew`, t)]);
    expect([x.status, y.status].sort()).toEqual([200, 201]);
    expect(x.body.data.reference).toBe(y.body.data.reference);
    expect(db.web_intakes).toHaveLength(1);
    const long = await post(app, `/portal/amc/${A.ids.amc}/renew`, t, { note: 'n'.repeat(501) });
    expect(long.status).toBe(400);
    expect(long.body.error.code).toBe('INVALID_INPUT');
    expect((await post(app, `/portal/amc/${A.ids.amc}/renew`, t, { note: 42 })).status).toBe(400);
  });

  it('GET /requests: filters open / completed / all, with status, AC, visit, report and bill', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    const all = (await get(app, '/portal/requests', t)).body.data.requests;
    expect(all.map((r: Row) => r.number)).toEqual(['SR-A-0001', 'SR-A-0002']);
    expect(all[0]).toEqual({
      number: 'SR-A-0001',
      type: 'BREAKDOWN',
      createdAt: `${day(-3)}T04:00:00.000Z`,
      status: { code: 'TECHNICIAN_ASSIGNED', label: 'Technician assigned', step: 4, tone: 'info' },
      ac: { id: A.ids.ac1, label: 'Daikin 1.5 ton · Living room' },
      visit: { date: day(1), startTime: '09:30', technicianFirstName: 'Sunil' },
      hasReport: false,
      billNumber: null,
    });
    expect(all[1]).toMatchObject({ number: 'SR-A-0002', hasReport: true, billNumber: 'PAY-2026-A00001', status: { code: 'COMPLETED' } });
    expect((await get(app, '/portal/requests?filter=open', t)).body.data.requests.map((r: Row) => r.number)).toEqual(['SR-A-0001']);
    expect((await get(app, '/portal/requests?filter=completed', t)).body.data.requests.map((r: Row) => r.number)).toEqual(['SR-A-0002']);
    expect((await get(app, '/portal/requests?filter=weird', t)).body.data.requests).toHaveLength(2);
  });

  it('GET /requests/:number: customer-facing timeline, visits, reports and bill', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    const r = (await get(app, '/portal/requests/SR-A-0001', t)).body.data.request;
    expect(r.description).toBe('Not cooling A');
    expect(r.timeline.map((x: Row) => x.label)).toEqual(['Request received', 'Confirmed', 'Visit scheduled', 'Technician assigned']);
    expect(r.visits).toEqual([{ date: day(1), startTime: '09:30', state: 'TECHNICIAN_ASSIGNED', technicianFirstName: 'Sunil' }]);
    expect(r.reports).toEqual([]); // the draft is not shown
    expect(r.bill).toBeNull();
    const done = (await get(app, '/portal/requests/SR-A-0002', t)).body.data.request;
    expect(done.reports).toEqual([{ reportNumber: 'RPT-A-0002', date: day(-40) }]);
    expect(done.bill).toEqual({ number: 'PAY-2026-A00001', total: 1180, balance: 680, status: 'PART_PAID' });
  });

  it('GET /reports/:number: the customer copy with parts (no prices), photos as 10-minute links and the business', async () => {
    const app = makeApp();
    const res = await get(app, '/portal/reports/RPT-A-0001', session(A.ids.customer));
    expect(res.status).toBe(200);
    const { report, business } = res.body.data;
    expect(report).toMatchObject({
      number: 'RPT-A-0001',
      date: day(-100),
      startTime: '10:00',
      endTime: '11:00',
      serviceType: 'DRY_SERVICE',
      visitKind: 'AMC',
      requestNumber: null,
      contractNumber: 'AMC-A-2026',
      technicianFirstName: 'Sunil',
      outcome: 'COMPLETED',
      workDescription: 'Work done A',
      recommendation: 'Recommend A',
      site: { name: 'Home A', address: 'A Street 1, Mumbai' },
    });
    expect(report.acs).toEqual([
      { ac: { id: A.ids.ac1, label: 'Daikin 1.5 ton · Living room' }, label: 'Daikin 1.5 ton · Living room', faultReported: null, findings: 'Dusty filter A', workDone: 'Dry service A', outcome: 'COMPLETED', conditionAfter: 'Good', refrigerantKg: 0.5 },
    ]);
    expect(report.photos.map((p: Row) => p.kind)).toEqual(['BEFORE', 'AFTER']);
    for (const p of report.photos) {
      expect(p.url).toMatch(/^https:\/\/storage\.test\/service-report-media\//);
      const left = Date.parse(p.expiresAt) - Date.now();
      expect(left).toBeGreaterThan(590_000);
      expect(left).toBeLessThanOrEqual(600_000);
    }
    expect(fake.signed).toEqual([
      { bucket: 'service-report-media', path: 'before-photo/A/one.jpg', seconds: 600 },
      { bucket: 'service-report-media', path: 'after-photo/A/two.jpg', seconds: 600 },
    ]);
    expect(business).toEqual({ legalName: 'Extreme Sales And Services', gstin: '27ANTPP9778J1ZO', address: 'Chembur, Mumbai', phone: '+91 7977805245', email: 'extremess0121@gmail.com' });
    expectClean(res.body, 'A');

    const r2 = (await get(app, '/portal/reports/RPT-A-0002', session(A.ids.customer))).body.data.report;
    expect(r2.parts).toEqual([{ name: 'Capacitor A', quantity: 2 }]);
    // Signing failed for this photo: it is left out and the page still works.
    expect(r2.photos).toEqual([]);
  });

  it('photo links are only ever signed for the signed-in customer\'s own final reports', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    await get(app, '/portal/reports/RPT-B-0001', t);
    await get(app, '/portal/reports/RPT-A-DRAFT', t);
    for (const url of ['/portal/overview', '/portal/acs', `/portal/acs/${A.ids.ac1}`, '/portal/amc', `/portal/amc/${A.ids.amc}`, '/portal/requests', '/portal/requests/SR-A-0001', '/portal/billing']) {
      await get(app, url, t);
    }
    expect(fake.signed).toEqual([]);
    await get(app, '/portal/reports/RPT-A-0001', t);
    expect(fake.signed.every((s) => s.path.includes('/A/'))).toBe(true);
    expect(fake.signed.some((s) => s.path.includes('draft'))).toBe(false);
  });

  it('GET /billing: totals (due, paid this financial year) and bills newest first', async () => {
    const app = makeApp();
    const res = await get(app, '/portal/billing', session(A.ids.customer));
    expect(res.body.data.totals).toEqual({ due: 680, paidThisYear: 500 }); // 600 paid - 100 reversed; the failed 999 is not counted
    expect(res.body.data.bills).toEqual([
      { number: 'PAY-2026-A00001', date: day(-39), forLabel: 'Service request SR-A-0002', total: 1180, paid: 500, balance: 680, status: 'PART_PAID' },
      { number: 'PAY-2026-A00002', date: day(-345), forLabel: 'AMC AMC-A-2026', total: 7998, paid: 7998, balance: 0, status: 'PAID' },
    ]);
    expectClean(res.body, 'A');
  });

  it('GET /billing/:number: GST split, payments with reversals, masked references, UPI link only while a balance is due', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    const res = await get(app, '/portal/billing/PAY-2026-A00001', t);
    const b = res.body.data.bill;
    expect(b).toMatchObject({
      number: 'PAY-2026-A00001',
      forLabel: 'Service request SR-A-0002',
      requestNumber: 'SR-A-0002',
      contractNumber: null,
      customer: { name: 'Asha Mehta', code: 'C-A', phone: '9820000001', address: 'A Street 1, Andheri, MH, 400001' },
      total: 1180,
      taxable: 1000,
      gstRate: 18,
      gst: 180,
      paid: 500,
      balance: 680,
      status: 'PART_PAID',
    });
    expect(b.payments).toEqual([
      { date: today, method: 'ONLINE', amount: 600, referenceLast4: '8899', kind: 'PAYMENT' },
      { date: today, method: 'ONLINE', amount: -100, referenceLast4: null, kind: 'REVERSAL' },
    ]);
    expect(b.upiLink).toBe(buildUpiPayLink('PAY-2026-A00001', 680));
    expect(b.upiLink).toBe('upi://pay?pa=7977805245-1@okbizaxis&pn=Extreme%20Sales%20and%20Services&am=680.00&cu=INR&tn=Invoice%20PAY-2026-A00001');
    expect(JSON.stringify(res.body)).not.toContain('UPIREFA778899');
    expectClean(res.body, 'A');

    const paid = (await get(app, '/portal/billing/PAY-2026-A00002', t)).body.data.bill;
    expect(paid).toMatchObject({ total: 7998, taxable: 6777.97, gst: 1220.03, balance: 0, status: 'PAID', upiLink: null });
  });

  it('GST math: taxable = round(total / 1.18, 2) and gst = total - taxable for awkward totals', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    const bill = db.payments.find((p) => p.payment_number === 'PAY-2026-A00001')!;
    for (const total of [999.99, 1, 0, 12345.67]) {
      bill.total_amount_due = total;
      bill.total_amount_paid = 0;
      const b = (await get(app, '/portal/billing/PAY-2026-A00001', t)).body.data.bill;
      const taxable = Math.round((total / 1.18) * 100) / 100;
      expect(b.taxable).toBe(taxable);
      expect(b.gst).toBe(Math.round((total - taxable) * 100) / 100);
      expect(Math.round((b.taxable + b.gst) * 100) / 100).toBe(total);
      expect(b.upiLink === null).toBe(total === 0);
    }
  });

  it('business details fall back to the invoice email\'s when the website block is not published', async () => {
    const app = makeApp();
    db.site_content_blocks = [];
    const res = await get(app, '/portal/billing/PAY-2026-A00001', session(A.ids.customer));
    expect(res.body.data.business).toMatchObject({ legalName: 'Extreme Sales And Services', gstin: '27ANTPP9778J1ZO', email: 'extremess0121@gmail.com' });
  });
});

describe('S11b portal v2: requests to staff and sign-out-all', () => {
  it('POST /profile/change-request: a PROFILE_CHANGE intake for the customer; 5 a day, then 429', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    for (let i = 0; i < 5; i++) {
      const res = await post(app, '/portal/profile/change-request', t, { message: `New phone number ${i}` });
      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({ requested: true, reference: expect.stringMatching(/^ESS-/) });
    }
    const over = await post(app, '/portal/profile/change-request', t, { message: 'One more please' });
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
    expect(db.web_intakes).toHaveLength(5);
    expect(db.web_intakes[0]).toMatchObject({ kind: 'PROFILE_CHANGE', status: 'PENDING_REVIEW', customer_id: A.ids.customer, matched_customer_id: A.ids.customer, contact_email: 'a@example.com' });
    expect(db.web_intakes[0].message).toContain('New phone number 0');
    expect(db.web_intakes[0].amc_contract_id).toBeUndefined();
    // B's limit is B's own.
    expect((await post(app, '/portal/profile/change-request', session(B.ids.customer), { message: 'Change my email' })).status).toBe(201);
    // Older than a day no longer counts.
    for (const r of db.web_intakes) if (r.customer_id === A.ids.customer) r.created_at = new Date(Date.now() - 25 * 3_600_000).toISOString();
    expect((await post(app, '/portal/profile/change-request', t, { message: 'Again tomorrow' })).status).toBe(201);
  });

  it('POST /profile/change-request: the message must be 5 to 1000 characters of text', async () => {
    const app = makeApp();
    const t = session(A.ids.customer);
    for (const message of [undefined, '', '   abc  ', 'x'.repeat(1001), 12345, { a: 1 }]) {
      const res = await post(app, '/portal/profile/change-request', t, { message });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    }
    expect((await post(app, '/portal/profile/change-request', t, { message: 'x'.repeat(1000) })).status).toBe(201);
    expect(db.web_intakes).toHaveLength(1);
  });

  it('POST /sign-out-all: ends every session of this customer (the current one too), not other customers\'', async () => {
    const app = makeApp();
    const t1 = session(A.ids.customer);
    const t2 = session(A.ids.customer);
    const tb = session(B.ids.customer);
    const res = await post(app, '/portal/sign-out-all', t1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { signedOut: true } });
    for (const t of [t1, t2]) expect((await get(app, '/portal/overview', t)).status).toBe(401);
    expect((await get(app, '/portal/overview', tb)).status).toBe(200);
    expect(db.customer_portal_sessions.filter((s) => s.customer_id === A.ids.customer).every((s) => s.revoked_at)).toBe(true);
  });
});

describe('S11b portal v2: helpers', () => {
  it('photoPath keeps only paths inside the private bucket', () => {
    expect(photoPath('before-photo/2026-11-01/x/a.jpg')).toBe('before-photo/2026-11-01/x/a.jpg');
    expect(photoPath('/after-photo/a.jpg')).toBe('after-photo/a.jpg');
    expect(photoPath('https://p.supabase.co/storage/v1/object/sign/service-report-media/a/b.jpg?token=x')).toBe('a/b.jpg');
    expect(photoPath('https://elsewhere.example.com/a.jpg')).toBeNull();
    expect(photoPath('data:image/png;base64,AAAA')).toBeNull();
    expect(photoPath('a/../../secret')).toBeNull();
    expect(photoPath('')).toBeNull();
    expect(photoPath(null)).toBeNull();
  });

  it('financial year starts on 1 April', () => {
    expect(financialYearStart('2026-11-27')).toBe('2026-04-01');
    expect(financialYearStart('2027-03-31')).toBe('2026-04-01');
    expect(financialYearStart('2027-04-01')).toBe('2027-04-01');
  });
});
