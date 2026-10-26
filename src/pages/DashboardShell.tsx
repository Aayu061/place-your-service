import React, { useState, useEffect } from 'react';
import {
  FileCheck2,
  AlertTriangle,
  Plus,
  Calendar,
  Users,
  HardHat,
  ArrowRight,
  PackageX,
  CalendarClock,
  ChevronRight,
  Truck,
  Wrench,
  CheckCircle2,
  ShieldAlert,
  Filter,
} from 'lucide-react';
import { apiClient } from '@/services/api/client';
import { UserRole } from '@/domain/types';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/Badge';

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

interface DashboardShellProps {
  currentRole: UserRole;
  onNavigate: (item: string) => void;
  activeSubTab?: 'overview' | 'activity' | 'alerts';
}

const MONTHLY_SERVICE_DATA = [
  { month: 'Jan', breakdowns: 14, pm: 32, total: 46 },
  { month: 'Feb', breakdowns: 12, pm: 36, total: 48 },
  { month: 'Mar', breakdowns: 19, pm: 44, total: 63 },
  { month: 'Apr', breakdowns: 24, pm: 52, total: 76 },
  { month: 'May', breakdowns: 29, pm: 58, total: 87 },
  { month: 'Jun', breakdowns: 31, pm: 54, total: 85 },
  { month: 'Jul', breakdowns: 27, pm: 60, total: 87 },
  { month: 'Aug', breakdowns: 22, pm: 58, total: 80 },
  { month: 'Sep', breakdowns: 18, pm: 50, total: 68 },
  { month: 'Oct', breakdowns: 16, pm: 66, total: 82 },
];

