// server/src/services/telemetryLog.service.ts
// ═══════════════════════════════════════════════════════════════════════════
// TELEMETRY & ERROR OBSERVABILITY SERVICE
// In-memory 500-slot Ring Buffer + Supabase system_error_logs Persistence
// System Health Monitoring (CPU, Heap, DB Latency, Crash Diagnostics)
// ═══════════════════════════════════════════════════════════════════════════

import os from 'os';
import { getSupabaseClient } from '../lib/supabase.js';
import { logger } from '../utils/logger.js';

export interface LogEntry {
  id: string;
  timestamp: string;
  service: 'PYS' | 'ESS' | 'CLIENT';
  level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  category: string;
  message: string;
  details?: any;
  stack?: string;
}

export interface CrashReportPayload {
  service: 'PYS' | 'ESS' | 'CLIENT';
  errorName?: string;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  url?: string;
  method?: string;
  statusCode?: number;
}

export interface SystemHealthMetrics {
  timestamp: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  uptimeSeconds: number;
  cpu: {
    cores: number;
    model: string;
    loadAvg1m: number;
    processCpuPercent: number;
  };
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    totalSystemMb: number;
    freeSystemMb: number;
    heapUsagePercent: number;
  };
  database: {
    status: 'ONLINE' | 'OFFLINE' | 'SLOW';
    latencyMs: number;
    checkedAt: string;
    details?: string;
  };
  services: {
    pysApi: { port: number; status: 'ONLINE' };
    essPlatform: { port: number; status: 'ONLINE' | 'UNKNOWN' };
  };
}

class TelemetryLogService {
  private readonly maxBufferSize = 500;
  private ringBuffer: LogEntry[] = [];
  private startTime = Date.now();
  private prevCpuUsage = process.cpuUsage();
  private prevCpuTime = Date.now();

  constructor() {
    // Seed initial startup log
    this.addLog({
      id: `log-${Date.now()}-0001`,
      timestamp: new Date().toISOString(),
      service: 'PYS',
      level: 'INFO',
      category: 'SYSTEM',
      message: 'TelemetryLogService initialized with 500-slot circular ring buffer.',
    });
  }

  /**
   * Adds an entry to the circular buffer.
   * Asynchronously persists errors and fatal logs into Supabase system_error_logs.
   */
  public addLog(entry: LogEntry): void {
    if (this.ringBuffer.length >= this.maxBufferSize) {
      this.ringBuffer.shift();
    }
    this.ringBuffer.push(entry);

    if (entry.level === 'ERROR' || entry.level === 'FATAL') {
      this.persistToSupabase(entry).catch((err) => {
        // Fallback to stderr without throwing to avoid recursive crash loops
        console.error('[Telemetry] Failed to persist error log to Supabase:', err.message);
      });
    }
  }

  /**
   * Queries in-memory ring buffer with filtering
   */
  public getLogs(options?: {
    limit?: number;
    service?: string;
    level?: string;
    search?: string;
  }): LogEntry[] {
    let result = [...this.ringBuffer].reverse();

    if (options?.service && options.service !== 'ALL') {
      result = result.filter((l) => l.service.toLowerCase() === options.service!.toLowerCase());
    }

    if (options?.level && options.level !== 'ALL') {
      result = result.filter((l) => l.level.toLowerCase() === options.level!.toLowerCase());
    }

    if (options?.search && options.search.trim().length > 0) {
      const term = options.search.toLowerCase();
      result = result.filter(
        (l) =>
          l.message.toLowerCase().includes(term) ||
          l.category.toLowerCase().includes(term) ||
          (l.stack && l.stack.toLowerCase().includes(term))
      );
    }

    const limit = options?.limit || 100;
    return result.slice(0, limit);
  }

