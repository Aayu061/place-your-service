/**
 * A small in-memory stand-in for the Supabase client, enough for the S11 customer-account code paths
 * (customerAccount.service, customerPortal.getCustomerOverview, the email outbox and the activity log).
 *
 * Filters: eq / is / gt / gte / lt / lte / in / ilike; order / limit / single / maybeSingle; head counts.
 * S11b: storage.from(bucket).createSignedUrl (records every link in `signed`) and the one-open-renewal unique index.
 * Embedded selects are ignored (rows come back flat). The customers -> customer_portal_accounts inner join used by
 * the sign-in lookup is emulated. RPCs and the customers.email trigger MIRROR the SQL in
 * supabase/migrations/20261127000000_customer_portal_hardening.sql - keep them in step.
 */
export type Row = Record<string, any>;

export interface FakeDb {
  db: Record<string, Row[]>;
  client: {
    from: (table: string) => any;
    rpc: (fn: string, args: Row) => Promise<{ data: unknown; error: null | { message: string } }>;
    storage: { from: (bucket: string) => { createSignedUrl: (path: string, seconds: number) => Promise<{ data: { signedUrl: string } | null; error: null | { message: string } }> } };
  };
  /** S11b: every storage link signed (bucket, path, seconds). A path containing 'fail' fails to sign. */
  signed: Array<{ bucket: string; path: string; seconds: number }>;
}

const HOUR = 3_600_000;
const nowIso = () => new Date().toISOString();

