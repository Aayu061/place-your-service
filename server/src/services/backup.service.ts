// server/src/services/backup.service.ts
// Database snapshot export (JSON or SQL INSERTs) and the live table-count manifest for the
// admin Server & Database page.
//
// The table list lives in ONE place (BACKUP_TABLES below). PostgREST cannot list tables for us
// (no information_schema access through the API), so when a migration adds a table, add it here.
// Every table is counted on its own: a missing or failing table shows up as "missing"/"error" in
// the manifest instead of emptying it.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getSupabaseClient } from '../lib/supabase.js';
import { logger } from '../utils/logger.js';

export interface BackupTableConfig {
  name: string;
  /** false = counted in the manifest but never exported (replay-protection / cache data). */
  export: boolean;
  /** Columns that must never leave the database (secrets, credential hashes). */
  excludeColumns?: string[];
  /** Stable ordering for paging; defaults to ['id']. */
  orderBy?: string[];
}

/**
 * Every public table, in restore order (parents before children).
 * Keep in sync with supabase/migrations.
 */
export const BACKUP_TABLES: readonly BackupTableConfig[] = [
  { name: 'profiles', export: true },
  { name: 'staff', export: true },
  // PIN hashes of 4-6 digit PINs are brute-forceable offline, so they are not exported.
  // After a restore, technicians get a PIN reset from the admin.
  { name: 'technicians', export: true, excludeColumns: ['pin_hash'] },
  { name: 'customers', export: true },
  { name: 'customer_sites', export: true },
  { name: 'ac_brands', export: true },
  { name: 'ac_models', export: true },
  { name: 'ac_model_variants', export: true },
  { name: 'ac_assets', export: true },
  { name: 'service_catalog_items', export: true },
  { name: 'service_catalog_prices', export: true },
  { name: 'catalog_meta', export: true },
  { name: 'amc_plans', export: true },
  { name: 'amc_contracts', export: true },
  { name: 'amc_assets', export: true },
  { name: 'business_number_series', export: true, orderBy: ['kind'] },
  { name: 'business_number_counters', export: true, orderBy: ['kind', 'year'] },
  { name: 'integration_clients', export: true },
  // The encrypted signing secret must never be exported.
  { name: 'integration_client_keys', export: true, excludeColumns: ['secret_ciphertext'] },
  { name: 'web_intakes', export: true },
  { name: 'service_requests', export: true },
  { name: 'service_request_status_history', export: true },
  { name: 'service_assignments', export: true },
  { name: 'service_schedules', export: true },
  { name: 'service_reports', export: true },
  { name: 'service_report_items', export: true },
  { name: 'service_report_assets', export: true },
  { name: 'service_report_follow_up_scopes', export: true },
  { name: 'service_report_header_history', export: true },
  { name: 'parts', export: true },
  { name: 'service_parts', export: true },
  { name: 'inventory_transactions', export: true },
  { name: 'payments', export: true },
  { name: 'payment_transactions', export: true },
  { name: 'ess_products', export: true },
  { name: 'contact_enquiries', export: true },
  { name: 'email_deliveries', export: true },
  { name: 'email_delivery_attempts', export: true },
  { name: 'service_report_email_deliveries', export: true },
  { name: 'service_report_email_delivery_attempts', export: true },
  { name: 'amc_quotation_email_deliveries', export: true },
  { name: 'inbound_emails', export: true },
  { name: 'outbound_events', export: true },
  { name: 'outbound_event_attempts', export: true },
  { name: 'notifications', export: true },
  { name: 'activity_logs', export: true },
  { name: 'system_error_logs', export: true },
  { name: 'database_backups_log', export: true },
  // Short-lived replay/idempotency data: counted, not exported.
  { name: 'integration_request_nonces', export: false, orderBy: ['client_id', 'nonce'] },
  { name: 'idempotency_records', export: false, orderBy: ['client_id', 'idempotency_key'] },
];

/** Back-compat: names of the exported tables in restore order. */
export const BACKUP_TABLES_ORDER: readonly string[] = BACKUP_TABLES.filter((t) => t.export).map((t) => t.name);

export type TableCountStatus = 'ok' | 'missing' | 'error';

export interface TableCountEntry {
  tableName: string;
  count: number | null;
  status: TableCountStatus;
  exported: boolean;
  error?: string;
}

export interface BackupTableManifest {
  tableName: string;
  count: number;
  status: TableCountStatus;
  excludedColumns?: string[];
  error?: string;
}

export interface BackupResult {
  fileName: string;
  format: 'json' | 'sql';
  fileSizeBytes: number;
  tablesCount: number;
  totalRecords: number;
  checksumSha256: string;
  createdAt: string;
  /** true when one or more tables could not be read (see manifest entries with status 'error'). */
  incomplete: boolean;
  tableManifest: BackupTableManifest[];
  content: string;
}

export interface BackupMetadata {
  countedAt: string;
  tables: TableCountEntry[];
  /** Only the tables that were counted successfully. */
  tableCounts: Record<string, number>;
  totalRecords: number;
  tablesCounted: number;
  tablesMissing: number;
  tablesFailed: number;
  recentBackups: Record<string, unknown>[];
  recentBackupsError?: string;
}

