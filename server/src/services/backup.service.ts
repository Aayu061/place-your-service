// server/src/services/backup.service.ts
// ═══════════════════════════════════════════════════════════════════════════
// DATABASE REPLICA & DISASTER RECOVERY EXPORT ENGINE
// Dumps complete relational state across all 20+ Supabase tables
// Supports downloadable JSON snapshots & standard PostgreSQL INSERT statements
// ═══════════════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getSupabaseClient } from '../lib/supabase.js';
import { logger } from '../utils/logger.js';
import { BadRequestError } from '../utils/errors.js';

export const BACKUP_TABLES_ORDER = [
  'profiles',
  'staff',
  'technicians',
  'customers',
  'customer_sites',
  'ac_brands',
  'ac_models',
  'ac_model_variants',
  'ac_assets',
  'amc_plans',
  'amc_contracts',
  'amc_assets',
  'service_requests',
  'service_schedules',
  'service_reports',
  'parts',
  'inventory_transactions',
  'payments',
  'payment_transactions',
  'ess_products',
  'contact_enquiries',
  'system_error_logs',
] as const;

export interface BackupTableManifest {
  tableName: string;
  count: number;
}

export interface BackupResult {
  fileName: string;
  format: 'json' | 'sql';
  fileSizeBytes: number;
  tablesCount: number;
  totalRecords: number;
  checksumSha256: string;
  createdAt: string;
  tableManifest: BackupTableManifest[];
  content: string;
}

export class BackupService {
  /**
   * Fetches all records from a table with pagination handling to bypass PostgREST max-row limits.
   */
  private async fetchAllRows(tableName: string): Promise<Record<string, any>[]> {
    const supabase = getSupabaseClient();
    const rows: Record<string, any>[] = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .range(from, from + pageSize - 1);

      if (error) {
        // Suppress warning if table is optional or not yet created
        if (error.code === 'PGRST205' || error.message.includes('Could not find')) {
          logger.warn(`Backup: Table '${tableName}' does not exist in schema cache yet, skipping.`);
          return [];
        }
        logger.error(`Backup: Error extracting rows from ${tableName}`, { error: error.message });
        throw new BadRequestError(`Failed to backup table '${tableName}': ${error.message}`);
      }

      if (data && data.length > 0) {
        rows.push(...data);
        from += pageSize;
        if (data.length < pageSize) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    return rows;
  }

  /**
   * Generates standard PostgreSQL INSERT statements for an array of rows.
   */
  private generateSqlInserts(tableName: string, rows: Record<string, any>[]): string {
    if (!rows || rows.length === 0) {
      return `-- No rows found for public.${tableName}\n\n`;
    }

    let out = `-- ============================================================================\n`;
    out += `-- Table: public.${tableName} (${rows.length} rows)\n`;
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
            // Format PostgreSQL string array literal e.g. ARRAY['a', 'b']
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

  /**
   * Generates a complete database replica snapshot in either JSON or SQL format.
   */
  public async generateBackup(format: 'json' | 'sql' = 'json', createdBy = 'SYSTEM'): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const isoDate = new Date().toISOString();
    const tableManifest: BackupTableManifest[] = [];
    const databaseDump: Record<string, Record<string, any>[]> = {};
    let totalRecords = 0;

    logger.info(`Starting full database snapshot generation [format: ${format}]`);

    for (const tableName of BACKUP_TABLES_ORDER) {
      const rows = await this.fetchAllRows(tableName);
      databaseDump[tableName] = rows;
      totalRecords += rows.length;
      tableManifest.push({ tableName, count: rows.length });
    }

    let content = '';
    const baseName = `pys_supabase_replica_${timestamp}`;
    const fileName = `${baseName}.${format}`;

    if (format === 'json') {
      const payload = {
        metadata: {
          system: 'Place Your Service & Extreme Sales & Services Unified Enterprise Engine',
          version: '2.0.0',
          exportedAt: isoDate,
          totalTables: BACKUP_TABLES_ORDER.length,
          totalRecords,
          checksumAlgorithm: 'SHA-256',
        },
        manifest: tableManifest,
        tables: databaseDump,
      };
      content = JSON.stringify(payload, null, 2);
    } else {
      content = `-- ============================================================================\n`;
      content += `-- PLACE YOUR SERVICE (PYS) & EXTREME SALES & SERVICES (ESS)\n`;
      content += `-- FULL DATABASE REPLICA SNAPSHOT\n`;
      content += `-- Timestamp: ${isoDate}\n`;
      content += `-- Total Tables: ${BACKUP_TABLES_ORDER.length} | Total Records: ${totalRecords}\n`;
      content += `-- ============================================================================\n\n`;

      for (const tableName of BACKUP_TABLES_ORDER) {
        content += this.generateSqlInserts(tableName, databaseDump[tableName]);
      }
    }

    const checksumSha256 = crypto.createHash('sha256').update(content).digest('hex');
    const fileSizeBytes = Buffer.byteLength(content, 'utf8');

    // Asynchronously log backup in database_backups_log
    try {
      const supabase = getSupabaseClient();
      await supabase.from('database_backups_log').insert({
        file_name: fileName,
        format,
        file_size_bytes: fileSizeBytes,
        tables_count: BACKUP_TABLES_ORDER.length,
        total_records: totalRecords,
        checksum_sha256: checksumSha256,
        created_by: createdBy,
        status: 'COMPLETED',
      });
    } catch (logErr: any) {
      logger.warn('Failed to insert backup record into database_backups_log (non-fatal)', {
        error: logErr.message,
      });
    }

    return {
      fileName,
      format,
      fileSizeBytes,
      tablesCount: BACKUP_TABLES_ORDER.length,
      totalRecords,
      checksumSha256,
      createdAt: isoDate,
      tableManifest,
      content,
    };
  }

  /**
   * Saves a backup snapshot file to local disk (PYS/backups/)
   */
  public async saveBackupToDisk(format: 'json' | 'sql' = 'json'): Promise<{ filePath: string; result: BackupResult }> {
    const result = await this.generateBackup(format, 'CLI_TOOL');
    const backupsDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const targetPath = path.join(backupsDir, result.fileName);
    fs.writeFileSync(targetPath, result.content, 'utf8');
    logger.info(`Backup written successfully to ${targetPath} (${(result.fileSizeBytes / 1024).toFixed(1)} KB)`);
    return { filePath: targetPath, result };
  }

  /**
   * Retrieves summary statistics and recent backup history for the management UI.
   */
  public async getBackupMetadata(): Promise<{
    tableCounts: Record<string, number>;
    totalRecords: number;
    recentBackups: Record<string, any>[];
  }> {
    const supabase = getSupabaseClient();
    const tableCounts: Record<string, number> = {};
    let totalRecords = 0;

    for (const tableName of BACKUP_TABLES_ORDER) {
      const { count } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
      const c = count || 0;
      tableCounts[tableName] = c;
      totalRecords += c;
    }

    const { data: logs } = await supabase
      .from('database_backups_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    return {
      tableCounts,
      totalRecords,
      recentBackups: logs || [],
    };
  }
}

export const backupService = new BackupService();
