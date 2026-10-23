import React, { useState, useEffect } from 'react';
import {
  FileCheck2,
  Clock,
  AlertTriangle,
  Package,
  Plus,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Sliders,
  RefreshCw,
  Users,
  Wrench,
} from 'lucide-react';
import { apiClient } from '@/services/api/client';
import { UserRole } from '@/domain/types';
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from '@/components/ui/Card';
import { GlassCard } from '@/components/ui/GlassCard';
import { OperationalTrendChart, DataPoint } from '@/components/charts/OperationalTrendChart';
import { CapacityRadialGauge } from '@/components/charts/CapacityRadialGauge';
import { WorkDistributionBarChart, DistributionCategory } from '@/components/charts/WorkDistributionBarChart';
import { useGsapCountUp } from '@/hooks/useGsapCountUp';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Drawer } from '@/components/ui/Drawer';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatDate } from '@/utils/formatters';

interface DashboardServiceRequest {
  id: string;
  requestNumber: string;
  customerName?: string;
  siteName?: string;
  assetBrand?: string;
  assetModel?: string;
  requestType: string;
  priority: string;
  status: string;
  assignedTechnicianName?: string;
  createdAt?: string;
}

interface DashboardSchedule {
  id: string;
  scheduleNumber: string;
  customerName?: string;
  siteName?: string;
  brand?: string;
  scheduledDate?: string;
  status: string;
}

interface KpiCounterCardProps {
  title: string;
  badgeText: string;
  badgeClass: string;
  value: number;
  unit: string;
  subIcon: React.ReactNode;
  subText: string;
  onClick?: () => void;
}