const PAGE_SIZE = 1000;
const COUNT_CONCURRENCY = 8;

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the table|does not exist/i.test(error.message || '')
  );
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist/i.test(error.message || '');
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function stripColumns(rows: Record<string, unknown>[], exclude?: string[]): Record<string, unknown>[] {
  if (!exclude || exclude.length === 0) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const col of exclude) delete copy[col];
    return copy;
  });
}

type FetchOutcome =
  | { status: 'ok'; rows: Record<string, unknown>[] }
  | { status: 'missing'; rows: [] }
  | { status: 'error'; rows: []; error: string };

export class BackupService {
  /** Counts one table with a HEAD request. Never throws. */
  public async countTable(table: BackupTableConfig): Promise<TableCountEntry> {
    try {
      const supabase = getSupabaseClient();
      const { count, error } = await supabase.from(table.name).select('*', { count: 'exact', head: true });
      if (error) {
        if (isMissingTableError(error)) {
          return { tableName: table.name, count: null, status: 'missing', exported: table.export };
        }
        return { tableName: table.name, count: null, status: 'error', exported: table.export, error: error.message || 'Count failed' };
      }
      return { tableName: table.name, count: typeof count === 'number' ? count : 0, status: 'ok', exported: table.export };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { tableName: table.name, count: null, status: 'error', exported: table.export, error: message };
    }
  }

