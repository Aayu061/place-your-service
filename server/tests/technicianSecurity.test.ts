import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { env } from '../src/config/env.js';
import {
  hashPin,
  verifyPin,
  signTechToken,
  verifyTechToken,
  resolveTechTokenSecret,
  validateNewTechPin,
  DEV_ONLY_TECH_JWT_SECRET,
} from '../src/utils/techAuth.js';
import { technicianService } from '../src/services/technician.service.js';

const TECH_ID = '88888888-8888-4888-8888-888888888888';

type Row = Record<string, unknown>;

/**
 * Minimal stateful stand-in for the Supabase client: one technicians row that reads and
 * updates act on, and empty results for every other table.
 */
function createFakeSupabase(initial: Row) {
  const state = { tech: { ...initial } as Row, updates: [] as Row[] };

  function builder(table: string) {
    let pendingUpdate: Row | null = null;
    const result = () => {
      if (table !== 'technicians') return { data: [], error: null, count: 0 };
      return { data: state.tech, error: null };
    };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ['select', 'or', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'gt', 'order', 'limit', 'range', 'ilike', 'is', 'not']) {
      chain[m] = vi.fn(self);
    }
    chain.update = vi.fn((payload: Row) => {
      pendingUpdate = payload;
      return chain;
    });
    chain.maybeSingle = vi.fn(async () => (table === 'technicians' ? { data: { ...state.tech }, error: null } : { data: null, error: null }));
    chain.single = chain.maybeSingle;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      if (pendingUpdate && table === 'technicians') {
        state.tech = { ...state.tech, ...pendingUpdate };
        state.updates.push(pendingUpdate);
        pendingUpdate = null;
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      }
      return Promise.resolve(result()).then(resolve, reject);
    };
    return chain;
  }

  const client = { from: vi.fn((table: string) => builder(table)), rpc: vi.fn(async () => ({ data: null, error: null })) };
  return { client, state };
}

function baseTech(overrides: Row = {}): Row {
  return {
    id: TECH_ID,
    technician_code: 'TECH-0042',
    name: 'Ravi Kumar',
    phone: '9820012345',
    email: null,
    status: 'AVAILABLE',
    is_active: true,
    pin_hash: hashPin('4826'),
    pin_reset_required: false,
    token_version: 0,
    failed_pin_attempts: 0,
    locked_until: null,
    ...overrides,
  };
}

function useFake(row: Row) {
  const fake = createFakeSupabase(row);
  vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(fake.client as never);
  return fake;
}

