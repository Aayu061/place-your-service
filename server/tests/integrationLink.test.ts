import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import app from '../src/app.js';
import { getSupabaseClient } from '../src/lib/supabase.js';
import { sealSecret, openSecret } from '../src/utils/secretBox.js';
import { signRequest } from '../src/utils/integrationSignature.js';
import { integrationService } from '../src/services/integration.service.js';
import { catalogService } from '../src/services/catalog.service.js';
import { requireIntegrationClient } from '../src/middleware/integrationAuth.js';
import { requireIdempotencyKey } from '../src/middleware/idempotency.js';
import { outboxService, PermanentOutboxError } from '../src/services/outbox.service.js';

vi.mock('../src/lib/supabase.js', () => ({
  getSupabaseClient: vi.fn(),
}));

const KEY_ID = 'essweb_0123456789ab';
const SECRET = 'test-secret-value-for-signing-0123456789';

/* ---------------- tiny in-memory stand-in for the tables used here ---------------- */
type Row = Record<string, any>;
let db: Record<string, Row[]>;
let rpcCalls: Array<[string, any]>;
let rpcResults: Record<string, any>;

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let payload: any = null;
  const rows = () => (db[table] ??= []);
  const run = async () => {
    if (op === 'insert') {
      const items = Array.isArray(payload) ? payload : [payload];
      for (const it of items) {
        if (table === 'integration_request_nonces' && rows().some((r) => r.client_id === it.client_id && r.nonce === it.nonce)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        if (table === 'idempotency_records' && rows().some((r) => r.client_id === it.client_id && r.idempotency_key === it.idempotency_key)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        rows().push({ status: 'IN_PROGRESS', ...it });
      }
      return { data: items, error: null };
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
    return { data: matched, error: null };
  };
  const b: any = {
    select: () => b,
    insert: (p: any) => ((op = 'insert'), (payload = p), b),
    update: (p: any) => ((op = 'update'), (payload = p), b),
    delete: () => ((op = 'delete'), b),
    eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), b),
    order: () => b,
    limit: () => b,
    in: () => b,
    maybeSingle: async () => {
      const r = await run();
      return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error };
    },
    single: async () => b.maybeSingle(),
    then: (res: any, rej: any) => run().then(res, rej),
  };
  return b;
}

function installDb(keyStatus = 'ACTIVE', scopes = ['catalog:read', 'intake:write']) {
  db = {
    integration_client_keys: [
      {
        id: 'key-row-1',
        key_id: KEY_ID,
        secret_ciphertext: sealSecret(SECRET),
        status: keyStatus,
        expires_at: null,
        integration_clients: { id: 'client-1', client_code: 'ESS_WEB', scopes, is_active: true },
      },
    ],
    integration_clients: [{ id: 'client-1', client_code: 'ESS_WEB' }],
    integration_request_nonces: [],
    idempotency_records: [],
    catalog_meta: [{ version: 3 }],
    service_catalog_items: [],
    amc_plans: [],
    activity_logs: [],
  };
  rpcCalls = [];
  rpcResults = {};
  vi.mocked(getSupabaseClient).mockReturnValue({
    from: (t: string) => query(t),
    rpc: async (name: string, args: any) => {
      rpcCalls.push([name, args]);
      return rpcResults[name] ?? { data: null, error: null };
    },
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no' } }) },
  } as any);
}

const signed = (method: string, path: string, body?: unknown, extra: Partial<Parameters<typeof signRequest>[0]> = {}) =>
  signRequest({
    keyId: KEY_ID,
    secret: SECRET,
    method,
    pathWithQuery: path,
    body: body === undefined ? null : JSON.stringify(body),
    ...extra,
  });

