import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { getSupabaseClient } from '../src/lib/supabase.js';
import { sealSecret } from '../src/utils/secretBox.js';
import { signRequest, canonicalString, computeSignature } from '../src/utils/integrationSignature.js';
import { integrationService } from '../src/services/integration.service.js';
import { catalogService, type PublicCatalog, type CatalogServiceItem, type CatalogAmcPlan } from '../src/services/catalog.service.js';
import { amcPriceFor, productPriceFor, servicePriceFor } from '../src/services/basketPricing.js';
import { createIntakeSchema } from '../src/validators/intake.validator.js';
import { hashKey } from '../src/services/essSite.service.js';
import { handleEssRevalidate } from '../src/services/notifications/essRevalidate.js';
import { buildIntakeReceiptEmail } from '../src/services/notifications/customerEmailTemplates.js';
import { basketLines } from '../src/services/notifications/customerNotifier.js';
import { env } from '../src/config/env.js';
import { PermanentOutboxError } from '../src/services/outbox.service.js';

vi.mock('../src/lib/supabase.js', () => ({ getSupabaseClient: vi.fn() }));

const KEY_ID = 'essweb_00aa11bb22cc';
const SECRET = 'stage-b-test-secret-0123456789abcdef';
const ALL_SCOPES = ['catalog:read', 'intake:write', 'track:read', 'products:read', 'content:read', 'areas:read', 'admin:access'];

/* ------------------------------------------------------------------ fake database */
type Row = Record<string, any>;
let db: Record<string, Row[]>;
let rpcCalls: Array<[string, any]>;
let rpcResults: Record<string, (args: any) => any>;
let updatedTables: string[];
let seq = 0;

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  let payload: any = null;
  let head = false;
  const rows = () => (db[table] ??= []);
  const run = async () => {
    if (op === 'insert' || op === 'upsert') {
      const items = Array.isArray(payload) ? payload : [payload];
      const out: Row[] = [];
      for (const it of items) {
        if (op === 'upsert') {
          const key = table === 'site_content_blocks' ? 'key' : table === 'service_areas' ? 'pincode_prefix' : 'id';
          const existing = rows().find((r) => r[key] === it[key]);
          if (existing) {
            Object.assign(existing, it);
            out.push(existing);
            continue;
          }
        }
        if (table === 'app_role_grants' && rows().some((r) => r.profile_id === it.profile_id && r.role === it.role && !r.revoked_at)) {
          return { data: null, error: { code: '23505', message: 'duplicate' } };
        }
        if (table === 'web_intake_items' && db.__failItems) return { data: null, error: { code: '23514', message: 'boom' } };
        const row =
          table === 'web_intakes'
            ? { id: `intake-${++seq}`, tracking_code: `ESS-AAAA-${String(seq).padStart(4, '2')}`, created_at: new Date().toISOString(), ...it }
            : { id: `${table}-${++seq}`, ...it };
        rows().push(row);
        out.push(row);
      }
      return { data: out, error: null };
    }
    const matched = rows().filter((r) => filters.every((f) => f(r)));
    if (op === 'update') {
      matched.forEach((r) => Object.assign(r, payload));
      return { data: matched, error: null };
    }
    if (op === 'delete') {
      db[table] = rows().filter((r) => !matched.includes(r));
      return { data: matched, error: null };
    }
    return { data: head ? null : matched, error: null, count: matched.length };
  };
  const b: any = {
    select: (_c?: string, o?: { head?: boolean }) => ((head = Boolean(o?.head)), b),
    insert: (p: any) => ((op = 'insert'), (payload = p), b),
    upsert: (p: any) => ((op = 'upsert'), (payload = p), b),
    update: (p: any) => ((op = 'update'), (payload = p), updatedTables.push(table), b),
    delete: () => ((op = 'delete'), b),
    eq: (c: string, v: any) => {
      if (c.includes('.')) return b; // embedded filters (e.g. integration_clients.client_code) ignored
      filters.push((r) => r[c] === v);
      return b;
    },
    neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), b),
    gte: (c: string, v: any) => (filters.push((r) => r[c] >= v), b),
    is: (c: string, v: any) => (filters.push((r) => (r[c] ?? null) === v), b),
    in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(r[c])), b),
    // PostgREST-like: `%`/`*` any run, `_` one character, backslash escapes (so unescaped input is caught).
    ilike: (c: string, v: string) => {
      const lit = (ch: string) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let src = '';
      for (let i = 0; i < v.length; i++) {
        const ch = v[i];
        if (ch === '\\' && i + 1 < v.length) src += lit(v[++i]);
        else if (ch === '%' || ch === '*') src += '.*';
        else if (ch === '_') src += '.';
        else src += lit(ch);
      }
      const re = new RegExp(`^${src}$`, 'is');
      filters.push((r) => re.test(String(r[c] ?? '')));
      return b;
    },
    or: () => b,
    order: () => b,
    limit: () => b,
    range: () => b,
    maybeSingle: async () => {
      const r = await run();
      return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error };
    },
    single: async () => b.maybeSingle(),
    then: (res: any, rej: any) => run().then(res, rej),
  };
  return b;
}

const ESS_SELLER = {
  seller_code: 'ESS', legal_name: 'Extreme Sales & Services', trade_name: 'Extreme Sales & Services', gstin: '27ANTPP9778J1ZO',
  address: 'Chembur, Mumbai', phone: '+91 7977805245', email: 'extremess0121@gmail.com', grievance_officer_name: null,
  grievance_officer_email: 'extremess0121@gmail.com', grievance_officer_phone: null, return_policy: null, is_first_party: true, status: 'ACTIVE',
};

