import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { getSupabaseClient } from '../src/lib/supabase.js';
import { sealSecret } from '../src/utils/secretBox.js';
import { signRequest } from '../src/utils/integrationSignature.js';
import { integrationService } from '../src/services/integration.service.js';
import { scheduleService } from '../src/services/schedule.service.js';
import { customerAccountService } from '../src/services/customerAccount.service.js';
import { todayIst } from '../src/validators/intake.validator.js';

vi.mock('../src/lib/supabase.js', () => ({
  getSupabaseClient: vi.fn(),
}));

const KEY_ID = 'essweb_0123456789ab';
const SECRET = 'test-secret-value-for-signing-0123456789';
const INTAKE_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';

/* ---------------- in-memory stand-in for the tables used here ---------------- */
type Row = Record<string, any>;
let db: Record<string, Row[]>;
let rpcCalls: Array<[string, any]>;
let rpcResults: Record<string, any>;
let seq: number;

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let payload: any = null;
  let head = false;
  let range: [number, number] | null = null;
  const rows = () => (db[table] ??= []);
  const run = async () => {
    if (op === 'insert') {
      const items = Array.isArray(payload) ? payload : [payload];
      const out: Row[] = [];
      for (const it of items) {
        if (table === 'idempotency_records' && rows().some((r) => r.client_id === it.client_id && r.idempotency_key === it.idempotency_key)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        if (
          table === 'web_intakes' &&
          it.external_reference_id &&
          rows().some((r) => r.source_channel === it.source_channel && r.external_reference_id === it.external_reference_id)
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        const row =
          table === 'web_intakes'
            ? { id: `intake-${++seq}`, tracking_code: `ESS-TEST-${String(seq).padStart(4, '2')}`, created_at: new Date().toISOString(), ...it }
            : table === 'idempotency_records'
              ? { status: 'IN_PROGRESS', ...it }
              : { ...it };
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
    const page = range ? matched.slice(range[0], range[1] + 1) : matched;
    return { data: head ? null : page, error: null, count: matched.length };
  };
  const b: any = {
    select: (_cols?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), b),
    insert: (p: any) => ((op = 'insert'), (payload = p), b),
    update: (p: any) => ((op = 'update'), (payload = p), b),
    delete: () => ((op = 'delete'), b),
    eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), b),
    gte: (c: string, v: any) => (filters.push((r) => r[c] >= v), b),
    or: () => b,
    order: () => b,
    limit: () => b,
    in: () => b,
    range: (from: number, to: number) => ((range = [from, to]), b),
    maybeSingle: async () => {
      const r = await run();
      return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error };
    },
    single: async () => b.maybeSingle(),
    then: (res: any, rej: any) => run().then(res, rej),
  };
  return b;
}

function installDb() {
  seq = 0;
  db = {
    integration_client_keys: [
      {
        id: 'key-row-1',
        key_id: KEY_ID,
        secret_ciphertext: sealSecret(SECRET),
        status: 'ACTIVE',
        expires_at: null,
        integration_clients: { id: 'client-1', client_code: 'ESS_WEB', scopes: ['catalog:read', 'intake:write'], is_active: true },
      },
    ],
    integration_clients: [{ id: 'client-1', client_code: 'ESS_WEB' }],
    integration_request_nonces: [],
    idempotency_records: [],
    service_catalog_items: [{ code: 'SVC-JET-WASH', name: 'Jet wash', is_active: true }],
    web_intakes: [],
    customers: [],
    activity_logs: [],
    profiles: [{ id: 'staff-user', full_name: 'Staff', email: 'staff@pys.test' }],
    staff: [{ id: 'staff-1', profile_id: 'staff-user', role: 'STAFF', is_active: true }],
  };
  rpcCalls = [];
  rpcResults = {
    generate_business_numbers: { data: ['WEB-2026-000001'], error: null },
  };
  vi.mocked(getSupabaseClient).mockReturnValue({
    from: (t: string) => query(t),
    rpc: async (name: string, args: any) => {
      rpcCalls.push([name, args]);
      return rpcResults[name] ?? { data: null, error: null };
    },
    auth: {
      getUser: async (token: string) =>
        token === 'staff-token'
          ? { data: { user: { id: 'staff-user', email: 'staff@pys.test' } }, error: null }
          : { data: { user: null }, error: { message: 'bad token' } },
    },
  } as any);
}

