import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { customerStatusFor } from '../domain/customerStatus.js';
import { customerPortalService } from './customerPortal.service.js';
import { emailOutboxService } from './email/emailOutbox.service.js';
import { logActivity } from './audit.service.js';

/**
 * S11: customer accounts on the ESS website (migration 20261125030000).
 * Sign-in: email -> one-time 6-digit code by email (10 min, 5 tries) -> session token (30 days max, 7 days idle).
 * Codes and tokens are stored only as keyed/plain SHA-256 hashes. Answers never reveal whether an email has an account.
 */

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_15_MIN = 3;
export const SESSION_MAX_DAYS = 30;
export const SESSION_IDLE_DAYS = 7;
/** F2: an account's sign-in locks for ACCOUNT_LOCK_HOURS after this many wrong codes within ACCOUNT_LOCK_WINDOW_HOURS. */
export const ACCOUNT_MAX_WRONG_CODES = 10;
export const ACCOUNT_LOCK_WINDOW_HOURS = 24;
export const ACCOUNT_LOCK_HOURS = 24;
/** F3: per visitor (ESS sends a hash of the visitor's network address), per hour. */
export const VISITOR_MAX_CODE_REQUESTS_PER_HOUR = 10;
export const VISITOR_MAX_WRONG_CODES_PER_HOUR = 20;
const VISITOR_WINDOW_MINUTES = 60;

export class CodeRejectedError extends Error {
  constructor() {
    super('That code is not right or has expired. Ask for a new code.');
    this.name = 'CodeRejectedError';
  }
}

/** F3: this visitor made too many tries this hour. Says nothing about any account. */
export class RateLimitedError extends Error {
  constructor() {
    super('Too many tries. Please wait an hour and try again.');
    this.name = 'RateLimitedError';
  }
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Keyed hash for codes. The key is derived from the server's integration secret (no new setting needed). */
function codeHash(customerId: string, code: string): string {
  const secret = env.INTEGRATION_SECRET_KEY ?? (env.NODE_ENV === 'production' ? null : 'dev-only-portal-otp-key');
  if (!secret) throw new Error('INTEGRATION_SECRET_KEY is required for customer sign-in codes');
  const key = createHmac('sha256', secret).update('customer-portal-otp-v1').digest();
  return createHmac('sha256', key).update(`${customerId}:${code}`).digest('hex');
}

/**
 * F3: the visitor key. ESS sends `clientIpHash` (64 lowercase hex, the same value it sends to /track); anything else
 * is ignored. Only a further hash is stored, never the value ESS sent.
 */
export function visitorKey(kind: 'code' | 'signin', clientIpHash: unknown): string | null {
  if (typeof clientIpHash !== 'string' || !/^[0-9a-f]{64}$/.test(clientIpHash)) return null;
  return sha256(`portal:${kind}:ip:${clientIpHash}`);
}

async function recordVisitorHit(key: string): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc('record_portal_visitor_hit', {
    p_key_hash: key,
    p_window_minutes: VISITOR_WINDOW_MINUTES,
  });
  if (error) throw new Error(`Failed to record the visitor limit: ${error.message}`);
  return Number(data ?? 0);
}

async function visitorOverLimit(key: string, max: number): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from('customer_portal_visitor_limits')
    .select('hits, window_started_at')
    .eq('key_hash', key)
    .maybeSingle();
  if (error) throw new Error(`Failed to check the visitor limit: ${error.message}`);
  const r = data as { hits: number; window_started_at: string } | null;
  if (!r) return false;
  const fresh = new Date(r.window_started_at).getTime() > Date.now() - VISITOR_WINDOW_MINUTES * 60_000;
  return fresh && r.hits >= max;
}

