import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { getSupabaseClient } from '../src/lib/supabase.js';
import { catalogService, priceBreakup } from '../src/services/catalog.service.js';

vi.mock('../src/lib/supabase.js', () => ({
  getSupabaseClient: vi.fn(),
}));

const jetWash = {
  id: 'item-jet',
  code: 'SVC-JET-WASH',
  name: 'Jet wash',
  short_description: 'High-pressure water wash',
  includes: ['Indoor coil jet wash'],
  excludes: ['Gas top-up'],
  category: 'CLEANING',
  request_type: 'GENERAL_SERVICE',
  service_type: 'JET_SERVICE',
  pricing_model: 'FIXED',
  base_price: '1199.00',
  gst_rate_percent: '18.00',
  sac_code: '9987',
  duration_minutes: 60,
  warranty_days: null,
  applies_to_ac_types: ['SPLIT', 'WINDOW'],
  form_schema: { blocks: ['contact', 'address', 'ac', 'request', 'consent'] },
  legacy_codes: ['STANDALONE-JET'],
  is_public: true,
  is_active: true,
  display_order: 20,
};
const pcb = { ...jetWash, id: 'item-pcb', code: 'SVC-PCB', name: 'PCB repair', pricing_model: 'QUOTE_AFTER_DIAGNOSIS', base_price: null };
const samc1 = {
  id: 'plan-1',
  plan_code: 'SEMI-COMP-SPLIT',
  public_code: 'SAMC-1',
  name: 'Semi-Comprehensive AMC',
  category: 'SEMI_COMPREHENSIVE',
  default_visits_per_year: 4,
  default_frequency: 'QUARTERLY',
  pricing_model: 'TIERED_TONNAGE',
  rate_split_small: 2999,
  rate_split_large: 3999,
  rate_window_small: null,
  rate_window_large: null,
  rate_flat: null,
  gst_rate_percent: 18,
  applies_to_ac_types: ['SPLIT'],
  legacy_codes: ['SAMC 1'],
  is_public: true,
  is_active: true,
};

type Result = { data: any; error: any };

/** Chainable, awaitable stand-in for a supabase-js query builder. */
function builder(result: Result, calls: any[]) {
  const b: any = {};
  for (const m of ['select', 'eq', 'in', 'order', 'update', 'insert', 'delete', 'limit', 'neq']) {
    b[m] = vi.fn((...args: any[]) => {
      calls.push([m, ...args]);
      return b;
    });
  }
  const one = async () => ({ data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: result.error });
  b.single = vi.fn(one);
  b.maybeSingle = vi.fn(one);
  b.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return b;
}

let calls: any[];
let tableData: Record<string, Result>;

function installSupabase() {
  const profiles: Record<string, any> = {
    'admin-user': { id: 'admin-profile', full_name: 'Admin', role: 'ADMIN' },
    'staff-user': { id: 'staff-profile', full_name: 'Staff', role: 'STAFF' },
  };
  let currentUser = '';
  vi.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getUser: vi.fn(async (token: string) => {
        if (token === 'admin-token') currentUser = 'admin-user';
        else if (token === 'staff-token') currentUser = 'staff-user';
        else return { data: { user: null }, error: { message: 'bad token' } };
        return { data: { user: { id: currentUser, email: `${currentUser}@pys.test` } }, error: null };
      }),
    },
    from: vi.fn((table: string) => {
      calls.push(['from', table]);
      if (table === 'profiles') return builder({ data: profiles[currentUser], error: null }, calls);
      if (table === 'staff') {
        return builder({ data: { id: 's', role: profiles[currentUser]?.role, is_active: true }, error: null }, calls);
      }
      return builder(tableData[table] ?? { data: [], error: null }, calls);
    }),
  } as any);
}

