import React, { useState } from 'react';
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  FileCheck2,
  HardHat,
  Download,
  AlertTriangle,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useToast } from '@/components/ui/useToast';

interface MonthlyVelocity {
  month: string;
  breakdowns: number;
  preventive: number;
  revenue: number;
}

const MONTHLY_DATA: MonthlyVelocity[] = [
  { month: 'Jan', breakdowns: 18, preventive: 42, revenue: 24500 },
  { month: 'Feb', breakdowns: 15, preventive: 48, revenue: 26200 },
  { month: 'Mar', breakdowns: 22, preventive: 56, revenue: 31000 },
  { month: 'Apr', breakdowns: 28, preventive: 64, revenue: 38400 },
  { month: 'May', breakdowns: 32, preventive: 70, revenue: 42100 },
  { month: 'Jun', breakdowns: 35, preventive: 68, revenue: 41600 },
  { month: 'Jul', breakdowns: 30, preventive: 74, revenue: 44000 },
  { month: 'Aug', breakdowns: 26, preventive: 72, revenue: 43500 },
  { month: 'Sep', breakdowns: 21, preventive: 65, revenue: 39200 },
  { month: 'Oct', breakdowns: 19, preventive: 82, revenue: 48250 },
];

interface TechLeader {
  id: string;
  name: string;
  avatar: string;
  completedJobs: number;
  firstTimeFixRate: number;
  avgResolutionHours: number;
  satisfactionRating: number;
  compositeScore: number;
}

const TECHNICIANS: TechLeader[] = [
  {
    id: 't1',
    name: 'Rajesh Sharma',
    avatar: 'RS',
    completedJobs: 46,
    firstTimeFixRate: 95.6,
    avgResolutionHours: 2.8,
    satisfactionRating: 4.9,
    compositeScore: 96.2,
  },
  {
    id: 't2',
    name: 'Amit Patel',
    avatar: 'AP',
    completedJobs: 42,
    firstTimeFixRate: 92.8,
    avgResolutionHours: 3.1,
    satisfactionRating: 4.8,
    compositeScore: 92.4,
  },
  {
    id: 't3',
    name: 'Vikas Kumar',
    avatar: 'VK',
    completedJobs: 38,
    firstTimeFixRate: 89.5,
    avgResolutionHours: 3.5,
    satisfactionRating: 4.7,
    compositeScore: 88.7,
  },
  {
    id: 't4',
    name: 'Suresh Raina',
    avatar: 'SR',
    completedJobs: 35,
    firstTimeFixRate: 87.0,
    avgResolutionHours: 3.9,
    satisfactionRating: 4.6,
    compositeScore: 85.1,
  },
];

interface OverallAnalyticsProps {
  onNavigate?: (item: string) => void;
}