function installDb() {
  seq = 0;
  db = {
    integration_client_keys: [
      {
        id: 'key-row-1', key_id: KEY_ID, secret_ciphertext: sealSecret(SECRET), status: 'ACTIVE', expires_at: null,
        integration_clients: { id: 'client-1', client_code: 'ESS_WEB', scopes: ALL_SCOPES, is_active: true },
      },
    ],
    integration_request_nonces: [],
    idempotency_records: [],
    web_intakes: [],
    web_intake_items: [],
    activity_logs: [],
    sellers: [{ id: 'seller-ess', ...ESS_SELLER }],
    ess_products: [
      { id: 'lg-15', name: 'LG 1.5T Split', category: 'new_ac', price: 42000, mrp: 52000, in_stock: true, is_published: true, seller_id: 'seller-ess', display_order: 1, seller: ESS_SELLER },
      { id: 'hidden', name: 'Hidden AC', category: 'new_ac', price: 30000, in_stock: true, is_published: false, seller_id: 'seller-ess', seller: ESS_SELLER },
      { id: 'suspended', name: 'Suspended seller AC', category: 'new_ac', price: 30000, in_stock: true, is_published: true, seller_id: 's2', seller: { ...ESS_SELLER, seller_code: 'X', status: 'SUSPENDED' } },
    ],
    site_content_blocks: [
      { key: 'home.hero', draft_body: { headline: 'Draft' }, published_body: { headline: 'Live' }, published_version: 3, published_at: '2026-11-19T00:00:00Z' },
      { key: 'faq', draft_body: { items: [] }, published_body: null, published_version: 0 },
      { key: 'business.identity', draft_body: {}, published_body: {}, published_version: 1 },
    ],
    site_content_versions: [],
    service_areas: [
      { pincode_prefix: '400', label: 'Mumbai, Thane & Navi Mumbai', is_active: true },
      { pincode_prefix: '400099', label: 'Airport (not served)', is_active: false },
    ],
    tracking_lookup_failures: [],
    service_schedules: [],
    technicians: [{ id: 'tech-1', name: 'Ramesh Kumar Yadav' }],
    profiles: [
      { id: 'admin-user', full_name: 'Owner', email: 'owner@ess.test' },
      { id: 'ess-staff-user', full_name: 'Shop Staff', email: 'shop@ess.test' },
      { id: 'nobody-user', full_name: 'Nobody', email: 'nobody@ess.test' },
    ],
    staff: [{ id: 'staff-1', profile_id: 'admin-user', role: 'ADMIN', is_active: true }],
    app_role_grants: [{ id: '0f5c3b8e-1d2a-4c6e-9b7a-3e2d1c0b9a88', profile_id: 'ess-staff-user', role: 'ESS_STAFF', revoked_at: null }],
    service_catalog_items: [{ code: 'SVC-DRY', is_public: true, display_order: 1 }],
    amc_plans: [],
  };
  rpcCalls = [];
  updatedTables = [];
  rpcResults = {
    generate_business_numbers: () => ({ data: ['WEB-2026-000009'], error: null }),
    record_tracking_failure: () => ({ data: null, error: null }),
    publish_site_content: (a) => ({ data: { key: a.p_key, version: 4 }, error: null }),
    // Stand-in for public.ess_update_catalog_display: same matching rules, all or nothing.
    ess_update_catalog_display: ({ p_items }) => {
      const before = structuredClone({ services: db.service_catalog_items, plans: db.amc_plans });
      for (const it of p_items) {
        const rows =
          it.type === 'SERVICE'
            ? db.service_catalog_items.filter((r) => r.code === it.code)
            : db.amc_plans.filter((r) => r.public_code === it.code || r.plan_code === it.code);
        if (rows.length === 0) {
          db.service_catalog_items = before.services;
          db.amc_plans = before.plans;
          return { data: null, error: { code: 'P0002', message: `${it.type === 'SERVICE' ? 'Service' : 'AMC plan'} ${it.code} not found` } };
        }
        for (const r of rows) {
          if (it.isPublic !== undefined) r.is_public = it.isPublic;
          if (it.displayOrder !== undefined) r.display_order = it.displayOrder;
        }
      }
      return { data: null, error: null };
    },
  };
  const tokens: Record<string, string> = { 'admin-token': 'admin-user', 'staff-token': 'ess-staff-user', 'nobody-token': 'nobody-user' };
  vi.mocked(getSupabaseClient).mockReturnValue({
    from: (t: string) => query(t),
    rpc: async (name: string, args: any) => {
      rpcCalls.push([name, args]);
      return rpcResults[name]?.(args) ?? { data: null, error: null };
    },
    auth: {
      getUser: async (token: string) =>
        tokens[token]
          ? { data: { user: { id: tokens[token], email: `${tokens[token]}@x` } }, error: null }
          : { data: { user: null }, error: { message: 'bad token' } },
      admin: {
        createUser: async ({ email }: { email: string }) => ({ data: { user: { id: `new-${email}` } }, error: null }),
      },
    },
  } as any);
}

/* ------------------------------------------------------------------ catalog fixture */
const svc = (over: Partial<CatalogServiceItem>): CatalogServiceItem => ({
  code: 'SVC-JET-WASH', name: 'Jet wash', shortDescription: null, includes: [], excludes: [], category: 'CLEANING',
  requestType: 'GENERAL_SERVICE', serviceType: 'GENERAL_SERVICE', pricingModel: 'FIXED',
  price: { base: 1015.25, gstRatePercent: 18, gst: 182.75, total: 1198 }, priceMatrix: [], sacCode: '9987',
  durationMinutes: 60, warrantyDays: 30, appliesToAcTypes: [], formSchema: null, legacyCodes: [], isPublic: true, isActive: true,
  displayOrder: 1, ...over,
});
const plan: CatalogAmcPlan = {
  code: 'ORD-4', planCode: 'ORD-4', name: 'Ordinary 4 services', category: 'ORDINARY', description: null, coverageSummary: null,
  visitsPerYear: 4, frequency: 'QUARTERLY', appliesToAcTypes: ['SPLIT', 'WINDOW'], maxEquipmentAgeYears: null, hasGasCharging: false,
  hasSpareParts: false, hasUnlimitedComplaints: true, pricingModel: 'RATE_CARD',
  rates: {
    splitSmall: { base: 1800, gstRatePercent: 0, gst: 0, total: 1800 },
    splitLarge: { base: 2000, gstRatePercent: 0, gst: 0, total: 2000 },
    windowSmall: { base: 1300, gstRatePercent: 0, gst: 0, total: 1300 },
    windowLarge: null,
    flat: null,
  },
  sacCode: null, legacyCodes: [],
};
const catalog: PublicCatalog = {
  version: 5, generatedAt: '2026-11-19T00:00:00Z', currency: 'INR',
  services: [
    svc({}),
    svc({
      code: 'SVC-GAS', name: 'Gas charging', pricingModel: 'FROM', price: { base: 1568, gstRatePercent: 18, gst: 282.24, total: 1850.24 },
      priceMatrix: [{ acType: 'SPLIT', tonnageMin: 1.5, tonnageMax: 2.0, base: 2000, gstRatePercent: 18, gst: 360, total: 2360 }],
    }),
    svc({ code: 'SVC-PCB', name: 'PCB repair', pricingModel: 'QUOTE_AFTER_DIAGNOSIS', price: null }),
  ],
  amcPlans: [plan],
};

