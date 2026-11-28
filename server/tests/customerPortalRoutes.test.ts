import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import * as supabaseLib from '../src/lib/supabase.js';
import { resendTransport } from '../src/services/email/emailTransport.service.js';
import { customerPortalService } from '../src/services/customerPortal.service.js';
import { customerAccountService } from '../src/services/customerAccount.service.js';
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

let fake: FakeDb;
let db: Record<string, Row[]>;
let sent: Array<{ to: string; text: string }>;
const codeFor = (email: string) => [...sent].reverse().find((m) => m.to === email)!.text.match(/code is (\d{6})/)![1];
const visitor = (n: number) => n.toString(16).padStart(64, 'a');

/** Two complete customers, A and B, each with a site, an AC, an AMC contract, a request and a visit. */
function twoCustomers(): Record<string, Row[]> {
  const now = new Date().toISOString();
  const c = (k: 'a' | 'b', name: string, email: string) => ({
    customer: { id: `cust-${k}`, customer_code: `C-${k.toUpperCase()}`, name, company_name: `${name} Pvt Ltd`, email, phone: `98200000${k === 'a' ? '01' : '02'}`, city: k === 'a' ? 'Andheri' : 'Borivali', customer_type: 'PERMANENT', is_active: true },
    site: { id: `site-${k}`, customer_id: `cust-${k}`, is_active: true, is_primary: true },
    asset: { id: `asset-${k}`, site_id: `site-${k}`, is_active: true, asset_tag: `TAG-${k.toUpperCase()}-77`, brand: k === 'a' ? 'Daikin' : 'Voltas', model_number: `MODEL-${k.toUpperCase()}`, created_at: now },
    amc: { id: `amc-${k}`, customer_id: `cust-${k}`, contract_number: `AMC-${k.toUpperCase()}-2026`, status: 'ACTIVE', start_date: '2026-04-01', end_date: '2027-03-31', total_visits: 4, amc_assets: [{ id: `aa-${k}` }] },
    sr: { id: `sr-${k}`, customer_id: `cust-${k}`, request_number: `SR-${k.toUpperCase()}-0001`, request_type: 'BREAKDOWN', status: 'PENDING', created_at: now },
    schedules: [
      { id: `sch-${k}-1`, service_request_id: `sr-${k}`, amc_id: null, status: 'SCHEDULED', scheduled_date: '2026-12-01', technician: { id: `tech-${k}`, name: k === 'a' ? 'Sunil Patil' : 'Imran Shaikh' } },
      { id: `sch-${k}-2`, service_request_id: null, amc_id: `amc-${k}`, status: 'COMPLETED', scheduled_date: '2026-06-01' },
    ],
  });
  const A = c('a', 'Asha Mehta', 'asha@example.com');
  const B = c('b', 'Bharat Rao', 'bharat@example.com');
  return {
    customers: [A.customer, B.customer],
    customer_portal_accounts: [
      { customer_id: 'cust-a', enabled: true },
      { customer_id: 'cust-b', enabled: true },
    ],
    customer_sites: [A.site, B.site],
    ac_assets: [A.asset, B.asset],
    amc_contracts: [A.amc, B.amc],
    service_requests: [A.sr, B.sr],
    service_schedules: [...A.schedules, ...B.schedules],
    service_reports: [],
    payments: [],
    customer_login_otps: [],
    customer_portal_sessions: [],
    email_deliveries: [],
  };
}

const B_MARKERS = ['cust-b', 'Bharat', 'bharat@example.com', 'Borivali', 'TAG-B-77', 'Voltas', 'MODEL-B', 'AMC-B-2026', 'SR-B-0001', 'Imran', '9820000002'];
const A_MARKERS = ['cust-a', 'Asha', 'asha@example.com', 'Andheri', 'TAG-A-77', 'Daikin', 'MODEL-A', 'AMC-A-2026', 'SR-A-0001', 'Sunil', '9820000001'];

const originalPortal = process.env.PORTAL_ENABLED;
beforeEach(() => {
  vi.restoreAllMocks();
  process.env.PORTAL_ENABLED = 'true';
  sent = [];
  fake = createFakeDb(twoCustomers());
  db = fake.db;
  vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(fake.client as never);
  vi.spyOn(resendTransport, 'send').mockImplementation(async (p: any) => {
    sent.push({ to: p.to, text: p.text });
    return { transport: 'dev-log', providerMessageId: `m-${sent.length}`, effectiveRecipient: p.to, sandboxRedirected: false } as never;
  });
});
afterEach(async () => {
  await customerAccountService.settleCodeDeliveries();
  if (originalPortal === undefined) delete process.env.PORTAL_ENABLED;
  else process.env.PORTAL_ENABLED = originalPortal;
});

