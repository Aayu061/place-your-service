import { useState, useEffect, useCallback } from 'react';
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
  Car,
  MessageSquare,
} from 'lucide-react';
import { technicianApi, TechJob } from '@/services/technicianApi';
import { getApiErrorMessage } from '@/services/api/client';
import { getBreakdownCategoryLabel, getPlannedServiceTypeLabel } from '@/domain/breakdownTypes';
import { getIstTodayIso } from '@/utils/date';

export interface TechnicianDashboardProps {
  onStartReport: (scheduleId: string) => void;
  filterTab?: 'jobs' | 'completed';
}

export function TechnicianDashboard({ onStartReport, filterTab = 'jobs' }: TechnicianDashboardProps) {
  const [jobs, setJobs] = useState<TechJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);
  const [includeOverdue, setIncludeOverdue] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string>(
    getIstTodayIso()
  );

  const loadJobs = useCallback(async (dateStr: string, withOverdue: boolean) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await technicianApi.getJobs(withOverdue ? undefined : dateStr, withOverdue);
      setJobs(data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to load dispatch queue.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs(selectedDate, includeOverdue);
  }, [loadJobs, selectedDate, includeOverdue]);

  const handleUpdateStatus = async (scheduleId: string, newStatus: string) => {
    try {
      setActionError(null);
      setUpdatingJobId(scheduleId);
      await technicianApi.updateJobStatus(scheduleId, newStatus);
      setJobs((prev) =>
        prev.map((j) => (j.id === scheduleId ? { ...j, status: newStatus } : j))
      );
    } catch (err: unknown) {
      setActionError(getApiErrorMessage(err, 'Failed to update job status.'));
    } finally {
      setUpdatingJobId(null);
    }
  };

  const completedCount = jobs.filter((j) => j.status === 'COMPLETED').length;
  const inProgressCount = jobs.filter((j) => j.status === 'IN_PROGRESS' || j.status === 'EN_ROUTE').length;
  const displayedJobs = filterTab === 'completed'
    ? jobs.filter((j) => j.status === 'COMPLETED')
    : jobs;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return { label: 'Completed', bg: 'rgba(34, 197, 94, 0.12)', text: '#16a34a', border: 'rgba(34, 197, 94, 0.25)' };
      case 'IN_PROGRESS':
        return { label: 'Working On-Site', bg: 'rgba(245, 158, 11, 0.15)', text: '#b45309', border: 'rgba(245, 158, 11, 0.3)' };
      case 'EN_ROUTE':
        return { label: 'On The Way', bg: 'rgba(37, 99, 235, 0.12)', text: '#2563eb', border: 'rgba(37, 99, 235, 0.25)' };
      default:
        return { label: 'Scheduled', bg: 'rgba(100, 116, 139, 0.12)', text: '#64748b', border: 'rgba(100, 116, 139, 0.25)' };
    }
  };

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
            onClick={() => loadJobs(selectedDate, includeOverdue)}
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
              backgroundColor: inProgressCount > 0 ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-surface-subtle)',
              border: inProgressCount > 0 ? '1px solid rgba(37, 99, 235, 0.25)' : '1px solid var(--border-default)',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: inProgressCount > 0 ? '#2563eb' : 'var(--text-muted)' }}>
              In Progress
            </span>
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: inProgressCount > 0 ? '#2563eb' : 'var(--text-primary)', margin: '2px 0 0 0' }}>
              {inProgressCount}
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
        </div>
      </div>

      {/* Date Picker & Overdue Backlog Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', padding: '0 4px' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>
          Appointments ({displayedJobs.length})
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setIncludeOverdue((prev) => !prev)}
            style={{
              padding: '5px 10px',
              borderRadius: 'var(--radius-md)',
              border: includeOverdue ? '1px solid var(--color-brand)' : '1px solid var(--border-default)',
              backgroundColor: includeOverdue ? 'var(--color-brand-soft)' : 'var(--bg-surface)',
              color: includeOverdue ? 'var(--color-brand)' : 'var(--text-secondary)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {includeOverdue ? 'Showing Overdue Backlog' : 'Include Overdue'}
          </button>
          {!includeOverdue && (
            <label
              htmlFor="dispatch-date-input"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              <Calendar size={13} style={{ color: 'var(--color-brand)' }} />
              <input
                id="dispatch-date-input"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  outline: 'none',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              />
            </label>
          )}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-error-bg)',
            border: '1px solid var(--color-error-border)',
            color: 'var(--color-error-text)',
            fontSize: 'var(--text-xs)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={15} />
            {actionError}
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 700, cursor: 'pointer' }}
          >
            Dismiss
          </button>
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
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                animation: 'pulse 1.5s infinite',
              }}
            />
          ))}
        </div>
      )}

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

      {/* Empty State */}
      {!isLoading && !error && displayedJobs.length === 0 && (
        <div
          style={{
            padding: 'var(--space-8)',
            textAlign: 'center',
            backgroundColor: 'var(--bg-surface)',
            border: '1px dashed var(--border-default)',
            borderRadius: 'var(--radius-lg)',
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
            const isUpdating = updatingJobId === job.id;
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

            const badge = getStatusBadge(job.status);

            return (
              <div
                key={job.id}
                style={{
                  borderRadius: 'var(--radius-lg)',
                  border: isCompleted
                    ? '1px solid rgba(34, 197, 94, 0.3)'
                    : job.status === 'IN_PROGRESS'
                    ? '1px solid rgba(245, 158, 11, 0.4)'
                    : '1px solid var(--border-default)',
                  backgroundColor: 'var(--bg-surface)',
                  padding: 'var(--space-4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                {/* Card Top: Schedule Number, Category & Status Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          color: '#dc2626',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                        }}
                      >
                        Breakdown Call
                      </span>
                    )}

                    {job.service_requests?.issue_category && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '10px',
                          fontWeight: 700,
                          backgroundColor: 'rgba(217, 119, 6, 0.1)',
                          color: '#b45309',
                          border: '1px solid rgba(217, 119, 6, 0.2)',
                        }}
                      >
                        {getBreakdownCategoryLabel(job.service_requests.issue_category)}
                      </span>
                    )}
                  </div>

                  {/* Status Badge */}
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '10px',
                      fontWeight: 700,
                      backgroundColor: badge.bg,
                      color: badge.text,
                      border: `1px solid ${badge.border}`,
                    }}
                  >
                    {badge.label}
                  </span>
                </div>

                {/* Appointment Timing */}
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
                  <span>
                    {job.start_time && job.end_time
                      ? `${job.start_time.slice(0, 5)} - ${job.end_time.slice(0, 5)}`
                      : 'Schedule time TBD'}
                  </span>
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

                  {/* Breakdown Complaint Summary */}
                  {job.service_requests?.description && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#92400e',
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        marginTop: '4px',
                      }}
                    >
                      <strong>Customer Complaint:</strong> {job.service_requests.description}
                    </div>
                  )}

                  {/* Planned Service Type */}
                  {job.planned_service_type && (
                    <div style={{ fontSize: '11px', color: 'var(--color-primary-700)', fontWeight: 600, marginTop: '2px' }}>
                      📋 Planned Scope: {getPlannedServiceTypeLabel(job.planned_service_type)}
                    </div>
                  )}

                  {/* Lifecycle Progression Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '6px 10px',
                      fontSize: '10px',
                      fontWeight: 600,
                      marginTop: '6px',
                    }}
                  >
                    {[
                      { key: 'ASSIGNED', label: '1. Assigned' },
                      { key: 'EN_ROUTE', label: '2. En Route' },
                      { key: 'IN_PROGRESS', label: '3. In Servicing' },
                      { key: 'COMPLETED', label: '4. Done' },
                    ].map((step, idx) => {
                      const isCurrent = job.status === step.key;
                      const isPast =
                        (job.status === 'EN_ROUTE' && idx === 0) ||
                        (job.status === 'IN_PROGRESS' && idx <= 1) ||
                        (job.status === 'COMPLETED' && idx <= 3);

                      return (
                        <div
                          key={step.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            color: isCurrent ? 'var(--color-brand)' : isPast ? '#16a34a' : 'var(--text-muted)',
                            fontWeight: isCurrent ? 700 : isPast ? 600 : 500,
                          }}
                        >
                          <span>{step.label}</span>
                          {idx < 3 && <span style={{ color: 'var(--border-default)', margin: '0 2px' }}>›</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Action Bar: Call, WhatsApp, Maps & Progressive Action Button */}
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
                        minWidth: '40px',
                      }}
                    >
                      <Phone size={16} />
                    </a>
                  )}

                  {/* 1-Tap Customer WhatsApp Alert */}
                  {customerPhone && (
                    <a
                      href={`https://wa.me/${(customerPhone.replace(/\D/g, '').length === 10 ? '91' : '') + customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                        job.status === 'EN_ROUTE'
                          ? `Hello ${job.customers?.name || 'Customer'},\nI have arrived at your site for scheduled appointment (${job.schedule_number}). Please let me know how to proceed to the AC unit.\n— ${technicianApi.getStoredTech()?.name || 'Technician'}, Place Your Service`
                          : `Hello ${job.customers?.name || 'Customer'},\nThis is ${technicianApi.getStoredTech()?.name || 'Your technician'} from Place Your Service. I am on the way to your premises for service visit ${job.schedule_number}. Estimated arrival in ~30 mins.\nContact: ${technicianApi.getStoredTech()?.phone || '7977805245'}.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={job.status === 'EN_ROUTE' ? "Send 'Arrived on Site' WhatsApp" : "Send 'On the Way' WhatsApp"}
                      style={{
                        padding: '10px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'rgba(34, 197, 94, 0.08)',
                        border: '1px solid rgba(34, 197, 94, 0.25)',
                        color: '#16a34a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textDecoration: 'none',
                        minWidth: '40px',
                      }}
                    >
                      <MessageSquare size={16} />
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
                      minWidth: '40px',
                    }}
                  >
                    <Navigation size={16} />
                  </a>

                  {/* Main Action: Progressive Status Action or Completed Badge */}
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
                    <div style={{ display: 'flex', flex: 1, gap: '6px' }}>
                      {/* Progressive quick button for status advancement */}
                      {job.status === 'EN_ROUTE' ? (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(job.id, 'IN_PROGRESS')}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: '#2563eb',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: 'var(--text-xs)',
                            border: 'none',
                            cursor: isUpdating ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <MapPin size={15} />
                          <span>{isUpdating ? '...' : 'Arrived On-Site'}</span>
                        </button>
                      ) : (job.status === 'SCHEDULED' || job.status === 'ASSIGNED') ? (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(job.id, 'EN_ROUTE')}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: 'var(--bg-surface-subtle)',
                            border: '1px solid var(--border-default)',
                            color: 'var(--text-primary)',
                            fontWeight: 700,
                            fontSize: 'var(--text-xs)',
                            cursor: isUpdating ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Car size={15} />
                          <span>{isUpdating ? '...' : 'On My Way'}</span>
                        </button>
                      ) : null}

                      {/* Main action: Start & Fill Report button */}
                      <button
                        type="button"
                        onClick={() => onStartReport(job.id)}
                        style={{
                          flex: 1,
                          padding: '10px 14px',
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
                          gap: '6px',
                          boxShadow: 'var(--shadow-xs)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <FileText size={16} />
                        <span>Start &amp; Fill Report</span>
                      </button>
                    </div>
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