/* ------------------------------------------------------------------ helpers */
let counter = 0;
function signed(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, body?: unknown, extra: Record<string, string> = {}) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const headers = signRequest({ keyId: KEY_ID, secret: SECRET, method: method.toUpperCase(), pathWithQuery: path, body: raw });
  let r = (request(app) as any)[method](path).set(headers);
  for (const [k, v] of Object.entries(extra)) r = r.set(k, v);
  if (body !== undefined) r = r.set('Content-Type', 'application/json').send(raw);
  return r;
}
const asActor = (token: string) => ({ 'X-PYS-Actor-Token': token });

const basketBody = (items: unknown[], over: Record<string, unknown> = {}) => ({
  kind: 'BASKET',
  externalReferenceId: `basket-${++counter}`,
  contact: { name: 'Priya Shah', phone: '+91 98200 11122', email: 'priya@example.com' },
  address: { line: '12 Palm Road', city: 'Mumbai', pincode: '400071' },
  consent: { privacy: true },
  items,
  ...over,
});

beforeEach(() => {
  installDb();
  integrationService.clearCache();
  catalogService.clearCache();
  vi.spyOn(catalogService, 'getPublicCatalog').mockResolvedValue(catalog);
});
afterEach(() => vi.restoreAllMocks());

/* ================================================================== pricing */
describe('basket pricing', () => {
  it('uses the matching price-matrix row, else the base price; quote-only services have no price', () => {
    const gas = catalog.services[1];
    expect(servicePriceFor(gas, { type: 'SPLIT', tonnage: 1.5 })).toMatchObject({ total: 2360, label: 'Gas charging (split, 1.5 ton)' });
    expect(servicePriceFor(gas, { type: 'WINDOW', tonnage: 1.5 })).toMatchObject({ total: 1850.24, label: 'Gas charging (from)' });
    expect(servicePriceFor(catalog.services[0])).toMatchObject({ total: 1198, label: 'Jet wash' });
    expect(servicePriceFor(catalog.services[2], { type: 'SPLIT', tonnage: 1.5 })).toBeNull();
  });

  it('AMC uses the rate card by AC type and size; outside the card it is priced after inspection', () => {
    expect(amcPriceFor(plan, { type: 'SPLIT', tonnage: 1 })?.total).toBe(1800);
    expect(amcPriceFor(plan, { type: 'SPLIT', tonnage: 2 })?.total).toBe(2000);
    expect(amcPriceFor(plan, { type: 'WINDOW', tonnage: 0.75 })?.total).toBe(1300);
    expect(amcPriceFor(plan, { type: 'WINDOW', tonnage: 2 })).toBeNull(); // no window-large rate
    expect(amcPriceFor(plan, { type: 'SPLIT', tonnage: 3 })).toBeNull(); // > 2.2 ton
    expect(amcPriceFor(plan, { type: 'CASSETTE', tonnage: 2 })).toBeNull();
    expect(amcPriceFor(plan)).toBeNull();
    expect(amcPriceFor({ ...plan, rates: { ...plan.rates, flat: { base: 999, gstRatePercent: 0, gst: 0, total: 999 } } })?.total).toBe(999);
  });

  it('products keep only their GST-inclusive listed price', () => {
    expect(productPriceFor('LG', 42000)).toEqual({ total: 42000, label: 'LG (listed price incl. GST)' });
    expect(productPriceFor('LG', 0)).toBeNull();
    expect(productPriceFor('LG', null)).toBeNull();
  });
});

/* ================================================================== validation */
describe('basket validation', () => {
  const base = { contact: { name: 'Priya', phone: '9820011122' }, consent: { privacy: true } };
  it('a basket needs items; other kinds may not carry items', () => {
    expect(createIntakeSchema.safeParse({ ...base, kind: 'BASKET' }).success).toBe(false);
    const r = createIntakeSchema.safeParse({ ...base, kind: 'CONTACT', items: [{ type: 'PRODUCT', productId: 'lg-15' }] });
    expect(r.success).toBe(false);
  });

  it('address is required only when the basket includes a visit', () => {
    expect(createIntakeSchema.safeParse({ ...base, kind: 'BASKET', items: [{ type: 'PRODUCT', productId: 'lg-15' }] }).success).toBe(true);
    const r = createIntakeSchema.safeParse({ ...base, kind: 'BASKET', items: [{ type: 'SERVICE', serviceCode: 'svc-dry' }] });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join('.'))).toContain('address');
  });

  it('each line names exactly the reference its type needs', () => {
    const bad = createIntakeSchema.safeParse({
      ...base, kind: 'BASKET', items: [{ type: 'PRODUCT', productId: 'x', serviceCode: 'SVC-DRY' }, { type: 'AMC' }],
    });
    expect(bad.success).toBe(false);
    const paths = bad.error!.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['items.0.serviceCode', 'items.1.amcPlanCode']));
  });

  it('a dealer-interest request needs no address', () => {
    expect(createIntakeSchema.safeParse({ ...base, kind: 'SELLER_INTEREST', request: { message: 'We sell Daikin' } }).success).toBe(true);
  });
});