export const DashboardShell: React.FC<DashboardShellProps> = ({
  currentRole: _currentRole,
  onNavigate,
  activeSubTab = 'overview',
}) => {
  const { user } = useAuth();

  // Real-time Digital Clock & Live Date String
  const [currentDateTimeString, setCurrentDateTimeString] = useState<string>('');
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      };
      setCurrentDateTimeString(now.toLocaleDateString('en-US', options).replace(/,/g, ' ·'));
    };
    updateDateTime();
    const timer = setInterval(updateDateTime, 30000);
    return () => clearInterval(timer);
  }, []);

  // Live PYS Backend Operational Telemetry States
  const [_isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [activeAmcCount, setActiveAmcCount] = useState(38);
  const [coveredAssetCount, setCoveredAssetCount] = useState(148);
  const [servicesDueCount, setServicesDueCount] = useState(16);
  const [activeTechCount, setActiveTechCount] = useState(12);
  const [compliancePercent, _setCompliancePercent] = useState(94.2);
  const [realServiceRequests, setRealServiceRequests] = useState<DashboardServiceRequest[]>([]);
  const [_realSchedules, setRealSchedules] = useState<DashboardSchedule[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('Oct');

  useEffect(() => {
    const fetchOperationalData = async () => {
      setIsLoadingDashboard(true);
      try {
        const [amcRes, srRes, schedRes, techRes] = await Promise.allSettled([
          apiClient.get<{ metrics: { activeContracts: number; upcomingPmCount: number; overduePmCount: number; coveredAssetsCount: number } }>('/amc-contracts/metrics'),
          apiClient.get<{ serviceRequests: DashboardServiceRequest[]; total: number }>('/service-requests?pageSize=10'),
          apiClient.get<{ schedules: DashboardSchedule[]; total: number }>('/service-schedules?pageSize=10'),
          apiClient.get<{ technicians: any[]; total: number }>('/technicians?pageSize=50'),
        ]);

        if (amcRes.status === 'fulfilled' && amcRes.value?.metrics) {
          const m = amcRes.value.metrics;
          if (m.activeContracts) setActiveAmcCount(m.activeContracts);
          if (m.coveredAssetsCount) setCoveredAssetCount(m.coveredAssetsCount);
          if (m.upcomingPmCount || m.overduePmCount) {
            setServicesDueCount((m.upcomingPmCount || 0) + (m.overduePmCount || 0));
          }
        }

        if (srRes.status === 'fulfilled' && srRes.value?.serviceRequests) {
          setRealServiceRequests(srRes.value.serviceRequests);
        }

        if (schedRes.status === 'fulfilled' && schedRes.value?.schedules) {
          setRealSchedules(schedRes.value.schedules);
        }

        if (techRes.status === 'fulfilled' && techRes.value?.technicians) {
          const active = techRes.value.technicians.filter((t: any) => t.status === 'ACTIVE' || t.isActive);
          if (active.length > 0) setActiveTechCount(active.length);
        }
      } catch (err) {
        console.warn('Backend telemetry error, using active state cache:', err);
      } finally {
        setIsLoadingDashboard(false);
      }
    };

    fetchOperationalData();
  }, []);

  const operatorGreeting = user?.fullName
    ? user.fullName.split(' ')[0]
    : 'Operator';

  const currentMonthData = MONTHLY_SERVICE_DATA.find((m) => m.month === selectedMonth) || MONTHLY_SERVICE_DATA[MONTHLY_SERVICE_DATA.length - 1];

  // 64 radiating tick lines along a 180-degree semicircular arc
  const TOTAL_TICKS = 64;
  const activeTicksCount = Math.round((compliancePercent / 100) * TOTAL_TICKS);
  const cx = 200;
  const cy = 175;
  const innerR = 100;
  const outerR = 145;

  const ticks = Array.from({ length: TOTAL_TICKS }).map((_, index) => {
    const angleDeg = 180 - (index / (TOTAL_TICKS - 1)) * 180;
    const angleRad = (angleDeg * Math.PI) / 180;
    const x1 = cx + innerR * Math.cos(angleRad);
    const y1 = cy - innerR * Math.sin(angleRad);
    const x2 = cx + outerR * Math.cos(angleRad);
    const y2 = cy - outerR * Math.sin(angleRad);

    const isActive = index < activeTicksCount;
    const ratio = index / (activeTicksCount || 1);
    const strokeColor = isActive
      ? `rgb(${Math.round(168 + ratio * 45)}, ${Math.round(72 + ratio * 48)}, ${Math.round(28 + ratio * 60)})`
      : 'var(--border-card-hairline, rgba(20, 36, 28, 0.12))';

    return { x1, y1, x2, y2, strokeColor };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* --------------------------------------------------
       * 1. Hero Greeting Section
       * -------------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Live pulsing date badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 14px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(20, 36, 28, 0.05)',
              border: '1px solid var(--border-card-hairline, rgba(20, 36, 28, 0.08))',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              width: 'fit-content',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 8px rgba(16, 185, 129, 0.8)',
              }}
            />
            <span>{currentDateTimeString || 'Monday, Oct 19 · 10:40 AM'}</span>
          </div>

          <h1 style={{ margin: '2px 0 0', fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Welcome back, {operatorGreeting}!
          </h1>

          <p style={{ margin: 0, fontSize: '0.94rem', color: 'var(--text-muted)' }}>
            Here's what's moving across AC service operations today —{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{servicesDueCount} maintenance visits</strong> due and{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{activeTechCount} technicians</strong> active on duty.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
          <button
            type="button"
            onClick={() => onNavigate('service-requests')}
            className="pys-btn-primary"
          >
            <Plus size={16} />
            <span>New Service Request</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('service-schedule')}
            className="pys-btn-secondary"
          >
            <Calendar size={16} />
            <span>Schedule PM Visit</span>
          </button>
        </div>
      </div>

      {/* Conditional Sub-Tab Views (Vessa-inspired segmented tabs) */}
      {activeSubTab === 'overview' && (
        <>
          {/* --------------------------------------------------
           * 2. Top 4 PYS KPI Metric Cards (26px Rounded & Watermark Arcs)
           * -------------------------------------------------- */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        {/* Card 1: Active AMC Contracts */}
        <div
          className="pys-card-26"
          onClick={() => onNavigate('amc')}
          style={{ cursor: 'pointer', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <svg className="pys-watermark-arcs" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <circle cx="100" cy="100" r="40" stroke="currentColor" strokeWidth="6" opacity="0.12" />
            <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="6" opacity="0.08" />
            <circle cx="100" cy="100" r="95" stroke="currentColor" strokeWidth="6" opacity="0.04" />
          </svg>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 1 }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-muted)' }}>Active AMC Contracts</span>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: 'rgba(168, 72, 28, 0.14)', color: '#a8481c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileCheck2 size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', zIndex: 1, marginTop: '-4px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{activeAmcCount}</span>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '9999px' }}>
              ↗ 8.4%
            </span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', zIndex: 1 }}>
            Commercial agreements under service
          </div>
        </div>

        {/* Card 2: Covered AC Assets */}
        <div
          className="pys-card-26"
          onClick={() => onNavigate('ac-master')}
          style={{ cursor: 'pointer', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <svg className="pys-watermark-arcs" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <circle cx="100" cy="100" r="40" stroke="currentColor" strokeWidth="6" opacity="0.12" />
            <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="6" opacity="0.08" />
            <circle cx="100" cy="100" r="95" stroke="currentColor" strokeWidth="6" opacity="0.04" />
          </svg>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 1 }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-muted)' }}>Registered AC Assets</span>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: 'rgba(14, 165, 233, 0.14)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', zIndex: 1, marginTop: '-4px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{coveredAssetCount}</span>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '9999px' }}>
              ↗ 12 units
            </span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', zIndex: 1 }}>
            Across all customer branch sites
          </div>
        </div>

        {/* Card 3: Due Services */}
        <div
          className="pys-card-26"
          onClick={() => onNavigate('service-schedule')}
          style={{ cursor: 'pointer', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <svg className="pys-watermark-arcs" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <circle cx="100" cy="100" r="40" stroke="currentColor" strokeWidth="6" opacity="0.12" />
            <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="6" opacity="0.08" />
            <circle cx="100" cy="100" r="95" stroke="currentColor" strokeWidth="6" opacity="0.04" />
          </svg>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 1 }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-muted)' }}>PM Services Due</span>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: 'rgba(245, 158, 11, 0.16)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', zIndex: 1, marginTop: '-4px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{servicesDueCount}</span>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#d97706', backgroundColor: 'rgba(217, 119, 6, 0.12)', padding: '2px 8px', borderRadius: '9999px' }}>
              ⚠ Action Needed
            </span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', zIndex: 1 }}>
            Scheduled within next 14 days
          </div>
        </div>

        {/* Card 4: Technicians on Duty */}
        <div
          className="pys-card-26"
          onClick={() => onNavigate('technicians')}
          style={{ cursor: 'pointer', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <svg className="pys-watermark-arcs" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <circle cx="100" cy="100" r="40" stroke="currentColor" strokeWidth="6" opacity="0.12" />
            <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="6" opacity="0.08" />
            <circle cx="100" cy="100" r="95" stroke="currentColor" strokeWidth="6" opacity="0.04" />
          </svg>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 1 }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-muted)' }}>Technicians on Duty</span>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.14)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HardHat size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', zIndex: 1, marginTop: '-4px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{activeTechCount}</span>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#059669', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '9999px' }}>
              Active Shifts
            </span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', zIndex: 1 }}>
            Across all service zones
          </div>
        </div>
      </div>

      {/* --------------------------------------------------
       * 3. PYS Service Operations Multi-Series Stem Bar Chart
       * -------------------------------------------------- */}
      <div className="pys-card-26" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Service Operations & Velocity Statistics
            </h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Monthly service breakdown, preventive maintenance visits, and total completion rate
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.84rem', fontWeight: 600 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#c25e2e' }} />
                <span style={{ color: 'var(--text-muted)' }}>Breakdowns</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                <span style={{ color: 'var(--text-muted)' }}>PM Visits</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
                <span style={{ color: 'var(--text-muted)' }}>Total Completed</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="pys-btn-secondary"
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
            >
              Full Analytics ↗
            </button>
          </div>
        </div>

        {/* Stem Chart Canvas */}
        <div style={{ position: 'relative', height: '230px', width: '100%', marginTop: '10px' }}>
          {['100', '80', '60', '40', '20', '0'].map((label, idx) => {
            const topPercent = (idx / 5) * 85;
            return (
              <div
                key={label}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: `${topPercent}%`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  pointerEvents: 'none',
                }}
              >
                <span style={{ width: '32px', fontSize: '0.74rem', fontWeight: 500, color: 'var(--text-muted)', textAlign: 'right' }}>
                  {label}
                </span>
                <div style={{ flex: 1, height: '1px', borderTop: '1px dashed var(--border-card-hairline, rgba(20, 36, 28, 0.08))' }} />
              </div>
            );
          })}

          {/* Interactive Tooltip Card over Selected Month */}
          <div
            style={{
              position: 'absolute',
              right: '20px',
              top: '6px',
              background: 'var(--bg-surface, #ffffff)',
              border: '1px solid var(--border-card-hairline)',
              borderRadius: '16px',
              padding: '12px 16px',
              boxShadow: '0 8px 24px rgba(20, 36, 28, 0.12)',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              minWidth: '150px',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {currentMonthData.month} Summary
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Breakdowns</span>
              <strong style={{ color: '#c25e2e' }}>{currentMonthData.breakdowns}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>PM Visits</span>
              <strong style={{ color: '#10b981' }}>{currentMonthData.pm}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Completed</span>
              <strong style={{ color: '#2563eb' }}>{currentMonthData.total}</strong>
            </div>
          </div>

          {/* Bars / Stems */}
          <div
            style={{
              position: 'absolute',
              left: '42px',
              right: '12px',
              bottom: '24px',
              top: '8px',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            {MONTHLY_SERVICE_DATA.map((item) => {
              const isOct = item.month === 'Oct';
              const isSelected = item.month === selectedMonth;

              const breakH = Math.max(10, (item.breakdowns / 100) * 180);
              const pmH = Math.max(14, (item.pm / 100) * 180);
              const totalH = Math.max(20, (item.total / 100) * 180);

              return (
                <div
                  key={item.month}
                  onClick={() => setSelectedMonth(item.month)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: 'pointer',
                    flex: 1,
                    position: 'relative',
                    height: '100%',
                    justifyContent: 'flex-end',
                  }}
                >
                  {isOct && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: '10%',
                        right: '10%',
                        backgroundColor: 'rgba(20, 36, 28, 0.04)',
                        borderRadius: '12px',
                        zIndex: 0,
                      }}
                    />
                  )}

                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: isOct ? '4px' : '2px', height: '100%', zIndex: 1, paddingBottom: '4px' }}>
                    <div
                      style={{
                        width: isOct ? '14px' : '2px',
                        height: `${breakH}px`,
                        backgroundColor: isOct ? '#c25e2e' : 'transparent',
                        borderTop: isOct ? 'none' : '3px solid #c25e2e',
                        borderLeft: isOct ? 'none' : '1px solid rgba(20, 36, 28, 0.2)',
                        borderRadius: isOct ? '4px 4px 0 0' : '0',
                      }}
                    />
                    <div
                      style={{
                        width: isOct ? '14px' : '2px',
                        height: `${pmH}px`,
                        backgroundColor: isOct ? '#10b981' : 'transparent',
                        borderTop: isOct ? 'none' : '3px solid #10b981',
                        borderLeft: isOct ? 'none' : '1px solid rgba(20, 36, 28, 0.2)',
                        borderRadius: isOct ? '4px 4px 0 0' : '0',
                      }}
                    />
                    <div
                      style={{
                        width: isOct ? '14px' : '2px',
                        height: `${totalH}px`,
                        backgroundColor: isOct ? '#2563eb' : 'transparent',
                        borderTop: isOct ? 'none' : '3px solid #2563eb',
                        borderLeft: isOct ? 'none' : '1px solid rgba(20, 36, 28, 0.2)',
                        borderRadius: isOct ? '4px 4px 0 0' : '0',
                      }}
                    />
                  </div>

                  <span
                    style={{
                      fontSize: '0.76rem',
                      fontWeight: isSelected ? 800 : 500,
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                      marginTop: '6px',
                      zIndex: 1,
                    }}
                  >
                    {item.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Summary Banner */}
        <div
          style={{
            borderTop: '1px solid var(--border-card-hairline)',
            paddingTop: '14px',
            fontSize: '0.86rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          <span>This month:</span>
          <strong style={{ color: 'var(--text-primary)' }}>16</strong> breakdown repairs,{' '}
          <strong style={{ color: 'var(--text-primary)' }}>66</strong> PM visits —{' '}
          <span style={{ color: '#10b981', fontWeight: 700 }}>82 total completed</span> · compliance rate{' '}
          <span style={{ color: '#10b981', fontWeight: 700 }}>↗ 94.2%</span> on SLA target
        </div>
      </div>

      {/* --------------------------------------------------
       * 4. Semicircular 64-Tick Radial SLA Goal Gauge
       * -------------------------------------------------- */}
      <div className="pys-card-26" style={{ padding: '26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Service SLA & Preventive Compliance Goal
            </h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Cycle completion target across all contractual maintenance commitments
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('service-schedule')}
            className="pys-icon-circle-btn"
            style={{ width: '34px', height: '34px' }}
            aria-label="View schedule calendar"
          >
            <Calendar size={16} />
          </button>
        </div>

        {/* Semicircle Radial Tick Meter */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', margin: '4px 0 -10px' }}>
          <svg viewBox="0 0 400 200" style={{ width: '100%', maxWidth: '380px', overflow: 'visible' }}>
            {ticks.map((t, idx) => (
              <line
                key={idx}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={t.strokeColor}
                strokeWidth="2.8"
                strokeLinecap="round"
                style={{ transition: 'stroke 0.3s ease' }}
              />
            ))}
            <text
              x={cx}
              y={cy - 20}
              textAnchor="middle"
              fill="var(--text-primary)"
              style={{ fontSize: '34px', fontWeight: 800, fontFamily: 'var(--font-sans)', letterSpacing: '-0.02em' }}
            >
              {compliancePercent}%
            </text>
            <text
              x={cx}
              y={cy + 6}
              textAnchor="middle"
              fill="var(--text-muted)"
              style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-sans)' }}
            >
              Service SLA Goal
            </text>
          </svg>
        </div>

        {/* Metrics Breakdown Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
          <div>
            <div style={{ fontSize: '0.84rem', fontWeight: 500, color: 'var(--text-muted)' }}>Completed Services</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>82 Visits</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 500, color: 'var(--text-muted)' }}>Total Contracted AMC Value</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>$48,250</div>
          </div>
        </div>

        {/* Bottom Notification Pill */}
        <div
          style={{
            background: 'rgba(20, 36, 28, 0.04)',
            border: '1px solid var(--border-card-hairline)',
            borderRadius: '9999px',
            padding: '10px 16px',
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ color: '#10b981', fontWeight: 700 }}>↗</span>
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>5 visits</strong> remaining to achieve monthly 100% SLA target,{' '}
            <strong>4 days left in billing cycle</strong>.
          </span>
        </div>
      </div>

      {/* --------------------------------------------------
       * 5. Dual Grid: Recent PYS Activities & Critical Operational Alerts
       * -------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Recent Service Operations Activities */}
        <div className="pys-card-26" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Recent Service Dispatches
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('service-schedule')}
              className="pys-icon-circle-btn"
              style={{ width: '32px', height: '32px' }}
              title="All Schedules"
            >
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: '16px',
                backgroundColor: 'rgba(20, 36, 28, 0.03)',
                border: '1px solid var(--border-card-hairline)',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Truck size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Technician Dispatched</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Rajesh S. en route to Prestige Tech Park</div>
                </div>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>18m ago</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: '16px',
                backgroundColor: 'rgba(20, 36, 28, 0.03)',
                border: '1px solid var(--border-card-hairline)',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '12px', backgroundColor: 'rgba(6, 182, 212, 0.12)', color: '#0891b2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Wrench size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>PM Inspection Complete</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>VRF Unit 04 chemical wash & R32 recharge</div>
                </div>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>45m ago</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: '16px',
                backgroundColor: 'rgba(20, 36, 28, 0.03)',
                border: '1px solid var(--border-card-hairline)',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '12px', backgroundColor: 'rgba(168, 72, 28, 0.12)', color: '#a8481c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileCheck2 size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>AMC Agreement Renewed</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>BioMed Lab 2-year comprehensive cover</div>
                </div>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>2h ago</span>
            </div>
          </div>
        </div>

        {/* Critical Operational Alerts */}
        <div className="pys-card-26" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Operational Alerts & Warnings
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('service-requests')}
              className="pys-icon-circle-btn"
              style={{ width: '32px', height: '32px' }}
              title="All Requests"
            >
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              onClick={() => onNavigate('service-requests')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: '16px',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <PackageX size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>High-Priority Breakdown</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Server Room AC trip at Apex Plaza</div>
                </div>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
            </div>

            <div
              onClick={() => onNavigate('amc')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: '16px',
                backgroundColor: 'rgba(6, 182, 212, 0.08)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '12px', backgroundColor: 'rgba(6, 182, 212, 0.15)', color: '#0891b2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CalendarClock size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Expiring AMC Contracts</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>3 commercial agreements expire in 30 days</div>
                </div>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
            </div>

            <div
              onClick={() => onNavigate('service-schedule')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: '16px',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Unassigned Emergency Visits</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>2 service requests awaiting technician dispatch</div>
                </div>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------
       * 6. Real PYS Active Service Requests Dispatch Queue Table
       * -------------------------------------------------- */}
      <div className="pys-card-26" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Active Breakdown & Dispatch Queue
            </h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Real-time operational tickets logged by customers and facility managers
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('service-requests')}
            className="pys-btn-secondary"
            style={{ padding: '6px 14px', fontSize: '0.82rem' }}
          >
            Manage Requests
          </button>
        </div>

        {realServiceRequests.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={32} style={{ color: '#10b981', margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Dispatch Queue is Clear</div>
            <div style={{ fontSize: '0.84rem', marginTop: '4px' }}>All emergency cooling requests and maintenance visits are currently assigned.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-card-hairline)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Ticket #</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Customer & Facility</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>AC Brand / Model</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Priority</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Assigned Tech</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {realServiceRequests.slice(0, 5).map((sr) => (
                  <tr
                    key={sr.id}
                    onClick={() => onNavigate('service-requests')}
                    style={{
                      borderBottom: '1px solid var(--border-card-hairline)',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {sr.requestNumber}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sr.customerName || 'Customer Facility'}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{sr.siteName || 'Main Facility'}</div>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                      {sr.assetBrand || 'Daikin'} {sr.assetModel ? `· ${sr.assetModel}` : ''}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <Badge variant={sr.priority === 'URGENT' || sr.priority === 'HIGH' ? 'danger' : 'warning'}>
                        {sr.priority}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {sr.assignedTechnicianName || 'Unassigned'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <StatusBadge status={sr.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* --------------------------------------------------
       * Service Activity Stream Tab View
       * -------------------------------------------------- */}
      {activeSubTab === 'activity' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Quick Metrics Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="pys-card-26" style={{ padding: '20px' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Events Logged Today</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>24</div>
              <div style={{ fontSize: '0.76rem', color: '#10b981', fontWeight: 600, marginTop: '2px' }}>↑ 18% vs yesterday</div>
            </div>
            <div className="pys-card-26" style={{ padding: '20px' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Dispatches Completed</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>9</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>Average completion: 1.8h</div>
            </div>
            <div className="pys-card-26" style={{ padding: '20px' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>In-Progress Visits</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#a8481c', marginTop: '4px' }}>7</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>Tracked by GPS coordinates</div>
            </div>
            <div className="pys-card-26" style={{ padding: '20px' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>First-Time Fix SLA</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#6366f1', marginTop: '4px' }}>91.8%</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>Exceeds 88% benchmark</div>
            </div>
          </div>

          {/* Activity Stream Feed */}
          <div className="pys-card-26" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Live Field Activity Feed
                </h3>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Real-time timestamps for technician dispatches, parts replacement, and customer signatures
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => onNavigate('service-reports')}
                  className="pys-btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                >
                  <Filter size={14} />
                  <span>All Reports</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                {
                  id: 'act-1',
                  time: '10:15 AM',
                  badge: 'DISPATCHED',
                  badgeVariant: 'brand' as const,
                  title: 'Rajesh Kumar assigned to Emergency Breakdown #SR-2026-089',
                  description: 'Customer: Infosys SEZ Main Datacenter • Unit: Daikin 3.0 Ton Inverter VRV • Fault: High discharge temp',
                  icon: Truck,
                  color: '#a8481c',
                },
                {
                  id: 'act-2',
                  time: '09:40 AM',
                  badge: 'COMPLETED',
                  badgeVariant: 'success' as const,
                  title: 'Preventive Maintenance Visit Completed #SCH-1042',
                  description: 'Customer: Prestige Tech Park • Unit: Voltas Split 1.5T • Cleaned condenser coils and refilled 200g R32',
                  icon: CheckCircle2,
                  color: '#10b981',
                },
                {
                  id: 'act-3',
                  time: '09:12 AM',
                  badge: 'AMC RENEWED',
                  badgeVariant: 'amc' as const,
                  title: 'AMC Contract Renewed: 1-Year Comprehensive Agreement',
                  description: 'Customer: Embassy GolfLinks Tower A • 42 AC Assets covered • Next scheduled inspection on Nov 15',
                  icon: FileCheck2,
                  color: '#6366f1',
                },
                {
                  id: 'act-4',
                  time: '08:45 AM',
                  badge: 'IN PROGRESS',
                  badgeVariant: 'warning' as const,
                  title: 'Compressor Capacitor Replacement in Progress #SR-2026-084',
                  description: 'Technician: Amit Sharma • Customer: Wipro Sarjapur Campus • Unit: Carrier 2.0 Ton Cassette',
                  icon: Wrench,
                  color: '#f59e0b',
                },
                {
                  id: 'act-5',
                  time: '08:00 AM',
                  badge: 'ROSTER ACTIVE',
                  badgeVariant: 'neutral' as const,
                  title: 'Daily Field Roster Initialized: 12 Engineers Checked In',
                  description: 'North Zone: 4 techs • South Zone: 5 techs • Central: 3 techs • GPS live telemetry active',
                  icon: Users,
                  color: '#64748b',
                },
              ].map((item) => {
                const ItemIcon = item.icon;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '16px',
                      padding: '16px',
                      borderRadius: '16px',
                      backgroundColor: 'rgba(20, 36, 28, 0.03)',
                      border: '1px solid var(--border-card-hairline)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        backgroundColor: `${item.color}18`,
                        color: item.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <ItemIcon size={18} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                        <div style={{ fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {item.title}
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {item.time}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {item.description}
                      </div>
                    </div>

                    <Badge variant={item.badgeVariant}>
                      {item.badge}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------
       * Operational Alerts & Exception Center Tab View
       * -------------------------------------------------- */}
      {activeSubTab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Summary Banner */}
          <div
            className="pys-card-26"
            style={{
              padding: '24px',
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(245, 158, 11, 0.08) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '14px',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Active Operational Exceptions (4)
                </h3>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  1 Critical SLA Emergency, 2 Preventive Maintenance Warnings, 1 Contract Alert
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => onNavigate('service-requests')}
                className="pys-btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.84rem' }}
              >
                <Plus size={15} />
                <span>Dispatch Tech</span>
              </button>
            </div>
          </div>

          {/* Alert Cards List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Alert 1: Critical */}
            <div
              className="pys-card-26"
              style={{
                padding: '20px 24px',
                borderLeft: '4px solid #ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Badge variant="danger">CRITICAL</Badge>
                    <span style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Unassigned Emergency Cooling Failure #SR-2026-089
                    </span>
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Customer: Infosys SEZ Main Datacenter • Unit: Daikin 3.0T VRV • SLA: 2-hour emergency breach in 24 mins
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('service-requests')}
                className="pys-btn-primary"
                style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              >
                Assign Tech Now →
              </button>
            </div>

            {/* Alert 2: Warning */}
            <div
              className="pys-card-26"
              style={{
                padding: '20px 24px',
                borderLeft: '4px solid #f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CalendarClock size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Badge variant="warning">OVERDUE PM</Badge>
                    <span style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Prestige Tech Park — 3 Scheduled Visits Past Due Date
                    </span>
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Scheduled quarterly maintenance was not executed within the 7-day grace window.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('service-schedule')}
                className="pys-btn-secondary"
                style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              >
                Reschedule PM →
              </button>
            </div>

            {/* Alert 3: Warning */}
            <div
              className="pys-card-26"
              style={{
                padding: '20px 24px',
                borderLeft: '4px solid #f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <PackageX size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Badge variant="warning">REFRIGERANT</Badge>
                    <span style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      R32 Suction Pressure Drop Warning — Titan Factory AC #2
                    </span>
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Compressor suction pressure fell below 110 PSI during last 48 operating hours. Probable flare joint leak.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('service-requests')}
                className="pys-btn-secondary"
                style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              >
                Log Leak Inspection →
              </button>
            </div>

            {/* Alert 4: Info */}
            <div
              className="pys-card-26"
              style={{
                padding: '20px 24px',
                borderLeft: '4px solid #3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileCheck2 size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Badge variant="neutral">EXPIRING CONTRACT</Badge>
                    <span style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Embassy GolfLinks AMC Agreement Expiring in 14 Days
                    </span>
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Annual agreement for 42 AC assets eligible for single-click renewal with +5% indexed rate.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('amc')}
                className="pys-btn-secondary"
                style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              >
                Review Renewal Quote →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
