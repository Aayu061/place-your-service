// src/pages/serverManagement/ServerManagementWorkspace.tsx
// Admin-only Server & Database page: live server health, saved errors, the in-memory log
// stream, per-table record counts and database snapshot downloads.
// Every number on this page comes from the API. When a value cannot be loaded, the page says so
// instead of showing a made-up figure.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Server,
  Database,
  Download,
  RefreshCw,
  Cpu,
  Activity,
  HardDrive,
  Globe,
  FileCode2,
  Layers,
  Bug,
  CheckCircle,
  Terminal,
  X,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/useToast';
import { apiClient, ApiError } from '@/services/api/client';

export interface SystemHealthResponse {
  timestamp: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  uptimeSeconds: number;
  startedAt?: string;
  environment?: string;
  nodeVersion?: string;
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
}

interface LogEntry {
  id: string;
  timestamp: string;
  service: 'PYS' | 'ESS' | 'CLIENT';
  level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  category: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

interface LogsResponse {
  totalReturned: number;
  bufferStartedAt?: string;
  bufferCapacity?: number;
  logs: LogEntry[];
}

interface CrashIncident {
  id: string;
  service_name: 'PYS' | 'ESS' | 'CLIENT';
  error_level: string;
  message: string;
  error_name?: string;
  stack_trace?: string;
  context_data?: {
    remediationAdvice?: string;
    [key: string]: unknown;
  };
  resolved: boolean;
  resolved_at?: string;
  created_at: string;
}

export interface TableCountEntry {
  tableName: string;
  count: number | null;
  status: 'ok' | 'missing' | 'error';
  exported: boolean;
  error?: string;
}

export interface BackupMetadataResponse {
  countedAt?: string;
  tables?: TableCountEntry[];
  tableCounts: Record<string, number>;
  totalRecords: number;
  tablesCounted?: number;
  tablesMissing?: number;
  tablesFailed?: number;
  recentBackups: {
    id: string;
    file_name: string;
    format: string;
    file_size_bytes: number;
    total_records: number;
    checksum_sha256: string;
    created_at: string;
    status: string;
  }[];
  recentBackupsError?: string;
}

type SectionKey = 'health' | 'logs' | 'crashes' | 'metadata';
type SectionErrors = Partial<Record<SectionKey, string>>;

const UNAVAILABLE = 'Unavailable';

function describeError(reason: unknown): string {
  if (reason instanceof ApiError && reason.statusCode === 403) {
    return 'Admins only. Your account does not have access to this page.';
  }
  if (reason instanceof Error && reason.message) return reason.message;
  return 'Could not reach the server.';
}

function formatDateTime(iso?: string): string {
  if (!iso) return UNAVAILABLE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNAVAILABLE;
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/** Normalises the manifest: new API sends `tables`, older API only `tableCounts`. */
function manifestRows(metadata: BackupMetadataResponse | null): TableCountEntry[] {
  if (!metadata) return [];
  if (Array.isArray(metadata.tables) && metadata.tables.length > 0) return metadata.tables;
  return Object.entries(metadata.tableCounts || {}).map(([tableName, count]) => ({
    tableName,
    count,
    status: 'ok' as const,
    exported: true,
  }));
}

export const ServerManagementWorkspace: React.FC = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [loadedOnce, setLoadedOnce] = useState<boolean>(false);
  const [downloadingFormat, setDownloadingFormat] = useState<'json' | 'sql' | null>(null);
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logBufferStartedAt, setLogBufferStartedAt] = useState<string | undefined>(undefined);
  const [crashes, setCrashes] = useState<CrashIncident[]>([]);
  const [metadata, setMetadata] = useState<BackupMetadataResponse | null>(null);
  const [errors, setErrors] = useState<SectionErrors>({});