/* ================================================================== baskets via the API */
describe('POST /api/v1/ess/intakes (basket)', () => {
  const post = (body: unknown) => signed('post', '/api/v1/ess/intakes', body, { 'Idempotency-Key': `idem-${++counter}-abcdefgh` });

  it('stores the basket and one line per item with the price the customer saw', async () => {
    const res = await post(
      basketBody([
        { type: 'SERVICE', serviceCode: 'SVC-GAS', quantity: 2, ac: { type: 'SPLIT', tonnage: 1.5 } },
        { type: 'AMC', amcPlanCode: 'ord-4', ac: { type: 'SPLIT', tonnage: 1 } },
        { type: 'PRODUCT', productId: 'lg-15' },
      ])
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ intakeNumber: 'WEB-2026-000009', status: 'PENDING_REVIEW' });
    expect(db.web_intakes).toHaveLength(1);
    expect(db.web_intakes[0]).toMatchObject({ kind: 'BASKET', contact_phone: '9820011122' });
    const lines = db.web_intake_items;
    expect(lines.map((l) => [l.line_no, l.item_type, l.item_name, l.quantity])).toEqual([
      [1, 'SERVICE', 'Gas charging', 2],
      [2, 'AMC', 'Ordinary 4 services', 1],
      [3, 'PRODUCT', 'LG 1.5T Split', 1],
    ]);
    expect(lines.every((l) => l.intake_id === db.web_intakes[0].id)).toBe(true);
    expect(lines[0].price_snapshot.total).toBe(2360);
    expect(lines[1]).toMatchObject({ amc_plan_code: 'ORD-4', price_snapshot: expect.objectContaining({ total: 1800 }) });
    expect(lines[2]).toMatchObject({ product_id: 'lg-15', seller_id: 'seller-ess', price_snapshot: { total: 42000, label: expect.any(String) } });
  });

  it('rejects unknown or withdrawn items with the line path and stores nothing', async () => {
    const res = await post(
      basketBody([
        { type: 'SERVICE', serviceCode: 'SVC-NOPE' },
        { type: 'AMC', amcPlanCode: 'NOPE' },
        { type: 'PRODUCT', productId: 'hidden' },
        { type: 'PRODUCT', productId: 'suspended' },
      ])
    );
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: any) => d.field)).toEqual([
      'items.0.serviceCode', 'items.1.amcPlanCode', 'items.2.productId', 'items.3.productId',
    ]);
    expect(db.web_intakes).toHaveLength(0);
  });

  it('removes the request again if its lines cannot be stored', async () => {
    db.__failItems = [] as any;
    const res = await post(basketBody([{ type: 'PRODUCT', productId: 'lg-15' }]));
    expect(res.status).toBe(500);
    expect(db.web_intakes).toHaveLength(0);
  });
});

/* ================================================================== public reads */
describe('ESS website reads', () => {
  it('requires a signed request', async () => {
    expect((await request(app).get('/api/v1/ess/products')).status).toBe(401);
  });

  it('lists only published products of active sellers, with the seller disclosure', async () => {
    const res = await signed('get', '/api/v1/ess/products');
    expect(res.status).toBe(200);
    expect(res.body.data.products.map((p: any) => p.id)).toEqual(['lg-15']);
    expect(res.body.data.products[0]).toMatchObject({
      price: 42000, mrp: 52000,
      seller: { code: 'ESS', legalName: 'Extreme Sales & Services', gstin: '27ANTPP9778J1ZO', isFirstParty: true },
    });
    expect((await signed('get', '/api/v1/ess/products/hidden')).status).toBe(404);
    expect((await signed('get', '/api/v1/ess/products/lg-15')).body.data.name).toBe('LG 1.5T Split');
  });

  it('returns published content only (never drafts) and validates keys', async () => {
    const res = await signed('get', '/api/v1/ess/content?keys=home.hero,faq,missing.key');
    expect(res.status).toBe(200);
    expect(res.body.data.blocks).toEqual({ 'home.hero': { version: 3, body: { headline: 'Live' }, publishedAt: '2026-11-19T00:00:00Z' } });
    expect((await signed('get', '/api/v1/ess/content?keys=Bad_Key')).status).toBe(422);
  });

  it('answers whether a pincode is served (longest prefix wins)', async () => {
    expect((await signed('get', '/api/v1/ess/serviceability/400071')).body.data).toEqual({
      pincode: '400071', serviceable: true, area: 'Mumbai, Thane & Navi Mumbai',
    });
    expect((await signed('get', '/api/v1/ess/serviceability/400099')).body.data.serviceable).toBe(false);
    expect((await signed('get', '/api/v1/ess/serviceability/560001')).body.data.serviceable).toBe(false);
    expect((await signed('get', '/api/v1/ess/serviceability/12')).status).toBe(422);
  });
});

/* ================================================================== tracking */
describe('POST /api/v1/ess/track', () => {
  const CODE = 'ESS-ABCD-EFGH';
  beforeEach(() => {
    db.web_intakes.push({
      id: 'intake-t', intake_number: 'WEB-2026-000001', tracking_code: CODE, kind: 'BASKET', status: 'PENDING_REVIEW',
      phone_normalized: '9820011122', area: 'Chembur', city: 'Mumbai', preferred_date: '2026-11-25', preferred_slot: 'MORNING',
      created_at: '2026-11-19T05:00:00Z', service_request_id: null,
      items: [
        { line_no: 2, item_type: 'PRODUCT', item_name: 'LG 1.5T Split', quantity: 1, line_status: 'PENDING', price_snapshot: { total: 42000, label: 'x' } },
        { line_no: 1, item_type: 'SERVICE', item_name: 'Jet wash', quantity: 2, line_status: 'PENDING', price_snapshot: null },
      ],
      sr: null,
    });
  });
  const track = (code: string, phone: string, clientIpHash?: string) =>
    signed('post', '/api/v1/ess/track', { code, phone, ...(clientIpHash ? { clientIpHash } : {}) });

  it('a wrong phone or code gives the same answer and counts towards the lockout', async () => {
    const a = await track(CODE, '9820000000', 'iphash-123456');
    const b = await track('ESS-ZZZZ-ZZZZ', '9820011122');
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(a.body.error.message).toBe(b.body.error.message);
    const keys = rpcCalls.filter(([n]) => n === 'record_tracking_failure').map(([, a2]) => a2.p_key_hash);
    expect(keys).toEqual([hashKey('code', CODE), hashKey('ip', 'iphash-123456'), hashKey('code', 'ESS-ZZZZ-ZZZZ')]);
  });

  it('locked codes answer 429 without looking the request up', async () => {
    db.tracking_lookup_failures.push({ key_hash: hashKey('code', CODE), failures: 10, locked_until: new Date(Date.now() + 60_000).toISOString() });
    const res = await track(CODE, '9820011122');
    expect(res.status).toBe(429);
  });

  it('shows a pending basket with its lines in order', async () => {
    const res = await track(CODE.toLowerCase(), '+91 98200 11122');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      trackingCode: CODE, status: { code: 'RECEIVED', step: 1 }, requestNumber: null, area: 'Chembur, Mumbai', visit: null,
      preferred: { date: '2026-11-25', slot: 'MORNING' },
    });
    expect(res.body.data.steps).toHaveLength(6);
    expect(res.body.data.items.map((i: any) => [i.name, i.status])).toEqual([['Jet wash', 'PENDING'], ['LG 1.5T Split', 'PENDING']]);
    expect(JSON.stringify(res.body.data)).not.toMatch(/9820011122|address/);
  });

  it('after approval follows the job and shows only the technician first name', async () => {
    Object.assign(db.web_intakes[0], { status: 'APPROVED', sr: { id: 'sr-1', request_number: 'SR-2026-958880', status: 'SCHEDULED' } });
    db.web_intakes[0].items[0].line_status = 'QUOTE_PENDING';
    db.service_schedules.push({ service_request_id: 'sr-1', status: 'SCHEDULED', scheduled_date: '2026-11-26', start_time: '09:00:00', end_time: '12:00:00', technician_id: 'tech-1' });
    const res = await track(CODE, '9820011122');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      requestNumber: 'SR-2026-958880', status: { code: 'TECHNICIAN_ASSIGNED' },
      visit: { date: '2026-11-26', startTime: '09:00', endTime: '12:00', technicianFirstName: 'Ramesh' },
    });
    expect(JSON.stringify(res.body.data)).not.toContain('Yadav');
    expect(res.body.data.items.find((i: any) => i.name === 'LG 1.5T Split').status).toBe('SELLER_WILL_QUOTE');
  });
});

