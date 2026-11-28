import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as supabaseLib from '../src/lib/supabase.js';
import { resendTransport } from '../src/services/email/emailTransport.service.js';
import { customerAccountService, CodeRejectedError, normalizeEmail, OTP_EMAIL_SUBJECT } from '../src/services/customerAccount.service.js';
import { createFakeDb, type FakeDb, type Row } from './helpers/portalFakeDb.js';

let fake: FakeDb;
let db: Record<string, Row[]>;

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
let sent: Array<{ to: string; subject: string; text: string; html: string }>;

function codeFromLastEmail(): string {
  return sent.at(-1)!.text.match(/code is (\d{6})/)![1];
}

beforeEach(() => {
  vi.restoreAllMocks();
  sent = [];
  fake = createFakeDb({
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
    email_deliveries: [],
  });
  db = fake.db;
  vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(fake.client as never);
  // The real outbox runs (it stores a row in email_deliveries); only the transport is replaced.
  vi.spyOn(resendTransport, 'send').mockImplementation(async (p: any) => {
    sent.push({ to: p.to, subject: p.subject, text: p.text, html: p.html });
    return { transport: 'dev-log', providerMessageId: `m-${sent.length}`, effectiveRecipient: p.to, sandboxRedirected: false } as never;
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

  it('an email with wildcard characters never matches another customer (no code, no sign-in)', async () => {
    db.customers.push({ id: 'c-bob', name: 'Bob', email: 'bob1@outlook.com', customer_type: 'PERMANENT', is_active: true });
    db.customer_portal_accounts.push({ customer_id: 'c-bob', enabled: true });
    for (const e of ['bob_@outlook.com', 'bob%@outlook.com', 'b%@outlook.com', 'bob*@outlook.com', '%@outlook.com', 'asha@example.co_', 'ASHA@EXAMPLE.CO%']) {
      await customerAccountService.requestCode(e);
    }
    expect(sent).toHaveLength(0);
    expect(db.customer_login_otps).toHaveLength(0);
  });

  it('the code goes to the stored email address (the outbox lowercases it), whatever case was typed', async () => {
    await customerAccountService.requestCode('  ASHA@example.COM ');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('asha@example.com');
    expect(db.email_deliveries[0].recipient_email).toBe(String(db.customers[0].email).toLowerCase());
  });

  it('a stored email that only matches by wildcard is not used, even if the database returned it', async () => {
    // Belt and braces: the in-code check refuses a row whose email is not the typed one.
    db.customers.push({ id: 'c-x', name: 'X', email: 'x1@example.com', customer_type: 'PERMANENT', is_active: true });
    db.customer_portal_accounts.push({ customer_id: 'c-x', enabled: true });
    await customerAccountService.requestCode('x\\1@example.com');
    expect(sent).toHaveLength(0);
  });

  it('a code whose email failed is removed, so a mail outage does not use up the 3-per-15-minutes limit', async () => {
    const send = vi.mocked(resendTransport.send);
    const working = send.getMockImplementation()!;
    send.mockRejectedValue(new Error('smtp down'));
    for (let i = 0; i < 3; i++) await customerAccountService.requestCode('asha@example.com');
    expect(db.customer_login_otps).toHaveLength(0);
    send.mockImplementation(working);
    await customerAccountService.requestCode('asha@example.com');
    expect(sent).toHaveLength(1);
    expect(db.customer_login_otps).toHaveLength(1);
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

  it('F1: the code is never stored - not in the subject, not in the kept email copy; delivery is still tracked', async () => {
    await customerAccountService.requestCode('asha@example.com');
    const code = codeFromLastEmail();
    expect(sent[0].subject).toBe(OTP_EMAIL_SUBJECT);
    expect(sent[0].subject).not.toContain(code);
    expect(sent[0].html).toContain(code); // the customer still gets it

    expect(db.email_deliveries).toHaveLength(1);
    const row = db.email_deliveries[0];
    expect(row.subject).toBe(OTP_EMAIL_SUBJECT);
    expect(row.text_body).toContain('[sign-in code removed]');
    expect(row.html_body).toContain('[sign-in code removed]');
    expect(row.status).toBe('SENT');
    expect(row.retryable).toBe(false); // never resent automatically from the redacted copy
    expect(row.max_attempts).toBe(1);
    expect(JSON.stringify(db)).not.toContain(code);
  });
});

describe('customer accounts: 24-hour lock after 10 wrong codes (S11 F2)', () => {
  const wrongFor = (code: string) => (code === '000000' ? '111111' : '000000');
  /** Moves every existing code back in time (past the 15-minute "3 codes" limit, still inside 24 h). */
  const age = (minutes: number) => {
    for (const o of db.customer_login_otps) o.created_at = new Date(new Date(o.created_at).getTime() - minutes * 60_000).toISOString();
  };
  const locks = () => (db.activity_logs ?? []).filter((l) => l.action === 'CUSTOMER_PORTAL_SIGNIN_LOCKED');

  it('counts wrong codes across codes; the 10th locks sign-in for 24 h with the same CODE_REJECTED answer', async () => {
    await customerAccountService.requestCode('asha@example.com');
    const c1 = codeFromLastEmail();
    for (let i = 0; i < 5; i++) await expect(customerAccountService.verifyCode('asha@example.com', wrongFor(c1))).rejects.toBeInstanceOf(CodeRejectedError);
    age(20);
    await customerAccountService.requestCode('asha@example.com');
    const c2 = codeFromLastEmail();
    for (let i = 0; i < 4; i++) await expect(customerAccountService.verifyCode('asha@example.com', wrongFor(c2))).rejects.toBeInstanceOf(CodeRejectedError);
    expect(db.customer_portal_accounts[0].signin_locked_until ?? null).toBeNull(); // 9 wrong: not yet
    expect(locks()).toHaveLength(0);

    await expect(customerAccountService.verifyCode('asha@example.com', wrongFor(c2))).rejects.toBeInstanceOf(CodeRejectedError); // 10th
    const until = new Date(db.customer_portal_accounts[0].signin_locked_until).getTime();
    expect(until - Date.now()).toBeGreaterThan(23.9 * 3_600_000);
    expect(until - Date.now()).toBeLessThanOrEqual(24 * 3_600_000);
    expect(locks()).toHaveLength(1);
    expect(locks()[0]).toMatchObject({ entity_type: 'customer', entity_id: 'c-perm', actor_profile_id: null });

    // While locked: a fresh code is not emailed, and even a right code is refused with the same error.
    age(20);
    const before = sent.length;
    await customerAccountService.requestCode('asha@example.com');
    expect(sent).toHaveLength(before);
    db.customer_login_otps.push({ ...db.customer_login_otps.at(-1)!, id: 'live', attempts: 0, consumed_at: null, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600_000).toISOString() });
    const err = await customerAccountService.verifyCode('asha@example.com', c2).catch((e) => e);
    expect(err).toBeInstanceOf(CodeRejectedError);
    expect(err.message).toBe(new CodeRejectedError().message);
    expect(db.customer_portal_sessions).toHaveLength(0);
    expect(locks()).toHaveLength(1); // logged once, not on every refused try
  });

  it('wrong codes older than 24 h do not count, and the lock ends after 24 h', async () => {
    await customerAccountService.requestCode('asha@example.com');
    const c1 = codeFromLastEmail();
    for (let i = 0; i < 5; i++) await expect(customerAccountService.verifyCode('asha@example.com', wrongFor(c1))).rejects.toBeInstanceOf(CodeRejectedError);
    age(25 * 60); // a day ago
    await customerAccountService.requestCode('asha@example.com');
    const c2 = codeFromLastEmail();
    for (let i = 0; i < 4; i++) await expect(customerAccountService.verifyCode('asha@example.com', wrongFor(c2))).rejects.toBeInstanceOf(CodeRejectedError);
    expect(db.customer_portal_accounts[0].signin_locked_until ?? null).toBeNull();
    const { token } = await customerAccountService.verifyCode('asha@example.com', c2);
    expect(await customerAccountService.resolveSession(token)).toBe('c-perm');

    // An expired lock no longer blocks.
    db.customer_portal_accounts[0].signin_locked_until = new Date(Date.now() - 1000).toISOString();
    age(20);
    await customerAccountService.requestCode('asha@example.com');
    await expect(customerAccountService.verifyCode('asha@example.com', codeFromLastEmail())).resolves.toHaveProperty('token');
  });

  it('staff switching access on again lifts the lock', async () => {
    db.customer_portal_accounts[0].signin_locked_until = new Date(Date.now() + 3_600_000).toISOString();
    await customerAccountService.setAccess('c-perm', true, 'staff-1');
    expect(db.customer_portal_accounts[0].signin_locked_until).toBeNull();
  });

  it('every switch on or off is in the activity log with the staff member; switching off signs the customer out', async () => {
    await customerAccountService.requestCode('asha@example.com');
    const { token } = await customerAccountService.verifyCode('asha@example.com', codeFromLastEmail());
    await customerAccountService.setAccess('c-perm', false, 'staff-1');
    expect(await customerAccountService.resolveSession(token)).toBeNull();
    await customerAccountService.setAccess('c-perm', true, 'staff-2');
    const logs = (db.activity_logs ?? []).filter((l) => String(l.action).startsWith('CUSTOMER_PORTAL_ACCESS'));
    expect(logs.map((l) => [l.action, l.actor_profile_id, l.entity_id])).toEqual([
      ['CUSTOMER_PORTAL_ACCESS_OFF', 'staff-1', 'c-perm'],
      ['CUSTOMER_PORTAL_ACCESS_ON', 'staff-2', 'c-perm'],
    ]);
  });

  it('access cannot be switched on for a customer without a usable email', async () => {
    db.customers.push({ id: 'c-noemail', name: 'No Mail', email: null, customer_type: 'PERMANENT', is_active: true });
    db.customers.push({ id: 'c-bad', name: 'Bad Mail', email: 'not-an-email', customer_type: 'PERMANENT', is_active: true });
    await expect(customerAccountService.setAccess('c-noemail', true, 'staff-1')).rejects.toThrow('NO_EMAIL');
    await expect(customerAccountService.setAccess('c-bad', true, 'staff-1')).rejects.toThrow('NO_EMAIL');
    expect(db.customer_portal_accounts.some((a) => a.customer_id === 'c-noemail' || a.customer_id === 'c-bad')).toBe(false);
  });
});

describe('customer accounts: AMC visits used / left in the overview (S11 G1)', () => {
  const sched = (id: string, amc: string, status: string, extra: Row = {}) => ({
    id, amc_id: amc, status, scheduled_date: '2026-10-01', service_request_id: null, rescheduled_from_id: null, ...extra,
  });

  it('counts completed visits like the dashboard: per covered AC, no follow-ups, no unresolved pending reports, capped', async () => {
    db.customer_sites = [];
    db.service_requests = [];
    db.payments = [];
    db.amc_contracts = [
      { id: 'amc-1', customer_id: 'c-perm', contract_number: 'AMC-1', status: 'ACTIVE', total_visits: 4, end_date: '2027-03-31', amc_assets: [{ id: 'x1' }, { id: 'x2' }] },
      { id: 'amc-2', customer_id: 'c-perm', contract_number: 'AMC-2', status: 'ACTIVE', total_visits: 1, end_date: '2027-02-28', amc_assets: [] },
      { id: 'amc-3', customer_id: 'c-perm', contract_number: 'AMC-3', status: 'ACTIVE', total_visits: null, end_date: '2027-01-31', amc_assets: [] },
      { id: 'amc-other', customer_id: 'c-off', contract_number: 'AMC-X', status: 'ACTIVE', total_visits: 4, end_date: '2027-01-31', amc_assets: [] },
    ];
    db.service_schedules = [
      sched('s1', 'amc-1', 'COMPLETED'),
      sched('s2', 'amc-1', 'COMPLETED'),
      sched('s3', 'amc-1', 'RESOLVED'),
      sched('s4', 'amc-1', 'COMPLETED', { service_reports: [{ primary_outcome: 'PENDING_PARTS', resolution_status: 'OPEN' }] }),
      sched('s5', 'amc-1', 'COMPLETED', { rescheduled_from_id: 's1' }),
      sched('s6', 'amc-1', 'SCHEDULED'),
      sched('s7', 'amc-2', 'COMPLETED'),
      sched('s8', 'amc-2', 'COMPLETED'),
      sched('s9', 'amc-3', 'COMPLETED'),
      sched('s10', 'amc-3', 'CANCELLED'),
      sched('s11', 'amc-other', 'COMPLETED'),
    ];
    const o = await customerAccountService.overview('c-perm');
    const by = Object.fromEntries(o.amc.map((c) => [c.contractNumber, c]));
    expect(Object.keys(by).sort()).toEqual(['AMC-1', 'AMC-2', 'AMC-3']);
    expect(by['AMC-1']).toMatchObject({ totalVisits: 4, acCount: 2, visitsUsed: 1, visitsLeft: 3 }); // 3 valid / 2 ACs
    expect(by['AMC-2']).toMatchObject({ totalVisits: 1, visitsUsed: 1, visitsLeft: 0 }); // capped, never negative
    expect(by['AMC-3']).toMatchObject({ totalVisits: null, visitsUsed: 1, visitsLeft: null });
  });
});

describe('customer accounts: an email change ends sessions and voids unused codes (S11 F4)', () => {
  const changeEmail = (email: string) => fake.client.from('customers').update({ email }).eq('id', 'c-perm');

  it('a real change revokes every session and a code sent to the old address stops working', async () => {
    await customerAccountService.requestCode('asha@example.com');
    const { token } = await customerAccountService.verifyCode('asha@example.com', codeFromLastEmail());
    db.customer_login_otps.forEach((o) => (o.created_at = new Date(Date.now() - 20 * 60_000).toISOString()));
    await customerAccountService.requestCode('asha@example.com');
    const pending = codeFromLastEmail();

    await changeEmail('asha.new@example.com');
    expect(await customerAccountService.resolveSession(token)).toBeNull();
    expect(db.customer_portal_sessions.every((s) => s.revoked_at)).toBe(true);
    await expect(customerAccountService.verifyCode('asha.new@example.com', pending)).rejects.toBeInstanceOf(CodeRejectedError);
    await expect(customerAccountService.verifyCode('asha@example.com', pending)).rejects.toBeInstanceOf(CodeRejectedError);

    // The new address works normally.
    await customerAccountService.requestCode('asha.new@example.com');
    await expect(customerAccountService.verifyCode('asha.new@example.com', codeFromLastEmail())).resolves.toHaveProperty('token');
  });

  it('a change of letter case only keeps the session', async () => {
    await customerAccountService.requestCode('asha@example.com');
    const { token } = await customerAccountService.verifyCode('asha@example.com', codeFromLastEmail());
    await changeEmail('ASHA@example.COM');
    expect(await customerAccountService.resolveSession(token)).toBe('c-perm');
  });

  it('the migration installs the matching trigger on customers.email (case-insensitive)', () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261127000000_customer_portal_hardening.sql'), 'utf8');
    expect(sql).toMatch(/CREATE TRIGGER trg_customer_portal_email_change AFTER UPDATE OF email ON public\.customers/);
    expect(sql).toMatch(/lower\(COALESCE\(NEW\.email, ''\)\) IS DISTINCT FROM lower\(COALESCE\(OLD\.email, ''\)\)/);
    expect(sql).toMatch(/UPDATE public\.customer_portal_sessions\s+SET revoked_at = now\(\)/);
    expect(sql).toMatch(/UPDATE public\.customer_login_otps\s+SET expires_at = now\(\)/);
  });
});
