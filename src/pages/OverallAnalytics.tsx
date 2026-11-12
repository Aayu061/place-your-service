import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CalendarClock, ClipboardList, RefreshCw, Users } from 'lucide-react';
import { analyticsApi, DashboardSummary, OverallAnalytics as OverallAnalyticsResponse } from '@/services/analyticsApi';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/feedback/EmptyState';

interface OverallAnalyticsProps {
  onNavigate?: (item: string, params?: Record<string, string>) => void;
}

const formatNumber = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const muted: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--text-sm)' };
const card: React.CSSProperties = { padding: 22, display: 'flex', flexDirection: 'column', gap: 12 };

function formatDate(value?: string) {
  if (!value) return 'No date';
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString();
}

function priorityVariant(priority: string): 'error' | 'warning' | 'neutral' {
  if (priority === 'URGENT' || priority === 'EMERGENCY') return 'error';
  return priority === 'HIGH' ? 'warning' : 'neutral';
}

export const OverallAnalytics: React.FC<OverallAnalyticsProps> = ({ onNavigate }) => {
  const [overall, setOverall] = useState<OverallAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setOverall(await analyticsApi.getOverallAnalytics()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Operational analytics could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  const summary: DashboardSummary | null = overall?.summary || null;

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading && !summary) return <section style={{ display: 'grid', gap: 16 }}><h1 style={{ margin: 0 }}>Overall Operational Analytics</h1><p role="status">Loading server-calculated operational metrics…</p></section>;
  if (error && !summary) return <section style={{ display: 'grid', gap: 16 }}><h1 style={{ margin: 0 }}>Overall Operational Analytics</h1><div role="alert" className="pys-card-26" style={card}><strong>Analytics unavailable</strong><p style={{ margin: 0, ...muted }}>{error}</p><Button variant="secondary" onClick={() => void refresh()}><RefreshCw size={15} /> Retry</Button></div></section>;

  const kpi = summary?.kpi;
  const maximumVolume = Math.max(1, ...(summary?.trendData || []).flatMap((day) => [day.value, day.secondaryValue]));
  const metrics = [
    { label: 'Active AMC contracts', value: kpi?.activeAmcCount, detail: `${formatNumber.format(kpi?.coveredAssetCount || 0)} covered assets`, icon: ClipboardList, target: 'amc' },
    { label: 'Open scheduled work', value: kpi?.servicesDueCount, detail: `${formatNumber.format(kpi?.overdueScheduleCount || 0)} overdue`, icon: CalendarClock, target: 'service-schedule' },
    { label: 'Requests for dispatch', value: kpi?.unassignedRequestsCount, detail: `${formatNumber.format(kpi?.urgentRequestsCount || 0)} urgent`, icon: AlertTriangle, target: 'service-requests' },
    { label: 'Active technicians', value: kpi?.activeTechniciansCount, detail: `${formatNumber.format(kpi?.completedTodayCount || 0)} visits completed today`, icon: Users, target: 'technicians' },
  ];

  return <section style={{ display: 'grid', gap: 20 }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
      <div><div style={muted}>Server-calculated · authenticated internal data</div><h1 style={{ margin: '4px 0', fontSize: 'var(--text-2xl)' }}>Overall Operational Analytics</h1><p style={{ margin: 0, ...muted }}>Snapshot counts describe current open work. Activity bars use the last 7 calendar days in IST (UTC+05:30).</p></div>
      <Button variant="secondary" isLoading={loading} onClick={() => void refresh()}><RefreshCw size={15} /> Refresh</Button>
    </header>
    {error && <p role="alert" style={{ color: 'var(--color-error-solid)', margin: 0 }}>{error} · Showing the last loaded values.</p>}

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
      {metrics.map(({ label, value, detail, icon: Icon, target }) => <button type="button" className="pys-card-26" style={{ ...card, minHeight: 145, textAlign: 'left', border: 0, background: 'var(--bg-surface)', cursor: onNavigate ? 'pointer' : 'default' }} key={label} onClick={() => onNavigate?.(target)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><span style={muted}>{label}</span><Icon size={18} aria-hidden="true" /></div>
        <strong style={{ fontSize: 'var(--text-2xl)' }}>{formatNumber.format(value || 0)}</strong><span style={muted}>{detail}</span>
      </button>)}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
      <article className="pys-card-26" style={card}>
        <div><h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Request and schedule activity</h2><p style={{ margin: '4px 0 0', ...muted }}>Requests created and visits scheduled per IST calendar day.</p></div>
        {summary?.trendData.length ? <div style={{ display: 'grid', gap: 14 }}>{summary.trendData.map((day) => <div key={day.date} style={{ display: 'grid', gridTemplateColumns: '82px 1fr 42px', alignItems: 'center', gap: 10 }}>
          <span style={muted}>{day.label} {day.date.slice(5)}</span><div style={{ display: 'grid', gap: 4 }}><div aria-label={`${day.value} requests`} style={{ height: 8, borderRadius: 99, background: 'var(--color-brand)', width: `${Math.max(day.value > 0 ? 4 : 0, (day.value / maximumVolume) * 100)}%` }} /><div aria-label={`${day.secondaryValue} scheduled visits`} style={{ height: 8, borderRadius: 99, background: 'var(--color-success-solid)', width: `${Math.max(day.secondaryValue > 0 ? 4 : 0, (day.secondaryValue / maximumVolume) * 100)}%` }} /></div><strong style={{ textAlign: 'right' }}>{formatNumber.format(day.value + day.secondaryValue)}</strong>
        </div>)}</div> : <EmptyState title="No activity data" description="Activity counts will appear once requests and schedules are recorded." />}
        <div style={{ display: 'flex', gap: 16, ...muted }}><span>Service requests</span><span>Scheduled visits</span></div>
      </article>
      <article className="pys-card-26" style={card}>
        <div><h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Workload indicators</h2><p style={{ margin: '4px 0 0', ...muted }}>Consistent with the dashboard summary calculation.</p></div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><span style={muted}>Not-overdue share of open schedules</span><strong>{summary?.compliancePercent ?? 0}%</strong></div>
          <div style={{ height: 8, background: 'var(--bg-surface-subtle)', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: `${summary?.compliancePercent ?? 0}%`, background: 'var(--color-success-solid)' }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><span style={muted}>Open schedules with a technician</span><strong>{summary?.capacityPercent ?? 0}%</strong></div>
          <div style={{ height: 8, background: 'var(--bg-surface-subtle)', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: `${summary?.capacityPercent ?? 0}%`, background: 'var(--color-brand)' }} /></div>
        </div>
        <p style={{ margin: 0, ...muted }}>A schedule is open when its status is not completed, resolved, cancelled, skipped, or rescheduled.</p>
      </article>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
      <article className="pys-card-26" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><div><h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Requests requiring work</h2><p style={{ margin: '4px 0 0', ...muted }}>Latest open records returned by the API.</p></div><Button size="sm" variant="ghost" onClick={() => onNavigate?.('service-requests')}>Open queue</Button></div>
        {summary?.recentServiceRequests.length ? summary.recentServiceRequests.map((request) => <button type="button" key={request.id} onClick={() => onNavigate?.('service-requests', { recordId: request.id, recordType: 'service_request' })} style={{ border: 0, borderTop: '1px solid var(--border-default)', padding: '11px 0', background: 'transparent', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer' }}><span><strong>{request.requestNumber}</strong><span style={{ display: 'block', ...muted }}>{request.customerName || 'Customer'} · {request.siteName || 'Site'}</span></span><span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}><Badge variant={priorityVariant(request.priority)}>{request.priority}</Badge><StatusBadge status={request.status} /></span></button>) : <EmptyState title="No open requests" description="New open requests will appear here." />}
      </article>
      <article className="pys-card-26" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><div><h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Open schedules</h2><p style={{ margin: '4px 0 0', ...muted }}>The API includes unassigned work in this list.</p></div><Button size="sm" variant="ghost" onClick={() => onNavigate?.('service-schedule')}>Dispatch board</Button></div>
        {summary?.recentSchedules.length ? summary.recentSchedules.map((schedule) => <button type="button" key={schedule.id} onClick={() => onNavigate?.('service-schedule', { recordId: schedule.id, recordType: 'schedule' })} style={{ border: 0, borderTop: '1px solid var(--border-default)', padding: '11px 0', background: 'transparent', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer' }}><span><strong>{schedule.scheduleNumber}</strong><span style={{ display: 'block', ...muted }}>{schedule.customerName || 'Customer'} · {schedule.siteName || 'Site'}</span></span><span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}><span>{formatDate(schedule.scheduledDate)}</span><StatusBadge status={schedule.status} /></span></button>) : <EmptyState title="No open schedules" description="Upcoming and overdue service work will appear here." />}
      </article>
    </div>

    {overall && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <article className="pys-card-26" style={card}>
          <div><h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Monthly Footprint</h2><p style={{ margin: '4px 0 0', ...muted }}>Master data and current IST month output.</p></div>
          <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={muted}>Active customers</span><strong>{formatNumber.format(overall.totals.activeCustomers)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={muted}>Tracked AC assets</span><strong>{formatNumber.format(overall.totals.totalAssets)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={muted}>Reports this month</span><strong>{formatNumber.format(overall.totals.reportsThisMonth)}</strong></div>
          </div>
        </article>
        <article className="pys-card-26" style={card}>
          <div><h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Open Requests by Category</h2></div>
          {overall.issueCategoryBreakdown.length ? (
            <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              {overall.issueCategoryBreakdown.slice(0, 5).map((item) => (
                <div key={item.category} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={muted}>{item.category.replace(/_/g, ' ')}</span>
                  <strong>{formatNumber.format(item.count)}</strong>
                </div>
              ))}
            </div>
          ) : <p style={muted}>No open issue categories recorded.</p>}
        </article>
        <article className="pys-card-26" style={card}>
          <div><h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Technician Output (Month)</h2></div>
          {overall.technicianPerformance.length ? (
            <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              {overall.technicianPerformance.slice(0, 5).map((t) => (
                <div key={t.technicianId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t.name}</span>
                  <strong>{formatNumber.format(t.completedThisMonth)} visits</strong>
                </div>
              ))}
            </div>
          ) : <p style={muted}>No completed technician visits yet this month.</p>}
        </article>
      </div>
    )}

    <div style={{ display: 'flex', gap: 8, alignItems: 'center', ...muted }}><Activity size={15} aria-hidden="true" /> Metrics are computed by the Express API; the browser does not calculate a separate dashboard total.</div>
  </section>;
};

export default OverallAnalytics;
