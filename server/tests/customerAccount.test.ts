import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import * as supabaseLib from '../src/lib/supabase.js';
import { emailOutboxService } from '../src/services/email/emailOutbox.service.js';
import { customerAccountService, CodeRejectedError, normalizeEmail } from '../src/services/customerAccount.service.js';

/**
 * A tiny in-memory stand-in for the Supabase query builder: enough for customerAccount.service.
 * Rows live in `db`; filters eq / is / gt / gte / ilike are applied; inner-join filtering on
 * customers -> customer_portal_accounts is emulated for the sign-in lookup.
 */
type Row = Record<string, any>;
let db: Record<string, Row[]>;
let idSeq = 0;

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  let payload: Row | null = null;
  let head = false;
  let wantRows = false;
  let single = false;
  let limitN = Infinity;
  let order: { col: string; asc: boolean } | null = null;
  const self: any = {
    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (op === 'select') head = Boolean(opts?.head);
      else wantRows = true;
      return self;
    },
    insert(row: Row) { op = 'insert'; payload = row; return self; },
    update(row: Row) { op = 'update'; payload = row; return self; },
    upsert(row: Row) { op = 'upsert'; payload = row; return self; },
    eq(col: string, v: unknown) {
      if (col.startsWith('customer_portal_accounts.')) {
        const c = col.split('.')[1];
        filters.push((r) => (db.customer_portal_accounts ?? []).some((a) => a.customer_id === r.id && a[c] === v));
      } else filters.push((r) => r[col] === v);
      return self;
    },
    is(col: string, v: unknown) { filters.push((r) => (r[col] ?? null) === v); return self; },
    gt(col: string, v: string) { filters.push((r) => r[col] > v); return self; },
    gte(col: string, v: string) { filters.push((r) => r[col] >= v); return self; },
    ilike(col: string, v: string) { filters.push((r) => String(r[col] ?? '').toLowerCase() === v.toLowerCase()); return self; },
    order(col: string, o: { ascending: boolean }) { order = { col, asc: o.ascending }; return self; },
    limit(n: number) { limitN = n; return self; },
    maybeSingle() { single = true; return self; },
    then(resolve: (v: unknown) => void) {
      const rows = (db[table] ??= []);
      if (op === 'insert') {
        rows.push({ id: `id-${++idSeq}`, attempts: 0, consumed_at: null, revoked_at: null, created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), ...payload });
        return resolve({ data: null, error: null });
      }
      if (op === 'upsert') {
        const i = rows.findIndex((r) => r.customer_id === payload!.customer_id);
        if (i >= 0) rows[i] = { ...rows[i], ...payload }; else rows.push({ ...payload });
        return resolve({ data: null, error: null });
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') {
        matched.forEach((r) => Object.assign(r, payload));
        return resolve({ data: wantRows ? matched.map((r) => ({ id: r.id })) : null, error: null });
      }
      let out = [...matched];
      if (order) out.sort((a, b) => (a[order!.col] > b[order!.col] ? 1 : -1) * (order!.asc ? 1 : -1));
      out = out.slice(0, limitN);
      if (head) return resolve({ count: matched.length, data: null, error: null });
      return resolve({ data: single ? (out[0] ?? null) : out, error: null });
    },
  };
  return self;
}

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
let sent: Array<{ to: string; text: string }>;

function codeFromLastEmail(): string {
  return sent.at(-1)!.text.match(/code is (\d{6})/)![1];
}

beforeEach(() => {
  vi.restoreAllMocks();
  idSeq = 0;
  sent = [];
  db = {
    customers: [
      { id: 'c-perm', name: 'Asha', email: 'Asha@Example.com', customer_type: 'PERMANENT', is_active: true },
      { id: 'c-off', name: 'Ravi', email: 'ravi@example.com', customer_type: 'PERMANENT', is_active: true },
      { id: 'c-temp', name: 'Temp', email: 'temp@example.com', customer_type: 'TEMPORARY', is_active: true },
    ],
    customer_portal_accounts: [
      { customer_id: 'c-perm', enabled: true },
      { customer_id: 'c-off', enabled: false },
    ],
    customer_login_otps: [],
    customer_portal_sessions: [],
  };
  vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({ from: (t: string) => builder(t) } as never);
  vi.spyOn(emailOutboxService, 'enqueueAndSend').mockImplementation(async (input: any) => {
    sent.push({ to: input.recipientEmail, text: input.text });
    return {} as never;
  });
});

