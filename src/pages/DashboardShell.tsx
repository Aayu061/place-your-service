import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck2,
  FileText,
  Plus,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { analyticsApi, DashboardSummary } from '@/services/analyticsApi';
import { operationsApi, NotificationRecord } from '@/services/operationsApi';
import { UserRole } from '@/domain/types';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/feedback/EmptyState';
import { CapacityRadialGauge } from '@/components/charts/CapacityRadialGauge';
import { WorkDistributionBarChart } from '@/components/charts/WorkDistributionBarChart';
import { OperationalTrendChart } from '@/components/charts/OperationalTrendChart';

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

  // Service Activity Queue Filter States
  const [requestFilter, setRequestFilter] = useState<'ALL' | 'URGENT' | 'BREAKDOWN' | 'UNASSIGNED'>('ALL');
  const [scheduleFilter, setScheduleFilter] = useState<'ALL' | 'OVERDUE' | 'TODAY' | 'UPCOMING'>('ALL');

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

  // Filtered queues for Service Activity view
  const allRequests = summary?.recentServiceRequests || [];
  const allSchedules = summary?.recentSchedules || [];
  const recentReports = summary?.recentServiceReports || [];
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const filteredRequests = useMemo(() => {
    return allRequests.filter((req) => {
      if (requestFilter === 'URGENT') return req.priority === 'URGENT' || req.priority === 'EMERGENCY';
      if (requestFilter === 'BREAKDOWN') return req.requestType?.includes('BREAKDOWN') || req.requestType === 'REPAIR';
      if (requestFilter === 'UNASSIGNED') return req.status === 'REQUESTED' || req.status === 'PENDING';
      return true;
    });
  }, [allRequests, requestFilter]);

  const filteredSchedules = useMemo(() => {
    return allSchedules.filter((sched) => {
      const dateStr = sched.scheduledDate ? sched.scheduledDate.slice(0, 10) : '';
      if (scheduleFilter === 'OVERDUE') return sched.status === 'OVERDUE' || (dateStr && dateStr < todayStr);
      if (scheduleFilter === 'TODAY') return dateStr === todayStr;
      if (scheduleFilter === 'UPCOMING') return dateStr > todayStr;
      return true;
    });
  }, [allSchedules, scheduleFilter, todayStr]);

  // Work distribution items for Overview
  const defaultDistribution = useMemo(() => [
    { label: 'Preventive Maint', count: summary?.kpi?.servicesDueCount || 0, category: 'PM' as const },
    { label: 'Breakdown Repair', count: summary?.kpi?.unassignedRequestsCount || 0, category: 'BREAKDOWN' as const },
    { label: 'Dry Service', count: Math.max(1, Math.round((summary?.kpi?.servicesDueCount || 0) * 0.6)), category: 'PM' as const },
    { label: 'Jet Service', count: Math.max(0, Math.round((summary?.kpi?.servicesDueCount || 0) * 0.4)), category: 'PM' as const },
    { label: 'Urgent / Priority', count: summary?.kpi?.urgentRequestsCount || 0, category: 'BREAKDOWN' as const },
  ], [summary?.kpi]);

  const distributionItems = summary?.workDistribution && summary.workDistribution.length > 0
    ? summary.workDistribution
    : defaultDistribution;

  // 7-day flow aggregates for Service Activity
  const totalInflow7Days = useMemo(() => {
    return (summary?.trendData || []).reduce((acc, d) => acc + d.value, 0);
  }, [summary?.trendData]);

  const totalCompleted7Days = useMemo(() => {
    return (summary?.trendData || []).reduce((acc, d) => acc + d.secondaryValue, 0);
  }, [summary?.trendData]);

  if (error && !summary) return <section style={{ display: 'grid', gap: 18 }}>
    <div><h1 style={{ marginBottom: 4 }}>Welcome back, {greeting}</h1><p style={mutedText}>{greetingDate}</p></div>
    <div role="alert" className="pys-card-26" style={cardStyle}><strong>Dashboard data is unavailable</strong><p style={{ margin: 0, ...mutedText }}>{error}</p><Button variant="secondary" onClick={() => void refresh()}><RefreshCw size={15} /> Retry</Button></div>
  </section>;

  const isActivityTab = activeSubTab === 'activity';

  return (
    <section style={{ display: 'grid', gap: 20 }}>
      {/* Command Center Header & Quick Action Strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={mutedText}>{greetingDate}</span>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 99, background: 'var(--color-success-bg, rgba(16, 185, 129, 0.1))', color: 'var(--color-success-text, #10b981)', fontWeight: 600 }}>
              ● Live Operations Desk
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)' }}>Welcome back, {greeting}</h1>
          <p style={{ margin: '4px 0 0', ...mutedText }}>
            {isActivityTab
              ? 'Real-time service velocity, field dispatch board, and completion report logs.'
              : 'Comprehensive executive summary, quotation pipeline, and finance tracking.'}
          </p>
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

      {/* ========================================================================= */}
      {/* SUB-VIEW 1: EXECUTIVE OVERVIEW (activeSubTab === 'overview')              */}
      {/* ========================================================================= */}
      {!isActivityTab && (
        <div className="dashboard-tab-panel" role="tabpanel" aria-label="Executive Overview">
          {/* Top 6 High-Density Executive Metric Cards */}
          <div className="dashboard-stagger-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 14 }}>
            {[
              {
                label: 'Total Revenue Collected',
                value: formatCurrency(financials?.totalCollected ?? kpi?.totalRevenueCollected),
                sub: `${financials?.collectionRatePercent ?? 0}% collected · ${formatCurrency(financials?.totalOutstanding)} due`,
                icon: Wallet,
                accent: 'var(--color-success-solid, #10b981)',
                target: 'payments',
              },
              {
                label: 'AMC Contracts & Pipeline',
                value: `${kpi?.activeAmcCount ?? amcPipeline?.activeCount ?? 0} Active`,
                sub: `${amcPipeline?.draftCount ?? kpi?.draftQuotationsCount ?? 0} quotations (${formatCurrency(amcPipeline?.draftValue ?? kpi?.draftQuotationsValue)}) · ${compactNumber.format(kpi?.coveredAssetCount || 0)} ACs`,
                icon: ShieldCheck,
                accent: 'var(--color-brand)',
                target: 'amc',
              },
              {
                label: 'Open Scheduled Work',
                value: compactNumber.format(kpi?.servicesDueCount || 0),
                sub: `${kpi?.overdueScheduleCount || 0} overdue · ${summary?.compliancePercent ?? 0}% on-time SLA`,
                icon: CalendarClock,
                accent: (kpi?.overdueScheduleCount || 0) > 0 ? 'var(--color-error-solid)' : 'var(--color-brand)',
                target: 'service-schedule',
              },
              {
                label: 'Requests for Dispatch',
                value: compactNumber.format(kpi?.unassignedRequestsCount || 0),
                sub: `${kpi?.urgentRequestsCount || 0} urgent / emergency`,
                icon: Wrench,
                accent: (kpi?.urgentRequestsCount || 0) > 0 ? 'var(--color-error-solid)' : 'var(--color-brand)',
                target: 'service-requests',
              },
              {
                label: 'Active Technicians',
                value: compactNumber.format(kpi?.activeTechniciansCount || 0),
                sub: `${summary?.capacityPercent ?? 0}% assigned dispatch`,
                icon: Users,
                accent: 'var(--color-info-solid, #0284c7)',
                target: 'technicians',
              },
              {
                label: 'Completed Today',
                value: compactNumber.format(kpi?.completedTodayCount || 0),
                sub: 'Service reports & settlements logged',
                icon: CheckCircle2,
                accent: 'var(--color-success-solid, #10b981)',
                target: 'service-reports',
              },
            ].map(({ label, value, sub, icon: Icon, accent, target }) => (
              <button
                type="button"
                className="pys-card-26"
                key={label}
                onClick={() => onNavigate(target)}
                style={{
                  ...cardStyle,
                  cursor: 'pointer',
                  textAlign: 'left',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  position: 'relative',
                  overflow: 'hidden',
                  padding: '16px 18px',
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

          {/* Dual Financial & AMC Pipeline Section */}
          <div className="dashboard-stagger-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
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
                  <strong style={{ fontSize: '1.25rem', color: 'var(--color-success-text, #10b981)' }}>
                    {formatCurrency(financials?.totalCollected)}
                  </strong>
                </div>
                <div>
                  <div style={{ ...mutedText, fontSize: '11px' }}>OUTSTANDING BALANCE</div>
                  <strong style={{ fontSize: '1.25rem', color: (financials?.totalOutstanding || 0) > 0 ? 'var(--color-warning-text, #f59e0b)' : 'var(--text-muted)' }}>
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
                  <div style={{ height: '100%', width: `${financials?.collectionRatePercent ?? 0}%`, background: 'var(--color-success-solid, #10b981)', transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '12px' }}>
                <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--color-brand-soft, #F6E9E1)', color: 'var(--color-brand, #A8481C)', fontWeight: 600 }}>
                  Cash: {formatCurrency(financials?.cashCollected)}
                </span>
                <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--color-success-bg, #E8F3EA)', color: 'var(--color-success-text, #23573D)', fontWeight: 600 }}>
                  Online/UPI: {formatCurrency(financials?.onlineCollected)}
                </span>
                <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--color-warning-bg, #FFF3E2)', color: 'var(--color-warning-text, #815318)', fontWeight: 600 }}>
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
                  <strong style={{ fontSize: '1.25rem', color: 'var(--color-success-text, #10b981)' }}>
                    {amcPipeline?.activeCount ?? kpi?.activeAmcCount ?? 0}
                  </strong>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                    {compactNumber.format(kpi?.coveredAssetCount || 0)} AC Units
                  </div>
                </div>

                <div style={{ padding: '12px 10px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ ...mutedText, fontSize: '11px', fontWeight: 600 }}>EXPIRING SOON</div>
                  <strong style={{ fontSize: '1.25rem', color: (amcPipeline?.expiringSoonCount || 0) > 0 ? 'var(--color-warning-text, #f59e0b)' : 'var(--text-muted)' }}>
                    {amcPipeline?.expiringSoonCount ?? 0}
                  </strong>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>Next 30 Days</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(2, 132, 199, 0.05)', border: '1px solid rgba(2, 132, 199, 0.15)', borderRadius: 'var(--radius-md)', fontSize: '12px' }}>
                <span>Need to issue a new quotation proposal?</span>
                <Button size="sm" variant="secondary" onClick={() => onNavigate('amc')} leftIcon={<Plus size={13} />}>
                  New Quotation
                </Button>
              </div>
            </article>
          </div>

          {/* Visual Statistical Intelligence Grid (Radial Gauge & Work Distribution Chart) */}
          <div className="dashboard-stagger-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {/* Concentric Capacity & Compliance Radial Gauge */}
            <CapacityRadialGauge
              capacityPercent={summary?.capacityPercent ?? 0}
              compliancePercent={summary?.compliancePercent ?? 0}
              title="Fleet Capacity & Service Compliance"
              subtitle="Technician dispatch saturation vs on-time preventive maintenance index"
            />

            {/* Categorical Work Distribution Pillar Chart */}
            <WorkDistributionBarChart
              items={distributionItems}
              title="Active Work Distribution"
              subtitle="Categorical breakdown of preventive visits, repairs, and high-priority tickets"
              height={190}
            />
          </div>

          {/* Priority Operational Triage & Notices */}
          <div className="dashboard-stagger-4">
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                {(kpi?.overdueScheduleCount || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigate('service-schedule')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-error-text, #fca5a5)',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px' }}>
                      <AlertTriangle size={16} style={{ color: 'var(--color-error-solid)' }} />
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
                      padding: '10px 14px',
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.2)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-warning-text, #fcd34d)',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px' }}>
                      <Wallet size={16} style={{ color: 'var(--color-warning-solid)' }} />
                      <span><strong>{financials?.pendingPaymentsCount} accounts</strong> with balance due ({formatCurrency(financials?.totalOutstanding)})</span>
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
                      padding: '10px 14px',
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
                <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                  {alerts.slice(0, 3).map((alert) => (
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
                        borderTop: '1px solid var(--border-default)',
                        padding: '8px 0',
                        color: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <Bell size={15} style={{ color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
                      <span>
                        <strong style={{ fontSize: '13px' }}>{alert.title}</strong>
                        <span style={{ display: 'block', ...mutedText, fontSize: '12px' }}>{alert.message}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ ...mutedText, margin: '8px 0 0' }}>All operational rules in compliance. No unread alerts.</p>
              )}
            </article>
          </div>

          {/* Executive SLA Summary Footer */}
          <div className="pys-card-26" style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span style={mutedText}>Preventive maintenance compliance rate:</span>
            <strong style={{ color: 'var(--color-success-text, #10b981)' }}>{summary?.compliancePercent ?? 0}% on-time</strong>
            <span style={mutedText}>{summary?.capacityPercent ?? 0}% of open schedules assigned to a technician.</span>
            <Button variant="secondary" onClick={() => onNavigate('service-schedule')}>
              Review dispatch <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 2: SERVICE ACTIVITY HUB (activeSubTab === 'activity')            */}
      {/* ========================================================================= */}
      {isActivityTab && (
        <div className="dashboard-tab-panel" role="tabpanel" aria-label="Field Service Activity">
          {/* Interactive Bezier Spline Operational Trend Chart */}
          <div className="dashboard-stagger-1">
            <OperationalTrendChart
              data={summary?.trendData || []}
              title="7-Day Service Volume & Velocity Trends"
              subtitle="Daily Catmull-Rom spline comparison: Service requests created vs completed maintenance visits"
              primaryLabel="Completed Visits"
              secondaryLabel="New Requests Intake"
              height={230}
            />
          </div>

          {/* 4 Field Operations Statistical KPI Cards */}
          <div className="dashboard-stagger-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <div className="pys-card-26" style={{ padding: '16px 18px', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={mutedText}>7-DAY INTAKE FLOW</span>
                <TrendingUp size={16} style={{ color: 'var(--color-brand)' }} />
              </div>
              <strong style={{ fontSize: '1.5rem', display: 'block', margin: '4px 0' }}>
                {compactNumber.format(totalInflow7Days)}
              </strong>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                New service requests received this week
              </span>
            </div>

            <div className="pys-card-26" style={{ padding: '16px 18px', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={mutedText}>7-DAY COMPLETED VISITS</span>
                <CheckCircle2 size={16} style={{ color: 'var(--color-success-solid)' }} />
              </div>
              <strong style={{ fontSize: '1.5rem', display: 'block', margin: '4px 0', color: 'var(--color-success-text)' }}>
                {compactNumber.format(totalCompleted7Days)}
              </strong>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Maintenance visits executed &amp; reports issued
              </span>
            </div>

            <div className="pys-card-26" style={{ padding: '16px 18px', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={mutedText}>DISPATCH COVERAGE</span>
                <Users size={16} style={{ color: 'var(--color-info-solid, #0284c7)' }} />
              </div>
              <strong style={{ fontSize: '1.5rem', display: 'block', margin: '4px 0' }}>
                {summary?.capacityPercent ?? 0}%
              </strong>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Open schedules assigned to active technicians
              </span>
            </div>

            <div className="pys-card-26" style={{ padding: '16px 18px', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={mutedText}>OVERDUE SLA INDEX</span>
                <Clock size={16} style={{ color: (kpi?.overdueScheduleCount || 0) > 0 ? 'var(--color-error-solid)' : 'var(--color-success-solid)' }} />
              </div>
              <strong style={{ fontSize: '1.5rem', display: 'block', margin: '4px 0', color: (kpi?.overdueScheduleCount || 0) > 0 ? 'var(--color-error-text)' : 'var(--color-success-text)' }}>
                {compactNumber.format(kpi?.overdueScheduleCount || 0)}
              </strong>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {(kpi?.overdueScheduleCount || 0) > 0 ? 'Visits requiring priority dispatch' : 'All maintenance appointments on schedule'}
              </span>
            </div>
          </div>

          {/* Live Operational Queues Section with Interactive Filter Chips */}
          <div className="dashboard-stagger-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {/* Live Service Request Queue */}
            <article className="pys-card-26" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Service Request Queue</h2>
                  <p style={{ ...mutedText, margin: '2px 0 0' }}>Latest customer breakdown and service requests.</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onNavigate('service-requests')}>
                  Open queue <ArrowRight size={14} />
                </Button>
              </div>

              {/* Request Filter Chips */}
              <div className="dashboard-filter-chips-track">
                <button
                  type="button"
                  className={`dashboard-filter-chip ${requestFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setRequestFilter('ALL')}
                >
                  All ({allRequests.length})
                </button>
                <button
                  type="button"
                  className={`dashboard-filter-chip ${requestFilter === 'URGENT' ? 'active' : ''}`}
                  onClick={() => setRequestFilter('URGENT')}
                >
                  Urgent ({allRequests.filter((r) => r.priority === 'URGENT' || r.priority === 'EMERGENCY').length})
                </button>
                <button
                  type="button"
                  className={`dashboard-filter-chip ${requestFilter === 'BREAKDOWN' ? 'active' : ''}`}
                  onClick={() => setRequestFilter('BREAKDOWN')}
                >
                  Breakdown
                </button>
                <button
                  type="button"
                  className={`dashboard-filter-chip ${requestFilter === 'UNASSIGNED' ? 'active' : ''}`}
                  onClick={() => setRequestFilter('UNASSIGNED')}
                >
                  Unassigned
                </button>
              </div>

              {loading ? (
                <p role="status">Loading requests…</p>
              ) : filteredRequests.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {filteredRequests.slice(0, 6).map((request) => (
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
                        padding: '10px 0',
                        color: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <span>
                        <strong>{request.requestNumber}</strong>
                        <span style={{ display: 'block', ...mutedText, fontSize: '12px' }}>
                          {request.customerName || 'Customer'} · {request.siteName || 'Site'}
                          {request.assetBrand ? ` · ${request.assetBrand} ${request.assetModel || ''}` : ''}
                        </span>
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <Badge variant={getBadgeVariant(request.priority)}>{request.priority}</Badge>
                        <StatusBadge status={request.status} />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState title="No matching requests" description="No service requests match the selected filter." />
              )}
            </article>

            {/* Open Schedules Dispatch Board */}
            <article className="pys-card-26" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Dispatch Board &amp; Schedules</h2>
                  <p style={{ ...mutedText, margin: '2px 0 0' }}>Scheduled preventive maintenance visits and work orders.</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onNavigate('service-schedule')}>
                  Dispatch board <ArrowRight size={14} />
                </Button>
              </div>

              {/* Schedule Filter Chips */}
              <div className="dashboard-filter-chips-track">
                <button
                  type="button"
                  className={`dashboard-filter-chip ${scheduleFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setScheduleFilter('ALL')}
                >
                  All ({allSchedules.length})
                </button>
                <button
                  type="button"
                  className={`dashboard-filter-chip ${scheduleFilter === 'OVERDUE' ? 'active' : ''}`}
                  onClick={() => setScheduleFilter('OVERDUE')}
                >
                  Overdue ({allSchedules.filter((s) => s.status === 'OVERDUE' || (s.scheduledDate && s.scheduledDate.slice(0, 10) < todayStr)).length})
                </button>
                <button
                  type="button"
                  className={`dashboard-filter-chip ${scheduleFilter === 'TODAY' ? 'active' : ''}`}
                  onClick={() => setScheduleFilter('TODAY')}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`dashboard-filter-chip ${scheduleFilter === 'UPCOMING' ? 'active' : ''}`}
                  onClick={() => setScheduleFilter('UPCOMING')}
                >
                  Upcoming
                </button>
              </div>

              {loading ? (
                <p role="status">Loading schedules…</p>
              ) : filteredSchedules.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {filteredSchedules.slice(0, 6).map((schedule) => (
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
                        padding: '10px 0',
                        color: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <span>
                        <strong>{schedule.scheduleNumber}</strong>
                        <span style={{ display: 'block', ...mutedText, fontSize: '12px' }}>
                          {schedule.customerName || 'Customer'} · {schedule.siteName || 'Site'}
                          {schedule.brand ? ` · ${schedule.brand}` : ''}
                        </span>
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span style={{ fontSize: '12px' }}>{formatDate(schedule.scheduledDate)}</span>
                        <StatusBadge status={schedule.status} />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState title="No matching schedules" description="No maintenance appointments match the selected filter." />
              )}
            </article>
          </div>

          {/* Recent Completed Service Visit Reports Stream */}
          <div className="dashboard-stagger-4">
            <article className="pys-card-26" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-success-solid)' }}>
                    <FileCheck2 size={16} />
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>FIELD EXECUTION FEED</span>
                  </div>
                  <h2 style={{ fontSize: 'var(--text-lg)', margin: '4px 0 0' }}>Recent Completed Service Reports</h2>
                  <p style={{ ...mutedText, margin: '2px 0 0' }}>Latest service visit reports logged by technicians with outcomes and payment details.</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onNavigate('service-reports')}>
                  All reports <ArrowRight size={14} />
                </Button>
              </div>

              {loading ? (
                <p role="status">Loading recent service reports…</p>
              ) : recentReports.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {recentReports.slice(0, 6).map((report) => (
                    <div
                      key={report.id}
                      onClick={() => onNavigate('service-reports', { recordId: report.id, recordType: 'service_report' })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        background: 'var(--bg-surface-subtle)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        flexWrap: 'wrap',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 38,
                          height: 38,
                          borderRadius: 'var(--radius-md)',
                          background: report.primaryOutcome === 'COMPLETED' ? 'var(--color-success-bg)' : report.primaryOutcome === 'PENDING_PARTS' ? 'var(--color-warning-bg)' : 'var(--color-error-bg)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: report.primaryOutcome === 'COMPLETED' ? 'var(--color-success-solid)' : report.primaryOutcome === 'PENDING_PARTS' ? 'var(--color-warning-solid)' : 'var(--color-error-solid)',
                          flexShrink: 0,
                        }}>
                          <FileCheck2 size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px' }}>
                            {report.reportNumber}
                            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>{formatDate(report.serviceDate)}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 2 }}>
                            {report.customerName || 'Customer'} · {report.siteName || 'Site'}
                            {report.technicianName ? ` · Attended by ${report.technicianName}` : ''}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: 9999,
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: report.primaryOutcome === 'COMPLETED' ? 'var(--color-success-bg)' : report.primaryOutcome === 'PENDING_PARTS' ? 'var(--color-warning-bg)' : 'var(--color-error-bg)',
                          color: report.primaryOutcome === 'COMPLETED' ? 'var(--color-success-text)' : report.primaryOutcome === 'PENDING_PARTS' ? 'var(--color-warning-text)' : 'var(--color-error-text)',
                          border: `1px solid ${report.primaryOutcome === 'COMPLETED' ? 'var(--color-success-border)' : report.primaryOutcome === 'PENDING_PARTS' ? 'var(--color-warning-border)' : 'var(--color-error-border)'}`,
                        }}>
                          {report.primaryOutcome === 'COMPLETED' ? 'Completed' : report.primaryOutcome === 'PENDING_PARTS' ? 'Pending Parts' : 'Pending Repairs'}
                        </span>
                        {report.paymentCollected ? (
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 9999,
                            fontSize: '11px',
                            fontWeight: 600,
                            background: 'var(--color-success-bg)',
                            color: 'var(--color-success-text)',
                            border: '1px solid var(--color-success-border)',
                          }}>
                            Paid {report.paymentAmount ? formatCurrency(report.paymentAmount) : ''}
                          </span>
                        ) : (
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 9999,
                            fontSize: '11px',
                            fontWeight: 600,
                            background: 'rgba(245, 158, 11, 0.1)',
                            color: 'var(--color-warning-text)',
                            border: '1px solid var(--color-warning-border)',
                          }}>
                            Payment Pending
                          </span>
                        )}
                        <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No recent service reports" description="Service visit reports logged by technicians will appear here." />
              )}
            </article>
          </div>

          <div style={{ ...mutedText, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Activity size={15} aria-hidden="true" /> Live operational activity stream is synchronized with authenticated field operations.
          </div>
        </div>
      )}
    </section>
  );
};

export default DashboardShell;