const KpiCounterCard: React.FC<KpiCounterCardProps> = ({
  title,
  badgeText,
  badgeClass,
  value,
  unit,
  subIcon,
  subText,
  onClick,
}) => {
  const countRef = useGsapCountUp(value, { duration: 1.2 });

  return (
    <GlassCard
      enableTilt
      variant="hybrid"
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        padding: 'var(--space-4)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
          <span className="text-caption" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            {title}
          </span>
          <span className={`badge ${badgeClass}`} style={{ fontSize: '10px' }}>{badgeText}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
          <span
            ref={countRef}
            style={{
              fontSize: 'var(--text-3xl)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {value}
          </span>
          <span className="text-caption" style={{ color: 'var(--text-muted)' }}>{unit}</span>
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {subIcon}
          <span>{subText}</span>
        </div>
      </div>
    </GlassCard>
  );
};

interface DashboardShellProps {
  currentRole: UserRole;
  onNavigate: (item: string) => void;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({ currentRole, onNavigate }) => {
  // Quick Actions Drawer State
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);

  // Real-time Digital Clock State
  const [currentDateTime, setCurrentDateTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = currentDateTime.getHours();
  const minutes = currentDateTime.getMinutes().toString().padStart(2, '0');
  const seconds = currentDateTime.getSeconds().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = (hours % 12 || 12).toString().padStart(2, '0');
  const formattedDate = currentDateTime.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Live Operational Backend Data States
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [activeAmcCount, setActiveAmcCount] = useState(0);
  const [servicesDueCount, setServicesDueCount] = useState(0);
  const [unassignedRequestsCount, setUnassignedRequestsCount] = useState(0);
  const lowStockCount = 0;

  const [realTrendData, setRealTrendData] = useState<DataPoint[]>([
    { label: 'Mon', value: 0, secondaryValue: 0 },
    { label: 'Tue', value: 0, secondaryValue: 0 },
    { label: 'Wed', value: 0, secondaryValue: 0 },
    { label: 'Thu', value: 0, secondaryValue: 0 },
    { label: 'Fri', value: 0, secondaryValue: 0 },
    { label: 'Sat', value: 0, secondaryValue: 0 },
    { label: 'Sun', value: 0, secondaryValue: 0 },
  ]);

  const [realWorkDistribution, setRealWorkDistribution] = useState<DistributionCategory[]>([
    { label: 'General / PM', count: 0, category: 'PM' },
    { label: 'Breakdown', count: 0, category: 'BREAKDOWN' },
    { label: 'Repairs', count: 0, category: 'BREAKDOWN' },
    { label: 'Installations', count: 0, category: 'PM' },
  ]);

  const [capacityPercent, setCapacityPercent] = useState(0);
  const [compliancePercent, setCompliancePercent] = useState(100);

  const [realServiceRequests, setRealServiceRequests] = useState<DashboardServiceRequest[]>([]);
  const [realSchedules, setRealSchedules] = useState<DashboardSchedule[]>([]);

  const fetchOperationalData = async () => {
    setIsLoadingDashboard(true);
    try {
      try {
        const summaryRes = await apiClient.get<{ data: any }>('/analytics/dashboard-summary');
        if (summaryRes?.data) {
          const d = summaryRes.data;
          setActiveAmcCount(d.kpi?.activeAmcCount || 0);
          setServicesDueCount(d.kpi?.servicesDueCount || 0);
          setUnassignedRequestsCount(d.kpi?.unassignedRequestsCount || 0);
          if (d.workDistribution && d.workDistribution.length > 0) {
            setRealWorkDistribution(d.workDistribution);
          }
          setCapacityPercent(d.capacityPercent || 0);
          setCompliancePercent(d.compliancePercent || 100);
          if (d.recentServiceRequests && d.recentServiceRequests.length > 0) {
            setRealServiceRequests(d.recentServiceRequests);
          }
          if (d.recentSchedules && d.recentSchedules.length > 0) {
            setRealSchedules(d.recentSchedules);
          }
          if (d.trendData && d.trendData.length > 0) {
            setRealTrendData(d.trendData);
          }
          setIsLoadingDashboard(false);
          return;
        }
      } catch {
        // Fallback to individual operational queries
      }

      const [amcRes, srRes, schedRes] = await Promise.allSettled([
        apiClient.get<{ metrics: { activeContracts: number; upcomingPmCount: number; overduePmCount: number; coveredAssetsCount: number } }>('/amc-contracts/metrics'),
        apiClient.get<{ serviceRequests: DashboardServiceRequest[]; total: number }>('/service-requests?pageSize=10'),
        apiClient.get<{ schedules: DashboardSchedule[]; total: number }>('/service-schedules?pageSize=10'),
      ]);

      // 1. AMC Metrics
      let activeAmc = 0;
      let dueVisits = 0;
      let overdueCount = 0;
      if (amcRes.status === 'fulfilled' && amcRes.value?.metrics) {
        activeAmc = amcRes.value.metrics.activeContracts || 0;
        dueVisits = (amcRes.value.metrics.upcomingPmCount || 0) + (amcRes.value.metrics.overduePmCount || 0);
        overdueCount = amcRes.value.metrics.overduePmCount || 0;
        setActiveAmcCount(activeAmc);
        setServicesDueCount(dueVisits);
      }

      // 2. Service Requests
      let reqList: DashboardServiceRequest[] = [];
      if (srRes.status === 'fulfilled' && srRes.value?.serviceRequests) {
        reqList = srRes.value.serviceRequests;
        setRealServiceRequests(reqList);
        const unassigned = reqList.filter((r) => ['REQUESTED', 'PENDING'].includes(r.status));
        setUnassignedRequestsCount(unassigned.length);
      }

      // 3. Service Schedules
      let schedList: DashboardSchedule[] = [];
      if (schedRes.status === 'fulfilled' && schedRes.value?.schedules) {
        schedList = schedRes.value.schedules;
        setRealSchedules(schedList);
      }

      // 4. Compute Real Work Distribution
      const pmCount = reqList.filter((r) =>
        ['PREVENTIVE_MAINTENANCE', 'GENERAL_SERVICE', 'INSPECTION'].includes(r.requestType)
      ).length;
      const breakdownCount = reqList.filter((r) =>
        ['BREAKDOWN', 'EMERGENCY'].includes(r.requestType)
      ).length;
      const repairCount = reqList.filter((r) => r.requestType === 'REPAIR').length;
      const installCount = reqList.filter((r) => r.requestType === 'INSTALLATION').length;

      setRealWorkDistribution([
        { label: 'General / PM', count: pmCount, category: 'PM' },
        { label: 'Breakdown', count: breakdownCount, category: 'BREAKDOWN' },
        { label: 'Repairs', count: repairCount, category: 'BREAKDOWN' },
        { label: 'Installations', count: installCount, category: 'PM' },
      ]);

      // 5. Compute Capacity & Compliance Ratios
      const totalWork = schedList.length + reqList.length;
      const completedWork = schedList.filter((s) => s.status === 'COMPLETED').length +
        reqList.filter((r) => ['COMPLETED', 'RESOLVED', 'CLOSED'].includes(r.status)).length;

      const calculatedCapacity = totalWork > 0 ? Math.round((completedWork / totalWork) * 100) : 0;
      const calculatedCompliance = totalWork > 0 ? Math.max(0, 100 - Math.round((overdueCount / totalWork) * 100)) : 100;
      setCapacityPercent(calculatedCapacity);
      setCompliancePercent(calculatedCompliance);

      // 6. Compute 7-day Operational Volume Trend
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const trendMap: DataPoint[] = days.map((day) => ({
        label: day,
        value: 0,
        secondaryValue: 0,
      }));

      schedList.forEach((s) => {
        if (s.scheduledDate) {
          const dayOfWeek = new Date(s.scheduledDate).getDay();
          const idx = (dayOfWeek + 6) % 7;
          if (trendMap[idx]) {
            trendMap[idx].value += 1;
          }
        }
      });

      reqList.forEach((r) => {
        if (r.createdAt) {
          const dayOfWeek = new Date(r.createdAt).getDay();
          const idx = (dayOfWeek + 6) % 7;
          const target = trendMap[idx];
          if (target) {
            target.secondaryValue = (target.secondaryValue ?? 0) + 1;
          }
        }
      });

      setRealTrendData(trendMap);
    } catch (err) {
      console.warn('Dashboard live metrics fetch error:', err);
    } finally {
      setIsLoadingDashboard(false);
    }
  };

  useEffect(() => {
    fetchOperationalData();
  }, []);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
            <h1 className="text-page-title">Operations Dashboard</h1>
            <Badge variant="success">Live Operations</Badge>
          </div>
          <p className="text-body-sm">
            Centralized operational command center for HVAC service requests, AMC contracts, technician dispatch, and asset health.
          </p>
        </div>

        {/* Real-time Digital Clock & Header Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {/* Glassmorphic Real-Time Digital Clock */}
          <div
            className="realtime-digital-clock"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(226, 232, 240, 0.85)',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(16, 185, 129, 0.12) 100%)',
                color: 'var(--color-brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Clock size={16} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontWeight: 700,
                    fontSize: '15px',
                    letterSpacing: '0.04em',
                    color: 'var(--text-primary)',
                    lineHeight: 1,
                  }}
                >
                  {displayHours}:{minutes}:{seconds}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-brand)', letterSpacing: '0.02em' }}>
                  {ampm}
                </span>
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    boxShadow: '0 0 6px #10b981',
                    marginLeft: '3px',
                  }}
                  title="Live Telemetry Synchronized"
                />
              </div>
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 500, marginTop: '2px' }}>
                {formattedDate}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            leftIcon={<Sliders size={15} />}
            onClick={() => setIsQuickActionsOpen(true)}
          >
            Quick Actions
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={15} />}
            onClick={() => onNavigate('service-requests')}
          >
            New Request
          </Button>
        </div>
      </div>

      {/* Live Operational State Banner */}
      <div
        className="card"
        style={{
          borderLeft: '4px solid var(--color-brand)',
          backgroundColor: 'var(--bg-surface)',
          padding: 'var(--space-4) var(--space-5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <ShieldCheck size={20} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Operational Telemetry &amp; Field Dispatch
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Synchronized in real-time with your active HVAC maintenance database and service records.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            size="sm"
            isLoading={isLoadingDashboard}
            leftIcon={<RefreshCw size={14} className={isLoadingDashboard ? 'animate-spin' : ''} />}
            onClick={fetchOperationalData}
          >
            Refresh Telemetry
          </Button>
          <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
            Current View: {currentRole}
          </span>
        </div>
      </div>

      {/* Operational Dashboard Content Layout */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Level 1: Tactical Neumorphic Glass KPI Cards with GSAP Count-Up */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCounterCard
            title="Active AMC Contracts"
            badgeText="Live Target"
            badgeClass="badge-amc"
            value={activeAmcCount}
            unit="contracts"
            subIcon={<FileCheck2 size={13} style={{ color: 'var(--color-amc-solid)' }} />}
            subText="Preventive maintenance active"
            onClick={() => onNavigate('amc')}
          />
          <KpiCounterCard
            title="Services Due Today"
            badgeText="Operational"
            badgeClass="badge-info"
            value={servicesDueCount}
            unit="visits"
            subIcon={<Clock size={13} style={{ color: 'var(--color-info-solid)' }} />}
            subText="Calculated by schedule date"
            onClick={() => onNavigate('service-schedule')}
          />
          <KpiCounterCard
            title="Unassigned Requests"
            badgeText={unassignedRequestsCount > 0 ? 'Attention' : 'Clear'}
            badgeClass={unassignedRequestsCount > 0 ? 'badge-warning' : 'badge-neutral'}
            value={unassignedRequestsCount}
            unit="tickets"
            subIcon={<AlertTriangle size={13} style={{ color: 'var(--color-warning-solid)' }} />}
            subText="Requires technician dispatch"
            onClick={() => onNavigate('service-requests')}
          />
          <KpiCounterCard
            title="Parts at Low Stock"
            badgeText="Inventory"
            badgeClass="badge-neutral"
            value={lowStockCount}
            unit="SKUs"
            subIcon={<Package size={13} style={{ color: 'var(--color-neutral-solid)' }} />}
            subText="Below minimum reorder level"
          />
        </div>

        {/* Level 2: Visual Operational Analytics Cockpit (GSAP Animated Charts) */}
        <div className="grid grid-cols-3 gap-6">
          <div style={{ gridColumn: 'span 2' }}>
            <OperationalTrendChart
              data={realTrendData}
              title="Operational Service Volume &amp; Velocity"
              subtitle="7-Day Catmull-Rom spline curve of scheduled visits vs. breakdown tickets"
            />
          </div>
          <div>
            <CapacityRadialGauge
              capacityPercent={capacityPercent}
              compliancePercent={compliancePercent}
              title="Field Capacity &amp; Health"
              subtitle="Active technician completion &amp; AMC compliance index"
            />
          </div>
        </div>

        {/* Level 3: Work Queue Category Distribution */}
        <div>
          <WorkDistributionBarChart
            items={realWorkDistribution}
            title="Service Category Distribution"
            subtitle="Live breakdown vs preventive maintenance distribution across active tickets"
          />
        </div>

        {/* Level 4: Operational Data Streams */}
        <div className="grid grid-cols-3 gap-6">
          {/* Left Column (Span 2): Active Service Workspace */}
          <div style={{ gridColumn: 'span 2' }}>
            <Card variant="hybrid">
              <CardHeader>
                <div>
                  <CardTitle>Active Service Operations Stream</CardTitle>
                  <div className="text-caption">
                    Live service requests from PostgreSQL database
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate('service-requests')}
                  rightIcon={<ExternalLink size={14} />}
                >
                  View All
                </Button>
              </CardHeader>
              <CardBody style={{ padding: realServiceRequests.length > 0 ? 0 : 'var(--space-4)' }}>
                {isLoadingDashboard ? (
                  <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <Skeleton height="36px" borderRadius="var(--radius-md)" />
                    <Skeleton height="36px" borderRadius="var(--radius-md)" />
                    <Skeleton height="36px" borderRadius="var(--radius-md)" />
                  </div>
                ) : realServiceRequests.length === 0 ? (
                  <EmptyState
                    title="No Active Service Requests"
                    description="Your operational queue is currently empty. Click 'New Request' to create and dispatch a new breakdown or maintenance ticket."
                    actionLabel="+ New Request"
                    onAction={() => onNavigate('service-requests')}
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service ID</TableHead>
                        <TableHead>Customer / Site</TableHead>
                        <TableHead>AC Asset</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Technician</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {realServiceRequests.slice(0, 5).map((sr: DashboardServiceRequest) => (
                        <TableRow key={sr.id} isInteractive onClick={() => onNavigate('service-requests')}>
                          <TableCell><span className="text-mono font-medium">{sr.requestNumber}</span></TableCell>
                          <TableCell>
                            <div className="font-medium">{sr.customerName || 'Customer'}</div>
                            <div className="text-caption">{sr.siteName || 'Site Location'}</div>
                          </TableCell>
                          <TableCell>{sr.assetBrand ? `${sr.assetBrand} ${sr.assetModel || ''}` : 'AC Unit'}</TableCell>
                          <TableCell><StatusBadge status={sr.status} /></TableCell>
                          <TableCell>
                            <Badge variant={sr.priority === 'EMERGENCY' || sr.priority === 'URGENT' ? 'error' : sr.priority === 'HIGH' ? 'warning' : 'info'}>
                              {sr.priority}
                            </Badge>
                          </TableCell>
                          <TableCell><span className="text-body-sm">{sr.assignedTechnicianName || 'Unassigned (Pending)'}</span></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Right Column: Upcoming PM Schedules & Quick Overview */}
          <div>
            <Card variant="hybrid">
              <CardHeader>
                <div>
                  <CardTitle>Preventive Schedules</CardTitle>
                  <div className="text-caption">Generated AMC Maintenance Queue</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate('service-schedule')}
                  rightIcon={<Calendar size={14} />}
                >
                  Calendar
                </Button>
              </CardHeader>
              <CardBody>
                {isLoadingDashboard ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <Skeleton height="54px" borderRadius="var(--radius-md)" />
                    <Skeleton height="54px" borderRadius="var(--radius-md)" />
                  </div>
                ) : realSchedules.length === 0 ? (
                  <EmptyState
                    title="No Schedules in Queue"
                    description="No preventive maintenance visits currently scheduled. Generate visits from AMC contracts."
                    actionLabel="Manage AMC"
                    onAction={() => onNavigate('amc')}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {realSchedules.slice(0, 3).map((s: DashboardSchedule) => (
                      <div
                        key={s.id}
                        style={{
                          padding: 'var(--space-3)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-default)',
                          backgroundColor: 'var(--bg-surface-subtle)',
                          cursor: 'pointer',
                        }}
                        onClick={() => onNavigate('service-schedule')}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span className="text-mono" style={{ fontWeight: 600, fontSize: 'var(--text-xs)' }}>
                            {s.scheduleNumber}
                          </span>
                          <StatusBadge status={s.status} />
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                          {s.customerName || s.siteName || 'Customer Facility'}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Target: {s.scheduledDate ? formatDate(s.scheduledDate) : 'Pending Date'} • {s.brand || 'AC Asset'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
              <CardFooter>
                <span className="text-caption">Algorithm: Calendar-Aware PM Schedule Generation</span>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>

      {/* Quick Actions Navigation Drawer */}
      <Drawer
        isOpen={isQuickActionsOpen}
        onClose={() => setIsQuickActionsOpen(false)}
        title="Quick Operational Actions"
        description="Jump directly to core service workflows across your facility operations."
        footer={
          <Button variant="secondary" onClick={() => setIsQuickActionsOpen(false)}>
            Close
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Card
            variant="interactive"
            onClick={() => {
              setIsQuickActionsOpen(false);
              onNavigate('customers');
            }}
          >
            <CardBody style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Users size={18} style={{ color: 'var(--color-brand)' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>Customer &amp; Sites Directory</div>
                <div className="text-caption">Register customers, physical locations, and AC assets</div>
              </div>
            </CardBody>
          </Card>

          <Card
            variant="interactive"
            onClick={() => {
              setIsQuickActionsOpen(false);
              onNavigate('service-requests');
            }}
          >
            <CardBody style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Plus size={18} style={{ color: 'var(--color-brand)' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>New Service Request</div>
                <div className="text-caption">Log breakdown tickets and emergency cooling service</div>
              </div>
            </CardBody>
          </Card>

          <Card
            variant="interactive"
            onClick={() => {
              setIsQuickActionsOpen(false);
              onNavigate('amc');
            }}
          >
            <CardBody style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <FileCheck2 size={18} style={{ color: 'var(--color-brand)' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>AMC Contracts Management</div>
                <div className="text-caption">Manage annual maintenance contracts and obligations</div>
              </div>
            </CardBody>
          </Card>

          <Card
            variant="interactive"
            onClick={() => {
              setIsQuickActionsOpen(false);
              onNavigate('service-schedule');
            }}
          >
            <CardBody style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Calendar size={18} style={{ color: 'var(--color-brand)' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>Dispatch &amp; Scheduling Calendar</div>
                <div className="text-caption">Assign technicians to pending visits and prevent collisions</div>
              </div>
            </CardBody>
          </Card>

          <Card
            variant="interactive"
            onClick={() => {
              setIsQuickActionsOpen(false);
              onNavigate('technicians');
            }}
          >
            <CardBody style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Wrench size={18} style={{ color: 'var(--color-brand)' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>Technician Workforce</div>
                <div className="text-caption">Monitor active technicians, workloads, and service zones</div>
              </div>
            </CardBody>
          </Card>
        </div>
      </Drawer>
    </div>
  );
};
