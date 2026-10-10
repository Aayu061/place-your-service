import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  Eye,
  Printer,
  Calendar,
  Wrench,
  Package,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCcw,
  X,
  Building,
  User,
  Pencil,
} from 'lucide-react';
import {
  ServiceVisitReport,
  ServiceVisitType,
  ServiceVisitOutcome,
  CreateFollowUpSchedulePayload,
  ServiceReportSummaryCounts,
} from '@/domain/types';
import { serviceReportApi } from '@/services/serviceReportApi';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useToast } from '@/components/ui/useToast';
import { formatDate } from '@/utils/formatters';
import { ServiceReportPrintView } from '@/components/serviceReports/ServiceReportPrintView';
import { ServiceVisitReportModal } from '@/components/serviceReports/ServiceVisitReportModal';

interface ServiceReportsManagementProps {
  onNavigate?: (module: string) => void;
}

export const ServiceReportsManagement: React.FC<ServiceReportsManagementProps> = ({ onNavigate }) => {
  const { showToast } = useToast();

  const [reports, setReports] = useState<ServiceVisitReport[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Server-wide KPI Summary Counts
  const [summaryStats, setSummaryStats] = useState<ServiceReportSummaryCounts>({
    total: 0,
    completed: 0,
    pendingParts: 0,
    pendingRepairs: 0,
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [visitTypeFilter, setVisitTypeFilter] = useState<'ALL' | ServiceVisitType>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | ServiceVisitOutcome>('ALL');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Drawer / View / Print State
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [detailedReport, setDetailedReport] = useState<ServiceVisitReport | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [reportToPrint, setReportToPrint] = useState<ServiceVisitReport | null>(null);

  // Edit Report Modal State
  const [reportToEdit, setReportToEdit] = useState<ServiceVisitReport | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  // Follow-up Revisit Modal State
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState<boolean>(false);
  const [followUpReport, setFollowUpReport] = useState<ServiceVisitReport | null>(null);
  const [followUpDate, setFollowUpDate] = useState<string>('');
  const [followUpStartTime, setFollowUpStartTime] = useState<string>('09:00');
  const [followUpEndTime, setFollowUpEndTime] = useState<string>('11:00');
  const [followUpNotes, setFollowUpNotes] = useState<string>('');
  const [isSubmittingFollowUp, setIsSubmittingFollowUp] = useState<boolean>(false);

  const fetchReports = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await serviceReportApi.getReports({
        search: debouncedSearch.trim() || undefined,
        visitType: visitTypeFilter !== 'ALL' ? visitTypeFilter : undefined,
        outcome: outcomeFilter !== 'ALL' ? outcomeFilter : undefined,
        startDate: startDateFilter || undefined,
        endDate: endDateFilter || undefined,
        page,
        pageSize,
      });

      setReports(res.reports || []);
      setTotalCount(res.total || 0);
      setTotalPages(res.totalPages || 1);

      if (res.summary) {
        setSummaryStats(res.summary);
      } else {
        // Fallback calculation
        let completed = 0;
        let parts = 0;
        let repairs = 0;
        (res.reports || []).forEach((r) => {
          if (r.primaryOutcome === 'COMPLETED') completed++;
          if (r.primaryOutcome === 'PENDING_PARTS') parts++;
          if (r.primaryOutcome === 'PENDING_REPAIRS') repairs++;
        });
        setSummaryStats({
          total: res.total || 0,
          completed,
          pendingParts: parts,
          pendingRepairs: repairs,
        });
      }
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'Failed to load service reports' });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [debouncedSearch, visitTypeFilter, outcomeFilter, startDateFilter, endDateFilter, page, pageSize, showToast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchReports();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setVisitTypeFilter('ALL');
    setOutcomeFilter('ALL');
    setStartDateFilter('');
    setEndDateFilter('');
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(searchTerm) ||
    visitTypeFilter !== 'ALL' ||
    outcomeFilter !== 'ALL' ||
    Boolean(startDateFilter) ||
    Boolean(endDateFilter);

  // Open detail drawer
  const openDetailDrawer = async (reportId: string) => {
    setSelectedReportId(reportId);
    try {
      setIsLoadingDetail(true);
      const res = await serviceReportApi.getReportById(reportId);
      setDetailedReport(res.report);
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'Failed to load report details' });
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Open print view
  const openPrintView = async (rep: ServiceVisitReport) => {
    if (rep.assets && rep.assets.length > 0) {
      setReportToPrint(rep);
    } else {
      try {
        const fullRes = await serviceReportApi.getReportById(rep.id);
        setReportToPrint(fullRes.report);
      } catch {
        setReportToPrint(rep);
      }
    }
  };

  // Open follow-up modal
  const openFollowUpModal = (rep: ServiceVisitReport) => {
    setFollowUpReport(rep);
    setFollowUpDate(new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10)); // default +2 days
    setFollowUpStartTime('09:00');
    setFollowUpEndTime('11:00');
    setFollowUpNotes('');
    setIsFollowUpModalOpen(true);
  };

  const handleCreateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpReport) return;

    try {
      setIsSubmittingFollowUp(true);
      const payload: CreateFollowUpSchedulePayload = {
        scheduledDate: followUpDate,
        startTime: followUpStartTime,
        endTime: followUpEndTime,
        durationMinutes: 120,
        notes: followUpNotes.trim() || undefined,
      };

      await serviceReportApi.createFollowUp(followUpReport.id, payload);
      showToast({
        type: 'success',
        title: 'Follow-up Arranged',
        message: `Follow-up appointment arranged for Report #${followUpReport.reportNumber}`,
      });
      setIsFollowUpModalOpen(false);
      fetchReports();
      if (selectedReportId === followUpReport.id) {
        openDetailDrawer(followUpReport.id);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Failed to arrange follow-up';
      showToast({
        type: 'error',
        title: 'Follow-up Failed',
        message,
      });
    } finally {
      setIsSubmittingFollowUp(false);
    }
  };

  const handleOpenEditModal = (report: ServiceVisitReport) => {
    setReportToEdit(report);
    setIsEditModalOpen(true);
  };

  const getOutcomeBadgeClass = (outcome: ServiceVisitOutcome) => {
    switch (outcome) {
      case 'COMPLETED':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'PENDING_PARTS':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'PENDING_REPAIRS':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="svr-space-y-6">
      {/* 4.1 Page Header */}
      <div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        <div>
          <h1
            className="text-2xl font-bold tracking-tight flex items-center gap-2.5"
            style={{ color: 'var(--text-primary)', margin: 0 }}
          >
            <FileText size={26} style={{ color: 'var(--color-brand)' }} />
            Service Visit Reports Register
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
            Authoritative technician on-site execution records, completion logs, and pending parts/repairs register.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </Button>
          {onNavigate && (
            <Button
              variant="primary"
              onClick={() => onNavigate('service-schedule')}
            >
              <Calendar size={14} />
              <span>Service Schedule Management</span>
            </Button>
          )}
        </div>
      </div>

      {/* 4.2 Aligned KPI Cards (4 Uniform Responsive Cards) */}
      <div className="svr-kpi-grid">
        {/* Total Reports */}
        <div className="svr-kpi-card total">
          <div className="svr-kpi-content">
            <span className="svr-kpi-label">Total Reports</span>
            <span className="svr-kpi-value">{summaryStats.total}</span>
            <span className="svr-kpi-sub">Recorded visit logs</span>
          </div>
          <div className="svr-kpi-icon-wrapper total">
            <FileText size={22} />
          </div>
        </div>

        {/* Service Completed */}
        <div className="svr-kpi-card completed">
          <div className="svr-kpi-content">
            <span className="svr-kpi-label">Service Completed</span>
            <span className="svr-kpi-value">{summaryStats.completed}</span>
            <span className="svr-kpi-sub">Fully resolved on-site</span>
          </div>
          <div className="svr-kpi-icon-wrapper completed">
            <CheckCircle2 size={22} />
          </div>
        </div>

        {/* Pending for Parts */}
        <div className="svr-kpi-card pending-parts">
          <div className="svr-kpi-content">
            <span className="svr-kpi-label">Pending for Parts</span>
            <span className="svr-kpi-value">{summaryStats.pendingParts}</span>
            <span className="svr-kpi-sub">Awaiting spare parts</span>
          </div>
          <div className="svr-kpi-icon-wrapper pending-parts">
            <Package size={22} />
          </div>
        </div>

        {/* Pending for Repairs */}
        <div className="svr-kpi-card pending-repairs">
          <div className="svr-kpi-content">
            <span className="svr-kpi-label">Pending for Repairs</span>
            <span className="svr-kpi-value">{summaryStats.pendingRepairs}</span>
            <span className="svr-kpi-sub">Awaiting revisit / repair</span>
          </div>
          <div className="svr-kpi-icon-wrapper pending-repairs">
            <Wrench size={22} />
          </div>
        </div>
      </div>

      {/* 4.3 Coherent Search & Filter Toolbar */}
      <div className="svr-filter-toolbar">
        {/* Search Input (Debounced) */}
        <div className="svr-filter-search">
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Report #, customer, or code..."
            style={{
              paddingLeft: '36px',
              paddingRight: searchTerm ? '32px' : '12px',
              height: '38px',
              fontSize: '13px',
              width: '100%',
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
              }}
              title="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Visit Type Filter */}
        <select
          value={visitTypeFilter}
          onChange={(e) => {
            setVisitTypeFilter(e.target.value as 'ALL' | ServiceVisitType);
            setPage(1);
          }}
          className="svr-filter-select"
          title="Filter by Visit Type"
        >
          <option value="ALL">All Visit Types</option>
          <option value="PREVENTIVE">AMC Preventive</option>
          <option value="SERVICE_REQUEST">Service Request</option>
        </select>

        {/* Outcome Filter */}
        <select
          value={outcomeFilter}
          onChange={(e) => {
            setOutcomeFilter(e.target.value as 'ALL' | ServiceVisitOutcome);
            setPage(1);
          }}
          className="svr-filter-select"
          title="Filter by Outcome"
        >
          <option value="ALL">All Outcomes</option>
          <option value="COMPLETED">Service Completed</option>
          <option value="PENDING_PARTS">Pending for Parts</option>
          <option value="PENDING_REPAIRS">Pending for Repairs</option>
        </select>

        {/* Date range filters */}
        <div className="svr-filter-dates">
          <Input
            type="date"
            value={startDateFilter}
            onChange={(e) => {
              setStartDateFilter(e.target.value);
              setPage(1);
            }}
            title="From Date"
            placeholder="From"
            style={{ height: '38px', fontSize: '12px', flex: 1 }}
          />
          <Input
            type="date"
            value={endDateFilter}
            onChange={(e) => {
              setEndDateFilter(e.target.value);
              setPage(1);
            }}
            title="To Date"
            placeholder="To"
            style={{ height: '38px', fontSize: '12px', flex: 1 }}
          />
        </div>

        {/* Reset Filters button */}
        <div className="svr-filter-actions">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            disabled={!hasActiveFilters}
            title="Reset All Filters"
            style={{ height: '38px' }}
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </Button>
        </div>
      </div>

      {/* 4.4 & 4.5 Reports Table & Loading / Empty States */}
      <div className="svr-table-container">
        {isLoading && reports.length === 0 ? (
          <div className="svr-loading-state">
            <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--color-brand)' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>Loading service reports...</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Fetching execution records and findings</div>
          </div>
        ) : reports.length === 0 ? (
          <div style={{ padding: 'var(--space-10) var(--space-4)', textAlign: 'center' }}>
            <EmptyState
              title="No Service Reports Found"
              description={
                hasActiveFilters
                  ? 'No visit reports match your selected filter criteria. Try adjusting or clearing filters.'
                  : 'No service visit reports recorded yet. File visit reports from scheduled appointments in Service Schedule Management.'
              }
              icon={<FileText size={40} style={{ color: 'var(--color-neutral-400)' }} />}
              actionLabel={hasActiveFilters ? 'Clear All Filters' : undefined}
              onAction={hasActiveFilters ? handleResetFilters : undefined}
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', textAlign: 'left', fontSize: 'var(--text-sm)', borderCollapse: 'collapse' }}>
              <thead
                style={{
                  backgroundColor: 'var(--color-neutral-50)',
                  borderBottom: '1px solid var(--border-default)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <tr>
                  <th style={{ padding: '12px 16px' }}>Report Number</th>
                  <th style={{ padding: '12px 16px' }}>Visit Date & Time</th>
                  <th style={{ padding: '12px 16px' }}>Visit Type</th>
                  <th style={{ padding: '12px 16px' }}>Customer & Site</th>
                  <th style={{ padding: '12px 16px' }}>Technician</th>
                  <th style={{ padding: '12px 16px' }}>Outcome</th>
                  <th style={{ padding: '12px 16px' }}>Appt / Follow-up</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid var(--border-default)' }}>
                {reports.map((report) => (
                  <tr
                    key={report.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-neutral-50)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {/* Report Number */}
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      #{report.reportNumber}
                    </td>

                    {/* Visit Date & Time */}
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{formatDate(report.serviceDate)}</div>
                      {report.startTime && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <Clock size={11} style={{ color: 'var(--text-muted)' }} />
                          {report.startTime} - {report.endTime || 'End'}
                        </div>
                      )}
                    </td>

                    {/* Visit Type */}
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: report.visitType === 'PREVENTIVE' ? 'var(--color-amc-bg)' : 'var(--color-info-bg)',
                          color: report.visitType === 'PREVENTIVE' ? 'var(--color-amc-text)' : 'var(--color-info-text)',
                          border: `1px solid ${report.visitType === 'PREVENTIVE' ? 'var(--color-amc-border)' : 'var(--color-info-border)'}`,
                        }}
                      >
                        {report.visitType === 'PREVENTIVE' ? 'AMC PM' : 'Service Request'}
                      </span>
                    </td>

                    {/* Customer & Site */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{report.customerName || 'N/A'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {report.siteName}
                      </div>
                    </td>

                    {/* Attending Technician */}
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User size={12} style={{ color: 'var(--text-muted)' }} />
                        {report.technicianName || 'Unassigned'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{report.technicianCode}</div>
                    </td>

                    {/* Outcome Badge */}
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${getOutcomeBadgeClass(
                          report.primaryOutcome
                        )}`}
                      >
                        {report.primaryOutcome === 'COMPLETED' && <CheckCircle size={12} />}
                        {report.primaryOutcome === 'PENDING_PARTS' && <Package size={12} />}
                        {report.primaryOutcome === 'PENDING_REPAIRS' && <Wrench size={12} />}
                        {report.primaryOutcome.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Appointment / Revisit */}
                    <td style={{ padding: '12px 16px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Appt: {report.scheduleNumber || 'N/A'}</div>
                      {report.followUpScheduleId ? (
                        <div style={{ color: 'var(--color-primary-700)', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={11} />
                          <span>Revisit: #{report.followUpScheduleNumber || 'Scheduled'}</span>
                        </div>
                      ) : report.primaryOutcome !== 'COMPLETED' ? (
                        <span style={{ color: 'var(--color-warning-text)', fontWeight: 600, display: 'block', marginTop: '2px' }}>
                          Follow-up Required
                        </span>
                      ) : null}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openDetailDrawer(report.id)}
                          title="View Details"
                          style={{ height: '32px', padding: '0 10px', fontSize: '12px' }}
                        >
                          <Eye size={13} />
                          <span>View</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openPrintView(report)}
                          title="Print / Save PDF"
                          style={{ height: '32px', padding: '0 10px', fontSize: '12px' }}
                        >
                          <Printer size={13} />
                        </Button>
                        {report.primaryOutcome !== 'COMPLETED' && !report.followUpScheduleId && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => openFollowUpModal(report)}
                            title="Schedule Follow-up Revisit"
                            style={{
                              height: '32px',
                              padding: '0 10px',
                              fontSize: '12px',
                              backgroundColor: 'var(--color-warning-solid)',
                              borderColor: 'var(--color-warning-solid)',
                            }}
                          >
                            <Clock size={13} />
                            <span>Revisit</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalCount > pageSize && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
            <div>
              Showing page {page} of {totalPages} ({totalCount} total reports)
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1}
              >
                <ChevronLeft size={14} /> Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages}
              >
                Next <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <Drawer
        isOpen={Boolean(selectedReportId)}
        onClose={() => {
          setSelectedReportId(null);
          setDetailedReport(null);
        }}
        title={`Service Visit Report #${detailedReport?.reportNumber || ''}`}
        width="660px"
      >
        {isLoadingDetail || !detailedReport ? (
          <div className="p-8 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
            Loading complete report record...
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header info */}
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                  Report Record
                </div>
                <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                  #{detailedReport.reportNumber}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Visit Date: {formatDate(detailedReport.serviceDate)} ({detailedReport.startTime} -{' '}
                  {detailedReport.endTime})
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => handleOpenEditModal(detailedReport)} title="Edit Report">
                  <Pencil size={14} className="mr-1" /> Edit Report
                </Button>
                <Button size="sm" variant="secondary" onClick={() => openPrintView(detailedReport)}>
                  <Printer size={14} className="mr-1" /> Print Report
                </Button>
                {detailedReport.primaryOutcome !== 'COMPLETED' &&
                  !detailedReport.followUpScheduleId && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => openFollowUpModal(detailedReport)}
                    >
                      <Clock size={14} className="mr-1" /> Schedule Revisit
                    </Button>
                  )}
              </div>
            </div>

            {/* Outcome Badge */}
            <div className="p-3.5 rounded-xl border flex justify-between items-center bg-slate-50">
              <div>
                <span className="text-xs text-slate-500 block uppercase font-semibold">Outcome:</span>
                <span className="font-bold text-sm text-slate-900">
                  {detailedReport.primaryOutcome.replace('_', ' ')}
                </span>
              </div>
              {detailedReport.followUpScheduleNumber && (
                <div className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                  Follow-up Revisit: #{detailedReport.followUpScheduleNumber}
                </div>
              )}
            </div>

            {/* Attribution Details */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-semibold mb-1 flex items-center gap-1">
                  <Building size={13} className="text-blue-600" /> Customer & Site
                </span>
                <div className="font-bold text-slate-900">{detailedReport.customerName}</div>
                <div className="text-slate-600 mt-0.5">{detailedReport.siteName}</div>
                <div className="text-slate-500 text-[11px] mt-0.5">{detailedReport.siteAddress}</div>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-semibold mb-1 flex items-center gap-1">
                  <User size={13} className="text-blue-600" /> Attending Technician
                </span>
                <div className="font-bold text-slate-900">{detailedReport.technicianName}</div>
                <div className="text-slate-600 mt-0.5">Code: {detailedReport.technicianCode}</div>
                <div className="text-slate-500 text-[11px] mt-0.5">Phone: {detailedReport.technicianPhone}</div>
              </div>
            </div>

            {/* Assets */}
            <div>
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                AC Asset Inspection Findings ({detailedReport.assets?.length || 0})
              </div>
              <div className="space-y-2.5">
                {detailedReport.assets?.map((asset) => (
                  <div
                    key={asset.id}
                    className="p-3.5 border border-slate-200 rounded-xl bg-white space-y-2 text-xs"
                  >
                    <div className="flex justify-between items-center font-bold text-slate-800">
                      <span className="font-mono text-blue-700">
                        {asset.assetTag} ({asset.brand} {asset.modelNumber})
                      </span>
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                        {asset.finalCondition}
                      </span>
                    </div>
                    {asset.faultReported && (
                      <div>
                        <strong>Reported Fault:</strong> {asset.faultReported}
                      </div>
                    )}
                    {asset.diagnosisFindings && (
                      <div>
                        <strong>Diagnosis:</strong> {asset.diagnosisFindings}
                      </div>
                    )}
                    {asset.workPerformed && (
                      <div>
                        <strong>Work Done:</strong> {asset.workPerformed}
                      </div>
                    )}
                    {asset.refrigerantAdded && (
                      <div className="text-blue-600 font-semibold">
                        Refrigerant Added: {asset.refrigerantQtyKg} kg
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            {detailedReport.workDescription && (
              <div>
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Work Description
                </div>
                <p className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200 whitespace-pre-line leading-relaxed">
                  {detailedReport.workDescription}
                </p>
              </div>
            )}

            {/* Pending Items */}
            {detailedReport.items && detailedReport.items.length > 0 && (
              <div>
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Outcome Action Items ({detailedReport.items.length})
                </div>
                <div className="space-y-2">
                  {detailedReport.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 border border-amber-200 rounded-xl bg-amber-50/40 text-xs space-y-1.5"
                    >
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>
                          {item.itemName} (Qty: {item.quantity})
                        </span>
                        <span className="text-amber-800 text-[11px] px-2 py-0.5 bg-amber-100 rounded">
                          {item.itemType}
                        </span>
                      </div>
                      <div>
                        <strong>Reason:</strong> {item.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Remarks & Sign-off */}
            <div className="border-t border-slate-200 pt-3.5 text-xs space-y-2">
              {detailedReport.technicianRemarks && (
                <div>
                  <strong>Technician Remarks:</strong> {detailedReport.technicianRemarks}
                </div>
              )}
              {detailedReport.customerRepresentative && (
                <div>
                  <strong>Customer Representative:</strong> {detailedReport.customerRepresentative}
                </div>
              )}
              {detailedReport.customerAcknowledgement && (
                <div>
                  <strong>Customer Feedback:</strong> "{detailedReport.customerAcknowledgement}"
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Follow-up Revisit Scheduling Modal */}
      {followUpReport && (
        <Modal
          isOpen={isFollowUpModalOpen}
          onClose={() => setIsFollowUpModalOpen(false)}
          title={`Arrange Follow-Up Revisit — Report #${followUpReport.reportNumber}`}
        >
          <form onSubmit={handleCreateFollowUp} className="space-y-4">
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              <strong>Pending Reason:</strong> {followUpReport.primaryOutcome.replace('_', ' ')}
              <div className="mt-1 text-slate-600">
                This will create a new linked service appointment in the schedule for revisit execution without
                erasing the original report record.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Revisit Scheduled Date <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                required
                disabled={isSubmittingFollowUp}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
                <Input
                  type="time"
                  value={followUpStartTime}
                  onChange={(e) => setFollowUpStartTime(e.target.value)}
                  disabled={isSubmittingFollowUp}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
                <Input
                  type="time"
                  value={followUpEndTime}
                  onChange={(e) => setFollowUpEndTime(e.target.value)}
                  disabled={isSubmittingFollowUp}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Revisit Notes / Instructions
              </label>
              <Input
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                placeholder="e.g. Carry replacement dual-run capacitor and brazing gear"
                disabled={isSubmittingFollowUp}
              />
            </div>

            <div className="flex justify-end gap-3 pt-3.5 border-t border-slate-200">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsFollowUpModalOpen(false)}
                disabled={isSubmittingFollowUp}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmittingFollowUp}>
                {isSubmittingFollowUp ? 'Scheduling...' : 'Confirm Revisit Appointment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Service Report Modal */}
      {reportToEdit && (
        <ServiceVisitReportModal
          isOpen={isEditModalOpen}
          mode="edit"
          initialReport={reportToEdit}
          onClose={() => {
            setIsEditModalOpen(false);
            setReportToEdit(null);
          }}
          onSuccess={() => {
            fetchReports();
            if (selectedReportId) {
              openDetailDrawer(selectedReportId);
            }
          }}
        />
      )}

      {/* Print View Modal */}
      {reportToPrint && (
        <ServiceReportPrintView
          report={reportToPrint}
          onClose={() => setReportToPrint(null)}
        />
      )}
    </div>
  );
};

export default ServiceReportsManagement;
