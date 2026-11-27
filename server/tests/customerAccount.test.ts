import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
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