export const OverallAnalytics: React.FC<OverallAnalyticsProps> = ({ onNavigate: _onNavigate }) => {
  const { showToast } = useToast();
  const [timeRange, setTimeRange] = useState<string>('30D');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('Oct');

  const maxRevenue = 50000;
  const currentMonthData = MONTHLY_DATA.find((m) => m.month === selectedMonth) || MONTHLY_DATA[MONTHLY_DATA.length - 1];

  const handleExport = (format: 'PDF' | 'CSV') => {
    showToast({
      title: `Exporting Analytics Report`,
      message: `Generated comprehensive ${format} operational intelligence report for ${timeRange}.`,
      type: 'success',
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* --------------------------------------------------
       * 1. Header & Global Filtering Controls
       * -------------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            <Sparkles size={14} style={{ color: '#a8481c' }} />
            <span>Platform Telemetry & Business Intelligence</span>
          </div>
          <h1 style={{ margin: '4px 0 0', fontSize: '2.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Overall Operational Analytics
          </h1>
        </div>

        {/* Time Range & Export Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Time Range Pills */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(20, 36, 28, 0.05)',
              borderRadius: '9999px',
              padding: '3px',
            }}
          >
            {['7D', '30D', '90D', '1Y'].map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                style={{
                  border: 'none',
                  background: timeRange === range ? 'var(--bg-surface)' : 'transparent',
                  color: timeRange === range ? 'var(--text-primary)' : 'var(--text-muted)',
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  boxShadow: timeRange === range ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.18s ease',
                }}
              >
                {range}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleExport('CSV')}
            className="pys-btn-secondary"
            style={{ padding: '8px 16px', fontSize: '0.84rem' }}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Domain Category Filter Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'All Operations' },
          { id: 'financials', label: 'Financials & AMC' },
          { id: 'reliability', label: 'Asset Reliability' },
          { id: 'technicians', label: 'Technician SLA' },
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`pys-pill-tab ${activeCategory === cat.id ? 'active' : ''}`}
            style={{
              padding: '6px 16px',
              width: 'auto',
              borderRadius: '9999px',
              border: '1px solid var(--border-card-hairline)',
              display: 'inline-flex',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* --------------------------------------------------
       * 2. Top Executive KPI Cards Row (26px Geometry & Watermark Arcs)
       * -------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
        {/* Card 1: MTTR */}
        <div className="pys-card-26" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <svg className="pys-watermark-arcs" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <circle cx="100" cy="100" r="40" stroke="currentColor" strokeWidth="6" opacity="0.12" />
            <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="6" opacity="0.08" />
            <circle cx="100" cy="100" r="95" stroke="currentColor" strokeWidth="6" opacity="0.04" />
          </svg>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 1 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>Mean Time to Resolution</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', zIndex: 1, marginTop: '-4px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>3.4h</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '9999px' }}>
              ↘ 18% vs Target
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', zIndex: 1 }}>
            SLA Threshold: <strong>4.0h</strong> · 96.4% Compliance
          </div>
        </div>

        {/* Card 2: First-Time Fix Rate */}
        <div className="pys-card-26" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <svg className="pys-watermark-arcs" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <circle cx="100" cy="100" r="40" stroke="currentColor" strokeWidth="6" opacity="0.12" />
            <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="6" opacity="0.08" />
            <circle cx="100" cy="100" r="95" stroke="currentColor" strokeWidth="6" opacity="0.04" />
          </svg>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 1 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>First-Time Fix Rate</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(14, 165, 233, 0.12)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', zIndex: 1, marginTop: '-4px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>91.8%</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '9999px' }}>
              ↗ 4.2%
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', zIndex: 1 }}>
            <strong>142 of 155</strong> service jobs resolved on 1st visit
          </div>
        </div>

        {/* Card 3: AMC Contract Retention & Value */}
        <div className="pys-card-26" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <svg className="pys-watermark-arcs" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <circle cx="100" cy="100" r="40" stroke="currentColor" strokeWidth="6" opacity="0.12" />
            <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="6" opacity="0.08" />
            <circle cx="100" cy="100" r="95" stroke="currentColor" strokeWidth="6" opacity="0.04" />
          </svg>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 1 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>AMC Contract Retention</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(168, 72, 28, 0.12)', color: '#a8481c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileCheck2 size={18} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', zIndex: 1, marginTop: '-4px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>$48,250</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '9999px' }}>
              94.6% Renewal
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', zIndex: 1 }}>
            <strong>38 active contracts</strong> · 2 renewals pending
          </div>
        </div>

        {/* Card 4: Workforce Utilization */}
        <div className="pys-card-26" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <svg className="pys-watermark-arcs" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <circle cx="100" cy="100" r="40" stroke="currentColor" strokeWidth="6" opacity="0.12" />
            <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="6" opacity="0.08" />
            <circle cx="100" cy="100" r="95" stroke="currentColor" strokeWidth="6" opacity="0.04" />
          </svg>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 1 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>Workforce Shift Load</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(234, 179, 8, 0.12)', color: '#ca8a04', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HardHat size={18} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', zIndex: 1, marginTop: '-4px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>84.5%</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.1)', padding: '2px 8px', borderRadius: '9999px' }}>
              Balanced
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', zIndex: 1 }}>
            <strong>12 of 14 technicians</strong> actively dispatched
          </div>
        </div>
      </div>

      {/* --------------------------------------------------
       * 3. Main Multi-Series Service Velocity & Revenue Bar Chart
       * -------------------------------------------------- */}
      <div className="pys-card-26" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Service Volume & Revenue Velocity
            </h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Algorithmic monthly correlation between Breakdown emergencies, PM visits, and revenue
            </div>
          </div>

          {/* Legend Items */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.84rem', fontWeight: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#c25e2e' }} />
              <span style={{ color: 'var(--text-muted)' }}>Breakdown Repairs</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
              <span style={{ color: 'var(--text-muted)' }}>PM Visits</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
              <span style={{ color: 'var(--text-muted)' }}>Revenue ($)</span>
            </div>
          </div>
        </div>

        {/* Stem Chart Canvas */}
        <div style={{ position: 'relative', height: '240px', width: '100%', marginTop: '12px' }}>
          {['$50k', '$40k', '$30k', '$20k', '$10k', '$0'].map((label, idx) => {
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
                <span style={{ width: '36px', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)', textAlign: 'right' }}>
                  {label}
                </span>
                <div style={{ flex: 1, height: '1px', borderTop: '1px dashed var(--border-card-hairline, rgba(20, 36, 28, 0.08))' }} />
              </div>
            );
          })}

          {/* Tooltip Card over Selected Month */}
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
              minWidth: '160px',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {currentMonthData.month} Analytics
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Breakdowns</span>
              <strong style={{ color: '#c25e2e' }}>{currentMonthData.breakdowns} jobs</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>PM Visits</span>
              <strong style={{ color: '#10b981' }}>{currentMonthData.preventive} visits</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Revenue</span>
              <strong style={{ color: '#2563eb' }}>${currentMonthData.revenue.toLocaleString()}</strong>
            </div>
          </div>

          {/* Stems */}
          <div
            style={{
              position: 'absolute',
              left: '46px',
              right: '12px',
              bottom: '24px',
              top: '8px',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            {MONTHLY_DATA.map((item) => {
              const isOct = item.month === 'Oct';
              const isSelected = item.month === selectedMonth;

              const breakH = Math.max(10, (item.breakdowns / 50) * 120);
              const pmH = Math.max(14, (item.preventive / 100) * 160);
              const revH = Math.max(20, (item.revenue / maxRevenue) * 190);

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
                        height: `${revH}px`,
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
      </div>

      {/* --------------------------------------------------
       * 4. Dual Grid: Equipment Reliability & Technician Leaderboard
       * -------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Left: AC Equipment & Refrigerant Reliability */}
        <div className="pys-card-26" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Equipment Reliability & Technology Breakdown
            </h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Hazard curve analysis across compressor technology and refrigerants
            </div>
          </div>

          {/* Compressor Tech Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600 }}>Inverter Technology (Variable Speed)</span>
                <span style={{ fontWeight: 700, color: '#10b981' }}>98.2% Uptime</span>
              </div>
              <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'rgba(20, 36, 28, 0.08)', overflow: 'hidden' }}>
                <div style={{ width: '98.2%', height: '100%', backgroundColor: '#10b981' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600 }}>Fixed Speed (Conventional Scroll/Recip)</span>
                <span style={{ fontWeight: 700, color: '#ca8a04' }}>91.4% Uptime</span>
              </div>
              <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'rgba(20, 36, 28, 0.08)', overflow: 'hidden' }}>
                <div style={{ width: '91.4%', height: '100%', backgroundColor: '#ca8a04' }} />
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-card-hairline)', paddingTop: '12px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Refrigerant Leak Incident Rate
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span>R32 (Eco Inverter)</span>
                <span style={{ fontWeight: 700, color: '#10b981' }}>2.1% incident rate</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span>R410A (Commercial VRF / Ductable)</span>
                <span style={{ fontWeight: 700, color: '#0284c7' }}>3.8% incident rate</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span>R22 (Legacy R-22 Units)</span>
                <span style={{ fontWeight: 700, color: '#dc2626' }}>8.4% incident rate (High Risk)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Technician Productivity & SLA Ranking */}
        <div className="pys-card-26" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Technician Workforce Productivity Leaderboard
            </h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Ranked via weighted composite score (Jobs, Resolution Speed, Fix Rate, Feedback)
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {TECHNICIANS.map((tech, rank) => (
              <div
                key={tech.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '16px',
                  backgroundColor: 'rgba(20, 36, 28, 0.03)',
                  border: '1px solid var(--border-card-hairline)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor: rank === 0 ? 'rgba(168, 72, 28, 0.15)' : 'rgba(20, 36, 28, 0.08)',
                      color: rank === 0 ? '#a8481c' : 'var(--text-primary)',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {tech.avatar}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {tech.name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {tech.completedJobs} jobs · {tech.avgResolutionHours}h avg MTTR
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#10b981' }}>
                    {tech.firstTimeFixRate}%
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    ★ {tech.satisfactionRating} / 5.0
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------
       * 5. Algorithmic Predictive Maintenance Early Warnings
       * -------------------------------------------------- */}
      <div
        className="pys-card-26"
        style={{
          padding: '24px',
          background: 'linear-gradient(135deg, rgba(168, 72, 28, 0.06) 0%, rgba(20, 184, 166, 0.06) 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '12px', backgroundColor: 'rgba(168, 72, 28, 0.15)', color: '#a8481c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={18} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Algorithmic Predictive Maintenance Early Warning
            </h4>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Continuous sensor heuristic & seasonal load failure forecasting
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          <div style={{ padding: '12px 16px', borderRadius: '14px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-card-hairline)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d97706', fontWeight: 700, fontSize: '0.85rem' }}>
              <AlertTriangle size={14} />
              <span>Commercial Zone East: 8 High-Tonnage Units</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              8 ductable split units have exceeded 1,800 operating hours since last condenser chemical wash. High risk of thermal trip during upcoming heatwave.
            </p>
          </div>

          <div style={{ padding: '12px 16px', borderRadius: '14px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-card-hairline)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 700, fontSize: '0.85rem' }}>
              <TrendingUp size={14} />
              <span>AMC Preventive Renewal Optimization</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              14 corporate accounts are primed for multi-year AMC bundle upgrade, yielding a projected <strong>+$14,800 annual recurring revenue</strong> increase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