let idemCounter = 0;
const postIntake = (body: unknown, idemKey = `intake-key-${++idemCounter}-abcdef`, extra: Record<string, string> = {}) => {
  const raw = JSON.stringify(body);
  return request(app)
    .post('/api/v1/ess/intakes')
    .set(signRequest({ keyId: KEY_ID, secret: SECRET, method: 'POST', pathWithQuery: '/api/v1/ess/intakes', body: raw }))
    .set('Idempotency-Key', idemKey)
    .set('Content-Type', 'application/json')
    .set(extra)
    .send(raw);
};

const booking = (over: Record<string, any> = {}) => ({
  kind: 'SERVICE_BOOKING',
  externalReferenceId: 'ess-booking-1',
  contact: { name: 'Asha Patil', phone: '+91 98200 99887', email: 'Asha@Example.com' },
  address: { line: 'Flat 4, Sai Krupa', area: 'Chembur', city: 'Mumbai', pincode: '400071' },
  ac: { type: 'SPLIT', brand: 'Daikin', tonnage: 1.5, inverter: 'YES', units: 2 },
  request: { serviceCode: 'SVC-JET-WASH', message: 'Cooling is weak', preferredDate: todayIst(), preferredSlot: 'MORNING' },
  consent: { privacy: true, marketing: false, noticeVersion: '2026-11' },
  meta: { elapsedMs: 45_000 },
  ...over,
});

const pendingIntakeRow = (over: Row = {}) => ({
  id: INTAKE_ID,
  intake_number: 'WEB-2026-000009',
  tracking_code: 'ESS-7KQ4-M9TX',
  kind: 'SERVICE_BOOKING',
  status: 'PENDING_REVIEW',
  source_channel: 'EXTREME_SALES_SERVICES',
  contact_name: 'Asha Patil',
  contact_phone: '9820099887',
  phone_normalized: '9820099887',
  consent_privacy: true,
  consent_marketing: false,
  ac_units: 1,
  spam_score: 0,
  created_at: '2026-11-18T05:00:00.000Z',
  ...over,
});

const staff = (req: request.Test) => req.set('Authorization', 'Bearer staff-token');