/* ================================================================== ESS admin */
describe('ESS admin area', () => {
  it('needs both the signed ESS request and a signed-in person with an ESS role', async () => {
    expect((await request(app).get('/api/v1/ess/admin/me').set(asActor('admin-token'))).status).toBe(401);
    expect((await signed('get', '/api/v1/ess/admin/me')).status).toBe(401);
    expect((await signed('get', '/api/v1/ess/admin/me', undefined, asActor('bad-token'))).status).toBe(401);
    expect((await signed('get', '/api/v1/ess/admin/me', undefined, asActor('nobody-token'))).status).toBe(403);
  });

  it('PYS Admin is ESS Admin; ESS Staff keeps the staff role', async () => {
    expect((await signed('get', '/api/v1/ess/admin/me', undefined, asActor('admin-token'))).body.data).toMatchObject({
      roles: ['ESS_ADMIN'], isPysAdmin: true,
    });
    expect((await signed('get', '/api/v1/ess/admin/me', undefined, asActor('staff-token'))).body.data.roles).toEqual(['ESS_STAFF']);
  });

  it('staff edit drafts; only admins publish or touch business details', async () => {
    const draft = await signed('put', '/api/v1/ess/admin/content/home.hero', { body: { headline: 'Cool Mumbai' } }, asActor('staff-token'));
    expect(draft.status).toBe(200);
    expect(db.site_content_blocks.find((b) => b.key === 'home.hero')!.draft_body).toEqual({ headline: 'Cool Mumbai' });
    expect(db.site_content_blocks.find((b) => b.key === 'home.hero')!.published_body).toEqual({ headline: 'Live' });

    expect((await signed('post', '/api/v1/ess/admin/content/home.hero/publish', undefined, asActor('staff-token'))).status).toBe(403);
    expect(
      (await signed('put', '/api/v1/ess/admin/content/business.identity', { body: { legalName: 'X' } }, asActor('staff-token'))).status
    ).toBe(403);

    const pub = await signed('post', '/api/v1/ess/admin/content/home.hero/publish', undefined, asActor('admin-token'));
    expect(pub.status).toBe(200);
    expect(rpcCalls).toContainEqual(['publish_site_content', { p_key: 'home.hero', p_actor: 'admin-user' }]);
  });

  it('business details must have the full, valid shape', async () => {
    const res = await signed('put', '/api/v1/ess/admin/content/business.identity', { body: { legalName: 'X', gstin: 'bad' } }, asActor('admin-token'));
    expect(res.status).toBe(422);
    const fields = res.body.error.details.map((d: any) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['body.gstin', 'body.address', 'body.email']));
  });

  it('staff add products for ESS; price above MRP is refused', async () => {
    const bad = await signed('post', '/api/v1/ess/admin/products', { name: 'Voltas 1T', price: 40000, mrp: 35000 }, asActor('staff-token'));
    expect(bad.status).toBe(422);
    const ok = await signed('post', '/api/v1/ess/admin/products', { name: 'Voltas 1T Window', price: 28000, mrp: 33000, stock: 2 }, asActor('staff-token'));
    expect(ok.status).toBe(201);
    const row = db.ess_products.at(-1)!;
    expect(row).toMatchObject({ name: 'Voltas 1T Window', seller_id: 'seller-ess', in_stock: true, price_display: '₹28,000' });
    expect(row.id).toMatch(/^voltas-1t-window-[0-9a-f]{6}$/);

    const patch = await signed('patch', '/api/v1/ess/admin/products/lg-15', { price: 60000 }, asActor('staff-token'));
    expect(patch.status).toBe(422); // above the stored MRP
  });

  it('only admins change service areas and what the website shows; codes are strict', async () => {
    const area = { pincodePrefix: '4102', label: 'Panvel', isActive: true };
    expect((await signed('put', '/api/v1/ess/admin/service-areas', area, asActor('staff-token'))).status).toBe(403);
    const ok = await signed('put', '/api/v1/ess/admin/service-areas', area, asActor('admin-token'));
    expect(ok.status).toBe(200);
    expect(ok.body.data.areas.map((a: any) => a.pincodePrefix)).toContain('4102');

    const injection = await signed(
      'patch', '/api/v1/ess/admin/catalog-display', { items: [{ type: 'AMC', code: 'x,plan_code.neq.0', isPublic: false }] }, asActor('admin-token')
    );
    expect(injection.status).toBe(422);
    const display = await signed('patch', '/api/v1/ess/admin/catalog-display', { items: [{ type: 'SERVICE', code: 'SVC-DRY', isPublic: false }] }, asActor('admin-token'));
    expect(display.status).toBe(200);
    expect(db.service_catalog_items[0].is_public).toBe(false);
  });

  describe('what the website shows is saved all or nothing', () => {
    const PATH = '/api/v1/ess/admin/catalog-display';
    const saveCalls = () => rpcCalls.filter(([n]) => n === 'ess_update_catalog_display');
    const displayLogs = () => db.activity_logs.filter((l) => l.action === 'ESS_CATALOG_DISPLAY_UPDATED');
    beforeEach(() => {
      db.amc_plans = [
        { id: 'plan-1', public_code: 'SAMC-1', plan_code: 'SEMI-COMP-SPLIT', name: 'Semi AMC', is_public: true, is_active: true, display_order: 10 },
        { id: 'plan-2', public_code: null, plan_code: 'ORD-4', name: 'Ordinary', is_public: false, is_active: true, display_order: 20 },
      ];
    });

    it('saves in one database step, logs it, re-checks the catalogue and returns the list', async () => {
      const stale = vi.spyOn(catalogService, 'markStale');
      const items = [
        { type: 'SERVICE', code: 'SVC-DRY', isPublic: false, displayOrder: 5 },
        { type: 'AMC', code: 'SAMC-1', displayOrder: 2 },
        { type: 'AMC', code: 'ORD-4', isPublic: true },
        { type: 'SERVICE', code: 'SVC-DRY' }, // nothing to change: skipped
      ];
      const res = await signed('patch', PATH, { items }, asActor('admin-token'));
      expect(res.status).toBe(200);
      expect(saveCalls()).toEqual([
        ['ess_update_catalog_display', { p_items: items.slice(0, 3) }],
      ]);
      expect(updatedTables).not.toContain('service_catalog_items'); // no row-by-row writes any more
      expect(updatedTables).not.toContain('amc_plans');
      expect(stale).toHaveBeenCalledTimes(1);
      expect(displayLogs()).toHaveLength(1);
      expect(displayLogs()[0]).toMatchObject({ actor_profile_id: 'admin-user', entity_type: 'CATALOG', details: { items } });
      expect(res.body.data.services.map((s: any) => [s.code, s.isPublic, s.displayOrder])).toEqual([['SVC-DRY', false, 5]]);
      expect(res.body.data.amcPlans.map((p: any) => [p.code, p.isPublic, p.displayOrder])).toEqual([
        ['SAMC-1', true, 2],
        ['ORD-4', true, 20],
      ]);
    });

    it('an unknown code changes nothing: 404 with the same message, no activity log, catalogue still re-checked', async () => {
      const stale = vi.spyOn(catalogService, 'markStale');
      const res = await signed(
        'patch', PATH,
        { items: [{ type: 'SERVICE', code: 'SVC-DRY', isPublic: false }, { type: 'AMC', code: 'GONE-1', isPublic: false }] },
        asActor('admin-token')
      );
      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe('AMC plan GONE-1 not found');
      expect(saveCalls()).toHaveLength(1);
      expect(db.service_catalog_items[0].is_public).toBe(true); // the valid row was not saved either
      expect(displayLogs()).toHaveLength(0);
      expect(stale).toHaveBeenCalledTimes(1);

      const svc404 = await signed('patch', PATH, { items: [{ type: 'SERVICE', code: 'SVC-GONE', displayOrder: 1 }] }, asActor('admin-token'));
      expect(svc404.status).toBe(404);
      expect(svc404.body.error.message).toBe('Service SVC-GONE not found');
    });

    it('a database failure keeps today\'s answers and the catalogue is still re-checked', async () => {
      const stale = vi.spyOn(catalogService, 'markStale');
      const body = { items: [{ type: 'SERVICE', code: 'SVC-DRY', isPublic: false }] };

      rpcResults.ess_update_catalog_display = () => ({ data: null, error: { code: '23514', message: 'check violation' } });
      const bad = await signed('patch', PATH, body, asActor('admin-token'));
      expect(bad.status).toBe(400);
      expect(bad.body.error.message).toBe('Could not update what the website shows: some values are not valid');

      rpcResults.ess_update_catalog_display = () => ({ data: null, error: { code: 'XX000', message: 'connection lost' } });
      const down = await signed('patch', PATH, body, asActor('admin-token'));
      expect(down.status).toBe(500);
      expect(down.body.error.message).toBe('Failed to update what the website shows: connection lost');

      expect(stale).toHaveBeenCalledTimes(2);
      expect(displayLogs()).toHaveLength(0);
    });

    it('skips the database call when no item has anything to change', async () => {
      const stale = vi.spyOn(catalogService, 'markStale');
      const res = await signed('patch', PATH, { items: [{ type: 'AMC', code: 'SAMC-1' }] }, asActor('admin-token'));
      expect(res.status).toBe(200);
      expect(saveCalls()).toHaveLength(0);
      expect(stale).toHaveBeenCalledTimes(1);
      expect(displayLogs()).toHaveLength(1); // as before: the request itself is recorded
    });

    it('ESS Staff are still refused and nothing is called', async () => {
      const res = await signed('patch', PATH, { items: [{ type: 'SERVICE', code: 'SVC-DRY', isPublic: false }] }, asActor('staff-token'));
      expect(res.status).toBe(403);
      expect(saveCalls()).toHaveLength(0);
      expect(db.service_catalog_items[0].is_public).toBe(true);
    });
  });

  it('admins give roles (new accounts get a one-time password) and cannot remove their own admin role', async () => {
    const res = await signed('post', '/api/v1/ess/admin/users', { email: 'New.Person@ESS.test', role: 'ESS_STAFF', fullName: 'New Person' }, asActor('admin-token'));
    expect(res.status).toBe(201);
    expect(res.body.data.temporaryPassword).toMatch(/.{12,}/);
    expect(db.app_role_grants.at(-1)).toMatchObject({ profile_id: 'new-new.person@ess.test', role: 'ESS_STAFF', granted_by: 'admin-user' });

    const again = await signed('post', '/api/v1/ess/admin/users', { email: 'shop@ess.test', role: 'ESS_STAFF' }, asActor('admin-token'));
    expect(again.status).toBe(409);

    // An email with `_` or `%` must not match (and give a role to) someone else's account.
    for (const email of ['sho_@ess.test', 'ow_er@ess.test']) {
      const wild = await signed('post', '/api/v1/ess/admin/users', { email, role: 'ESS_ADMIN' }, asActor('admin-token'));
      expect(wild.status).toBe(201);
      expect(db.app_role_grants.at(-1)!.profile_id).toBe(`new-${email}`);
    }
    expect(db.app_role_grants.some((g) => g.profile_id === 'ess-staff-user' && g.role === 'ESS_ADMIN')).toBe(false);

    db.app_role_grants.push({ id: '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d', profile_id: 'ess-staff-user', role: 'ESS_ADMIN', revoked_at: null });
    const self = await signed('delete', '/api/v1/ess/admin/users/1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d', undefined, asActor('staff-token'));
    expect(self.status).toBe(400);
  });
});