describe('customer accounts: sign-in codes and sessions (S11)', () => {
  it('normalises emails and refuses junk', () => {
    expect(normalizeEmail('  Asha@Example.COM ')).toBe('asha@example.com');
    expect(normalizeEmail('not an email')).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it('emails a code only to an active permanent customer with access switched on; stores only a hash', async () => {
    for (const e of ['nobody@example.com', 'ravi@example.com', 'temp@example.com', 'junk']) await customerAccountService.requestCode(e);
    expect(sent).toHaveLength(0);
    expect(db.customer_login_otps).toHaveLength(0);

    await customerAccountService.requestCode('asha@example.com');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('asha@example.com');
    const code = codeFromLastEmail();
    expect(db.customer_login_otps).toHaveLength(1);
    expect(JSON.stringify(db.customer_login_otps)).not.toContain(code);
    expect(db.customer_login_otps[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('at most 3 codes per 15 minutes', async () => {
    for (let i = 0; i < 5; i++) await customerAccountService.requestCode('asha@example.com');
    expect(sent).toHaveLength(3);
  });

  it('the right code signs in once; the session token is stored only as a hash', async () => {
    await customerAccountService.requestCode('asha@example.com');
    const code = codeFromLastEmail();
    const { token } = await customerAccountService.verifyCode('ASHA@example.com', code);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(db.customer_portal_sessions[0].token_hash).toBe(sha(token));
    expect(JSON.stringify(db.customer_portal_sessions)).not.toContain(token);
    await expect(customerAccountService.verifyCode('asha@example.com', code)).rejects.toBeInstanceOf(CodeRejectedError); // single use
    expect(await customerAccountService.resolveSession(token)).toBe('c-perm');
  });

  it('wrong codes count; after 5 wrong tries even the right code is refused', async () => {
    await customerAccountService.requestCode('asha@example.com');
    const code = codeFromLastEmail();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await expect(customerAccountService.verifyCode('asha@example.com', wrong)).rejects.toBeInstanceOf(CodeRejectedError);
    await expect(customerAccountService.verifyCode('asha@example.com', code)).rejects.toBeInstanceOf(CodeRejectedError);
    expect(db.customer_portal_sessions).toHaveLength(0);
  });

  it('an expired code is refused', async () => {
    await customerAccountService.requestCode('asha@example.com');
    const code = codeFromLastEmail();
    db.customer_login_otps[0].expires_at = new Date(Date.now() - 1000).toISOString();
    await expect(customerAccountService.verifyCode('asha@example.com', code)).rejects.toBeInstanceOf(CodeRejectedError);
  });

  it('sessions end when revoked, expired, idle 7 days, signed out, or access is switched off', async () => {
    await customerAccountService.requestCode('asha@example.com');
    const { token } = await customerAccountService.verifyCode('asha@example.com', codeFromLastEmail());
    const s = db.customer_portal_sessions[0];
    expect(await customerAccountService.resolveSession(token)).toBe('c-perm');

    s.last_seen_at = new Date(Date.now() - 8 * 86_400_000).toISOString();
    expect(await customerAccountService.resolveSession(token)).toBeNull();
    s.last_seen_at = new Date().toISOString();

    s.expires_at = new Date(Date.now() - 1).toISOString();
    expect(await customerAccountService.resolveSession(token)).toBeNull();
    s.expires_at = new Date(Date.now() + 86_400_000).toISOString();

    db.customer_portal_accounts[0].enabled = false;
    expect(await customerAccountService.resolveSession(token)).toBeNull();
    db.customer_portal_accounts[0].enabled = true;

    await customerAccountService.signOut(token);
    expect(await customerAccountService.resolveSession(token)).toBeNull();
    expect(await customerAccountService.resolveSession('not-a-token')).toBeNull();
  });
});
