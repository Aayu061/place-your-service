import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { customerStatusFor } from '../domain/customerStatus.js';
import { customerPortalService } from './customerPortal.service.js';
import { emailOutboxService } from './email/emailOutbox.service.js';

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

export class CodeRejectedError extends Error {
  constructor() {
    super('That code is not right or has expired. Ask for a new code.');
    this.name = 'CodeRejectedError';
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

function otpEmail(name: string, code: string) {
  const subject = `Your sign-in code: ${code}`;
  const text = `Hello ${name},\n\nYour Extreme Sales & Services sign-in code is ${code}. It works for ${OTP_TTL_MINUTES} minutes.\n\nIf you did not ask for it, you can ignore this email.`;
  const html = `<p>Hello ${escapeHtml(name)},</p><p>Your Extreme Sales &amp; Services sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It works for ${OTP_TTL_MINUTES} minutes. If you did not ask for it, you can ignore this email.</p>`;
  return { subject, text, html };
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const customerAccountService = {
  /** Always resolves the same way (the caller answers 202), whether or not the email has an account. */
  async requestCode(rawEmail: unknown): Promise<void> {
    const email = normalizeEmail(rawEmail);
    if (!email) return;
    const customer = await signInCustomer(email);
    if (!customer) return;

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
        tags: [{ name: 'kind', value: 'portal_otp' }],
      });
    } catch (err) {
      logger.warn('Sign-in code email failed', { outcome: 'portal_otp_email_failed', error: err instanceof Error ? err.name : 'error' });
    }
  },

  /** Returns a new session token, or throws CodeRejectedError (same message for every failure). */
  async verifyCode(rawEmail: unknown, rawCode: unknown): Promise<{ token: string; expiresAt: string }> {
    const email = normalizeEmail(rawEmail);
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    if (!email || !/^\d{6}$/.test(code)) throw new CodeRejectedError();
    const customer = await signInCustomer(email);
    if (!customer) throw new CodeRejectedError();

    const supabase = getSupabaseClient();
    const { data: rows, error } = await supabase
      .from('customer_login_otps')
      .select('id, code_hash, attempts, expires_at')
      .eq('customer_id', customer.id)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(`Failed to check the code: ${error.message}`);
    const otp = (rows ?? [])[0] as { id: string; code_hash: string; attempts: number } | undefined;
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw new CodeRejectedError();

    const expected = Buffer.from(otp.code_hash, 'hex');
    const given = Buffer.from(codeHash(customer.id, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await supabase.from('customer_login_otps').update({ attempts: otp.attempts + 1 }).eq('id', otp.id);
      throw new CodeRejectedError();
    }
    // Single use: only the first request that flips consumed_at wins.
    const { data: used, error: uErr } = await supabase
      .from('customer_login_otps')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', otp.id)
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

  /** PYS staff: switch website access on or off for one customer. */
  async setAccess(customerId: string, enabled: boolean, actorId: string): Promise<{ enabled: boolean }> {
    const supabase = getSupabaseClient();
    if (enabled) {
      const { error } = await supabase
        .from('customer_portal_accounts')
        .upsert({ customer_id: customerId, enabled: true, enabled_by: actorId || null, enabled_at: new Date().toISOString(), disabled_at: null }, { onConflict: 'customer_id' });
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