  /** Fetches every row of a table page by page (PostgREST caps rows per request). Never throws. */
  private async fetchAllRows(table: BackupTableConfig): Promise<FetchOutcome> {
    const supabase = getSupabaseClient();
    const rows: Record<string, unknown>[] = [];
    let orderBy: string[] = table.orderBy ?? ['id'];
    let from = 0;

    try {
      for (;;) {
        let query = supabase.from(table.name).select('*');
        for (const col of orderBy) query = query.order(col, { ascending: true });
        const { data, error } = await query.range(from, from + PAGE_SIZE - 1);

        if (error) {
          if (isMissingTableError(error)) {
            logger.warn(`Backup: table '${table.name}' does not exist, skipping.`);
            return { status: 'missing', rows: [] };
          }
          if (orderBy.length > 0 && isMissingColumnError(error) && from === 0) {
            // Table without the expected key column: fall back to unordered paging.
            orderBy = [];
            continue;
          }
          logger.error(`Backup: could not read table '${table.name}'`, { error: error.message });
          return { status: 'error', rows: [], error: error.message || 'Read failed' };
        }

        const page = (data ?? []) as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Backup: could not read table '${table.name}'`, { error: message });
      return { status: 'error', rows: [], error: message };
    }

    return { status: 'ok', rows: stripColumns(rows, table.excludeColumns) };
  }

  /** Standard PostgreSQL INSERT statements for an array of rows. */
  private generateSqlInserts(tableName: string, rows: Record<string, unknown>[], note?: string): string {
    if (!rows || rows.length === 0) {
      return `-- No rows exported for public.${tableName}${note ? ` (${note})` : ''}\n\n`;
    }

    let out = `-- ============================================================================\n`;
    out += `-- Table: public.${tableName} (${rows.length} rows)${note ? ` -- ${note}` : ''}\n`;
    out += `-- ============================================================================\n`;

    const columns = Object.keys(rows[0]);
    const colList = columns.map((c) => `"${c}"`).join(', ');

    for (const row of rows) {
      const values = columns
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          if (typeof val === 'number') return String(val);
          if (Array.isArray(val)) {
            if (val.length > 0 && val.every((v) => v !== null && typeof v === 'object')) {
              return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
            }
            const escaped = val.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ');
            return `ARRAY[${escaped}]`;
          }
          if (typeof val === 'object') {
            return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
          }
          return `'${String(val).replace(/'/g, "''")}'`;
        })
        .join(', ');

      out += `INSERT INTO public."${tableName}" (${colList}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`;
    }

    out += '\n';
    return out;
  }

  /** Builds a snapshot of every exportable table in JSON or SQL form. */
  public async generateBackup(format: 'json' | 'sql' = 'json', createdBy = 'SYSTEM'): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const isoDate = new Date().toISOString();
    const exportTables = BACKUP_TABLES.filter((t) => t.export);
    const tableManifest: BackupTableManifest[] = [];
    const databaseDump: Record<string, Record<string, unknown>[]> = {};
    let totalRecords = 0;

    logger.info(`Starting database snapshot [format: ${format}]`);

    // Sequential on purpose: keeps memory and DB load predictable on a small instance.
    for (const table of exportTables) {
      const outcome = await this.fetchAllRows(table);
      if (outcome.status === 'missing') {
        tableManifest.push({ tableName: table.name, count: 0, status: 'missing' });
        continue;
      }
      if (outcome.status === 'error') {
        tableManifest.push({ tableName: table.name, count: 0, status: 'error', error: outcome.error });
        continue;
      }
      databaseDump[table.name] = outcome.rows;
      totalRecords += outcome.rows.length;
      tableManifest.push({
        tableName: table.name,
        count: outcome.rows.length,
        status: 'ok',
        ...(table.excludeColumns?.length ? { excludedColumns: [...table.excludeColumns] } : {}),
      });
    }

    const incomplete = tableManifest.some((m) => m.status === 'error');
    const exportedCount = Object.keys(databaseDump).length;
    const notExported = BACKUP_TABLES.filter((t) => !t.export).map((t) => t.name);

    let content = '';
    const fileName = `pys_supabase_replica_${timestamp}.${format}`;

    if (format === 'json') {
      content = JSON.stringify(
        {
          metadata: {
            system: 'Place Your Service (PYS)',
            version: '3.0.0',
            exportedAt: isoDate,
            totalTables: exportedCount,
            totalRecords,
            incomplete,
            notExportedTables: notExported,
            checksumAlgorithm: 'SHA-256',
          },
          manifest: tableManifest,
          tables: databaseDump,
        },
        null,
        2
      );
    } else {
      content = `-- ============================================================================\n`;
      content += `-- PLACE YOUR SERVICE (PYS) DATABASE SNAPSHOT\n`;
      content += `-- Timestamp: ${isoDate}\n`;
      content += `-- Tables exported: ${exportedCount} | Total records: ${totalRecords}${incomplete ? ' | INCOMPLETE: some tables could not be read' : ''}\n`;
      content += `-- Not exported (short-lived data): ${notExported.join(', ')}\n`;
      content += `-- ============================================================================\n\n`;
      for (const entry of tableManifest) {
        if (entry.status !== 'ok') {
          content += `-- public.${entry.tableName}: ${entry.status === 'missing' ? 'table not present' : `NOT EXPORTED, read failed: ${entry.error}`}\n\n`;
          continue;
        }
        const note = entry.excludedColumns?.length ? `columns not exported: ${entry.excludedColumns.join(', ')}` : undefined;
        content += this.generateSqlInserts(entry.tableName, databaseDump[entry.tableName], note);
      }
    }

    const checksumSha256 = crypto.createHash('sha256').update(content).digest('hex');
    const fileSizeBytes = Buffer.byteLength(content, 'utf8');

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('database_backups_log').insert({
        file_name: fileName,
        format,
        file_size_bytes: fileSizeBytes,
        tables_count: exportedCount,
        total_records: totalRecords,
        checksum_sha256: checksumSha256,
        created_by: createdBy,
        status: incomplete ? 'INCOMPLETE' : 'COMPLETED',
      });
      if (error) throw new Error(error.message);
    } catch (logErr) {
      logger.warn('Failed to insert backup record into database_backups_log (non-fatal)', {
        error: logErr instanceof Error ? logErr.message : String(logErr),
      });
    }

    return {
      fileName,
      format,
      fileSizeBytes,
      tablesCount: exportedCount,
      totalRecords,
      checksumSha256,
      createdAt: isoDate,
      incomplete,
      tableManifest,
      content,
    };
  }

  /** Saves a snapshot file to local disk (PYS/backups/). */
  public async saveBackupToDisk(format: 'json' | 'sql' = 'json'): Promise<{ filePath: string; result: BackupResult }> {
    const result = await this.generateBackup(format, 'CLI_TOOL');
    const backupsDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const targetPath = path.join(backupsDir, result.fileName);
    fs.writeFileSync(targetPath, result.content, 'utf8');
    logger.info(`Backup written to ${targetPath} (${(result.fileSizeBytes / 1024).toFixed(1)} KB)`);
    return { filePath: targetPath, result };
  }

  /** Live per-table counts plus recent backup history. One failing table never empties the result. */
  public async getBackupMetadata(): Promise<BackupMetadata> {
    const tables = await mapWithConcurrency(BACKUP_TABLES, COUNT_CONCURRENCY, (t) => this.countTable(t));

    const tableCounts: Record<string, number> = {};
    let totalRecords = 0;
    for (const entry of tables) {
      if (entry.status === 'ok' && entry.count !== null) {
        tableCounts[entry.tableName] = entry.count;
        totalRecords += entry.count;
      }
    }

    let recentBackups: Record<string, unknown>[] = [];
    let recentBackupsError: string | undefined;
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('database_backups_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) recentBackupsError = error.message;
      else recentBackups = (data ?? []) as Record<string, unknown>[];
    } catch (err) {
      recentBackupsError = err instanceof Error ? err.message : String(err);
    }

    return {
      countedAt: new Date().toISOString(),
      tables,
      tableCounts,
      totalRecords,
      tablesCounted: tables.filter((t) => t.status === 'ok').length,
      tablesMissing: tables.filter((t) => t.status === 'missing').length,
      tablesFailed: tables.filter((t) => t.status === 'error').length,
      recentBackups,
      ...(recentBackupsError ? { recentBackupsError } : {}),
    };
  }
}

export const backupService = new BackupService();