/** POST /code, then wait for the code email (it is sent after the answer). */
async function postCode(app: express.Express, body: Record<string, unknown>) {
  const res = await request(app).post('/portal/code').send(body);
  await customerAccountService.settleCodeDeliveries();
  return res;
}

async function signIn(app: express.Express, email: string): Promise<string> {
  expect((await postCode(app, { email, clientIpHash: visitor(0xabc) })).status).toBe(202);
  const res = await request(app).post('/portal/sign-in').send({ email, code: codeFor(email) });
  expect(res.status).toBe(200);
  return res.body.data.token;
}

describe('customer accounts: data isolation between customers (S11)', () => {
  it("A's session only ever returns A's rows, and B's only B's; the customer comes only from the session", async () => {
    const app = makeApp();
    const overviewSpy = vi.spyOn(customerPortalService, 'getCustomerOverview');
    const tokenA = await signIn(app, 'asha@example.com');
    const tokenB = await signIn(app, 'bharat@example.com');

    // Attempts to point at B by query, body or header are ignored: only the session decides.
    const resA = await request(app)
      .get('/portal/me?customerId=cust-b&customer_id=cust-b')
      .set('X-PYS-Customer-Session', tokenA)
      .set('X-Customer-Id', 'cust-b')
      .send({ customerId: 'cust-b' });
    expect(resA.status).toBe(200);
    const a = JSON.stringify(resA.body);
    for (const m of A_MARKERS.filter((x) => x !== 'cust-a')) expect(a).toContain(m);
    for (const m of B_MARKERS) expect(a).not.toContain(m);
    expect(resA.body.data.amc).toEqual([expect.objectContaining({ contractNumber: 'AMC-A-2026', visitsUsed: 1, visitsLeft: 3 })]);
    expect(resA.body.data.requests.map((r: any) => r.requestNumber)).toEqual(['SR-A-0001']);
    expect(resA.body.data.requests[0].visit.technicianFirstName).toBe('Sunil');

    const resB = await request(app).get('/portal/me').set('X-PYS-Customer-Session', tokenB);
    expect(resB.status).toBe(200);
    const b = JSON.stringify(resB.body);
    for (const m of A_MARKERS) expect(b).not.toContain(m);
    expect(b).toContain('AMC-B-2026');

    expect(overviewSpy.mock.calls.map((c) => c[0])).toEqual(['cust-a', 'cust-b']);
    // Whitelist: no internal ids or technician phone leave PYS.
    expect(a).not.toContain('cust-a');
    expect(a).not.toContain('tech-a');
  });

  it('a revoked, signed-out, unknown, malformed or missing token gets 401 and no data', async () => {
    const app = makeApp();
    const tokenA = await signIn(app, 'asha@example.com');
    const tokenB = await signIn(app, 'bharat@example.com');

    // Revoked by staff switching B's access off; A signed out.
    db.customer_portal_sessions.find((s) => s.customer_id === 'cust-b')!.revoked_at = new Date().toISOString();
    expect((await request(app).post('/portal/sign-out').set('X-PYS-Customer-Session', tokenA)).status).toBe(200);

    const other = 'x'.repeat(43);
    for (const t of [tokenA, tokenB, other, 'short', undefined]) {
      const req = request(app).get('/portal/me');
      if (t) req.set('X-PYS-Customer-Session', t);
      const res = await req;
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ success: false, error: { code: 'SESSION_ENDED', message: 'Please sign in again.' } });
    }
  });
});