/* ================================================================== emails + revalidate */
describe('receipt email and website refresh', () => {
  it('lists basket items and treats dealer interest like a message', () => {
    const lines = basketLines({ items: [{ line_no: 2, item_name: 'LG 1.5T', quantity: 1 }, { line_no: 1, item_name: 'Jet wash', quantity: 2 }] });
    expect(lines).toEqual(['Jet wash x2', 'LG 1.5T']);
    const basket = buildIntakeReceiptEmail({ contactName: 'Priya', intakeNumber: 'WEB-1', trackingCode: 'ESS-AAAA-BBBB', kind: 'BASKET', items: lines });
    expect(basket.text).toContain('Jet wash x2, LG 1.5T');
    const dealer = buildIntakeReceiptEmail({ contactName: 'Raj', intakeNumber: 'WEB-2', trackingCode: 'ESS-AAAA-CCCC', kind: 'SELLER_INTEREST' });
    expect(dealer.subject).toContain('We received your message');
  });

  describe('ESS_REVALIDATE handler', () => {
    const event = (over: Record<string, unknown> = {}) =>
      ({ id: 'evt-1', event_type: 'ESS_REVALIDATE', payload: { topic: 'catalog' }, created_at: new Date().toISOString(), ...over }) as any;
    let saved: string | undefined;
    beforeEach(() => {
      saved = env.ESS_REVALIDATE_URL;
    });
    afterEach(() => {
      (env as any).ESS_REVALIDATE_URL = saved;
    });

    it('is skipped until the new site has a refresh address, and for stale events', async () => {
      (env as any).ESS_REVALIDATE_URL = undefined;
      expect(await handleEssRevalidate(event(), vi.fn())).toBe('SKIPPED');
      (env as any).ESS_REVALIDATE_URL = 'https://ess.example/api/revalidate';
      expect(await handleEssRevalidate(event({ created_at: '2020-01-01T00:00:00Z' }), vi.fn())).toBe('SKIPPED');
    });

    it('posts a request ESS can verify with its own key', async () => {
      (env as any).ESS_REVALIDATE_URL = 'https://ess.example/api/revalidate?x=1';
      const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
      expect(await handleEssRevalidate(event(), fetchImpl as any)).toBe('DONE');
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://ess.example/api/revalidate?x=1');
      const h = init.headers as Record<string, string>;
      expect(h['X-PYS-Key-Id']).toBe(KEY_ID);
      const expected = computeSignature(
        SECRET,
        canonicalString({ timestamp: h['X-PYS-Timestamp'], nonce: h['X-PYS-Nonce'], method: 'POST', pathWithQuery: '/api/revalidate?x=1', body: init.body as string })
      );
      expect(h['X-PYS-Signature']).toBe(expected);
    });

    it('a refused refresh is not retried; a server error is', async () => {
      (env as any).ESS_REVALIDATE_URL = 'https://ess.example/api/revalidate';
      await expect(handleEssRevalidate(event(), (async () => new Response('', { status: 401 })) as any)).rejects.toBeInstanceOf(PermanentOutboxError);
      await expect(handleEssRevalidate(event(), (async () => new Response('', { status: 503 })) as any)).rejects.not.toBeInstanceOf(PermanentOutboxError);
      await expect(handleEssRevalidate(event({ payload: {} }), vi.fn() as any)).rejects.toBeInstanceOf(PermanentOutboxError);
    });
  });
});