describe('ESS ↔ PYS signed link', () => {
  beforeEach(() => {
    integrationService.clearCache();
    catalogService.clearCache();
    installDb();
  });

  it('encrypts stored secrets and detects tampering', () => {
    const sealed = sealSecret('hello');
    expect(sealed).not.toContain('hello');
    expect(openSecret(sealed)).toBe('hello');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => openSecret(parts.join('.'))).toThrow();
  });

  it('accepts a correctly signed request', async () => {
    const res = await request(app).get('/api/v1/ess/ping').set(signed('GET', '/api/v1/ess/ping'));
    expect(res.status).toBe(200);
    expect(res.body.data.client).toBe('ESS_WEB');
  });

  it('rejects missing, wrong, stale and replayed signatures', async () => {
    expect((await request(app).get('/api/v1/ess/ping')).status).toBe(401);

    const wrongSecret = signRequest({ keyId: KEY_ID, secret: 'not-the-secret-000000000000', method: 'GET', pathWithQuery: '/api/v1/ess/ping' });
    expect((await request(app).get('/api/v1/ess/ping').set(wrongSecret)).status).toBe(401);

    const stale = signed('GET', '/api/v1/ess/ping', undefined, { timestamp: Math.floor(Date.now() / 1000) - 600 });
    expect((await request(app).get('/api/v1/ess/ping').set(stale)).status).toBe(401);

    const otherPath = signed('GET', '/api/v1/ess/catalog');
    expect((await request(app).get('/api/v1/ess/ping').set(otherPath)).status).toBe(401);

    const once = signed('GET', '/api/v1/ess/ping');
    expect((await request(app).get('/api/v1/ess/ping').set(once)).status).toBe(200);
    expect((await request(app).get('/api/v1/ess/ping').set(once)).status).toBe(401); // replay
  });

  it('rejects revoked keys and checks scopes', async () => {
    installDb('REVOKED');
    expect((await request(app).get('/api/v1/ess/ping').set(signed('GET', '/api/v1/ess/ping'))).status).toBe(401);

    integrationService.clearCache();
    installDb('ACTIVE', ['intake:write']);
    const res = await request(app).get('/api/v1/ess/catalog').set(signed('GET', '/api/v1/ess/catalog'));
    expect(res.status).toBe(403);
  });

  it('serves the catalog to a signed client', async () => {
    const res = await request(app).get('/api/v1/ess/catalog').set(signed('GET', '/api/v1/ess/catalog'));
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(3);
  });

  it('detects a changed body (signature covers the raw bytes)', async () => {
    const mini = express();
    mini.use(express.json({ verify: (req, _res, buf) => ((req as any).rawBody = buf) }));
    mini.post('/api/v1/ess/x', requireIntegrationClient(), (_req, res) => res.json({ ok: true }));
    const headers = signed('POST', '/api/v1/ess/x', { amount: 1 });
    const res = await request(mini).post('/api/v1/ess/x').set(headers).set('Content-Type', 'application/json').send(JSON.stringify({ amount: 999 }));
    expect(res.status).toBe(401);
  });

  it('returns the first response again for a repeated Idempotency-Key', async () => {
    let created = 0;
    const mini = express();
    mini.use(express.json({ verify: (req, _res, buf) => ((req as any).rawBody = buf) }));
    mini.post('/api/v1/ess/intakes', requireIntegrationClient(), requireIdempotencyKey(), (_req, res) => {
      created++;
      res.status(201).json({ intake: `WEB-2026-00000${created}` });
    });
    const body = JSON.stringify({ name: 'A' });
    const send = (b = body) =>
      request(mini)
        .post('/api/v1/ess/intakes')
        .set(signRequest({ keyId: KEY_ID, secret: SECRET, method: 'POST', pathWithQuery: '/api/v1/ess/intakes', body: b }))
        .set('Idempotency-Key', 'booking-abc-123')
        .set('Content-Type', 'application/json')
        .send(b);

    const first = await send();
    expect(first.status).toBe(201);
    await new Promise((r) => setTimeout(r, 10)); // stored after the response is sent

    const second = await send();
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(created).toBe(1);

    const different = await send(JSON.stringify({ name: 'B' }));
    expect(different.status).toBe(422);
    expect(created).toBe(1);
  });

  it('requires an Idempotency-Key on writes', async () => {
    const mini = express();
    mini.use(express.json({ verify: (req, _res, buf) => ((req as any).rawBody = buf) }));
    mini.post('/api/v1/ess/intakes', requireIntegrationClient(), requireIdempotencyKey(), (_req, res) => res.json({}));
    const res = await request(mini)
      .post('/api/v1/ess/intakes')
      .set(signRequest({ keyId: KEY_ID, secret: SECRET, method: 'POST', pathWithQuery: '/api/v1/ess/intakes', body: '{}' }))
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(400);
  });

  it('only lets the Admin manage keys', async () => {
    expect((await request(app).get('/api/v1/integrations/clients')).status).toBe(401);
  });
});

describe('outbox worker', () => {
  beforeEach(() => {
    installDb();
    outboxService.unregisterAll();
  });

  it('claims nothing when no handler is registered', async () => {
    const summary = await outboxService.processPending();
    expect(summary.claimed).toBe(0);
    expect(rpcCalls).toHaveLength(0);
  });

  it('claims only registered types and reports each outcome', async () => {
    const ev = (id: string, type: string) => ({ id, event_type: type, aggregate_type: 'SERVICE_REQUEST', aggregate_id: null, payload: {}, attempt_count: 1, max_attempts: 8, created_at: '' });
    rpcResults.claim_outbound_events = {
      data: [ev('e1', 'OK_EVENT'), ev('e2', 'OK_EVENT'), ev('e3', 'OK_EVENT'), ev('e4', 'OK_EVENT')],
      error: null,
    };
    let n = 0;
    outboxService.register('OK_EVENT', async () => {
      n++;
      if (n === 2) return 'SKIPPED';
      if (n === 3) throw new Error('mail server down');
      if (n === 4) throw new PermanentOutboxError('customer deleted');
      return 'DONE';
    });

    const summary = await outboxService.processPending();
    expect(summary).toEqual({ claimed: 4, done: 1, skipped: 1, failed: 2 });
    expect(rpcCalls[0]).toEqual(['claim_outbound_events', { p_limit: 20, p_event_types: ['OK_EVENT'] }]);
    const completions = rpcCalls.filter(([n]) => n === 'complete_outbound_event').map(([, a]) => [a.p_event_id, a.p_outcome, a.p_retryable]);
    expect(completions).toEqual([
      ['e1', 'DONE', true],
      ['e2', 'SKIPPED', true],
      ['e3', 'FAILED', true],
      ['e4', 'FAILED', false],
    ]);
  });
});