/** F2: true while the account's sign-in is locked after too many wrong codes. */
async function isSignInLocked(customerId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from('customer_portal_accounts')
    .select('signin_locked_until')
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to check the sign-in lock: ${error.message}`);
  const until = (data as { signin_locked_until?: string | null } | null)?.signin_locked_until;
  return Boolean(until && new Date(until).getTime() > Date.now());
}

/** F2: count a wrong code against the account; writes an activity-log entry when this one sets the lock. */
async function recordWrongCode(customerId: string): Promise<void> {
  const { data: lockedNow, error } = await getSupabaseClient().rpc('portal_record_wrong_code', {
    p_customer_id: customerId,
    p_max_wrong: ACCOUNT_MAX_WRONG_CODES,
    p_window_hours: ACCOUNT_LOCK_WINDOW_HOURS,
    p_lock_hours: ACCOUNT_LOCK_HOURS,
  });
  if (error) throw new Error(`Failed to record the wrong code: ${error.message}`);
  if (lockedNow === true) {
    logger.warn('Customer website sign-in locked after too many wrong codes', { outcome: 'portal_signin_locked' });
    await logActivity({
      actorProfileId: null,
      action: 'CUSTOMER_PORTAL_SIGNIN_LOCKED',
      entityType: 'customer',
      entityId: customerId,
      details: { wrongCodes: ACCOUNT_MAX_WRONG_CODES, windowHours: ACCOUNT_LOCK_WINDOW_HOURS, lockedHours: ACCOUNT_LOCK_HOURS },
    });
  }
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) ? e : null;
}

/** The customer behind an email who may sign in: active, PERMANENT, website access switched on. */
async function signInCustomer(email: string): Promise<{ id: string; name: string } | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, customer_type, is_active, customer_portal_accounts!inner(enabled)')
    .ilike('email', email)
    .eq('customer_type', 'PERMANENT')
    .eq('is_active', true)
    .eq('customer_portal_accounts.enabled', true)
    .limit(2);
  if (error) throw new Error(`Failed to look up the account: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; name: string; email?: string }>;
  // Two permanent customers sharing one email cannot be told apart: no sign-in for that email.
  return rows.length === 1 ? { id: rows[0].id, name: rows[0].name } : null;
}

export const OTP_EMAIL_SUBJECT = 'Your Extreme Sales & Services sign-in code';

/**
 * F1: the code is only in the body that is sent, never in the subject (subjects show in inbox lists and are stored
 * in email_deliveries) and never in the copy the outbox keeps (`stored`).
 */