/* ================================================================== AC enquiries (plan 3) */
describe('AC enquiry with several ACs', () => {
  const base = { contact: { name: 'Priya', phone: '9820011122' }, consent: { privacy: true } };
  const enquiryBody = (items: unknown[], over: Record<string, unknown> = {}) => ({
    kind: 'PRODUCT_ENQUIRY',
    externalReferenceId: `enq-${++counter}`,
    contact: { name: 'Priya Shah', phone: '+91 98200 11122' },
    consent: { privacy: true },
    items,
    ...over,
  });

  it('an enquiry may carry up to 10 AC lines, and only ACs', () => {
    expect(createIntakeSchema.safeParse({ ...base, kind: 'PRODUCT_ENQUIRY', items: [{ type: 'PRODUCT', productId: 'lg-15', notes: 'Installation needed' }] }).success).toBe(true);
    expect(createIntakeSchema.safeParse({ ...base, kind: 'PRODUCT_ENQUIRY' }).success).toBe(true);
    expect(createIntakeSchema.safeParse({ ...base, kind: 'PRODUCT_ENQUIRY', items: [{ type: 'SERVICE', serviceCode: 'SVC-DRY' }] }).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ type: 'PRODUCT', productId: `p-${i}` }));
    expect(createIntakeSchema.safeParse({ ...base, kind: 'PRODUCT_ENQUIRY', items: eleven }).success).toBe(false);
  });

  it('stores one line per AC with its seller and listed price', async () => {
    const res = await signed('post', '/api/v1/ess/intakes', enquiryBody([{ type: 'PRODUCT', productId: 'lg-15', quantity: 2, notes: 'Installation needed' }]), {
      'Idempotency-Key': `enq-key-${counter}`,
    });
    expect(res.status).toBe(201);
    expect(db.web_intakes[0]).toMatchObject({ kind: 'PRODUCT_ENQUIRY' });
    expect(db.web_intake_items).toHaveLength(1);
    expect(db.web_intake_items[0]).toMatchObject({ item_type: 'PRODUCT', product_id: 'lg-15', seller_id: 'seller-ess', quantity: 2, notes: 'Installation needed' });
    expect(db.web_intake_items[0].price_snapshot.total).toBe(42000);
  });

  it('refuses an AC that is no longer listed, naming the line', async () => {
    const res = await signed('post', '/api/v1/ess/intakes', enquiryBody([{ type: 'PRODUCT', productId: 'hidden' }]), { 'Idempotency-Key': `enq-key-x-${counter}` });
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: any) => d.field)).toContain('items.0.productId');
    expect(db.web_intakes).toHaveLength(0);
  });

  it('tracking shows the price the seller sent', async () => {
    db.web_intakes.push({
      id: 'intake-q', intake_number: 'WEB-2026-000077', tracking_code: 'ESS-QQQQ-QQQQ', kind: 'PRODUCT_ENQUIRY', status: 'APPROVED',
      phone_normalized: '9820011122', area: null, city: 'Thane', created_at: '2026-11-20T05:00:00Z', service_request_id: null, sr: null,
      items: [{ line_no: 1, item_type: 'PRODUCT', item_name: 'LG 1.5T Split', quantity: 1, line_status: 'QUOTED', quote_total: 40500, price_snapshot: { total: 42000, label: 'x' } }],
    });
    const res = await signed('post', '/api/v1/ess/track', { code: 'ESS-QQQQ-QQQQ', phone: '9820011122' });
    expect(res.status).toBe(200);
    expect(res.body.data.items[0]).toMatchObject({ status: 'QUOTED', price: { total: 40500, label: 'Price from the seller' } });
  });
});

