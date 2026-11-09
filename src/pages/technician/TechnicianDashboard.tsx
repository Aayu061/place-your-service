import { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  Airplay,
  CheckCircle2,
  AlertCircle,
  FileText,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import { technicianApi, TechJob } from '@/services/technicianApi';

export interface TechnicianDashboardProps {
  onStartReport: (scheduleId: string) => void;
  filterTab?: 'jobs' | 'completed';
}

export function TechnicianDashboard({ onStartReport, filterTab = 'jobs' }: TechnicianDashboardProps) {
  const [jobs, setJobs] = useState<TechJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const loadJobs = async (dateStr: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await technicianApi.getJobs(dateStr);
      setJobs(data);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to load dispatch queue.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadJobs(selectedDate);
  }, [selectedDate]);

  const completedCount = jobs.filter((j) => j.status === 'COMPLETED').length;
  const pendingCount = jobs.length - completedCount;
  const displayedJobs = filterTab === 'completed'
    ? jobs.filter((j) => j.status === 'COMPLETED')
    : jobs;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Header Greeting & Metrics */}
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
          <div>
            <h2
              style={{
                fontSize: 'var(--text-base)',
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Today's Field Dispatch
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Assigned visits for {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadJobs(selectedDate)}
            title="Refresh Queue"
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

        {/* Quick KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>
              Assigned
            </span>
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0 0 0' }}>
              {jobs.length}
            </p>
          </div>
          <div
            style={{
              padding: '10px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-success-bg, rgba(34, 197, 94, 0.1))',
              border: '1px solid var(--color-success-border, rgba(34, 197, 94, 0.2))',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-success-text, #16a34a)' }}>
              Done
            </span>
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--color-success-text, #16a34a)', margin: '2px 0 0 0' }}>
              {completedCount}
            </p>
          </div>
          <div
            style={{
              padding: '10px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-warning-bg, rgba(245, 158, 11, 0.1))',
              border: '1px solid var(--color-warning-border, rgba(245, 158, 11, 0.2))',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-warning-text, #d97706)' }}>
              Pending
            </span>
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--color-warning-text, #d97706)', margin: '2px 0 0 0' }}>
              {pendingCount}
            </p>
          </div>
        </div>
      </div>

      {/* Date Picker Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>
          Appointments ({jobs.length})
        </span>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{
            padding: '6px 10px',
            fontSize: 'var(--text-xs)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontWeight: 600,
            outline: 'none',
          }}
        />
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-error-bg)',
            border: '1px solid var(--color-error-border)',
            color: 'var(--color-error-text)',
            fontSize: 'var(--text-xs)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: '140px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                opacity: 0.6,
              }}
            />
          ))}
        </div>
      )}

      {/* Empty Queue State */}
      {!isLoading && displayedJobs.length === 0 && (
        <div
          style={{
            padding: 'var(--space-8)',
            textAlign: 'center',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <Calendar size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {filterTab === 'completed' ? 'No Completed Jobs' : 'No Jobs Assigned'}
            </h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {filterTab === 'completed'
                ? 'You have not submitted service reports for any jobs on this date.'
                : 'You have no scheduled visits allocated for this date. Check with dispatch or take a well-deserved rest.'}
            </p>
          </div>
        </div>
      )}

      {/* Job Cards */}
      {!isLoading && displayedJobs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {displayedJobs.map((job) => {
            const isCompleted = job.status === 'COMPLETED';
            const customerPhone = job.customers?.phone;
            const fullAddress = [
              job.sites?.site_name,
              job.sites?.address,
              job.sites?.city,
              job.sites?.landmark,
            ].filter(Boolean).join(', ');

            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              `${job.sites?.address || ''} ${job.sites?.city || ''} ${job.sites?.pincode || ''}`
            )}`;

            return (
              <div
                key={job.id}
                style={{
                  borderRadius: 'var(--radius-lg)',
                  border: isCompleted
                    ? '1px solid rgba(34, 197, 94, 0.3)'
                    : '1px solid var(--border-default)',
                  backgroundColor: 'var(--bg-surface)',
                  padding: 'var(--space-4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                {/* Card Top: Schedule Number & Status */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {job.schedule_number}
                    </span>
                    {job.amc_id ? (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '10px',
                          fontWeight: 700,
                          backgroundColor: 'rgba(168, 85, 247, 0.1)',
                          color: '#9333ea',
                          border: '1px solid rgba(168, 85, 247, 0.2)',
                        }}
                      >
                        AMC Preventive
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '10px',
                          fontWeight: 700,
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          color: '#2563eb',
                          border: '1px solid rgba(59, 130, 246, 0.2)',
                        }}
                      >
                        Service Call
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Clock size={13} />
                    <span>{job.start_time || '10:00'} - {job.end_time || '12:00'}</span>
                  </div>
                </div>

                {/* Customer & Site Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {job.customers?.name || 'Customer Name'}
                  </h4>

                  {/* Site Address */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    <MapPin size={14} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-brand)' }} />
                    <span style={{ lineHeight: 1.4 }}>{fullAddress || 'Address on file'}</span>
                  </div>

                  {/* AC Asset Preview */}
                  {job.ac_assets && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                        marginTop: '4px',
                      }}
                    >
                      <Airplay size={14} style={{ color: 'var(--text-muted)' }} />
                      <span>
                        {job.ac_assets.brand} {job.ac_assets.model_number || ''}
                        {job.ac_assets.room_location ? ` (${job.ac_assets.room_location})` : ''}
                      </span>
                      {job.ac_assets.tonnage ? (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>· {job.ac_assets.tonnage}T</span>
                      ) : null}
                    </div>
                  )}

                  {/* Planned Service Type / Notes */}
                  {job.planned_service_type && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                      Planned: {job.planned_service_type}
                    </div>
                  )}
                </div>

                {/* Quick Action Bar: Call, Maps & Report Button */}
                <div
                  style={{
                    paddingTop: 'var(--space-3)',
                    borderTop: '1px solid var(--border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {/* Phone Call Button */}
                  {customerPhone && (
                    <a
                      href={`tel:${customerPhone}`}
                      title="Call Customer"
                      style={{
                        padding: '10px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-surface-subtle)',
                        border: '1px solid var(--border-default)',
                        color: '#16a34a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textDecoration: 'none',
                      }}
                    >
                      <Phone size={16} />
                    </a>
                  )}

                  {/* Google Maps Button */}
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in Google Maps"
                    style={{
                      padding: '10px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-default)',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textDecoration: 'none',
                    }}
                  >
                    <Navigation size={16} />
                  </a>

                  {/* Main Action: Fill Report or Completed Badge */}
                  {isCompleted ? (
                    <div
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-success-bg, rgba(34, 197, 94, 0.1))',
                        border: '1px solid var(--color-success-border, rgba(34, 197, 94, 0.2))',
                        color: 'var(--color-success-text, #16a34a)',
                        fontWeight: 700,
                        fontSize: 'var(--text-xs)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <CheckCircle2 size={16} />
                      <span>Service Completed</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartReport(job.id)}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-brand)',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: 'var(--text-xs)',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: 'var(--shadow-xs)',
                      }}
                    >
                      <FileText size={16} />
                      <span>Start &amp; Fill Report</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