describe('service catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalogService.clearCache();
    calls = [];
    tableData = {
      catalog_meta: { data: { version: 7 }, error: null },
      service_catalog_items: { data: [jetWash, pcb], error: null },
      service_catalog_prices: { data: [], error: null },
      amc_plans: { data: [samc1], error: null },
      activity_logs: { data: null, error: null },
    };
    installSupabase();
  });

  it('computes GST-inclusive totals with rounding', () => {
    expect(priceBreakup(1199, 18)).toEqual({ base: 1199, gstRatePercent: 18, gst: 215.82, total: 1414.82 });
    expect(priceBreakup('399.00', '18.00')).toEqual({ base: 399, gstRatePercent: 18, gst: 71.82, total: 470.82 });
    expect(priceBreakup(null, 18)).toBeNull();
  });

  it('serves the public catalog without login, with GST breakup and a version ETag', async () => {
    const res = await request(app).get('/api/v1/catalog');
    expect(res.status).toBe(200);
    expect(res.headers.etag).toBe('W/"catalog-v7"');
    expect(res.headers['cache-control']).toContain('max-age=60');

    const { services, amcPlans, version } = res.body.data;
    expect(version).toBe(7);
    expect(services.map((s: any) => s.code)).toEqual(['SVC-JET-WASH', 'SVC-PCB']);
    expect(services[0].price).toEqual({ base: 1199, gstRatePercent: 18, gst: 215.82, total: 1414.82 });
    expect(services[1].price).toBeNull(); // quoted after diagnosis
    expect(amcPlans[0]).toMatchObject({ code: 'SAMC-1', planCode: 'SEMI-COMP-SPLIT' });
    expect(amcPlans[0].rates.splitSmall.total).toBe(3538.82);
    expect(amcPlans[0].rates.windowSmall).toBeNull();

    // Only active + public rows are requested.
    expect(calls).toContainEqual(['eq', 'is_public', true]);
    expect(calls).toContainEqual(['eq', 'is_active', true]);
  });

  it('answers 304 when the client already has this version', async () => {
    const res = await request(app).get('/api/v1/catalog').set('If-None-Match', 'W/"catalog-v7"');
    expect(res.status).toBe(304);
  });

  it('requires login for the staff item list', async () => {
    expect((await request(app).get('/api/v1/catalog/items')).status).toBe(401);
    const res = await request(app).get('/api/v1/catalog/items').set('Authorization', 'Bearer staff-token');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('lets only the Admin change prices', async () => {
    const body = { basePrice: 1299 };
    expect((await request(app).patch('/api/v1/catalog/items/SVC-JET-WASH').send(body)).status).toBe(401);
    expect(
      (await request(app).patch('/api/v1/catalog/items/SVC-JET-WASH').set('Authorization', 'Bearer staff-token').send(body)).status
    ).toBe(403);

    const res = await request(app)
      .patch('/api/v1/catalog/items/svc-jet-wash')
      .set('Authorization', 'Bearer admin-token')
      .send(body);
    expect(res.status).toBe(200);
    expect(calls).toContainEqual(['update', { base_price: 1299 }]);
    expect(calls).toContainEqual(['eq', 'code', 'SVC-JET-WASH']); // code normalised to capitals
  });

  it('rejects a fixed-price service without a price and unknown fields', async () => {
    const res = await request(app)
      .post('/api/v1/catalog/items')
      .set('Authorization', 'Bearer admin-token')
      .send({
        code: 'SVC-NEW',
        name: 'New service',
        category: 'CLEANING',
        requestType: 'GENERAL_SERVICE',
        serviceType: 'DRY_SERVICE',
        pricingModel: 'FIXED',
      });
    expect(res.status).toBe(422);

    const extra = await request(app)
      .patch('/api/v1/catalog/items/SVC-DRY')
      .set('Authorization', 'Bearer admin-token')
      .send({ basePrice: 10, hacked: true });
    expect(extra.status).toBe(422);
  });

  it('rejects a price matrix row whose tonnage range is reversed', async () => {
    const res = await request(app)
      .put('/api/v1/catalog/items/SVC-GAS/prices')
      .set('Authorization', 'Bearer admin-token')
      .send({ prices: [{ acType: 'SPLIT', tonnageMin: 2, tonnageMax: 1, price: 1850 }] });
    expect(res.status).toBe(422);
  });
});