describe('seller AC enquiries (ESS admin)', () => {
  const intake = { id: 'intake-e', intake_number: 'WEB-2026-000088', tracking_code: 'ESS-EEEE-EEEE', contact_name: 'Priya Shah', contact_phone: '9820011122', contact_email: 'priya@example.com', city: 'Thane', area: 'Vashi', pincode: '400703', message: 'Need it soon', status: 'APPROVED', created_at: '2026-11-20T05:00:00Z' };
  beforeEach(() => {
    db.outbound_events = [];
    db.web_intake_items.push(
      { id: 'line-a', intake_id: 'intake-e', line_no: 1, item_type: 'PRODUCT', product_id: 'lg-15', seller_id: 'seller-ess', item_name: 'LG 1.5T Split', quantity: 1, notes: 'Installation needed', line_status: 'QUOTE_PENDING', price_snapshot: { total: 42000, label: 'x' }, intake },
      { id: 'line-b', intake_id: 'intake-e', line_no: 2, item_type: 'PRODUCT', product_id: 'other', seller_id: 's2', item_name: 'Other seller AC', quantity: 1, line_status: 'QUOTE_PENDING', price_snapshot: null, intake },
      { id: 'line-c', intake_id: 'intake-x', line_no: 1, item_type: 'PRODUCT', product_id: 'lg-15', seller_id: 'seller-ess', item_name: 'LG 1.5T Split', quantity: 1, line_status: 'PENDING', price_snapshot: null, intake: { ...intake, id: 'intake-x', status: 'PENDING_REVIEW' } },
    );
  });
  const get = (token: string) => signed('get', '/api/v1/ess/admin/enquiries', undefined, asActor(token));

  it('shows only approved enquiry lines for ACs this seller sells, with the customer to call', async () => {
    const res = await get('staff-token');
    expect(res.status).toBe(200);
    expect(res.body.data.enquiries.map((e: any) => e.lineId)).toEqual(['line-a']);
    expect(res.body.data.enquiries[0]).toMatchObject({
      intakeNumber: 'WEB-2026-000088', productName: 'LG 1.5T Split', quantity: 1, notes: 'Installation needed', status: 'QUOTE_PENDING',
      listedPrice: 42000, customer: { name: 'Priya Shah', phone: '9820011122', email: 'priya@example.com', area: 'Vashi', city: 'Thane', pincode: '400703' },
    });
    expect((await get('nobody-token')).status).toBe(403);
  });

  it('sending a price marks the line "Price sent" and queues the customer email', async () => {
    const res = await signed('post', '/api/v1/ess/admin/enquiries/line-a/quote', { total: 40500, note: 'Includes installation' }, asActor('staff-token'));
    expect(res.status).toBe(200);
    expect(db.web_intake_items[0]).toMatchObject({ line_status: 'QUOTED', quote_total: 40500, quote_note: 'Includes installation', quoted_by: 'ess-staff-user' });
    expect(db.web_intake_items[0].quoted_at).toBeTruthy();
    expect(db.outbound_events).toEqual([expect.objectContaining({ event_type: 'WEB_ENQUIRY_QUOTED', aggregate_id: 'line-a' })]);
  });

  it('cannot price another seller\'s line or one that is not approved yet', async () => {
    expect((await signed('post', '/api/v1/ess/admin/enquiries/line-b/quote', { total: 1000 }, asActor('staff-token'))).status).toBe(404);
    expect((await signed('post', '/api/v1/ess/admin/enquiries/line-c/quote', { total: 1000 }, asActor('staff-token'))).status).toBe(409);
    expect((await signed('post', '/api/v1/ess/admin/enquiries/line-a/quote', { total: -5 }, asActor('staff-token'))).status).toBe(422);
  });

  it('S08: re-pricing a quoted line queues an "updated price" email each time, even back to an earlier price', async () => {
    const quote = (total: number, note?: string) => signed('post', '/api/v1/ess/admin/enquiries/line-a/quote', { total, ...(note ? { note } : {}) }, asActor('staff-token'));
    expect((await quote(40500)).body.data).toMatchObject({ status: 'QUOTED', updated: false, emailed: true });
    await new Promise((r) => setTimeout(r, 5)); // distinct quoted_at versions
    expect((await quote(39000)).body.data).toMatchObject({ updated: true, emailed: true });
    await new Promise((r) => setTimeout(r, 5));
    expect((await quote(40500)).body.data).toMatchObject({ updated: true, emailed: true });
    const events = db.outbound_events.filter((e: any) => e.event_type === 'WEB_ENQUIRY_QUOTED');
    expect(events).toHaveLength(3);
    expect(events.map((e: any) => e.payload.updated)).toEqual([false, true, true]);
    expect(new Set(events.map((e: any) => e.idempotency_key)).size).toBe(3);
    expect(db.web_intake_items[0].quote_total).toBe(40500);
  });

  it('S08: saving the same price and note again changes nothing and sends no email', async () => {
    await signed('post', '/api/v1/ess/admin/enquiries/line-a/quote', { total: 40500, note: 'Includes installation' }, asActor('staff-token'));
    const again = await signed('post', '/api/v1/ess/admin/enquiries/line-a/quote', { total: 40500, note: 'Includes installation' }, asActor('staff-token'));
    expect(again.body.data).toMatchObject({ updated: true, emailed: false });
    expect(db.outbound_events.filter((e: any) => e.event_type === 'WEB_ENQUIRY_QUOTED')).toHaveLength(1);
  });

  it('S08: a closed line cannot be re-priced', async () => {
    db.web_intake_items[0].line_status = 'FULFILLED';
    expect((await signed('post', '/api/v1/ess/admin/enquiries/line-a/quote', { total: 39000 }, asActor('staff-token'))).status).toBe(409);
  });

  it('closes a line as sold or not taken', async () => {
    expect((await signed('post', '/api/v1/ess/admin/enquiries/line-a/close', { result: 'SOLD' }, asActor('staff-token'))).status).toBe(200);
    expect(db.web_intake_items[0].line_status).toBe('FULFILLED');
    db.web_intake_items[0].line_status = 'QUOTED';
    await signed('post', '/api/v1/ess/admin/enquiries/line-a/close', { result: 'NOT_TAKEN' }, asActor('staff-token'));
    expect(db.web_intake_items[0].line_status).toBe('CANCELLED');
  });
});