export function createFakeDb(initial: Record<string, Row[]>): FakeDb {
  const db = initial;
  let idSeq = 0;

  const DEFAULTS: Record<string, () => Row> = {
    customer_login_otps: () => ({ attempts: 0, consumed_at: null, created_at: nowIso() }),
    customer_portal_sessions: () => ({ revoked_at: null, created_at: nowIso(), last_seen_at: nowIso() }),
    email_deliveries: () => ({ created_at: nowIso(), updated_at: nowIso() }),
    web_intakes: () => ({ status: 'PENDING_REVIEW', created_at: nowIso(), tracking_code: `ESS-TEST-${idSeq}`, intake_number: `WEB-${idSeq}` }),
  };

  /** Mirrors unique index uq_web_intakes_open_amc_renewal (20261128000000): one open renewal per contract. */
  function uniqueClash(table: string, row: Row): boolean {
    if (table !== 'web_intakes' || row.kind !== 'AMC_RENEWAL' || row.status !== 'PENDING_REVIEW') return false;
    return (db.web_intakes ?? []).some((r) => r.kind === 'AMC_RENEWAL' && r.status === 'PENDING_REVIEW' && r.amc_contract_id === row.amc_contract_id);
  }

  /** Mirrors trigger trg_customer_portal_email_change (F4). */
  function afterCustomerUpdate(before: Row, after: Row) {
    if (String(before.email ?? '').toLowerCase() !== String(after.email ?? '').toLowerCase()) {
      const now = nowIso();
      for (const s of db.customer_portal_sessions ?? []) if (s.customer_id === after.id && !s.revoked_at) s.revoked_at = now;
      for (const o of db.customer_login_otps ?? [])
        if (o.customer_id === after.id && !o.consumed_at && o.expires_at > now) o.expires_at = now;
    }
  }

  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payload: Row | null = null;
    let head = false;
    let wantRows = false;
    let single: false | 'maybe' | 'exact' = false;
    let limitN = Infinity;
    const orders: Array<{ col: string; asc: boolean }> = [];
    const self: any = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (op === 'select') head = Boolean(opts?.head);
        else wantRows = true;
        return self;
      },
      insert(row: Row) { op = 'insert'; payload = row; return self; },
      update(row: Row) { op = 'update'; payload = row; return self; },
      upsert(row: Row) { op = 'upsert'; payload = row; return self; },
      delete() { op = 'delete'; return self; },
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
      lt(col: string, v: string) { filters.push((r) => r[col] < v); return self; },
      lte(col: string, v: string) { filters.push((r) => r[col] <= v); return self; },
      in(col: string, vs: unknown[]) { filters.push((r) => vs.includes(r[col])); return self; },
      // Like PostgREST: `*` and `%` match any run, `_` any one character, a backslash escapes the next character.
      ilike(col: string, v: string) { const re = likeRegex(v); filters.push((r) => re.test(String(r[col] ?? ''))); return self; },
      order(col: string, o?: { ascending?: boolean }) { orders.push({ col, asc: o?.ascending !== false }); return self; },
      limit(n: number) { limitN = n; return self; },
      maybeSingle() { single = 'maybe'; return self; },
      single() { single = 'exact'; return self; },
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        try {
          resolve(run());
        } catch (e) {
          if (reject) reject(e);
          else throw e;
        }
      },
    };

    function run() {
      const rows = (db[table] ??= []);
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload!];
        const inserted = list.map((p) => {
          const id = `id-${++idSeq}`;
          return { id, ...(DEFAULTS[table]?.() ?? {}), ...p };
        });
        if (inserted.some((r) => uniqueClash(table, r))) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
        }
        rows.push(...inserted);
        const data = wantRows ? (single ? inserted[0] : inserted) : null;
        return { data, error: null };
      }
      if (op === 'upsert') {
        const i = rows.findIndex((r) => r.customer_id === payload!.customer_id);
        if (i >= 0) rows[i] = { ...rows[i], ...payload };
        else rows.push({ ...payload });
        return { data: null, error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'delete') {
        db[table] = rows.filter((r) => !matched.includes(r));
        return { data: null, error: null };
      }
      if (op === 'update') {
        for (const r of matched) {
          const before = { ...r };
          Object.assign(r, payload);
          if (table === 'customers') afterCustomerUpdate(before, r);
        }
        return { data: wantRows ? matched.map((r) => ({ id: r.id })) : null, error: null };
      }
      let out = [...matched];
      for (const o of [...orders].reverse()) out.sort((a, b) => (a[o.col] > b[o.col] ? 1 : a[o.col] < b[o.col] ? -1 : 0) * (o.asc ? 1 : -1));
      out = out.slice(0, limitN);
      if (head) return { count: matched.length, data: null, error: null };
      if (single === 'exact') return out[0] ? { data: out[0], error: null } : { data: null, error: { message: 'not found', code: 'PGRST116' } };
      return { data: single ? (out[0] ?? null) : out, error: null };
    }
    return self;
  }

  const rpcs: Record<string, (a: Row) => unknown> = {
    /** Mirrors public.portal_claim_code_attempt. */
    portal_claim_code_attempt({ p_customer_id, p_max_attempts }) {
      const now = nowIso();
      const acct = (db.customer_portal_accounts ?? []).find((a) => a.customer_id === p_customer_id);
      if (acct?.signin_locked_until && acct.signin_locked_until > now) return [];
      const otp = (db.customer_login_otps ?? [])
        .filter((o) => o.customer_id === p_customer_id && !o.consumed_at && o.expires_at > now)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      if (!otp || otp.attempts >= p_max_attempts) return [];
      otp.attempts += 1;
      return [{ otp_id: otp.id, code_hash: otp.code_hash }];
    },
    /** Mirrors public.portal_record_wrong_code. */
    portal_record_wrong_code({ p_customer_id, p_max_wrong, p_window_hours, p_lock_hours }) {
      const since = new Date(Date.now() - p_window_hours * HOUR).toISOString();
      const wrong = (db.customer_login_otps ?? [])
        .filter((o) => o.customer_id === p_customer_id && o.created_at > since)
        .reduce((n, o) => n + Math.max(o.attempts - (o.consumed_at ? 1 : 0), 0), 0);
      if (wrong < p_max_wrong) return false;
      const acct = (db.customer_portal_accounts ?? []).find((a) => a.customer_id === p_customer_id);
      if (!acct || (acct.signin_locked_until && acct.signin_locked_until > nowIso())) return false;
      acct.signin_locked_until = new Date(Date.now() + p_lock_hours * HOUR).toISOString();
      return true;
    },
    /** Mirrors public.record_portal_visitor_hit. */
    record_portal_visitor_hit({ p_key_hash, p_window_minutes }) {
      const rows = (db.customer_portal_visitor_limits ??= []);
      const now = Date.now();
      let r = rows.find((x) => x.key_hash === p_key_hash);
      if (!r) {
        r = { key_hash: p_key_hash, hits: 0, window_started_at: new Date(now).toISOString() };
        rows.push(r);
      }
      if (new Date(r.window_started_at).getTime() <= now - p_window_minutes * 60_000) {
        r.hits = 0;
        r.window_started_at = new Date(now).toISOString();
      }
      r.hits += 1;
      r.updated_at = new Date(now).toISOString();
      return r.hits;
    },
    complete_email_delivery({ p_delivery_id, p_succeeded, p_transport, p_provider_message_id, p_error, p_retryable }) {
      const d = (db.email_deliveries ?? []).find((x) => x.id === p_delivery_id);
      if (!d) return null;
      Object.assign(d, {
        status: p_succeeded ? 'SENT' : 'FAILED',
        retryable: p_succeeded ? false : p_retryable,
        transport: p_transport,
        provider_message_id: p_provider_message_id,
        last_error: p_succeeded ? null : p_error,
      });
      return d;
    },
  };

  const signed: FakeDb['signed'] = [];
  const storage = {
    from(bucket: string) {
      return {
        async createSignedUrl(path: string, seconds: number) {
          signed.push({ bucket, path, seconds });
          if (path.includes('fail')) return { data: null, error: { message: 'fake: signing failed' } };
          return { data: { signedUrl: `https://storage.test/${bucket}/${path}?token=t&expires=${seconds}` }, error: null };
        },
      };
    },
  };

  return {
    db,
    signed,
    client: {
      storage,
      from,
      async rpc(fn: string, args: Row) {
        const impl = rpcs[fn];
        if (!impl) return { data: null, error: { message: `fake: unknown rpc ${fn}` } };
        return { data: impl(args), error: null };
      },
    },
  };
}

/** A PostgREST ilike pattern as a case-insensitive regex (wildcards honoured, so tests catch unescaped input). */
function likeRegex(pattern: string): RegExp {
  const lit = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) out += lit(pattern[++i]);
    else if (c === '%' || c === '*') out += '.*';
    else if (c === '_') out += '.';
    else out += lit(c);
  }
  return new RegExp(`^${out}$`, 'is');
}
