import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as supabaseLib from '../src/lib/supabase.js';
import { backupService, BACKUP_TABLES, BACKUP_TABLES_ORDER } from '../src/services/backup.service.js';
import { telemetryLogService } from '../src/services/telemetryLog.service.js';

type Rows = Record<string, Record<string, unknown>[]>;

function fakeClient(opts: { rows?: Rows; missing?: string[]; failing?: string[]; throwing?: string[] }) {
  const inserts: { table: string; payload: unknown }[] = [];
  const client = {
    from: vi.fn((table: string) => {
      let head = false;
      let rangeFrom = 0;
      let rangeTo = Number.MAX_SAFE_INTEGER;
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn((_cols: string, o?: { head?: boolean }) => {
        head = Boolean(o?.head);
        if (opts.throwing?.includes(table)) throw new Error('network down');
        return chain;
      });
      chain.order = vi.fn(() => chain);
      chain.limit = vi.fn(() => chain);
      chain.range = vi.fn((a: number, b: number) => {
        rangeFrom = a;
        rangeTo = b;
        return chain;
      });
      chain.insert = vi.fn(async (payload: unknown) => {
        inserts.push({ table, payload });
        return { error: null };
      });
      chain.then = (resolve: (v: unknown) => unknown) => {
        if (opts.missing?.includes(table)) {
          return Promise.resolve({ data: null, count: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }).then(resolve);
        }
        if (opts.failing?.includes(table)) {
          return Promise.resolve({ data: null, count: null, error: { code: '42501', message: 'permission denied' } }).then(resolve);
        }
        const all = opts.rows?.[table] ?? [];
        if (head) return Promise.resolve({ data: null, count: all.length, error: null }).then(resolve);
        return Promise.resolve({ data: all.slice(rangeFrom, rangeTo + 1), error: null }).then(resolve);
      };
      return chain;
    }),
  };
  return { client, inserts };
}

describe('Admin database backup & table manifest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists every known table, including the Phase 1 tables', () => {
    const names = BACKUP_TABLES.map((t) => t.name);
    for (const t of [
      'business_number_series',
      'business_number_counters',
      'service_catalog_items',
      'service_catalog_prices',
      'catalog_meta',
      'integration_clients',
      'integration_client_keys',
      'idempotency_records',
      'outbound_events',
      'outbound_event_attempts',
      'service_request_status_history',
      'web_intakes',
      'system_error_logs',
    ]) {
      expect(names).toContain(t);
    }
    expect(new Set(names).size).toBe(names.length);
    // Replay/idempotency data is counted but never exported
    expect(BACKUP_TABLES_ORDER).not.toContain('integration_request_nonces');
    expect(BACKUP_TABLES_ORDER).not.toContain('idempotency_records');
  });

  it('one missing or failing table does not empty the manifest', async () => {
    const { client } = fakeClient({
      rows: { customers: [{ id: 'c1' }, { id: 'c2' }], technicians: [{ id: 't1' }] },
      missing: ['web_intakes'],
      failing: ['payments'],
      throwing: ['parts'],
    });
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(client as never);

    const meta = await backupService.getBackupMetadata();
    expect(meta.tables).toHaveLength(BACKUP_TABLES.length);
    expect(meta.tableCounts.customers).toBe(2);
    expect(meta.tableCounts.technicians).toBe(1);
    expect(meta.totalRecords).toBe(3);
    expect(meta.tables.find((t) => t.tableName === 'web_intakes')?.status).toBe('missing');
    expect(meta.tables.find((t) => t.tableName === 'payments')?.status).toBe('error');
    expect(meta.tables.find((t) => t.tableName === 'parts')?.status).toBe('error');
    expect(meta.tablesMissing).toBe(1);
    expect(meta.tablesFailed).toBe(2);
    expect(meta.tablesCounted).toBe(BACKUP_TABLES.length - 3);
    expect('payments' in meta.tableCounts).toBe(false);
  });

  it('exports never contain integration secrets or PIN hashes', async () => {
    const { client, inserts } = fakeClient({
      rows: {
        technicians: [{ id: 't1', name: 'Ravi', pin_hash: 'scrypt$abc$def' }],
        integration_client_keys: [{ id: 'k1', key_id: 'ess-1', secret_ciphertext: 'TOP-SECRET-CIPHERTEXT' }],
        integration_request_nonces: [{ client_id: 'c', nonce: 'NONCE-VALUE' }],
        idempotency_records: [{ client_id: 'c', idempotency_key: 'IDEMP-KEY' }],
      },
      missing: ['web_intakes'],
    });
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(client as never);

    for (const format of ['json', 'sql'] as const) {
      const result = await backupService.generateBackup(format, 'test');
      expect(result.content).not.toContain('TOP-SECRET-CIPHERTEXT');
      if (format === 'json') {
        const parsed = JSON.parse(result.content);
        expect(parsed.tables.integration_client_keys[0]).not.toHaveProperty('secret_ciphertext');
        expect(parsed.tables.technicians[0]).not.toHaveProperty('pin_hash');
        expect(parsed.tables).not.toHaveProperty('integration_request_nonces');
      } else {
        expect(result.content).not.toMatch(/INSERT INTO public\."integration_client_keys" \([^)]*secret_ciphertext/);
      }
      expect(result.content).not.toContain('scrypt$abc$def');
      expect(result.content).not.toContain('NONCE-VALUE');
      expect(result.content).not.toContain('IDEMP-KEY');
      expect(result.content).toContain('ess-1');
      expect(result.incomplete).toBe(false);
      expect(result.tableManifest.find((m) => m.tableName === 'web_intakes')?.status).toBe('missing');
    }
    expect(inserts.filter((i) => i.table === 'database_backups_log')).toHaveLength(2);
  });

  it('marks the snapshot incomplete when a table cannot be read', async () => {
    const { client } = fakeClient({ rows: { customers: [{ id: 'c1' }] }, failing: ['payments'] });
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(client as never);
    const result = await backupService.generateBackup('json', 'test');
    expect(result.incomplete).toBe(true);
    expect(result.tableManifest.find((m) => m.tableName === 'payments')?.status).toBe('error');
    expect(result.totalRecords).toBe(1);
  });

  it('pages through tables larger than one PostgREST page', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({ id: `r${i}` }));
    const { client } = fakeClient({ rows: { activity_logs: many } });
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(client as never);
    const result = await backupService.generateBackup('json', 'test');
    expect(result.tableManifest.find((m) => m.tableName === 'activity_logs')?.count).toBe(2500);
  });
});

describe('Telemetry log buffer', () => {
  it('reports when the in-memory buffer started and no made-up service ports', async () => {
    expect(Number.isNaN(Date.parse(telemetryLogService.getStartedAt()))).toBe(false);
    expect(telemetryLogService.getBufferCapacity()).toBe(500);
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({
      from: () => ({ select: () => ({ limit: async () => ({ data: [], error: null }) }) }),
    } as never);
    const health = await telemetryLogService.getSystemHealth();
    expect(health.startedAt).toBe(telemetryLogService.getStartedAt());
    expect((health as unknown as Record<string, unknown>).services).toBeUndefined();
  });
});