describe('Technician security', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('TECH_JWT_SECRET', () => {
    const original = { NODE_ENV: env.NODE_ENV, TECH_JWT_SECRET: env.TECH_JWT_SECRET };
    afterEach(() => {
      (env as { NODE_ENV: string }).NODE_ENV = original.NODE_ENV;
      (env as { TECH_JWT_SECRET?: string }).TECH_JWT_SECRET = original.TECH_JWT_SECRET;
    });

    it('never uses the Supabase service-role key and fails closed in production', () => {
      expect(resolveTechTokenSecret('production', undefined)).toBeNull();
      expect(resolveTechTokenSecret('production', 'too-short-secret')).toBeNull();
      expect(resolveTechTokenSecret('production', 'x'.repeat(32))).toBe('x'.repeat(32));
      expect(resolveTechTokenSecret('test', undefined)).toBe(DEV_ONLY_TECH_JWT_SECRET);
      expect(resolveTechTokenSecret('development', undefined)).not.toBe(env.SUPABASE_SERVICE_ROLE_KEY);
    });

    it('answers 503 on technician login and token checks when the secret is missing in production', async () => {
      const token = signTechToken({ id: TECH_ID, technicianCode: 'TECH-0042', phone: '9820012345', name: 'Ravi' });
      useFake(baseTech());
      (env as { NODE_ENV: string }).NODE_ENV = 'production';
      (env as { TECH_JWT_SECRET?: string }).TECH_JWT_SECRET = undefined;

      const login = await request(app).post('/api/v1/tech/login').send({ identifier: 'TECH-0042', pin: '4826' });
      expect(login.status).toBe(503);
      expect(login.body.error.message).toBe('Technician login is not configured');

      const me = await request(app).get('/api/v1/tech/me').set('Authorization', `Bearer ${token}`);
      expect(me.status).toBe(503);
    });

    it('tokens signed with a different secret are rejected', () => {
      (env as { TECH_JWT_SECRET?: string }).TECH_JWT_SECRET = 'a'.repeat(40);
      const token = signTechToken({ id: TECH_ID, technicianCode: 'T', phone: '1', name: 'n' });
      (env as { TECH_JWT_SECRET?: string }).TECH_JWT_SECRET = 'b'.repeat(40);
      expect(verifyTechToken(token)).toBeNull();
    });
  });

  describe('new PIN rules', () => {
    it.each([
      ['12345', 'exactly 6 digits'],
      ['1234567', 'exactly 6 digits'],
      ['123456', 'run of digits'],
      ['987654', 'run of digits'],
      ['000000', 'same digit'],
      ['777777', 'same digit'],
      ['121212', 'too easy'],
      ['482482', 'too easy'],
    ])('rejects %s', (pin, why) => {
      expect(validateNewTechPin(pin)).toMatch(new RegExp(why, 'i'));
    });

    it('rejects the old PIN and accepts a reasonable one', () => {
      const oldHash = hashPin('582941');
      expect(validateNewTechPin('582941', { hash: oldHash })).toMatch(/different/i);
      expect(validateNewTechPin('582941', { pin: '582941' })).toMatch(/different/i);
      expect(validateNewTechPin('582941', { pin: '4826', hash: hashPin('4826') })).toBeNull();
    });
  });

  describe('forced PIN change', () => {
    it('login with the default PIN only gives a pin-change token that cannot use the portal', async () => {
      const fake = useFake(baseTech({ pin_hash: hashPin('1234') }));

      const login = await request(app).post('/api/v1/tech/login').send({ identifier: 'TECH-0042', pin: '1234' });
      expect(login.status).toBe(200);
      expect(login.body.data.pinChangeRequired).toBe(true);
      const limitedToken = login.body.data.token as string;
      expect(verifyTechToken(limitedToken)?.scope).toBe('pin_change');

      const me = await request(app).get('/api/v1/tech/me').set('Authorization', `Bearer ${limitedToken}`);
      expect(me.status).toBe(403);
      expect(me.body.error.code).toBe('PIN_CHANGE_REQUIRED');

      // Weak new PIN is refused
      const weak = await request(app)
        .patch('/api/v1/tech/pin')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({ currentPin: '1234', newPin: '123456' });
      expect(weak.status).toBe(400);

      // 4-digit new PIN is refused by validation
      const short = await request(app)
        .patch('/api/v1/tech/pin')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({ currentPin: '1234', newPin: '5829' });
      expect([400, 422]).toContain(short.status);

      const ok = await request(app)
        .patch('/api/v1/tech/pin')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({ currentPin: '1234', newPin: '582941' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.updated).toBe(true);
      expect(fake.state.tech.pin_reset_required).toBe(false);
      expect(fake.state.tech.token_version).toBe(1);
      expect(verifyPin('582941', fake.state.tech.pin_hash as string)).toBe(true);

      const fullToken = ok.body.data.token as string;
      expect(verifyTechToken(fullToken)?.scope).toBe('full');

      // The limited token is now revoked (token_version changed)
      const reuse = await request(app)
        .patch('/api/v1/tech/pin')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({ currentPin: '582941', newPin: '730518' });
      expect(reuse.status).toBe(401);

      // The new full token passes the auth check
      const meAfter = await request(app).get('/api/v1/tech/me').set('Authorization', `Bearer ${fullToken}`);
      expect([401, 403]).not.toContain(meAfter.status);
    });

    it('an account flagged pin_reset_required is forced to change even with a non-default PIN', async () => {
      useFake(baseTech({ pin_reset_required: true }));
      const login = await request(app).post('/api/v1/tech/login').send({ identifier: 'TECH-0042', pin: '4826' });
      expect(login.status).toBe(200);
      expect(login.body.data.pinChangeRequired).toBe(true);

      // Even a full-scope token is refused while the flag is set
      const fullToken = signTechToken({ id: TECH_ID, technicianCode: 'TECH-0042', phone: '9820012345', name: 'Ravi', tokenVersion: 0 });
      const me = await request(app).get('/api/v1/tech/me').set('Authorization', `Bearer ${fullToken}`);
      expect(me.status).toBe(403);
      expect(me.body.error.code).toBe('PIN_CHANGE_REQUIRED');
    });

    it('a normal login returns a full token', async () => {
      useFake(baseTech());
      const login = await request(app).post('/api/v1/tech/login').send({ identifier: 'TECH-0042', pin: '4826' });
      expect(login.status).toBe(200);
      expect(login.body.data.pinChangeRequired).toBe(false);
      expect(verifyTechToken(login.body.data.token)?.scope).toBe('full');
    });
  });

  describe('lockout', () => {
    it('locks the account for 15 minutes after 5 wrong PINs, even for the right PIN', async () => {
      const fake = useFake(baseTech());
      for (let i = 1; i <= 4; i++) {
        const res = await request(app).post('/api/v1/tech/login').send({ identifier: 'TECH-0042', pin: '0000' });
        expect(res.status).toBe(401);
        expect(res.body.error.message).toBe('Wrong technician code, mobile number or PIN.');
        expect(fake.state.tech.failed_pin_attempts).toBe(i);
      }
      const fifth = await request(app).post('/api/v1/tech/login').send({ identifier: 'TECH-0042', pin: '0000' });
      expect(fifth.status).toBe(429);
      expect(fifth.body.error.code).toBe('TECH_LOGIN_LOCKED');
      const lockedUntil = Date.parse(fake.state.tech.locked_until as string);
      expect(lockedUntil - Date.now()).toBeGreaterThan(14 * 60 * 1000);
      expect(lockedUntil - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);

      const right = await request(app).post('/api/v1/tech/login').send({ identifier: 'TECH-0042', pin: '4826' });
      expect(right.status).toBe(429);
    });

    it('a successful login clears the failure counter', async () => {
      const fake = useFake(baseTech({ failed_pin_attempts: 3 }));
      const res = await request(app).post('/api/v1/tech/login').send({ identifier: 'TECH-0042', pin: '4826' });
      expect(res.status).toBe(200);
      expect(fake.state.tech.failed_pin_attempts).toBe(0);
    });

    it('an expired lock no longer blocks login', async () => {
      useFake(baseTech({ locked_until: new Date(Date.now() - 1000).toISOString() }));
      const res = await request(app).post('/api/v1/tech/login').send({ identifier: 'TECH-0042', pin: '4826' });
      expect(res.status).toBe(200);
    });
  });

  describe('token_version', () => {
    it('tokens from before a PIN change/reset stop working', async () => {
      useFake(baseTech({ token_version: 3 }));
      const stale = signTechToken({ id: TECH_ID, technicianCode: 'TECH-0042', phone: '9820012345', name: 'Ravi', tokenVersion: 2 });
      const current = signTechToken({ id: TECH_ID, technicianCode: 'TECH-0042', phone: '9820012345', name: 'Ravi', tokenVersion: 3 });

      const staleRes = await request(app).get('/api/v1/tech/me').set('Authorization', `Bearer ${stale}`);
      expect(staleRes.status).toBe(401);

      const currentRes = await request(app).get('/api/v1/tech/me').set('Authorization', `Bearer ${current}`);
      expect([401, 403]).not.toContain(currentRes.status);
    });

    it('admin PIN reset forces a new PIN and bumps token_version', async () => {
      const fake = useFake(baseTech({ token_version: 4, failed_pin_attempts: 2, locked_until: new Date(Date.now() + 60000).toISOString() }));
      await technicianService.resetPin(TECH_ID, '7391');
      expect(fake.state.tech.pin_reset_required).toBe(true);
      expect(fake.state.tech.token_version).toBe(5);
      expect(fake.state.tech.failed_pin_attempts).toBe(0);
      expect(fake.state.tech.locked_until).toBeNull();
      expect(verifyPin('7391', fake.state.tech.pin_hash as string)).toBe(true);
    });
  });
});