describe('website request intake (M5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    integrationService.clearCache();
    installDb();
  });

  describe('signed ESS create', () => {
    it('stores a booking for review and returns its numbers (201)', async () => {
      const res = await postIntake(booking());
      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({ intakeNumber: 'WEB-2026-000001', trackingCode: expect.stringMatching(/^ESS-/), status: 'PENDING_REVIEW' });

      const row = db.web_intakes[0];
      expect(row).toMatchObject({
        kind: 'SERVICE_BOOKING',
        status: 'PENDING_REVIEW',
        source_channel: 'EXTREME_SALES_SERVICES',
        contact_phone: '9820099887',
        contact_email: 'asha@example.com',
        catalog_service_code: 'SVC-JET-WASH',
        ac_units: 2,
        consent_privacy: true,
        spam_score: 0,
      });
      expect(rpcCalls).toContainEqual(['generate_business_numbers', { p_kind: 'WEB_INTAKE', p_count: 1 }]);
    });

    it('a booking from a signed-in website customer is linked to them (from the session, only while accounts are on)', async () => {
      const original = process.env.PORTAL_ENABLED;
      const resolve = vi.spyOn(customerAccountService, 'resolveSession').mockImplementation(async (t) => (t === 'a'.repeat(43) ? 'cust-acct' : null));
      try {
        process.env.PORTAL_ENABLED = 'true';
        await postIntake(booking({ externalReferenceId: 'acct-1' }), undefined, { 'X-PYS-Customer-Session': 'a'.repeat(43) });
        expect(db.web_intakes.at(-1)).toMatchObject({ matched_customer_id: 'cust-acct', customer_id: 'cust-acct' });

        // An ended or unknown session just means "not signed in": stored as a normal booking, no refusal.
        const res = await postIntake(booking({ externalReferenceId: 'acct-2' }), undefined, { 'X-PYS-Customer-Session': 'b'.repeat(43) });
        expect(res.status).toBe(201);
        expect(db.web_intakes.at(-1)!.customer_id).toBeUndefined();

        // Accounts switched off: the session is not even looked at.
        process.env.PORTAL_ENABLED = 'false';
        resolve.mockClear();
        await postIntake(booking({ externalReferenceId: 'acct-3' }), undefined, { 'X-PYS-Customer-Session': 'a'.repeat(43) });
        expect(resolve).not.toHaveBeenCalled();
        expect(db.web_intakes.at(-1)!.customer_id).toBeUndefined();
      } finally {
        if (original === undefined) delete process.env.PORTAL_ENABLED;
        else process.env.PORTAL_ENABLED = original;
      }
    });

    it('returns the existing intake for a repeated externalReferenceId (200, same numbers)', async () => {
      const first = await postIntake(booking());
      const second = await postIntake(booking({ contact: { name: 'Asha P', phone: '09820099887' } }));
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.data).toEqual(first.body.data);
      expect(db.web_intakes).toHaveLength(1);
    });

    it('marks honeypot submissions as SPAM but answers like a normal request', async () => {
      const res = await postIntake(booking({ externalReferenceId: undefined, meta: { honeypot: 'http://spam', elapsedMs: 400 } }));
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('SPAM');
      expect(Object.keys(res.body.data).sort()).toEqual(['intakeNumber', 'status', 'trackingCode']);
      expect(db.web_intakes[0].status).toBe('SPAM');
      expect(db.web_intakes[0].spam_score).toBe(150);
    });

    it('scores very fast submissions without rejecting them', async () => {
      const res = await postIntake(booking({ meta: { elapsedMs: 1200 } }));
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING_REVIEW');
      expect(db.web_intakes[0].spam_score).toBe(50);
    });

    it('rejects invalid phone numbers with 422', async () => {
      const res = await postIntake(booking({ contact: { name: 'Asha', phone: '12345' } }));
      expect(res.status).toBe(422);
      expect(res.body.error.details.some((d: any) => d.field === 'contact.phone')).toBe(true);
      expect(db.web_intakes).toHaveLength(0);
    });

    it('rejects unknown service codes, missing booking address, past dates and missing consent with 422', async () => {
      expect((await postIntake(booking({ request: { serviceCode: 'SVC-NOPE' } }))).status).toBe(422);
      expect((await postIntake(booking({ address: undefined }))).status).toBe(422);
      expect((await postIntake(booking({ request: { preferredDate: '2020-01-01' } }))).status).toBe(422);
      expect((await postIntake(booking({ consent: { privacy: false } }))).status).toBe(422);
      expect((await postIntake(booking({ unexpected: true }))).status).toBe(422);
      expect(db.web_intakes).toHaveLength(0);
    });

    it('accepts a contact message without address', async () => {
      const res = await postIntake({
        kind: 'CONTACT',
        contact: { name: 'Ravi', phone: '9123456789' },
        request: { message: 'Do you service VRF units?' },
        consent: { privacy: true },
      });
      expect(res.status).toBe(201);
      expect(db.web_intakes[0]).toMatchObject({ kind: 'CONTACT', address_line: null, ac_units: 1 });
    });

    it('requires a signature', async () => {
      const res = await request(app).post('/api/v1/ess/intakes').send(booking());
      expect(res.status).toBe(401);
    });
  });

  describe('staff inbox', () => {
    it('requires login for every staff route', async () => {
      expect((await request(app).get('/api/v1/intakes')).status).toBe(401);
      expect((await request(app).get('/api/v1/intakes/stats')).status).toBe(401);
      expect((await request(app).get(`/api/v1/intakes/${INTAKE_ID}`)).status).toBe(401);
      expect((await request(app).post(`/api/v1/intakes/${INTAKE_ID}/approve`).send({})).status).toBe(401);
      expect((await request(app).post(`/api/v1/intakes/${INTAKE_ID}/reject`).send({ status: 'SPAM' })).status).toBe(401);
    });

    it('lists requests with paging and maps the DTO', async () => {
      db.web_intakes.push(pendingIntakeRow(), pendingIntakeRow({ id: 'other', status: 'APPROVED' }));
      const res = await staff(request(app).get('/api/v1/intakes?status=PENDING_REVIEW&page=1&pageSize=10'));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ total: 1, page: 1, pageSize: 10 });
      expect(res.body.data.items[0]).toMatchObject({
        id: INTAKE_ID,
        intakeNumber: 'WEB-2026-000009',
        trackingCode: 'ESS-7KQ4-M9TX',
        contact: { name: 'Asha Patil', phone: '9820099887', email: null },
        matchedCustomer: null,
        serviceRequest: null,
        review: { reviewedBy: null, reviewedAt: null, rejectionReason: null },
      });
    });

    it('returns stats', async () => {
      db.web_intakes.push(pendingIntakeRow(), pendingIntakeRow({ id: 's', status: 'SPAM' }));
      const res = await staff(request(app).get('/api/v1/intakes/stats'));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ pending: 1, spam: 1, approvedToday: 0, rejectedToday: 0 });
    });

    it('shows customers with the same phone as candidates', async () => {
      db.web_intakes.push(pendingIntakeRow());
      db.customers.push({ id: 'cust-1', name: 'Asha Patil', customer_code: 'CUST-000010', phone: '9820099887', customer_type: 'PERMANENT', phone_normalized: '9820099887', is_active: true });
      const res = await staff(request(app).get(`/api/v1/intakes/${INTAKE_ID}`));
      expect(res.status).toBe(200);
      expect(res.body.data.candidates).toEqual([
        { id: 'cust-1', name: 'Asha Patil', customerCode: 'CUST-000010', phone: '9820099887', customerType: 'PERMANENT' },
      ]);
    });

    it('approves through the RPC with the right arguments', async () => {
      db.web_intakes.push(pendingIntakeRow());
      rpcResults.approve_web_intake = {
        data: { intakeId: INTAKE_ID, status: 'APPROVED', serviceRequestId: 'sr-1', requestNumber: 'SR-2026-000042', customerId: 'cust-9', createdCustomer: true },
        error: null,
      };
      const customerId = '11111111-2222-4333-8444-555555555555';
      const res = await staff(
        request(app).post(`/api/v1/intakes/${INTAKE_ID}/approve`).send({ customerId, requestType: 'GENERAL_SERVICE', priority: 'HIGH', notes: 'Call first' })
      );
      expect(res.status).toBe(200);
      expect(rpcCalls).toContainEqual([
        'approve_web_intake',
        { p_intake_id: INTAKE_ID, p_actor: 'staff-user', p_customer_id: customerId, p_request_type: 'GENERAL_SERVICE', p_priority: 'HIGH', p_notes: 'Call first' },
      ]);
      expect(res.body.data.serviceRequest).toEqual({ id: 'sr-1', requestNumber: 'SR-2026-000042' });
      expect(res.body.data.schedule).toBeNull();
      expect(res.body.data.intake.id).toBe(INTAKE_ID);
      const log = db.activity_logs.find((l) => l.action === 'WEB_INTAKE_APPROVED');
      expect(log).toBeTruthy();
      expect(JSON.stringify(log.details)).not.toContain('9820099887');
    });

    it('a customer-account request stays with its customer and never books a visit', async () => {
      const owner = '22222222-3333-4444-8555-666666666666';
      const other = '11111111-2222-4333-8444-555555555555';
      db.web_intakes.push(pendingIntakeRow({ kind: 'AMC_RENEWAL', customer_id: owner, matched_customer_id: owner }));
      rpcResults.approve_web_intake = { data: { intakeId: INTAKE_ID, status: 'APPROVED', serviceRequestId: null }, error: null };
      const moved = await staff(request(app).post(`/api/v1/intakes/${INTAKE_ID}/approve`).send({ customerId: other }));
      expect(moved.status).toBe(422);
      expect(rpcCalls.some(([n]) => n === 'approve_web_intake')).toBe(false);

      const spy = vi.spyOn(scheduleService, 'createSchedule');
      const ok = await staff(
        request(app).post(`/api/v1/intakes/${INTAKE_ID}/approve`).send({ schedule: { date: '2026-12-01', slot: 'MORNING' } })
      );
      expect(ok.status).toBe(200);
      expect(rpcCalls.find(([n]) => n === 'approve_web_intake')?.[1]).toMatchObject({ p_customer_id: owner });
      expect(spy).not.toHaveBeenCalled();
      expect(ok.body.data.schedule).toBeNull();
    });

    it('the detail of a renewal request shows its contract', async () => {
      const contractId = '33333333-4444-4555-8666-777777777777';
      db.web_intakes.push(pendingIntakeRow({ kind: 'AMC_RENEWAL', amc_contract_id: contractId }));
      db.amc_contracts = [{ id: contractId, contract_number: 'AMC-2026-0007', status: 'EXPIRING_SOON', end_date: '2026-12-15' }];
      const res = await staff(request(app).get(`/api/v1/intakes/${INTAKE_ID}`));
      expect(res.status).toBe(200);
      expect(res.body.data.amcContract).toEqual({ id: contractId, contractNumber: 'AMC-2026-0007', status: 'EXPIRING_SOON', endDate: '2026-12-15' });
    });

    it('uses defaults when approving with an empty body', async () => {
      db.web_intakes.push(pendingIntakeRow({ kind: 'CONTACT' }));
      rpcResults.approve_web_intake = { data: { intakeId: INTAKE_ID, status: 'APPROVED', serviceRequestId: null }, error: null };
      const res = await staff(request(app).post(`/api/v1/intakes/${INTAKE_ID}/approve`).send({}));
      expect(res.status).toBe(200);
      expect(rpcCalls.find(([n]) => n === 'approve_web_intake')?.[1]).toEqual({
        p_intake_id: INTAKE_ID, p_actor: 'staff-user', p_customer_id: null, p_request_type: null, p_priority: 'MEDIUM', p_notes: null,
      });
      expect(res.body.data.serviceRequest).toBeNull();
    });

    it('keeps the approval when scheduling fails and returns a warning', async () => {
      db.web_intakes.push(pendingIntakeRow());
      rpcResults.approve_web_intake = { data: { serviceRequestId: 'sr-1', requestNumber: 'SR-2026-000042' }, error: null };
      const spy = vi.spyOn(scheduleService, 'createSchedule').mockRejectedValue(new Error('Technician is busy'));
      const res = await staff(
        request(app).post(`/api/v1/intakes/${INTAKE_ID}/approve`).send({ schedule: { date: '2026-12-01', slot: 'AFTERNOON' } })
      );
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ serviceRequestId: 'sr-1', scheduledDate: '2026-12-01', startTime: '12:00', endTime: '15:00' }),
        'staff-user',
        expect.anything()
      );
      expect(res.body.data.schedule).toBeNull();
      expect(res.body.data.warning).toContain('Technician is busy');
      expect(res.body.data.serviceRequest.requestNumber).toBe('SR-2026-000042');
    });

    it('returns the schedule when scheduling succeeds', async () => {
      db.web_intakes.push(pendingIntakeRow());
      rpcResults.approve_web_intake = { data: { serviceRequestId: 'sr-1', requestNumber: 'SR-2026-000042' }, error: null };
      vi.spyOn(scheduleService, 'createSchedule').mockResolvedValue({ id: 'sch-1', scheduleNumber: 'SCH-2026-000007' } as any);
      const res = await staff(
        request(app).post(`/api/v1/intakes/${INTAKE_ID}/approve`).send({ schedule: { date: '2026-12-01', slot: 'MORNING' } })
      );
      expect(res.body.data.schedule).toEqual({ id: 'sch-1', scheduleNumber: 'SCH-2026-000007' });
      expect(res.body.data.warning).toBeUndefined();
    });

    it('maps "already reviewed" to 409 and not-found to 404', async () => {
      rpcResults.approve_web_intake = { data: null, error: { code: '55000', message: 'Web intake has already been reviewed (status APPROVED)' } };
      expect((await staff(request(app).post(`/api/v1/intakes/${INTAKE_ID}/approve`).send({}))).status).toBe(409);
      rpcResults.approve_web_intake = { data: null, error: { code: 'P0002', message: 'Web intake not found' } };
      expect((await staff(request(app).post(`/api/v1/intakes/${INTAKE_ID}/approve`).send({}))).status).toBe(404);
    });

    it('validates approve and reject bodies', async () => {
      expect((await staff(request(app).post(`/api/v1/intakes/${INTAKE_ID}/approve`).send({ priority: 'WHENEVER' }))).status).toBe(422);
      expect((await staff(request(app).post('/api/v1/intakes/not-a-uuid/approve').send({}))).status).toBe(422);
      expect((await staff(request(app).post(`/api/v1/intakes/${INTAKE_ID}/reject`).send({ status: 'REJECTED' }))).status).toBe(422);
      expect((await staff(request(app).post(`/api/v1/intakes/${INTAKE_ID}/reject`).send({ status: 'APPROVED', reason: 'x' }))).status).toBe(422);
      expect(
        (await staff(request(app).post(`/api/v1/intakes/${INTAKE_ID}/reject`).send({ status: 'REJECTED', reason: 'x'.repeat(501) }))).status
      ).toBe(422);
      expect(rpcCalls.some(([n]) => n === 'approve_web_intake' || n === 'reject_web_intake')).toBe(false);
    });

    it('rejects through the RPC', async () => {
      db.web_intakes.push(pendingIntakeRow());
      const res = await staff(
        request(app).post(`/api/v1/intakes/${INTAKE_ID}/reject`).send({ status: 'REJECTED', reason: 'Outside service area' })
      );
      expect(res.status).toBe(200);
      expect(rpcCalls).toContainEqual([
        'reject_web_intake',
        { p_intake_id: INTAKE_ID, p_actor: 'staff-user', p_status: 'REJECTED', p_reason: 'Outside service area' },
      ]);
      expect(res.body.data.intake.id).toBe(INTAKE_ID);

      const spam = await staff(request(app).post(`/api/v1/intakes/${INTAKE_ID}/reject`).send({ status: 'SPAM' }));
      expect(spam.status).toBe(200);
      expect(rpcCalls.at(-1)).toEqual(['reject_web_intake', { p_intake_id: INTAKE_ID, p_actor: 'staff-user', p_status: 'SPAM', p_reason: null }]);
    });
  });
});
