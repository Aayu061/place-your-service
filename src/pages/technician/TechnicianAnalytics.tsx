import { useState, useEffect } from 'react';
import {
  BarChart2,
  CheckCircle2,
  Clock,
  Wrench,
  ShieldCheck,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  FileCheck,
} from 'lucide-react';
import { technicianApi, TechDailyAnalytics } from '@/services/technicianApi';
import { getApiErrorMessage } from '@/services/api/client';

export function TechnicianAnalytics() {
  const [analytics, setAnalytics] = useState<TechDailyAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await technicianApi.getAnalytics();
      setAnalytics(data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to load daily analytics.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Header */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
          boxShadow: 'var(--shadow-xs)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 'var(--text-base)',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Field Work Analytics
          </h2>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
            Daily completion velocity &amp; 7-day performance
          </p>
        </div>

        <button
          type="button"
          onClick={fetchAnalytics}
          title="Refresh Analytics"
          style={{
            padding: '8px',
            backgroundColor: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error state */}
      {error && !isLoading && (
        <div
          style={{
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-error-bg)',
            border: '1px solid var(--color-error-border)',
            color: 'var(--color-error-text)',
            fontSize: 'var(--text-xs)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: '110px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                animation: 'pulse 1.5s infinite',
              }}
            />
          ))}
        </div>
      )}

      {!isLoading && analytics && (
        <>
          {/* Today's Completion Velocity */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
              boxShadow: 'var(--shadow-xs)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} color="var(--color-brand)" />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Today's Execution Progress
                </span>
              </div>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 800,
                  color: 'var(--color-brand)',
                }}
              >
                {analytics.today.completionRatePercent}% Done
              </span>
            </div>

            {/* Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '10px',
                backgroundColor: 'var(--bg-surface-subtle)',
                borderRadius: '999px',
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, analytics.today.completionRatePercent))}%`,
                  height: '100%',
                  backgroundColor: 'var(--color-brand)',
                  borderRadius: '999px',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>

            {/* 4 Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '4px' }}>
              <div style={{ textAlign: 'center', padding: '8px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Assigned</span>
                <p style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '2px 0 0 0', color: 'var(--text-primary)' }}>
                  {analytics.today.totalAssigned}
                </p>
              </div>

              <div style={{ textAlign: 'center', padding: '8px', backgroundColor: 'rgba(34, 197, 94, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                <span style={{ fontSize: '10px', color: '#16a34a', textTransform: 'uppercase', fontWeight: 600 }}>Done</span>
                <p style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '2px 0 0 0', color: '#16a34a' }}>
                  {analytics.today.completed}
                </p>
              </div>

              <div style={{ textAlign: 'center', padding: '8px', backgroundColor: 'rgba(37, 99, 235, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
                <span style={{ fontSize: '10px', color: '#2563eb', textTransform: 'uppercase', fontWeight: 600 }}>Active</span>
                <p style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '2px 0 0 0', color: '#2563eb' }}>
                  {analytics.today.inProgress}
                </p>
              </div>

              <div style={{ textAlign: 'center', padding: '8px', backgroundColor: 'rgba(245, 158, 11, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                <span style={{ fontSize: '10px', color: '#b45309', textTransform: 'uppercase', fontWeight: 600 }}>Left</span>
                <p style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '2px 0 0 0', color: '#b45309' }}>
                  {analytics.today.pending}
                </p>
              </div>
            </div>
          </div>

          {/* Quality & Efficiency Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <Clock size={14} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Avg Visit Duration</span>
              </div>
              <p style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 0 0' }}>
                {analytics.weekly.avgDurationMinutes} <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>mins</span>
              </p>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Based on start/end timestamps</span>
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <FileCheck size={14} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Customer Sign-Off</span>
              </div>
              <p style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: '#16a34a', margin: '4px 0 0 0' }}>
                {analytics.weekly.customerSignOffRatePercent}%
              </p>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Signed digital reports</span>
            </div>
          </div>

          {/* Weekly Work Classification Split (AMC vs Breakdown) */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
              boxShadow: 'var(--shadow-xs)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} color="var(--color-brand)" />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                Weekly Work Classification (7 Days)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9333ea', fontSize: '11px', fontWeight: 700 }}>
                  <ShieldCheck size={14} />
                  <span>AMC Preventive</span>
                </div>
                <p style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: '#9333ea', margin: '6px 0 0 0' }}>
                  {analytics.weekly.amcCompleted}
                </p>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Scheduled PM inspections</span>
              </div>

              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '11px', fontWeight: 700 }}>
                  <Wrench size={14} />
                  <span>Breakdown Calls</span>
                </div>
                <p style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: '#dc2626', margin: '6px 0 0 0' }}>
                  {analytics.weekly.breakdownCompleted}
                </p>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Emergency repair requests</span>
              </div>
            </div>
          </div>

          {/* 7-Day Rolling Trend Bars */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
              boxShadow: 'var(--shadow-xs)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart2 size={16} color="var(--color-brand)" />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  7-Day Completed Visits Trend
                </span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Total: {analytics.weekly.totalCompleted} visits
              </span>
            </div>

            {/* Daily Bars Visualizer */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '6px',
                alignItems: 'flex-end',
                height: '110px',
                paddingTop: '16px',
              }}
            >
              {analytics.dailyTrend.map((day) => {
                const maxVal = Math.max(1, ...analytics.dailyTrend.map((d) => d.totalCompleted));
                const heightPercent = Math.max(12, Math.round((day.totalCompleted / maxVal) * 100));

                return (
                  <div
                    key={day.date}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {day.totalCompleted}
                    </span>

                    <div
                      style={{
                        width: '100%',
                        height: `${heightPercent}%`,
                        backgroundColor: day.totalCompleted > 0 ? 'var(--color-brand)' : 'var(--bg-surface-subtle)',
                        borderRadius: '4px 4px 0 0',
                        border: '1px solid var(--border-default)',
                        transition: 'height 0.3s ease',
                      }}
                      title={`${day.date}: ${day.totalCompleted} jobs (${day.amcCount} AMC, ${day.breakdownCount} Breakdown)`}
                    />

                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {day.dayName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

