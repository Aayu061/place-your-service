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
    <div className="space-y-4">
      {/* Header Greeting & Metrics */}
      <div className="bg-surface-raised border border-brand-border rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-brand-primary">
              Today's Field Dispatch
            </h2>
            <p className="text-xs text-brand-secondary">
              Assigned visits for {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadJobs(selectedDate)}
            title="Refresh Queue"
            className="p-2 text-brand-secondary hover:text-brand-primary hover:bg-surface-subtle rounded-xl border border-brand-border transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="p-2.5 rounded-xl bg-surface-sunken border border-brand-border text-center">
            <span className="text-[10px] uppercase font-bold text-brand-secondary">Assigned</span>
            <p className="text-lg font-extrabold text-brand-primary">{jobs.length}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
            <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Done</span>
            <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{completedCount}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
            <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Pending</span>
            <p className="text-lg font-extrabold text-amber-600 dark:text-amber-400">{pendingCount}</p>
          </div>
        </div>
      </div>

      {/* Date Picker Bar */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-brand-primary tracking-wide">
          Appointments ({jobs.length})
        </span>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-2.5 py-1 text-xs bg-surface-raised border border-brand-border rounded-lg text-brand-primary font-medium focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
        />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-2xl bg-surface-raised border border-brand-border animate-pulse p-4 space-y-2">
              <div className="h-4 bg-brand-border/40 rounded w-1/3" />
              <div className="h-3 bg-brand-border/30 rounded w-2/3" />
              <div className="h-3 bg-brand-border/20 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty Queue State */}
      {!isLoading && displayedJobs.length === 0 && (
        <div className="p-8 text-center rounded-2xl bg-surface-raised border border-brand-border space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-surface-subtle flex items-center justify-center text-brand-secondary border border-brand-border">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-brand-primary">
              {filterTab === 'completed' ? 'No Completed Jobs' : 'No Jobs Assigned'}
            </h3>
            <p className="text-xs text-brand-secondary mt-1">
              {filterTab === 'completed'
                ? 'You have not submitted service reports for any jobs on this date.'
                : 'You have no scheduled visits allocated for this date. Check with dispatch or take a well-deserved rest.'}
            </p>
          </div>
        </div>
      )}

      {/* Job Cards */}
      {!isLoading && displayedJobs.length > 0 && (
        <div className="space-y-3">
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
                className={`rounded-2xl border transition-all p-4 space-y-3 ${
                  isCompleted
                    ? 'bg-surface-raised/70 border-emerald-500/30'
                    : 'bg-surface-raised border-brand-border shadow-xs hover:border-brand-primary/50'
                }`}
              >
                {/* Card Top: Schedule Number & Status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-brand-primary">
                      {job.schedule_number}
                    </span>
                    {job.amc_id ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        AMC Preventive
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        Service Call
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-brand-secondary">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{job.start_time || '10:00'} - {job.end_time || '12:00'}</span>
                  </div>
                </div>

                {/* Customer & Site Details */}
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-brand-primary">
                    {job.customers?.name || 'Customer Name'}
                  </h4>

                  {/* Site Address */}
                  <div className="flex items-start gap-1.5 text-xs text-brand-secondary">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-primary" />
                    <span className="line-clamp-2">{fullAddress || 'Address on file'}</span>
                  </div>

                  {/* AC Asset Preview */}
                  {job.ac_assets && (
                    <div className="flex items-center gap-1.5 text-xs text-brand-primary font-medium pt-1">
                      <Airplay className="w-3.5 h-3.5 text-brand-secondary" />
                      <span>
                        {job.ac_assets.brand} {job.ac_assets.model_number || ''}
                        {job.ac_assets.room_location ? ` (${job.ac_assets.room_location})` : ''}
                      </span>
                      {job.ac_assets.tonnage ? (
                        <span className="text-[10px] text-brand-secondary">· {job.ac_assets.tonnage}T</span>
                      ) : null}
                    </div>
                  )}

                  {/* Planned Service Type / Notes */}
                  {job.planned_service_type && (
                    <div className="text-[11px] text-brand-secondary italic pt-0.5">
                      Planned: {job.planned_service_type}
                    </div>
                  )}
                </div>

                {/* Quick Action Bar: Call, Maps & Report Button */}
                <div className="pt-2 border-t border-brand-border flex items-center gap-2">
                  {/* Phone Call Button */}
                  {customerPhone && (
                    <a
                      href={`tel:${customerPhone}`}
                      className="p-2.5 rounded-xl bg-surface-sunken hover:bg-surface-subtle border border-brand-border text-brand-primary flex items-center justify-center transition-colors"
                      title="Call Customer"
                    >
                      <Phone className="w-4 h-4 text-emerald-500" />
                    </a>
                  )}

                  {/* Google Maps Button */}
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-xl bg-surface-sunken hover:bg-surface-subtle border border-brand-border text-brand-primary flex items-center justify-center transition-colors"
                    title="Open in Google Maps"
                  >
                    <Navigation className="w-4 h-4 text-blue-500" />
                  </a>

                  {/* Main Action: Fill Report or Completed Badge */}
                  {isCompleted ? (
                    <div className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Service Completed</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartReport(job.id)}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-surface-canvas font-bold text-xs shadow-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
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
