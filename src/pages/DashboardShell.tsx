import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  Wrench,
  Wallet,
  FileText,
  Users,
  CreditCard,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
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
const inrCurrency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const formatCurrency = (val?: number) => inrCurrency.format(val || 0);

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
  const financials = summary?.financials;
  const amcPipeline = summary?.amcPipeline;
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
    {/* Command Center Header & Quick Action Strip */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={mutedText}>{greetingDate}</span>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 99, background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success-dark, #065f46)', fontWeight: 600 }}>
            ● Live Operations Desk
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)' }}>Welcome back, {greeting}</h1>
        <p style={{ margin: '4px 0 0', ...mutedText }}>Comprehensive service workload, quotation pipeline, and finance tracking.</p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={() => void refresh()} isLoading={loading}>
          <RefreshCw size={15} /> Refresh
        </Button>
        <Button variant="secondary" onClick={() => onNavigate('payments')}>
          <CreditCard size={15} /> Collect Payment
        </Button>
        <Button variant="secondary" onClick={() => onNavigate('amc')}>
          <FileText size={15} /> New AMC Quotation
        </Button>
        <Button onClick={() => onNavigate('service-requests')}>
          <Wrench size={15} /> New Service Request
        </Button>
      </div>
    </div>

    {error && <p role="alert" style={{ color: 'var(--color-error-solid)', margin: 0 }}>{error} · Showing the last loaded values.</p>}

    {/* Top 6 High-Density Executive Metric Cards */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 14 }}>
      {[
        {
          label: 'Total Revenue Collected',
          value: formatCurrency(financials?.totalCollected ?? kpi?.totalRevenueCollected),
          sub: `${financials?.collectionRatePercent ?? 0}% collected · ${formatCurrency(financials?.totalOutstanding)} due`,
          icon: Wallet,
          accent: 'var(--color-success-solid, #10b981)',
          onClick: () => onNavigate('payments'),
        },
        {
          label: 'AMC Contracts & Pipeline',
          value: `${compactNumber.format(kpi?.activeAmcCount || 0)} Active`,
          sub: `${amcPipeline?.draftCount || kpi?.draftQuotationsCount || 0} quotations (${formatCurrency(amcPipeline?.draftValue || kpi?.draftQuotationsValue)}) · ${compactNumber.format(kpi?.coveredAssetCount || 0)} ACs`,
          icon: ClipboardList,
          accent: 'var(--color-brand, #0284c7)',
          onClick: () => onNavigate('amc'),
        },
        {
          label: 'Open Scheduled Work',
          value: compactNumber.format(kpi?.servicesDueCount || 0),
          sub: `${compactNumber.format(kpi?.overdueScheduleCount || 0)} overdue · ${summary?.compliancePercent ?? 0}% on-time SLA`,
          icon: CalendarClock,
          accent: (kpi?.overdueScheduleCount || 0) > 0 ? 'var(--color-error-solid, #ef4444)' : 'var(--color-brand, #0284c7)',
          onClick: () => onNavigate('service-schedule'),
        },
        {
          label: 'Requests for Dispatch',
          value: compactNumber.format(kpi?.unassignedRequestsCount || 0),
          sub: `${compactNumber.format(kpi?.urgentRequestsCount || 0)} urgent / emergency`,
          icon: Wrench,
          accent: (kpi?.urgentRequestsCount || 0) > 0 ? 'var(--color-warning-solid, #f59e0b)' : 'var(--color-brand, #0284c7)',
          onClick: () => onNavigate('service-requests'),
        },
        {
          label: 'Active Technicians',
          value: compactNumber.format(kpi?.activeTechniciansCount || 0),
          sub: `${summary?.capacityPercent ?? 0}% assigned dispatch`,
          icon: Users,
          accent: '#0d9488',
          onClick: () => onNavigate('technicians'),
        },
        {
          label: 'Completed Today',
          value: compactNumber.format(kpi?.completedTodayCount || 0),
          sub: 'Service reports & settlements logged',
          icon: CheckCircle2,
          accent: 'var(--color-success-solid, #10b981)',
          onClick: () => onNavigate('service-reports'),
        },
      ].map(({ label, value, sub, icon: Icon, accent, onClick }) => (
        <button
          type="button"
          className="pys-card-26"
          key={label}
          onClick={onClick}
          style={{
            ...cardStyle,
            minHeight: 140,
            textAlign: 'left',
            border: 0,
            background: 'var(--bg-surface)',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={mutedText}>{label}</span>
            <Icon size={18} style={{ color: accent }} aria-hidden="true" />
          </div>
          <strong style={{ fontSize: 'var(--text-2xl)' }}>{loading && value === undefined ? '…' : value}</strong>
          <span style={mutedText}>{sub}</span>
        </button>
      ))}
    </div>

    {/* Financial Health & AMC Pipeline Section (New Dual Intelligence Cards) */}
    {!isActivityTab && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Card A: Financial & Collections Health */}
        <article className="pys-card-26" style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-success-solid)' }}>
                <Wallet size={16} />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>REVENUE &amp; SETTLEMENTS</span>
              </div>
              <h2 style={{ fontSize: 'var(--text-lg)', margin: '4px 0 0' }}>Collections Health</h2>
              <p style={{ ...mutedText, margin: '2px 0 0' }}>Invoiced revenue, cash vs online breakdown, and balance due.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('payments')}>
              Payment desk <ArrowRight size={14} />
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '12px 14px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div>
              <div style={{ ...mutedText, fontSize: '11px' }}>TOTAL COLLECTED</div>
              <strong style={{ fontSize: '1.25rem', color: 'var(--color-success-dark, #065f46)' }}>
                {formatCurrency(financials?.totalCollected)}
              </strong>
            </div>
            <div>
              <div style={{ ...mutedText, fontSize: '11px' }}>OUTSTANDING BALANCE</div>
              <strong style={{ fontSize: '1.25rem', color: (financials?.totalOutstanding || 0) > 0 ? 'var(--color-warning-dark, #b45309)' : 'var(--text-muted)' }}>
                {formatCurrency(financials?.totalOutstanding)}
              </strong>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 4 }}>
              <span style={mutedText}>Collection Realization Rate</span>
              <strong>{financials?.collectionRatePercent ?? 0}%</strong>
            </div>
            <div style={{ height: 8, background: 'var(--bg-surface-subtle)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${financials?.collectionRatePercent ?? 0}%`, background: 'var(--color-success-solid, #10b981)', transition: 'width 0.3s ease' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '12px' }}>
            <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(2, 132, 199, 0.08)', color: 'var(--color-brand)' }}>
              Cash: {formatCurrency(financials?.cashCollected)}
            </span>
            <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.08)', color: 'var(--color-success-dark, #065f46)' }}>
              Online/UPI: {formatCurrency(financials?.onlineCollected)}
            </span>
            <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(245, 158, 11, 0.08)', color: 'var(--color-warning-dark, #b45309)' }}>
              Pending Accounts: {financials?.pendingPaymentsCount ?? 0}
            </span>
          </div>
        </article>

        {/* Card B: AMC Agreements & Quotations Funnel */}
        <article className="pys-card-26" style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-brand)' }}>
                <ShieldCheck size={16} />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>AGREEMENT PIPELINE</span>
              </div>
              <h2 style={{ fontSize: 'var(--text-lg)', margin: '4px 0 0' }}>AMC Lifecycle &amp; Quotations</h2>
              <p style={{ ...mutedText, margin: '2px 0 0' }}>Proposals awaiting email/payment clearance through active contracts.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('amc')}>
              View AMC Hub <ArrowRight size={14} />
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div style={{ padding: '12px 10px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ ...mutedText, fontSize: '11px', fontWeight: 600 }}>DRAFT QUOTES</div>
              <strong style={{ fontSize: '1.25rem', color: 'var(--color-brand)' }}>
                {amcPipeline?.draftCount ?? kpi?.draftQuotationsCount ?? 0}
              </strong>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                {formatCurrency(amcPipeline?.draftValue ?? kpi?.draftQuotationsValue)}
              </div>
            </div>

            <div style={{ padding: '12px 10px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ ...mutedText, fontSize: '11px', fontWeight: 600 }}>ACTIVE CONTRACTS</div>
              <strong style={{ fontSize: '1.25rem', color: 'var(--color-success-dark, #065f46)' }}>
                {amcPipeline?.activeCount ?? kpi?.activeAmcCount ?? 0}
              </strong>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                {compactNumber.format(kpi?.coveredAssetCount || 0)} AC Units
              </div>
            </div>

            <div style={{ padding: '12px 10px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ ...mutedText, fontSize: '11px', fontWeight: 600 }}>EXPIRING SOON</div>
              <strong style={{ fontSize: '1.25rem', color: (amcPipeline?.expiringSoonCount || 0) > 0 ? 'var(--color-warning-dark, #b45309)' : 'var(--text-muted)' }}>
                {amcPipeline?.expiringSoonCount ?? 0}
              </strong>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>Next 30 Days</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(2, 132, 199, 0.05)', border: '1px solid rgba(2, 132, 199, 0.15)', borderRadius: 'var(--radius-md)', fontSize: '12px' }}>
            <span>Need to issue a new quotation proposal?</span>
            <Button size="sm" variant="secondary" onClick={() => onNavigate('amc')}>
              + New Quotation
            </Button>
          </div>
        </article>
      </div>
    )}

    {/* Workload Velocity & Triage Alerts (2 Columns) */}
    {!isActivityTab && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16 }}>
        {/* 7 Day Velocity Chart */}
        <article className="pys-card-26" style={cardStyle}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-brand)' }}>
              <TrendingUp size={16} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>WORKLOAD VELOCITY</span>
            </div>
            <h2 style={{ fontSize: 'var(--text-lg)', margin: '4px 0 0' }}>7-Day Request &amp; Schedule Flow</h2>
            <p style={{ ...mutedText, margin: '2px 0 0' }}>Service intake requests and visits scheduled by date.</p>
          </div>
          <div aria-label="Seven day request and schedule activity chart" style={{ display: 'grid', gap: 12 }}>
            {(summary?.trendData || []).map((day) => (
              <div key={day.date} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 42px', gap: 10, alignItems: 'center' }}>
                <span style={mutedText}>{day.label} {day.date.slice(5)}</span>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div
                    aria-label={`${day.value} requests`}
                    style={{ height: 8, width: `${Math.max(day.value ? 4 : 0, (day.value / trendMax) * 100)}%`, background: 'var(--color-brand)', borderRadius: 99 }}
                  />
                  <div
                    aria-label={`${day.secondaryValue} schedules`}
                    style={{ height: 8, width: `${Math.max(day.secondaryValue ? 4 : 0, (day.secondaryValue / trendMax) * 100)}%`, background: 'var(--color-success-solid)', borderRadius: 99 }}
                  />
                </div>
                <span style={{ ...mutedText, textAlign: 'right' }}>{compactNumber.format(day.value + day.secondaryValue)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, ...mutedText }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-brand)' }} /> Service Requests
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-success-solid)' }} /> Scheduled Visits
            </span>
          </div>
        </article>

        {/* Priority Action Triage & Operational Notices */}
        <article className="pys-card-26" style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-warning-solid)' }}>
                <AlertTriangle size={16} />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>ACTION REQUIRED</span>
              </div>
              <h2 style={{ fontSize: 'var(--text-lg)', margin: '4px 0 0' }}>Operational Triage</h2>
              <p style={{ ...mutedText, margin: '2px 0 0' }}>Overdue schedules, dispatch bottlenecks &amp; system alerts.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('notifications')}>
              All notices <ArrowRight size={14} />
            </Button>
          </div>

          {/* Quick Triage Indicators */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(kpi?.overdueScheduleCount || 0) > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('service-schedule')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-error-dark, #991b1b)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px' }}>
                  <AlertTriangle size={16} />
                  <strong>{kpi?.overdueScheduleCount} service visits are overdue</strong>
                </div>
                <ArrowRight size={14} />
              </button>
            )}

            {(financials?.pendingPaymentsCount || 0) > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('payments')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-warning-dark, #b45309)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px' }}>
                  <Wallet size={16} />
                  <span><strong>{financials?.pendingPaymentsCount} payment records</strong> have balance due ({formatCurrency(financials?.totalOutstanding)})</span>
                </div>
                <ArrowRight size={14} />
              </button>
            )}

            {(amcPipeline?.draftCount || kpi?.draftQuotationsCount || 0) > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('amc')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'rgba(2, 132, 199, 0.08)',
                  border: '1px solid rgba(2, 132, 199, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-brand)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px' }}>
                  <FileText size={16} />
                  <span><strong>{amcPipeline?.draftCount || kpi?.draftQuotationsCount} AMC quotations</strong> awaiting email / clearance</span>
                </div>
                <ArrowRight size={14} />
              </button>
            )}
          </div>

          {/* Operational Notices */}
          {loading ? (
            <p role="status">Loading alerts…</p>
          ) : alerts.length ? (
            alerts.slice(0, 3).map((alert) => (
              <button
                type="button"
                key={alert.id}
                onClick={() => openNotification(alert)}
                style={{
                  display: 'flex',
                  textAlign: 'left',
                  gap: 10,
                  alignItems: 'flex-start',
                  background: 'transparent',
                  border: 0,
                  padding: '6px 0',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <Bell size={15} style={{ color: 'var(--text-muted)', marginTop: 2 }} aria-hidden="true" />
                <span>
                  <strong style={{ fontSize: '13px' }}>{alert.title}</strong>
                  <span style={{ display: 'block', ...mutedText, fontSize: '12px' }}>{alert.message}</span>
                </span>
              </button>
            ))
          ) : (
            <p style={{ ...mutedText, margin: '8px 0 0' }}>All operational rules in compliance. No unread alerts.</p>
          )}
        </article>
      </div>
    )}

    {/* Live Operational Queues Section */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16 }}>
      {/* Service Request Queue */}
      <article className="pys-card-26" style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>{isActivityTab ? 'Recent requests' : 'Service request queue'}</h2>
            <p style={{ ...mutedText, margin: '4px 0 0' }}>Latest open customer service requests.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onNavigate('service-requests')}>
            Open queue <ArrowRight size={14} />
          </Button>
        </div>
        {loading ? (
          <p role="status">Loading requests…</p>
        ) : requests.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {requests.slice(0, 6).map((request) => (
              <button
                type="button"
                key={request.id}
                onClick={() => onNavigate('service-requests', { recordId: request.id, recordType: 'service_request' })}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 8,
                  alignItems: 'center',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 0,
                  borderTop: '1px solid var(--border-default)',
                  padding: '12px 0',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <span>
                  <strong>{request.requestNumber}</strong>
                  <span style={{ display: 'block', ...mutedText }}>
                    {request.customerName || 'Customer'} · {request.siteName || 'Site'}
                    {request.assetBrand ? ` · ${request.assetBrand} ${request.assetModel || ''}` : ''}
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <Badge variant={getBadgeVariant(request.priority)}>{request.priority}</Badge>
                  <StatusBadge status={request.status} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="No open requests" description="New service requests will appear here." />
        )}
      </article>

      {/* Open Schedules Dispatch Board */}
      <article className="pys-card-26" style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Open schedules</h2>
            <p style={{ ...mutedText, margin: '4px 0 0' }}>Upcoming and overdue preventive maintenance visits.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onNavigate('service-schedule')}>
            Dispatch board <ArrowRight size={14} />
          </Button>
        </div>
        {loading ? (
          <p role="status">Loading schedules…</p>
        ) : schedules.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {schedules.slice(0, 6).map((schedule) => (
              <button
                type="button"
                key={schedule.id}
                onClick={() => onNavigate('service-schedule', { recordId: schedule.id, recordType: 'schedule' })}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 8,
                  alignItems: 'center',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 0,
                  borderTop: '1px solid var(--border-default)',
                  padding: '12px 0',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <span>
                  <strong>{schedule.scheduleNumber}</strong>
                  <span style={{ display: 'block', ...mutedText }}>
                    {schedule.customerName || 'Customer'} · {schedule.siteName || 'Site'}
                    {schedule.brand ? ` · ${schedule.brand}` : ''}
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <span style={{ fontSize: '13px' }}>{formatDate(schedule.scheduledDate)}</span>
                  <StatusBadge status={schedule.status} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="No open schedules" description="Unassigned and upcoming work will appear on the dispatch board." />
        )}
      </article>
    </div>

    {isActivityTab && (
      <div style={{ ...mutedText, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Activity size={15} aria-hidden="true" /> {userAction} is built from the latest server records shown above.
      </div>
    )}
    {!isActivityTab && (
      <div className="pys-card-26" style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={mutedText}>Preventive maintenance compliance rate:</span>
        <strong style={{ color: 'var(--color-success-dark, #065f46)' }}>{summary?.compliancePercent ?? 0}% on-time</strong>
        <span style={mutedText}>{summary?.capacityPercent ?? 0}% of open schedules assigned to a technician.</span>
        <Button variant="secondary" onClick={() => onNavigate('service-schedule')}>
          Review dispatch <ArrowRight size={14} />
        </Button>
      </div>
    )}
  </section>;
};

export default DashboardShell;