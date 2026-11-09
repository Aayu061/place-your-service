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
  Flame,
  Clock,
  Zap,
} from 'lucide-react';
import { analyticsApi, DashboardSummary } from '@/services/analyticsApi';
import { operationsApi, NotificationRecord } from '@/services/operationsApi';
import { UserRole } from '@/domain/types';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/feedback/EmptyState';
import { OperationalTrendChart, DataPoint } from '@/components/charts/OperationalTrendChart';
import { CapacityRadialGauge } from '@/components/charts/CapacityRadialGauge';
import { WorkDistributionBarChart, DistributionCategory } from '@/components/charts/WorkDistributionBarChart';

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

  const weeklyRequestsTotal = useMemo(() => {
    return (summary?.trendData || []).reduce((acc, day) => acc + (day.value || 0), 0);
  }, [summary?.trendData]);

  const weeklySchedulesTotal = useMemo(() => {
    return (summary?.trendData || []).reduce((acc, day) => acc + (day.secondaryValue || 0), 0);
  }, [summary?.trendData]);

  const trendDataPoints: DataPoint[] = useMemo(() => {
    return (summary?.trendData || []).map((day) => ({
      label: `${day.label} ${day.date.slice(5)}`,
      value: day.secondaryValue, // Scheduled visits
      secondaryValue: day.value, // Intake requests
    }));
  }, [summary?.trendData]);

  const workDistributionItems: DistributionCategory[] = useMemo(() => {
    const openPM = Math.max(0, (kpi?.servicesDueCount || 0) - (kpi?.overdueScheduleCount || 0));
    const overduePM = kpi?.overdueScheduleCount || 0;
    const breakdown = kpi?.unassignedRequestsCount || 0;
    const urgent = kpi?.urgentRequestsCount || 0;
    const completed = kpi?.completedTodayCount || 0;

    return [
      { label: 'AMC PM', count: openPM, category: 'PM', color: 'var(--color-brand)' },
      { label: 'Overdue PM', count: overduePM, category: 'PM', color: 'var(--color-error-solid)' },
      { label: 'Breakdown', count: breakdown, category: 'BREAKDOWN', color: 'var(--color-warning-solid)' },
      { label: 'Urgent/SLA', count: urgent, category: 'BREAKDOWN', color: '#f97316' },
      { label: 'Completed', count: completed, category: 'PM', color: 'var(--color-success-solid)' },
    ];
  }, [kpi]);

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

  return (
    <div key={activeSubTab} className="animate-slide-up gpu-accelerated" style={{ display: 'grid', gap: 20 }}>
      {/* =========================================================================
       * 1. TOP COMMAND HEADER & QUICK ACTIONS STRIP
       * ========================================================================= */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={mutedText}>{greetingDate}</span>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 99,
              background: isActivityTab ? 'var(--color-info-bg, rgba(59, 130, 246, 0.1))' : 'var(--color-success-bg, rgba(16, 185, 129, 0.1))',
              color: isActivityTab ? 'var(--color-info-text, #3b82f6)' : 'var(--color-success-text, #10b981)',
              fontWeight: 600,
            }}>
              {isActivityTab ? '⚡ Service Activity & Execution Radar' : '● Live Operations Executive Desk'}
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)' }}>Welcome back, {greeting}</h1>
          <p style={{ margin: '4px 0 0', ...mutedText }}>
            {isActivityTab
              ? 'Real-time service velocity, workload distribution, and live technician dispatch boards.'
              : 'Comprehensive revenue collections, contract lifecycle, and team operational readiness overview.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => void refresh()} isLoading={loading}>
            <RefreshCw size={15} /> Refresh
          </Button>
          {!isActivityTab ? (
            <>
              <Button variant="secondary" onClick={() => onNavigate('payments')}>
                <CreditCard size={15} /> Collect Payment
              </Button>
              <Button variant="secondary" onClick={() => onNavigate('amc')}>
                <FileText size={15} /> New AMC Quotation
              </Button>
              <Button onClick={() => onNavigate('service-requests')}>
                <Wrench size={15} /> New Service Request
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onNavigate('service-requests')}>
                <ClipboardList size={15} /> Open Request Queue
              </Button>
              <Button onClick={() => onNavigate('service-schedule')}>
                <CalendarClock size={15} /> Dispatch Board
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <p role="alert" style={{ color: 'var(--color-error-solid)', margin: 0 }}>{error} · Showing the last loaded values.</p>}

      {/* =========================================================================
       * 2. VIEW TAB A: OVERVIEW (EXECUTIVE SNAPSHOT & BUSINESS HEALTH)
       * ========================================================================= */}
      {!isActivityTab && (
        <>
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

          {/* Row 1: Collections Health & AMC Agreement Funnel */}
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
                  <div style={{ height: '100%', width: `${financials?.collectionRatePercent ?? 0}%`, background: 'var(--color-success-solid, #10b981)', transition: 'width 0.3s ease' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '12px' }}>
                <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(2, 132, 199, 0.08)', color: 'var(--color-brand)' }}>
                  Cash: {formatCurrency(financials?.cashCollected)}
                </span>
                <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.08)', color: 'var(--color-success-text, #10b981)' }}>
                  Online/UPI: {formatCurrency(financials?.onlineCollected)}
                </span>
                <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(245, 158, 11, 0.08)', color: 'var(--color-warning-text, #f59e0b)' }}>
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
                <Button size="sm" variant="secondary" onClick={() => onNavigate('amc')}>
                  + New Quotation
                </Button>
              </div>
            </article>
          </div>

          {/* Row 2: Fleet Readiness Gauge & Operational Triage Alerts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {/* Animated Radial Gauge: Fleet Capacity & PM Compliance */}
            <CapacityRadialGauge
              capacityPercent={summary?.capacityPercent ?? 0}
              compliancePercent={summary?.compliancePercent ?? 0}
              title="Fleet Capacity & Service Compliance"
              subtitle="Real-time field technician dispatch utilization and maintenance SLA index"
            />

            {/* Operational Triage Sentinel */}
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
                      color: 'var(--color-error-text, #ef4444)',
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
                      color: 'var(--color-warning-text, #f59e0b)',
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

          {/* Compliance Benchmark Banner */}
          <div className="pys-card-26" style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span style={mutedText}>Preventive maintenance compliance rate:</span>
            <strong style={{ color: 'var(--color-success-text, #10b981)' }}>{summary?.compliancePercent ?? 0}% on-time SLA</strong>
            <span style={mutedText}>{summary?.capacityPercent ?? 0}% of open schedules assigned to an active technician.</span>
            <Button variant="secondary" onClick={() => onNavigate('service-schedule')}>
              Review dispatch <ArrowRight size={14} />
            </Button>
          </div>
        </>
      )}

      {/* =========================================================================
       * 3. VIEW TAB B: SERVICE ACTIVITY (WORKLOAD VELOCITY, CHARTS & LIVE QUEUES)
       * ========================================================================= */}
      {isActivityTab && (
        <>
          {/* Service Velocity Quick KPI Strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div className="pys-card-26" style={{ ...cardStyle, minHeight: 110, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-brand)' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={mutedText}>Weekly Service Intake</span>
                <Flame size={17} style={{ color: 'var(--color-brand)' }} />
              </div>
              <strong style={{ fontSize: '1.65rem' }}>{compactNumber.format(weeklyRequestsTotal)}</strong>
              <span style={mutedText}>New requests received over 7 days</span>
            </div>

            <div className="pys-card-26" style={{ ...cardStyle, minHeight: 110, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-success-solid)' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={mutedText}>Weekly Scheduled Visits</span>
                <CalendarClock size={17} style={{ color: 'var(--color-success-solid)' }} />
              </div>
              <strong style={{ fontSize: '1.65rem' }}>{compactNumber.format(weeklySchedulesTotal)}</strong>
              <span style={mutedText}>Appointments booked &amp; fulfilled</span>
            </div>

            <div className="pys-card-26" style={{ ...cardStyle, minHeight: 110, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-warning-solid)' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={mutedText}>Pending Dispatch Queue</span>
                <Clock size={17} style={{ color: 'var(--color-warning-solid)' }} />
              </div>
              <strong style={{ fontSize: '1.65rem' }}>{compactNumber.format(kpi?.unassignedRequestsCount || 0)}</strong>
              <span style={mutedText}>Requests awaiting technician allocation</span>
            </div>

            <div className="pys-card-26" style={{ ...cardStyle, minHeight: 110, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-error-solid)' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={mutedText}>Critical Attention</span>
                <Zap size={17} style={{ color: 'var(--color-error-solid)' }} />
              </div>
              <strong style={{ fontSize: '1.65rem', color: (kpi?.urgentRequestsCount || 0) > 0 ? 'var(--color-error-text)' : 'inherit' }}>
                {compactNumber.format(kpi?.urgentRequestsCount || 0)}
              </strong>
              <span style={mutedText}>Urgent &amp; Emergency service tickets</span>
            </div>
          </div>

          {/* Row 1: Dual Statistical Powerhouse Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {/* Chart 1: GSAP Bezier Spline 7-Day Velocity Curve */}
            <OperationalTrendChart
              data={trendDataPoints}
              title="7-Day Service Volume & Velocity"
              subtitle="Interactive Catmull-Rom Bezier spline tracking scheduled visits vs new intake requests"
              height={220}
              primaryLabel="Scheduled Visits"
              secondaryLabel="New Requests"
            />

            {/* Chart 2: Neumorphic Bar Chart of Work Queue Distribution */}
            <WorkDistributionBarChart
              items={workDistributionItems}
              title="Workload Category Distribution"
              subtitle="Staggered breakdown of open PM, overdue visits, breakdown tickets, and today's completions"
              height={200}
            />
          </div>

          {/* Row 2: Live Operational Dispatch Queues */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
            {/* Service Request Queue */}
            <article className="pys-card-26" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Service Request Queue</h2>
                  <p style={{ ...mutedText, margin: '4px 0 0' }}>Latest customer breakdown &amp; diagnostic requests.</p>
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
                  <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Open Schedules &amp; Dispatches</h2>
                  <p style={{ ...mutedText, margin: '4px 0 0' }}>Upcoming, active, and overdue maintenance visits.</p>
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

          {/* Telemetry Status Strip */}
          <div style={{ ...mutedText, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Activity size={15} aria-hidden="true" /> Real-time operational execution data synchronized with internal service API.
          </div>
        </>
      )}
    </div>
  );
};