  /**
   * Captures crash or unhandled error, analyzes root-cause, logs and persists to Supabase
   */
  public async recordCrash(report: CrashReportPayload): Promise<{
    id: string;
    remediation: string;
    persisted: boolean;
  }> {
    const logId = `crash-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    const remediation = this.generateRemediationAdvice(report.message, report.stack);

    const entry: LogEntry = {
      id: logId,
      timestamp: nowIso,
      service: report.service,
      level: 'FATAL',
      category: 'CRASH_INSPECTOR',
      message: `[${report.service}] ${report.errorName || 'UnhandledError'}: ${report.message}`,
      details: {
        ...report.context,
        url: report.url,
        method: report.method,
        statusCode: report.statusCode,
        remediationAdvice: remediation,
      },
      stack: report.stack,
    };

    this.addLog(entry);

    let persisted = false;
    try {
      const supabase = getSupabaseClient();
      await supabase.from('system_error_logs').insert({
        service_name: report.service,
        error_level: 'FATAL',
        message: report.message,
        error_name: report.errorName || 'UnhandledException',
        stack_trace: report.stack || null,
        context_data: {
          ...report.context,
          url: report.url,
          method: report.method,
          statusCode: report.statusCode,
          remediationAdvice: remediation,
        },
      });
      persisted = true;
    } catch (err: any) {
      logger.error('Failed to write crash to Supabase system_error_logs', { error: err.message });
    }

    return {
      id: logId,
      remediation,
      persisted,
    };
  }

  /**
   * Asynchronously persists an ERROR/FATAL log entry to Supabase system_error_logs
   */
  private async persistToSupabase(entry: LogEntry): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      await supabase.from('system_error_logs').insert({
        service_name: entry.service,
        error_level: entry.level,
        message: entry.message,
        error_name: entry.category,
        stack_trace: entry.stack || null,
        context_data: entry.details || {},
      });
    } catch (err: any) {
      console.error('[Telemetry] Supabase error log insertion error:', err.message);
    }
  }

  /**
   * Generates intelligent root-cause remediation advice based on error signatures
   */
  private generateRemediationAdvice(message: string, stack?: string): string {
    const combined = `${message} ${stack || ''}`.toLowerCase();

    if (combined.includes('econnrefused')) {
      return 'Target service or database port is closed or unreachable. Verify the process is running on the expected host/port.';
    }
    if (combined.includes('jwt') || combined.includes('token') || combined.includes('unauthorized')) {
      return 'Authentication credentials invalid or expired. Check JWT expiration, secret consistency, and Bearer token headers.';
    }
    if (combined.includes('null value in column') || combined.includes('not-null constraint')) {
      return 'Database constraint violation: A required field was omitted in the payload. Check request schema validation.';
    }
    if (combined.includes('syntaxerror') && combined.includes('unexpected identifier')) {
      return 'Client runtime syntax error: TypeScript syntax (e.g. "as HTMLElement") was sent to browser JS. Strip TypeScript type assertions.';
    }
    if (combined.includes('cors')) {
      return 'Cross-Origin Resource Sharing rejection: Add the client origin (e.g. localhost:5002) to server CORS_ORIGIN whitelist.';
    }
    if (combined.includes('rate limit') || combined.includes('429')) {
      return 'Rate limit threshold exceeded: Ensure client uses backoff or adjust RATE_LIMIT_MAX in environment configuration.';
    }
    if (combined.includes('postgrest') || combined.includes('pgrst')) {
      return 'Supabase PostgREST error: Column name mismatch or RLS policy denial. Verify table schema with execute_sql.';
    }

    return 'Inspect the stack trace line numbers and check server logs around this timestamp for correlation with recent requests.';
  }

  /**
   * Calculates real-time system metrics (CPU load, memory heap, DB latency)
   */
  public async getSystemHealth(): Promise<SystemHealthMetrics> {
    const now = Date.now();
    const uptimeSec = Math.floor(process.uptime());

    // CPU calculation
    const currentCpuUsage = process.cpuUsage(this.prevCpuUsage);
    const timeDelta = (now - this.prevCpuTime) * 1000; // in microseconds
    const totalCpus = os.cpus().length || 1;
    const processCpuPercent =
      timeDelta > 0
        ? Math.min(100, Math.round(((currentCpuUsage.user + currentCpuUsage.system) / (timeDelta * totalCpus)) * 1000) / 10)
        : 0;

    this.prevCpuUsage = process.cpuUsage();
    this.prevCpuTime = now;

    // Memory calculation
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;
    const heapTotalMb = Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100;
    const rssMb = Math.round((mem.rss / 1024 / 1024) * 100) / 100;
    const totalSystemMb = Math.round(os.totalmem() / 1024 / 1024);
    const freeSystemMb = Math.round(os.freemem() / 1024 / 1024);
    const heapUsagePercent = heapTotalMb > 0 ? Math.round((heapUsedMb / heapTotalMb) * 100) : 0;

    // Supabase DB Ping Latency
    const dbStartTime = Date.now();
    let dbStatus: 'ONLINE' | 'OFFLINE' | 'SLOW' = 'ONLINE';
    let dbLatencyMs = 0;
    let dbDetails = 'PostgreSQL jvccvdxfilzlncbgiplk connected';

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('profiles').select('id').limit(1);
      dbLatencyMs = Date.now() - dbStartTime;

      if (error) {
        dbStatus = 'OFFLINE';
        dbDetails = `Query error: ${error.message}`;
      } else if (dbLatencyMs > 600) {
        dbStatus = 'SLOW';
        dbDetails = `High latency detected (${dbLatencyMs}ms)`;
      }
    } catch (err: any) {
      dbStatus = 'OFFLINE';
      dbLatencyMs = Date.now() - dbStartTime;
      dbDetails = err.message;
    }

    const overallStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN' =
      dbStatus === 'OFFLINE'
        ? 'DOWN'
        : dbStatus === 'SLOW' || heapUsagePercent > 85
        ? 'DEGRADED'
        : 'HEALTHY';

    return {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      uptimeSeconds: uptimeSec,
      cpu: {
        cores: totalCpus,
        model: os.cpus()[0]?.model || 'Standard CPU',
        loadAvg1m: Math.round((os.loadavg()[0] || 0) * 100) / 100,
        processCpuPercent,
      },
      memory: {
        heapUsedMb,
        heapTotalMb,
        rssMb,
        totalSystemMb,
        freeSystemMb,
        heapUsagePercent,
      },
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        checkedAt: new Date().toISOString(),
        details: dbDetails,
      },
      services: {
        pysApi: { port: 5000, status: 'ONLINE' },
        essPlatform: { port: 5002, status: 'ONLINE' },
      },
    };
  }

  /**
   * Retrieves persistent crash logs from Supabase
   */
  public async getCrashesFromDb(limit = 50) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('system_error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to load crash logs: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Marks a crash log as resolved
   */
  public async resolveCrashInDb(id: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('system_error_logs')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to resolve crash: ${error.message}`);
    }
    return data;
  }
}

export const telemetryLogService = new TelemetryLogService();