  // Filters for Log Streamer
  const [selectedService, setSelectedService] = useState<string>('ALL');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Active crash inspection modal
  const [inspectedCrash, setInspectedCrash] = useState<CrashIncident | null>(null);
  const [triggeringTest, setTriggeringTest] = useState<boolean>(false);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // 1. Fetch health, logs, saved errors and table counts. Each section loads on its own, so one
  //    failing endpoint does not blank the others. apiClient already unwraps { success, data }.
  const fetchTelemetry = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);

      const queryParams = new URLSearchParams();
      if (selectedService !== 'ALL') queryParams.append('service', selectedService);
      if (selectedLevel !== 'ALL') queryParams.append('level', selectedLevel);
      if (searchFilter.trim()) queryParams.append('search', searchFilter.trim());
      queryParams.append('limit', '80');

      // Table counts are heavier (one query per table): only on manual/initial loads.
      const [healthRes, logsRes, crashesRes, metaRes] = await Promise.allSettled([
        apiClient.get<SystemHealthResponse>('/admin/telemetry/health'),
        apiClient.get<LogsResponse>(`/admin/telemetry/logs?${queryParams.toString()}`),
        apiClient.get<CrashIncident[]>('/admin/telemetry/crashes?limit=20'),
        isBackground ? Promise.resolve(null) : apiClient.get<BackupMetadataResponse>('/admin/database/backup/metadata'),
      ]);

      const nextErrors: SectionErrors = {};

      if (healthRes.status === 'fulfilled' && healthRes.value) setHealth(healthRes.value);
      else if (healthRes.status === 'rejected') nextErrors.health = describeError(healthRes.reason);

      if (logsRes.status === 'fulfilled' && logsRes.value) {
        setLogs(Array.isArray(logsRes.value.logs) ? logsRes.value.logs : []);
        setLogBufferStartedAt(logsRes.value.bufferStartedAt);
      } else if (logsRes.status === 'rejected') nextErrors.logs = describeError(logsRes.reason);

      if (crashesRes.status === 'fulfilled') setCrashes(Array.isArray(crashesRes.value) ? crashesRes.value : []);
      else nextErrors.crashes = describeError(crashesRes.reason);

      if (metaRes.status === 'fulfilled') {
        if (metaRes.value) setMetadata(metaRes.value);
      } else nextErrors.metadata = describeError(metaRes.reason);

      setErrors((prev) => (isBackground ? { ...nextErrors, metadata: prev.metadata } : nextErrors));

      if (!isBackground) {
        setLoading(false);
        setLoadedOnce(true);
        const failed = Object.keys(nextErrors).length;
        if (failed === 4) {
          showToast({
            type: 'error',
            title: 'Could not load server information',
            message: nextErrors.health || 'The API did not respond.',
          });
        }
      }
    },
    [selectedService, selectedLevel, searchFilter, showToast]
  );

  // Initial load
  useEffect(() => {
    void fetchTelemetry(false);
  }, [fetchTelemetry]);

  // Polling timer for live streaming
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void fetchTelemetry(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchTelemetry]);

  // 2. Trigger Diagnostic Self-Test (controlled test exception)
  const handleTriggerSelfTest = async () => {
    setTriggeringTest(true);
    try {
      await apiClient.post('/admin/telemetry/test-error', {});
      showToast({
        type: 'success',
        title: 'Test error recorded',
        message: 'A controlled test error was saved to the error log.',
      });
      await fetchTelemetry(true);
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Self-test failed', message: describeError(err) });
    } finally {
      setTriggeringTest(false);
    }
  };

  // 3. Mark Crash Incident Resolved
  const handleResolveCrash = async (id: string) => {
    try {
      await apiClient.patch(`/admin/telemetry/crashes/${id}/resolve`, {});
      showToast({ type: 'success', title: 'Marked resolved', message: 'The error is marked as resolved.' });
      if (inspectedCrash && inspectedCrash.id === id) {
        setInspectedCrash({ ...inspectedCrash, resolved: true });
      }
      void fetchTelemetry(true);
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Could not update', message: describeError(err) });
    }
  };

  // 4. Download a database snapshot (uses the signed-in session via apiClient)
  const handleDownloadBackup = async (format: 'json' | 'sql') => {
    setDownloadingFormat(format);
    try {
      const blob = await apiClient.download('/admin/database/backup', { format });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `pys_supabase_replica_${stamp}.${format}`;

      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(objectUrl);
      document.body.removeChild(a);

      showToast({
        type: 'success',
        title: 'Snapshot downloaded',
        message: `Saved ${fileName} (${(blob.size / 1024).toFixed(1)} KB).`,
      });
      void fetchTelemetry(false);
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Download failed', message: describeError(err) });
    } finally {
      setDownloadingFormat(null);
    }
  };

  // Format uptime in friendly string
  const formatUptime = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return UNAVAILABLE;
    if (seconds < 60) return 'Just started';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const rows = manifestRows(metadata);
  const okRows = rows.filter((r) => r.status === 'ok');
  const problemRows = rows.filter((r) => r.status !== 'ok');
  const metaLoading = loading && !metadata;
  const placeholder = loadedOnce ? UNAVAILABLE : 'Loading…';

  const iconBox = (bg: string, color: string, icon: React.ReactNode) => (
    <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {icon}
    </div>
  );

  const flowSteps: { title: string; body: string }[] = [
    {
      title: 'PYS web app (Vercel)',
      body: 'Admin, staff and technician screens. Runs in the browser and calls the PYS API over HTTPS.',
    },
    {
      title: 'PYS API (Render)',
      body: 'Checks logins and roles, applies business rules, and is the only part that writes to the database.',
    },
    {
      title: 'Supabase PostgreSQL',
      body: 'The single source of truth for customers, AC units, requests, AMC, reports and payments, protected by row-level security.',
    },
    {
      title: 'ESS website',
      body: 'Sends bookings and enquiries to PYS through the signed /api/v1/ess link (each request is signed and can only be used once).',
    },
    {
      title: 'Email (Resend)',
      body: 'Emails are queued in an outbox and sent through Resend, with retries and a delivery history.',
    },
  ];

  return (
    <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* HEADER & CONTROLS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--color-brand)' }}><Server size={26} /></span>
            <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 800 }}>Server &amp; Database</h1>
            <Badge variant="neutral">Admin only</Badge>
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Live server health, saved errors, recent server logs, record counts and database snapshots.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            onClick={() => void fetchTelemetry(false)}
            isLoading={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {errors.health && (
        <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', fontSize: 'var(--text-sm)' }}>
          <AlertTriangle size={16} style={{ color: 'var(--color-danger)' }} />
          <span>Server health is unavailable: {errors.health}</span>
        </div>
      )}

      {/* SECTION 1: LIVE SERVER HEALTH */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
        <Card>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            {iconBox('var(--color-brand-subtle)', 'var(--color-brand)', <Cpu size={22} />)}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>API PROCESS CPU</div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{!health ? placeholder : `${health.cpu.processCpuPercent}%`}</span>
                {health && (
                  <Badge variant={health.cpu.processCpuPercent > 60 ? 'warning' : 'success'}>{health.cpu.cores} cores</Badge>
                )}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Load (1 min): {health ? health.cpu.loadAvg1m : '—'}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            {iconBox('#8b5cf620', '#8b5cf6', <Activity size={22} />)}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>API MEMORY (HEAP)</div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                {health ? (
                  <>
                    <span>{health.memory.heapUsedMb} MB</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>/ {health.memory.heapTotalMb} MB</span>
                  </>
                ) : (
                  <span>{placeholder}</span>
                )}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {health ? `In use: ${health.memory.heapUsagePercent}% · Total process: ${health.memory.rssMb} MB` : '—'}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            {iconBox('#10b98120', '#10b981', <Database size={22} />)}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>DATABASE (SUPABASE)</div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{health ? health.database.status : placeholder}</span>
                {health && (
                  <Badge variant={health.database.status === 'ONLINE' ? 'success' : health.database.status === 'SLOW' ? 'warning' : 'danger'}>
                    {health.database.latencyMs} ms
                  </Badge>
                )}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {health?.database.details || '—'}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            {iconBox('#3b82f620', '#3b82f6', <Globe size={22} />)}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>API UPTIME</div>
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 800 }}>
                {health ? formatUptime(health.uptimeSeconds) : placeholder}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {health?.startedAt ? `Started ${formatDateTime(health.startedAt)}` : '—'}
                {health?.environment ? ` · ${health.environment}` : ''}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* SECTION 2: SAVED ERRORS (system_error_logs, survives restarts) */}
      <Card>
        <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bug size={18} style={{ color: 'var(--color-danger)' }} />
              Saved Errors
              {crashes.filter((c) => !c.resolved).length > 0 && (
                <Badge variant="danger">{crashes.filter((c) => !c.resolved).length} unresolved</Badge>
              )}
            </CardTitle>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
              Server errors are saved in the database, so they stay here after a restart. Showing the latest 20.
            </p>
          </div>
          <Button size="sm" variant="secondary" leftIcon={<Zap size={14} />} onClick={handleTriggerSelfTest} isLoading={triggeringTest}>
            Record a test error
          </Button>
        </CardHeader>
        <CardBody>
          {errors.crashes ? (
            <div role="alert" style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-danger)', fontSize: 'var(--text-sm)' }}>
              Saved errors are unavailable: {errors.crashes}
            </div>
          ) : !loadedOnce ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>
          ) : crashes.length === 0 ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              <CheckCircle size={32} style={{ color: 'var(--color-success)', margin: '0 auto 8px' }} />
              <div>No saved errors.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 'var(--text-xs)', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 10px' }}>Source</th>
                    <th style={{ padding: '8px 10px' }}>Level</th>
                    <th style={{ padding: '8px 10px' }}>Error</th>
                    <th style={{ padding: '8px 10px' }}>When</th>
                    <th style={{ padding: '8px 10px' }}>Status</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {crashes.map((crash) => (
                    <tr
                      key={crash.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        backgroundColor: crash.resolved ? 'transparent' : 'rgba(239, 68, 68, 0.04)',
                      }}
                    >
                      <td style={{ padding: '8px 10px' }}>
                        <Badge variant={crash.service_name === 'PYS' ? 'brand' : 'neutral'}>{crash.service_name}</Badge>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <Badge variant={crash.error_level === 'FATAL' || crash.error_level === 'ERROR' ? 'danger' : 'warning'}>
                          {crash.error_level}
                        </Badge>
                      </td>
                      <td style={{ padding: '8px 10px', maxWidth: 360 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{crash.error_name || 'Error'}</div>
                        <div style={{ color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {crash.message}
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDateTime(crash.created_at)}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {crash.resolved ? <Badge variant="success">Resolved</Badge> : <Badge variant="danger">Open</Badge>}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Button size="sm" variant="ghost" style={{ marginRight: 6 }} onClick={() => setInspectedCrash(crash)}>
                          Details
                        </Button>
                        {!crash.resolved && (
                          <Button size="sm" variant="secondary" onClick={() => void handleResolveCrash(crash.id)}>
                            Mark resolved
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* SECTION 3: RECENT SERVER LOGS (in memory, since the last restart) */}
      <Card>
        <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Terminal size={18} style={{ color: 'var(--color-brand)' }} />
              Recent Server Logs
            </CardTitle>
            <p data-testid="log-buffer-started" style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
              {logBufferStartedAt
                ? `Since server start at ${formatDateTime(logBufferStartedAt)}. `
                : ''}
              Kept in the server's memory only (last 500 lines), so this list empties when the server restarts. Errors are also saved above.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <select
              aria-label="Filter logs by source"
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              style={{ fontSize: 'var(--text-xs)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
            >
              <option value="ALL">All sources</option>
              <option value="PYS">PYS API</option>
              <option value="ESS">ESS website</option>
              <option value="CLIENT">Browser</option>
            </select>

            <select
              aria-label="Filter logs by level"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              style={{ fontSize: 'var(--text-xs)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
            >
              <option value="ALL">All levels</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
              <option value="FATAL">FATAL</option>
            </select>

            <input
              type="text"
              aria-label="Search logs"
              placeholder="Search logs..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ fontSize: 'var(--text-xs)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', width: 140 }}
            />

            <Button size="sm" variant={autoRefresh ? 'primary' : 'secondary'} onClick={() => setAutoRefresh(!autoRefresh)}>
              {autoRefresh ? 'Live (every 4s)' : 'Paused'}
            </Button>
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          <div
            ref={logContainerRef}
            style={{
              maxHeight: 380,
              overflowY: 'auto',
              background: '#0f172a',
              color: '#e2e8f0',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '11px',
              padding: '12px',
              lineHeight: 1.6,
            }}
          >
            {errors.logs ? (
              <div style={{ color: '#f87171', textAlign: 'center', padding: '24px' }}>Logs are unavailable: {errors.logs}</div>
            ) : logs.length === 0 ? (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: '24px' }}>
                {loadedOnce ? 'No logs match the current filter.' : 'Loading…'}
              </div>
            ) : (
              logs.map((log) => {
                const levelColor =
                  log.level === 'FATAL' || log.level === 'ERROR' ? '#f87171' : log.level === 'WARN' ? '#fbbf24' : '#38bdf8';
                return (
                  <div key={log.id} style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255, 255, 255, 0.05)', padding: '3px 0' }}>
                    <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span style={{ color: '#a855f7', fontWeight: 700, width: 44 }}>[{log.service}]</span>
                    <span style={{ color: levelColor, fontWeight: 700, width: 46 }}>{log.level}</span>
                    <span style={{ color: '#cbd5e1', flex: 1, wordBreak: 'break-word' }}>{log.message}</span>
                  </div>
                );
              })
            )}
          </div>
        </CardBody>
      </Card>

      {/* SECTION 4: RECORD COUNTS & DATABASE SNAPSHOTS */}
      <Card>
        <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HardDrive size={18} style={{ color: 'var(--color-brand)' }} />
              Records &amp; Database Snapshots
            </CardTitle>
            <p data-testid="records-summary" style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
              {errors.metadata ? (
                <>Record counts are unavailable: {errors.metadata}</>
              ) : metadata ? (
                <>
                  Total records: <strong>{metadata.totalRecords.toLocaleString('en-IN')}</strong> across{' '}
                  <strong>{okRows.length}</strong> tables
                  {metadata.countedAt ? ` (counted ${formatDateTime(metadata.countedAt)})` : ''}.
                  {problemRows.length > 0 ? ` ${problemRows.length} table(s) could not be counted.` : ''}
                </>
              ) : metaLoading ? (
                'Counting records…'
              ) : (
                'Record counts are unavailable.'
              )}{' '}
              Snapshots leave out secrets (signing keys, PIN hashes) and short-lived replay data.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Download size={14} />}
              isLoading={downloadingFormat === 'json'}
              onClick={() => void handleDownloadBackup('json')}
            >
              Download JSON
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<FileCode2 size={14} />}
              isLoading={downloadingFormat === 'sql'}
              onClick={() => void handleDownloadBackup('sql')}
            >
              Download SQL
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
              Records per table
            </div>
            {rows.length === 0 ? (
              <div data-testid="manifest-empty" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                {errors.metadata ? 'Unavailable — use Refresh to try again.' : metaLoading ? 'Counting…' : 'No tables reported.'}
              </div>
            ) : (
              <div data-testid="table-manifest" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {rows.map((row) => (
                  <div
                    key={row.tableName}
                    title={row.status === 'error' ? row.error : row.exported ? undefined : 'Counted only; not included in snapshots'}
                    style={{ padding: '6px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 'var(--text-xs)' }}
                  >
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.tableName}</span>
                    {row.status === 'ok' ? (
                      <strong style={{ color: (row.count ?? 0) > 0 ? 'var(--color-brand)' : 'var(--text-muted)' }}>{(row.count ?? 0).toLocaleString('en-IN')}</strong>
                    ) : row.status === 'missing' ? (
                      <Badge variant="neutral">not created</Badge>
                    ) : (
                      <Badge variant="danger">error</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {metadata && (metadata.recentBackups?.length ?? 0) > 0 && (
            <div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
                Recent snapshots
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                {metadata.recentBackups.slice(0, 5).map((b) => (
                  <li key={b.id}>
                    {formatDateTime(b.created_at)} · {String(b.format).toUpperCase()} · {(Number(b.total_records) || 0).toLocaleString('en-IN')} records ·{' '}
                    {((Number(b.file_size_bytes) || 0) / 1024).toFixed(1)} KB · {b.status}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      {/* SECTION 5: HOW THE SYSTEM FITS TOGETHER */}
      <Card>
        <CardHeader>
          <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={18} style={{ color: 'var(--color-brand)' }} />
            How the system fits together
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
            {flowSteps.map((step, index) => (
              <div
                key={step.title}
                style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--color-brand)' }}>STEP {index + 1}</span>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{step.title}</div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{step.body}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* INSPECTION MODAL */}
      {inspectedCrash && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-xl)',
              maxWidth: 720,
              width: '100%',
              padding: 'var(--space-6)',
              maxHeight: '85vh',
              overflowY: 'auto',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-2xl)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bug size={20} style={{ color: 'var(--color-danger)' }} />
                  {inspectedCrash.error_name || 'Incident Diagnostics'}
                </h3>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  Platform: {inspectedCrash.service_name} · Incident ID: {inspectedCrash.id}
                </span>
              </div>
              <button
                onClick={() => setInspectedCrash(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Error Message */}
            <div style={{ padding: 12, background: 'rgba(239, 68, 68, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: 16 }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-danger)', marginBottom: 4 }}>
                EXCEPTION MESSAGE:
              </div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{inspectedCrash.message}</div>
            </div>

            {/* Root-Cause Advice */}
            {inspectedCrash.context_data?.remediationAdvice && (
              <div style={{ padding: 12, background: 'rgba(59, 130, 246, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: 16 }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#2563eb', marginBottom: 4 }}>
                  AUTOMATED ROOT-CAUSE REMEDIATION RECOMMENDATION:
                </div>
                <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.6 }}>
                  {String(inspectedCrash.context_data.remediationAdvice)}
                </div>
              </div>
            )}

            {/* Stack Trace */}
            {inspectedCrash.stack_trace && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  FULL STACK TRACE:
                </div>
                <pre
                  style={{
                    background: '#0f172a',
                    color: '#e2e8f0',
                    padding: 12,
                    borderRadius: 'var(--radius-md)',
                    fontSize: '11px',
                    lineHeight: 1.5,
                    overflowX: 'auto',
                    margin: 0,
                  }}
                >
                  {inspectedCrash.stack_trace}
                </pre>
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
              {!inspectedCrash.resolved && (
                <Button
                  variant="primary"
                  onClick={() => void handleResolveCrash(inspectedCrash.id)}
                >
                  Mark Incident as Resolved
                </Button>
              )}
              <Button variant="secondary" onClick={() => setInspectedCrash(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServerManagementWorkspace;
