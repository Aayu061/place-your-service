import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { operationsApi, ActivityLogRecord } from '@/services/operationsApi';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/feedback/EmptyState';
import { TablePagination } from '@/components/ui/TablePagination';
import { useToast } from '@/components/ui/useToast';
import { hintStyle, sectionStyle, toolbarStyle, useWorkspaceFilters } from './workspaceShared';

function renderDetails(details: Record<string, unknown> | null) {
  if (!details || Object.keys(details).length === 0) return <span style={hintStyle}>No details</span>;
  const entries = Object.entries(details);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {entries.slice(0, 4).map(([key, value]) => (
          <span key={key} style={{ display: 'inline-flex', gap: 4, padding: '2px 6px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', fontSize: '11px' }}>
            <span style={{ color: 'var(--text-muted)' }}>{key}:</span>
            <strong>{typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}</strong>
          </span>
        ))}
      </div>
      {entries.length > 4 && (
        <details style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          <summary style={{ cursor: 'pointer', padding: '2px 0' }}>Show all {entries.length} fields</summary>
          <pre style={{ margin: '4px 0 0', padding: 6, background: 'var(--bg-surface-subtle)', borderRadius: 4, whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
            {JSON.stringify(details, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export const ActivityLogWorkspace: React.FC = () => {
  const { showToast } = useToast();
  const { search, setSearch, debouncedSearch, from, setFrom, to, setTo } = useWorkspaceFilters();
  const [rows, setRows] = useState<ActivityLogRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await operationsApi.listActivityLogs({
        page,
        pageSize: 50,
        entityType: debouncedSearch.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setRows(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (error) {
      showToast({ type: 'error', title: 'Activity log unavailable', message: error instanceof Error ? error.message : 'Could not load activity records.' });
    } finally {
      setLoading(false);
    }
  }, [showToast, page, debouncedSearch, from, to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div style={sectionStyle}>
      <div style={toolbarStyle}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Input
            label="Filter entity type"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="customer, schedule…"
            style={{ maxWidth: 280 }}
          />
          <Input
            label="From date"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            label="To date"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button size="sm" variant="secondary" leftIcon={<RefreshCw size={14} />} onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div role="status">Loading immutable activity records…</div>
      ) : rows.length ? (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                  <td>{row.profiles?.full_name || row.actor_profile_id || 'System'}</td>
                  <td>
                    <strong>{row.action}</strong>
                  </td>
                  <td>
                    {row.entity_type}
                    {row.entity_id ? <div style={hintStyle}>{row.entity_id}</div> : null}
                  </td>
                  <td>{renderDetails(row.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination page={page} pageSize={50} total={total} totalPages={totalPages} onPageChange={setPage} itemLabel="events" />
        </div>
      ) : (
        <EmptyState title="No activity matches these filters" description="Activity events are written by the server as operational changes occur." />
      )}
    </div>
  );
};