export function otpEmail(name: string, code: string) {
  const subject = OTP_EMAIL_SUBJECT;
  const text = `Hello ${name},

Your Extreme Sales & Services sign-in code is ${code}. It works for ${OTP_TTL_MINUTES} minutes.

If you did not ask for it, you can ignore this email.`;
  const html = `<p>Hello ${escapeHtml(name)},</p><p>Your Extreme Sales &amp; Services sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It works for ${OTP_TTL_MINUTES} minutes. If you did not ask for it, you can ignore this email.</p>`;
  const removed = 'This copy does not include your sign-in code (codes are never kept). Please ask for a new code on the website.';
  const stored = {
    text: `Hello ${name},

[sign-in code removed] ${removed}`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>[sign-in code removed] ${removed}</p>`,
  };
  return { subject, text, html, stored };
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * G1: completed AMC visits per contract, counted the same way as the PYS dashboard (amc.service): a schedule counts
 * when it is COMPLETED/RESOLVED, is not a follow-up (rescheduled_from_id), and has no unresolved "pending parts /
 * repairs" report. Only contracts of the signed-in customer are passed in. null when the lookup fails.
 */
async function completedAmcVisits(contractIds: string[]): Promise<Map<string, number> | null> {
  const out = new Map<string, number>();
  if (contractIds.length === 0) return out;
  const { data, error } = await getSupabaseClient()
    .from('service_schedules')
    .select(
      'amc_id, status, rescheduled_from_id, service_reports:service_reports!service_reports_service_schedule_id_fkey (primary_outcome, resolution_status)'
    )
    .in('amc_id', contractIds);
  if (error) {
    logger.warn('Customer website: AMC visits lookup failed', { outcome: 'portal_amc_visits_failed' });
    return null;
  }
  for (const s of (data ?? []) as any[]) {
    if (!s.amc_id || s.rescheduled_from_id || !['COMPLETED', 'RESOLVED'].includes(s.status)) continue;
    const reports = Array.isArray(s.service_reports) ? s.service_reports : s.service_reports ? [s.service_reports] : [];
    const pending = reports.some(
      (r: any) => (r.primary_outcome === 'PENDING_PARTS' || r.primary_outcome === 'PENDING_REPAIRS') && r.resolution_status !== 'RESOLVED'
    );
    if (!pending) out.set(s.amc_id, (out.get(s.amc_id) ?? 0) + 1);
  }
  return out;
}

/**
 * G1: visits used / left for one contract. One visit covers every AC on the contract, so completed schedules are
 * divided by the number of ACs (as on the dashboard) and capped at the total.
 */
function amcVisits(c: any, completed: Map<string, number> | null): { visitsUsed: number | null; visitsLeft: number | null } {
  if (!completed) return { visitsUsed: null, visitsLeft: null };
  const acCount = Array.isArray(c.amc_assets) ? c.amc_assets.length : 0;
  const raw = completed.get(c.id) ?? 0;
  const perVisit = acCount > 0 ? Math.floor(raw / acCount) : raw;
  const total = typeof c.total_visits === 'number' ? c.total_visits : null;
  const visitsUsed = total === null ? perVisit : Math.min(total, perVisit);
  return { visitsUsed, visitsLeft: total === null ? null : Math.max(total - visitsUsed, 0) };
}

export const customerAccountService = {
  /** Always resolves the same way (the caller answers 202), whether or not the email has an account. */
  async requestCode(rawEmail: unknown, clientIpHash?: unknown): Promise<void> {
    // F3 first, before the email is looked at, so this answer cannot depend on the account.
    const vKey = visitorKey('code', clientIpHash);
    if (vKey && (await recordVisitorHit(vKey)) > VISITOR_MAX_CODE_REQUESTS_PER_HOUR) throw new RateLimitedError();

    const email = normalizeEmail(rawEmail);
    if (!email) return;
    const customer = await signInCustomer(email);
    if (!customer) return;
    if (await isSignInLocked(customer.id)) return; // F2: no new codes while locked (quietly)

    const supabase = getSupabaseClient();
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count, error: cErr } = await supabase
      .from('customer_login_otps')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer.id)
      .gte('created_at', since);
    if (cErr) throw new Error(`Failed to check recent codes: ${cErr.message}`);
    if ((count ?? 0) >= OTP_MAX_PER_15_MIN) return; // quietly limited

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const { error } = await supabase.from('customer_login_otps').insert({
      customer_id: customer.id,
      code_hash: codeHash(customer.id, code),
      expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
    });
    if (error) throw new Error(`Failed to store the code: ${error.message}`);

    const mail = otpEmail(customer.name, code);
    try {
      await emailOutboxService.enqueueAndSend({
        entityType: 'PORTAL_OTP',
        entityId: customer.id,
        templateKey: 'portal_otp',
        recipientEmail: email,
        recipientName: customer.name,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        storedCopy: mail.stored,
        tags: [{ name: 'kind', value: 'portal_otp' }],
      });
    } catch (err) {
      logger.warn('Sign-in code email failed', { outcome: 'portal_otp_email_failed', error: err instanceof Error ? err.name : 'error' });
    }
  },

  /**
   * Returns a new session token, or throws CodeRejectedError (same answer for every failure, including a locked
   * account) or RateLimitedError (this visitor made too many wrong tries this hour, F3).
   */
  async verifyCode(rawEmail: unknown, rawCode: unknown, clientIpHash?: unknown): Promise<{ token: string; expiresAt: string }> {
    const vKey = visitorKey('signin', clientIpHash);
    if (vKey && (await visitorOverLimit(vKey, VISITOR_MAX_WRONG_CODES_PER_HOUR))) throw new RateLimitedError();
    try {
      return await this.checkCodeAndStartSession(rawEmail, rawCode);
    } catch (err) {
      if (err instanceof CodeRejectedError && vKey) await recordVisitorHit(vKey);
      throw err;
    }
  },

  /** One atomic try of the newest live code; on a match, a new session. */
  async checkCodeAndStartSession(rawEmail: unknown, rawCode: unknown): Promise<{ token: string; expiresAt: string }> {
    const email = normalizeEmail(rawEmail);
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    if (!email || !/^\d{6}$/.test(code)) throw new CodeRejectedError();
    const customer = await signInCustomer(email);
    if (!customer) throw new CodeRejectedError();

    const supabase = getSupabaseClient();
    // Atomically takes one try of the newest live code. Nothing comes back while the account is locked (F2), when
    // there is no live code, or when the code has used up its tries, so parallel guesses cannot beat the limits.
    const { data: claimed, error } = await supabase.rpc('portal_claim_code_attempt', {
      p_customer_id: customer.id,
      p_max_attempts: OTP_MAX_ATTEMPTS,
    });
    if (error) throw new Error(`Failed to check the code: ${error.message}`);
    const otp = (Array.isArray(claimed) ? claimed[0] : claimed) as { otp_id: string; code_hash: string } | null | undefined;
    if (!otp?.otp_id) throw new CodeRejectedError();

    const expected = Buffer.from(otp.code_hash, 'hex');
    const given = Buffer.from(codeHash(customer.id, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await recordWrongCode(customer.id);
      throw new CodeRejectedError();
    }
    // Single use: only the first request that flips consumed_at wins.
    const { data: used, error: uErr } = await supabase
      .from('customer_login_otps')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', otp.otp_id)
      .is('consumed_at', null)
      .select('id');
    if (uErr) throw new Error(`Failed to use the code: ${uErr.message}`);
    if (!used || used.length !== 1) throw new CodeRejectedError();

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_MAX_DAYS * 86_400_000).toISOString();
    const { error: sErr } = await supabase
      .from('customer_portal_sessions')
      .insert({ customer_id: customer.id, token_hash: sha256(token), expires_at: expiresAt });
    if (sErr) throw new Error(`Failed to start the session: ${sErr.message}`);
    await supabase.from('customer_portal_accounts').update({ last_login_at: new Date().toISOString() }).eq('customer_id', customer.id);
    return { token, expiresAt };
  },

  /** The customer id for a live session, or null (unknown, revoked, expired, idle too long, access switched off). */
  async resolveSession(rawToken: unknown): Promise<string | null> {
    if (typeof rawToken !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(rawToken)) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('customer_portal_sessions')
      .select('id, customer_id, expires_at, last_seen_at, revoked_at')
      .eq('token_hash', sha256(rawToken))
      .maybeSingle();
    if (error) throw new Error(`Failed to check the session: ${error.message}`);
    const s = data as { id: string; customer_id: string; expires_at: string; last_seen_at: string; revoked_at: string | null } | null;
    if (!s || s.revoked_at) return null;
    const now = Date.now();
    if (new Date(s.expires_at).getTime() <= now) return null;
    if (now - new Date(s.last_seen_at).getTime() > SESSION_IDLE_DAYS * 86_400_000) return null;
    const { data: account, error: aErr } = await supabase
      .from('customer_portal_accounts')
      .select('enabled')
      .eq('customer_id', s.customer_id)
      .maybeSingle();
    if (aErr) throw new Error(`Failed to check website access: ${aErr.message}`);
    if (account?.enabled !== true) return null;
    if (now - new Date(s.last_seen_at).getTime() > 5 * 60_000) {
      await supabase.from('customer_portal_sessions').update({ last_seen_at: new Date(now).toISOString() }).eq('id', s.id);
    }
    return s.customer_id;
  },

  async signOut(rawToken: unknown): Promise<void> {
    if (typeof rawToken !== 'string' || !rawToken) return;
    await getSupabaseClient()
      .from('customer_portal_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', sha256(rawToken))
      .is('revoked_at', null);
  },

  /** What a signed-in customer sees: their own details, ACs, AMC and service history. Nothing internal. */
  async overview(customerId: string) {
    const o = await customerPortalService.getCustomerOverview(customerId);
    const latestVisit = new Map<string, { status: string; technician_id?: string | null; scheduled_date?: string; start_time?: string | null; technicianFirstName?: string | null }>();
    for (const s of o.serviceSchedules as any[]) {
      if (!latestVisit.has(s.service_request_id)) {
        latestVisit.set(s.service_request_id, {
          status: s.status,
          technician_id: s.technician?.id ?? null,
          scheduled_date: s.scheduled_date,
          start_time: s.start_time ?? null,
          technicianFirstName: typeof s.technician?.name === 'string' ? s.technician.name.split(/\s+/)[0] : null,
        });
      }
    }
    const completedByContract = await completedAmcVisits((o.amcContracts as any[]).map((c) => c.id).filter(Boolean));
    return {
      customer: { name: o.customer.name, companyName: o.customer.companyName ?? null, email: o.customer.email, phone: o.customer.phone, city: o.customer.city ?? null },
      acs: (o.assets as any[]).map((a) => ({
        tag: a.asset_tag ?? null,
        brand: a.brand ?? null,
        model: a.model_number ?? null,
        type: a.ac_type ?? null,
        tons: a.capacity_tons ?? null,
        room: a.room_location ?? null,
        warrantyUntil: a.warranty_end_date ?? null,
      })),
      amc: (o.amcContracts as any[]).map((c) => ({
        contractNumber: c.contract_number,
        plan: c.amc_plans?.name ?? null,
        status: c.status,
        startDate: c.start_date,
        endDate: c.end_date,
        totalVisits: c.total_visits ?? null,
        acCount: Array.isArray(c.amc_assets) ? c.amc_assets.length : 0,
        ...amcVisits(c, completedByContract),
      })),
      requests: (o.serviceRequests as any[]).map((r) => {
        const visit = latestVisit.get(r.id);
        const status = customerStatusFor({ status: r.status }, visit ? { status: visit.status, technician_id: visit.technician_id } : null);
        return {
          requestNumber: r.request_number,
          type: r.request_type,
          createdAt: r.created_at,
          status: { code: status.code, label: status.label, step: status.step, tone: status.tone },
          visit: visit?.scheduled_date ? { date: visit.scheduled_date, startTime: visit.start_time ?? null, technicianFirstName: visit.technicianFirstName ?? null } : null,
        };
      }),
    };
  },

  /** PYS staff: switch website access on or off for one customer. Switching on also lifts a sign-in lock (F2). */
  async setAccess(customerId: string, enabled: boolean, actorId: string): Promise<{ enabled: boolean }> {
    const supabase = getSupabaseClient();
    if (enabled) {
      const { error } = await supabase
        .from('customer_portal_accounts')
        .upsert({ customer_id: customerId, enabled: true, enabled_by: actorId || null, enabled_at: new Date().toISOString(), disabled_at: null, signin_locked_until: null }, { onConflict: 'customer_id' });
      if (error) throw new Error(error.message.includes('only for active permanent') ? 'ONLY_PERMANENT' : `Failed to switch access on: ${error.message}`);
    } else {
      const { error } = await supabase
        .from('customer_portal_accounts')
        .update({ enabled: false, disabled_at: new Date().toISOString() })
        .eq('customer_id', customerId);
      if (error) throw new Error(`Failed to switch access off: ${error.message}`);
      await supabase.from('customer_portal_sessions').update({ revoked_at: new Date().toISOString() }).eq('customer_id', customerId).is('revoked_at', null);
    }
    return { enabled };
  },

  async getAccess(customerId: string): Promise<{ enabled: boolean; lastLoginAt: string | null }> {
    const { data, error } = await getSupabaseClient()
      .from('customer_portal_accounts')
      .select('enabled, last_login_at')
      .eq('customer_id', customerId)
      .maybeSingle();
    if (error) throw new Error(`Failed to read website access: ${error.message}`);
    return { enabled: Boolean(data?.enabled), lastLoginAt: (data?.last_login_at as string | null) ?? null };
  },
};
