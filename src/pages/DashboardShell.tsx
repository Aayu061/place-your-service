import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, Bell, CalendarClock, CheckCircle2, ClipboardList, RefreshCw, Wrench } from 'lucide-react';
import { analyticsApi, DashboardSummary } from '@/services/analyticsApi';
import { operationsApi, NotificationRecord } from '@/services/operationsApi';
import { UserRole } from '@/domain/types';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/feedback/EmptyState';

interface DashboardShellProps {
  currentRole: UserRole;
  onNavigate: (item: string, params?: Record<string, string>) => void;
  activeSubTab?: 'overview' | 'activity';
}

const compactNumber = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const cardStyle: React.CSSProperties = { padding: 22, display: 'flex', flexDirection: 'column', gap: 12 };
const mutedText: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--text-sm)' };

function formatDate(value?: string | null) {
  if (!value) return 'Date not recorded';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function getBadgeVariant(priority: string): 'error' | 'warning' | 'neutral' {
  if (priority === 'URGENT' || priority === 'EMERGENCY') return 'error';
  if (priority === 'HIGH') return 'warning';
  return 'neutral';
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  currentRole: _currentRole,
  onNavigate,
  activeSubTab = 'overview',
}) => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboard, notificationPage] = await Promise.all([
        analyticsApi.getDashboardSummary(),
        operationsApi.listNotifications({ page: 1, pageSize: 8, unreadOnly: 'true' }),
      ]);
      setSummary(dashboard);
      setAlerts(notificationPage.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The operations dashboard could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const greeting = user?.fullName ? user.fullName.split(' ')[0] : 'Operator';
  const greetingDate = useMemo(() => new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  }), []);
  const kpi = summary?.kpi;
  const trendMax = Math.max(1, ...(summary?.trendData || []).flatMap((item) => [item.value, item.secondaryValue]));

  const openNotification = (notification: NotificationRecord) => {
    const destinations: Record<string, { workspace: string; recordType: string }> = {
      customer: { workspace: 'customers', recordType: 'customer' },
      service_request: { workspace: 'service-requests', recordType: 'service_request' },
      service_schedule: { workspace: 'service-schedule', recordType: 'schedule' },
      service_report: { workspace: 'service-reports', recordType: 'service_report' },
      amc_contract: { workspace: 'amc', recordType: 'amc' },
      part: { workspace: 'inventory', recordType: 'part' },
      payment: { workspace: 'payments', recordType: 'payment' },
    };
    const destination = notification.entity_type ? destinations[notification.entity_type] : undefined;
    if (destination) onNavigate(destination.workspace, { recordId: notification.entity_id || '', recordType: destination.recordType });
    else onNavigate('notifications');
  };

  if (error && !summary) return <section style={{ display: 'grid', gap: 18 }}>
    <div><h1 style={{ marginBottom: 4 }}>Welcome back, {greeting}</h1><p style={mutedText}>{greetingDate}</p></div>
    <div role="alert" className="pys-card-26" style={cardStyle}><strong>Dashboard data is unavailable</strong><p style={{ margin: 0, ...mutedText }}>{error}</p><Button variant="secondary" onClick={() => void refresh()}><RefreshCw size={15} /> Retry</Button></div>
  </section>;

  const isActivityTab = activeSubTab === 'activity';
  const requests = summary?.recentServiceRequests || [];
  const schedules = summary?.recentSchedules || [];
  const userAction = isActivityTab ? 'Recent service activity' : 'Operational overview';

  return <section style={{ display: 'grid', gap: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
      <div><div style={{ ...mutedText, marginBottom: 5 }}>{greetingDate}</div><h1 style={{ margin: 0, fontSize: 'var(--text-2xl)' }}>Welcome back, {greeting}</h1><p style={{ margin: '6px 0 0', ...mutedText }}>Current service workload from the authenticated operations API.</p></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Button variant="secondary" onClick={() => void refresh()} isLoading={loading}><RefreshCw size={15} /> Refresh</Button><Button onClick={() => onNavigate('service-requests')}><Wrench size={15} /> New service request</Button></div>
    </div>

    {error && <p role="alert" style={{ color: 'var(--color-error-solid)', margin: 0 }}>{error} · Showing the last loaded values.</p>}

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 14 }}>
      {[
        { label: 'Active AMC contracts', value: kpi?.activeAmcCount, sub: `${compactNumber.format(kpi?.coveredAssetCount || 0)} covered assets`, icon: ClipboardList, onClick: () => onNavigate('amc') },
        { label: 'Open scheduled work', value: kpi?.servicesDueCount, sub: `${compactNumber.format(kpi?.overdueScheduleCount || 0)} overdue`, icon: CalendarClock, onClick: () => onNavigate('service-schedule') },
        { label: 'Requests for dispatch', value: kpi?.unassignedRequestsCount, sub: 'Waiting for scheduling', icon: Wrench, onClick: () => onNavigate('service-requests') },
        { label: 'Urgent requests', value: kpi?.urgentRequestsCount, sub: 'Open urgent or emergency', icon: AlertTriangle, onClick: () => onNavigate('service-requests') },
        { label: 'Active technicians', value: kpi?.activeTechniciansCount, sub: 'Active technician records', icon: Activity, onClick: () => onNavigate('technicians') },
        { label: 'Completed today', value: kpi?.completedTodayCount, sub: 'Schedules marked complete', icon: CheckCircle2, onClick: () => onNavigate('service-schedule') },
      ].map(({ label, value, sub, icon: Icon, onClick }) => <button type="button" className="pys-card-26" key={label} onClick={onClick} style={{ ...cardStyle, minHeight: 140, textAlign: 'left', border: 0, background: 'var(--bg-surface)', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><span style={mutedText}>{label}</span><Icon size={18} aria-hidden="true" /></div>
        <strong style={{ fontSize: 'var(--text-2xl)' }}>{loading && value === undefined ? '…' : compactNumber.format(value || 0)}</strong><span style={mutedText}>{sub}</span>
      </button>)}
    </div>

    {!isActivityTab && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16 }}>
      <article className="pys-card-26" style={cardStyle}>
        <div><h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>7 day activity</h2><p style={{ ...mutedText, margin: '5px 0 0' }}>Requests created and service visits scheduled by date.</p></div>
        <div aria-label="Seven day request and schedule activity chart" style={{ display: 'grid', gap: 12 }}>
          {(summary?.trendData || []).map((day) => <div key={day.date} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 42px', gap: 10, alignItems: 'center' }}>
            <span style={mutedText}>{day.label} {day.date.slice(5)}</span>
            <div style={{ display: 'grid', gap: 4 }}><div aria-label={`${day.value} requests`} style={{ height: 8, width: `${Math.max(day.value ? 4 : 0, (day.value / trendMax) * 100)}%`, background: 'var(--color-brand)', borderRadius: 99 }} /><div aria-label={`${day.secondaryValue} schedules`} style={{ height: 8, width: `${Math.max(day.secondaryValue ? 4 : 0, (day.secondaryValue / trendMax) * 100)}%`, background: 'var(--color-success-solid)', borderRadius: 99 }} /></div>
            <span style={{ ...mutedText, textAlign: 'right' }}>{compactNumber.format(day.value + day.secondaryValue)}</span>
          </div>)}
        </div>
        <div style={{ display: 'flex', gap: 16, ...mutedText }}><span>Requests</span><span>Scheduled visits</span></div>
      </article>
      <article className="pys-card-26" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}><div><h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Alerts requiring attention</h2><p style={{ ...mutedText, margin: '5px 0 0' }}>Unread notices from operational rules.</p></div><Button size="sm" variant="ghost" onClick={() => onNavigate('notifications')}>All alerts <ArrowRight size={14} /></Button></div>
        {loading ? <p role="status">Loading alerts…</p> : alerts.length ? alerts.slice(0, 4).map((alert) => <button type="button" key={alert.id} onClick={() => openNotification(alert)} style={{ display: 'flex', textAlign: 'left', gap: 10, alignItems: 'flex-start', background: 'transparent', border: 0, padding: '8px 0', color: 'inherit', cursor: 'pointer' }}><Bell size={16} aria-hidden="true" /><span><strong>{alert.title}</strong><span style={{ display: 'block', ...mutedText }}>{alert.message}</span></span></button>) : <p style={mutedText}>No unread alerts.</p>}
      </article>
    </div>}

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16 }}>
      <article className="pys-card-26" style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><div><h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>{isActivityTab ? 'Recent requests' : 'Service request queue'}</h2><p style={{ ...mutedText, margin: '5px 0 0' }}>Latest open service requests.</p></div><Button size="sm" variant="ghost" onClick={() => onNavigate('service-requests')}>Open queue <ArrowRight size={14} /></Button></div>
        {loading ? <p role="status">Loading requests…</p> : requests.length ? <div style={{ display: 'grid', gap: 10 }}>{requests.slice(0, 6).map((request) => <button type="button" key={request.id} onClick={() => onNavigate('service-requests', { recordId: request.id, recordType: 'service_request' })} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', textAlign: 'left', background: 'transparent', border: 0, borderTop: '1px solid var(--border-default)', padding: '12px 0', color: 'inherit', cursor: 'pointer' }}>
          <span><strong>{request.requestNumber}</strong><span style={{ display: 'block', ...mutedText }}>{request.customerName || 'Customer'} · {request.siteName || 'Site'}{request.assetBrand ? ` · ${request.assetBrand} ${request.assetModel || ''}` : ''}</span></span><span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}><Badge variant={getBadgeVariant(request.priority)}>{request.priority}</Badge><StatusBadge status={request.status} /></span>
        </button>)}</div> : <EmptyState title="No open requests" description="New service requests will appear here." />}
      </article>
      <article className="pys-card-26" style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><div><h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Open schedules</h2><p style={{ ...mutedText, margin: '5px 0 0' }}>Upcoming and overdue work, including unassigned visits.</p></div><Button size="sm" variant="ghost" onClick={() => onNavigate('service-schedule')}>Dispatch board <ArrowRight size={14} /></Button></div>
        {loading ? <p role="status">Loading schedules…</p> : schedules.length ? <div style={{ display: 'grid', gap: 10 }}>{schedules.slice(0, 6).map((schedule) => <button type="button" key={schedule.id} onClick={() => onNavigate('service-schedule', { recordId: schedule.id, recordType: 'schedule' })} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', textAlign: 'left', background: 'transparent', border: 0, borderTop: '1px solid var(--border-default)', padding: '12px 0', color: 'inherit', cursor: 'pointer' }}>
          <span><strong>{schedule.scheduleNumber}</strong><span style={{ display: 'block', ...mutedText }}>{schedule.customerName || 'Customer'} · {schedule.siteName || 'Site'}{schedule.brand ? ` · ${schedule.brand}` : ''}</span></span><span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}><span>{formatDate(schedule.scheduledDate)}</span><StatusBadge status={schedule.status} /></span>
        </button>)}</div> : <EmptyState title="No open schedules" description="Unassigned and upcoming work will appear on the dispatch board." />}
      </article>
    </div>

    {isActivityTab && <div style={{ ...mutedText, display: 'flex', gap: 8, alignItems: 'center' }}><Activity size={15} aria-hidden="true" /> {userAction} is built from the latest server records shown above.</div>}
    {!isActivityTab && <div className="pys-card-26" style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}><span style={mutedText}>Not-overdue share of open schedules</span><strong>{summary?.compliancePercent ?? 0}%</strong><span style={mutedText}>{summary?.capacityPercent ?? 0}% of open schedules have a technician assigned.</span><Button variant="secondary" onClick={() => onNavigate('service-schedule')}>Review dispatch <ArrowRight size={14} /></Button></div>}
  </section>;
};

export default DashboardShell;