describe('customer accounts: per-visitor limits (S11 F3)', () => {
  const RATE_LIMITED = { success: false, error: { code: 'RATE_LIMITED', message: 'Too many tries. Please wait an hour and try again.' } };

  it('POST /code: 10 requests per visitor per hour, then 429 - for known and unknown emails alike', async () => {
    const app = makeApp();
    for (let i = 0; i < 10; i++) {
      const email = i % 2 ? 'asha@example.com' : `nobody${i}@example.com`;
      expect((await request(app).post('/portal/code').send({ email, clientIpHash: visitor(1) })).status).toBe(202);
    }
    for (const email of ['asha@example.com', 'nobody@example.com']) {
      const res = await request(app).post('/portal/code').send({ email, clientIpHash: visitor(1) });
      expect(res.status).toBe(429);
      expect(res.body).toEqual(RATE_LIMITED);
    }
    // Another visitor is not affected; the stored key is a hash, never the value ESS sent.
    expect((await request(app).post('/portal/code').send({ email: 'bharat@example.com', clientIpHash: visitor(2) })).status).toBe(202);
    expect(JSON.stringify(db.customer_portal_visitor_limits)).not.toContain(visitor(1));
    expect(db.customer_portal_visitor_limits.every((r) => /^[0-9a-f]{64}$/.test(r.key_hash))).toBe(true);
  });

  it('POST /code: a missing or malformed clientIpHash does not switch the limit off; all such requests share one bucket', async () => {
    const app = makeApp();
    const odd = [undefined, 'not-hex', visitor(1).toUpperCase(), visitor(1).slice(1), 42];
    for (let i = 0; i < 10; i++) {
      expect((await postCode(app, { email: 'nobody@example.com', clientIpHash: odd[i % odd.length] })).status).toBe(202);
    }
    for (const clientIpHash of odd) {
      const res = await postCode(app, { email: 'nobody@example.com', clientIpHash });
      expect(res.status).toBe(429);
      expect(res.body).toEqual(RATE_LIMITED);
    }
    // One shared row, stored as a hash; a visitor with a real key is not affected.
    expect(db.customer_portal_visitor_limits).toHaveLength(1);
    expect(db.customer_portal_visitor_limits[0].key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await postCode(app, { email: 'nobody@example.com', clientIpHash: visitor(9) })).status).toBe(202);
  });

  it('POST /code answers before the account lookup and email (same timing for every email)', async () => {
    const app = makeApp();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const send = vi.mocked(resendTransport.send);
    const real = send.getMockImplementation()!;
    send.mockImplementation(async (p: any) => {
      await gate;
      return real(p);
    });
    const res = await request(app).post('/portal/code').send({ email: 'asha@example.com', clientIpHash: visitor(10) });
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(0); // answered while the email was still waiting
    release();
    await customerAccountService.settleCodeDeliveries();
    expect(sent).toHaveLength(1);
  });

  it('POST /code: the window resets after an hour', async () => {
    const app = makeApp();
    for (let i = 0; i < 11; i++) await request(app).post('/portal/code').send({ email: 'nobody@example.com', clientIpHash: visitor(3) });
    expect((await request(app).post('/portal/code').send({ email: 'nobody@example.com', clientIpHash: visitor(3) })).status).toBe(429);
    db.customer_portal_visitor_limits[0].window_started_at = new Date(Date.now() - 61 * 60_000).toISOString();
    expect((await request(app).post('/portal/code').send({ email: 'nobody@example.com', clientIpHash: visitor(3) })).status).toBe(202);
  });

  it('POST /sign-in: 20 wrong codes per visitor per hour (any email), then 429 even with the right code', async () => {
    const app = makeApp();
    for (let i = 0; i < 20; i++) {
      const res = await request(app).post('/portal/sign-in').send({ email: `nobody${i}@example.com`, code: '123456', clientIpHash: visitor(4) });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('CODE_REJECTED');
    }
    await postCode(app, { email: 'asha@example.com', clientIpHash: visitor(4) });
    const right = { email: 'asha@example.com', code: codeFor('asha@example.com') };
    const res = await request(app).post('/portal/sign-in').send({ ...right, clientIpHash: visitor(4) });
    expect(res.status).toBe(429);
    expect(res.body).toEqual(RATE_LIMITED);
    expect(db.customer_portal_sessions).toHaveLength(0);
    // The limited request did not use up a try of the real code; another visitor signs in fine.
    const ok = await request(app).post('/portal/sign-in').send({ ...right, clientIpHash: visitor(5) });
    expect(ok.status).toBe(200);
  });

  it('POST /sign-in: a right code does not count towards the visitor limit', async () => {
    const app = makeApp();
    await signIn(app, 'asha@example.com');
    for (let i = 0; i < 25; i++) {
      await postCode(app, { email: 'asha@example.com', clientIpHash: visitor(1000 + i) });
      db.customer_login_otps.forEach((o) => (o.created_at = new Date(Date.now() - 20 * 60_000).toISOString()));
      const res = await request(app)
        .post('/portal/sign-in')
        .send({ email: 'asha@example.com', code: codeFor('asha@example.com'), clientIpHash: visitor(6) });
      expect(res.status).toBe(200);
    }
  });
});
