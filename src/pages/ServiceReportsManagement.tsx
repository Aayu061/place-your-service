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
  AlertTriangle,
  Link2,
} from 'lucide-react';
import {
  ServiceVisitReport,
  ServiceVisitType,
  ServiceVisitOutcome,
  PlannedServiceType,
  PerformedServiceType,
  ServiceResolutionStatus,
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
  const [resolutionStatusFilter, setResolutionStatusFilter] = useState<'ALL' | ServiceResolutionStatus>('ALL');
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
        resolutionStatus: resolutionStatusFilter !== 'ALL' ? resolutionStatusFilter : undefined,
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
  }, [debouncedSearch, visitTypeFilter, outcomeFilter, resolutionStatusFilter, startDateFilter, endDateFilter, page, pageSize, showToast]);

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
    setResolutionStatusFilter('ALL');
    setStartDateFilter('');
    setEndDateFilter('');
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(searchTerm) ||
    visitTypeFilter !== 'ALL' ||
    outcomeFilter !== 'ALL' ||
    resolutionStatusFilter !== 'ALL' ||
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

  const getServiceTypeBadge = (type?: PlannedServiceType | PerformedServiceType | null) => {
    switch (type) {
      case 'DRY_SERVICE':
        return { label: 'Dry Service', bg: 'var(--color-neutral-100, #f1f5f9)', text: 'var(--color-neutral-800, #1e293b)', border: 'var(--color-neutral-300, #cbd5e1)' };
      case 'JET_SERVICE':
        return { label: 'Jet Service', bg: 'var(--color-primary-50, #eff6ff)', text: 'var(--color-primary-700, #1d4ed8)', border: 'var(--color-primary-200, #bfdbfe)' };
      case 'PUMPDOWN_SERVICE':
        return { label: 'Pumpdown Service', bg: 'var(--color-warning-50, #fffbeb)', text: 'var(--color-warning-700, #b45309)', border: 'var(--color-warning-200, #fde68a)' };
      default:
        return { label: 'Not specified', bg: 'var(--color-neutral-50, #f8fafc)', text: 'var(--text-muted, #94a3b8)', border: 'var(--border-subtle, #e2e8f0)' };
    }
  };

  const renderResolutionBadge = (report: ServiceVisitReport) => {
    // If this report had pending items that have since been resolved by a follow-up revisit
    if (report.resolvingReportNumber) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (report.resolvingReportId) openDetailDrawer(report.resolvingReportId);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: 'var(--color-success-bg, #f0fdf4)',
            color: 'var(--color-success-text, #166534)',
            border: '1px solid var(--color-success-border, #bbf7d0)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
          title={`Click to view resolving report #${report.resolvingReportNumber}`}
        >
          <CheckCircle size={11} />
          <span>Resolved by #{report.resolvingReportNumber}</span>
        </button>
      );
    }

    // If this report is itself a follow-up revisit resolving an earlier originating report
    if (report.originatingReportNumber) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (report.originatingReportId) openDetailDrawer(report.originatingReportId);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: 'var(--color-info-bg, #eff6ff)',
            color: 'var(--color-info-text, #1e40af)',
            border: '1px solid var(--color-info-border, #bfdbfe)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
          title={`Click to view original pending report #${report.originatingReportNumber}`}
        >
          <Link2 size={11} />
          <span>Follow-up for #{report.originatingReportNumber}</span>
        </button>
      );
    }

    // Active unresolved parts
    if (report.primaryOutcome === 'PENDING_PARTS' || report.resolutionStatus === 'AWAITING_PARTS') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: '#fffbeb',
              color: '#b45309',
              border: '1px solid #fde68a',
              width: 'fit-content',
            }}
          >
            <Package size={11} />
            <span>Awaiting Parts</span>
          </span>
          {report.followUpScheduleNumber ? (
            <span style={{ fontSize: '11px', color: 'var(--color-primary-700)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Clock size={10} /> Appt #{report.followUpScheduleNumber}
            </span>
          ) : (
            <span style={{ fontSize: '10px', color: 'var(--color-warning-text)', fontWeight: 600 }}>
              Revisit Required
            </span>
          )}
        </div>
      );
    }

    // Active unresolved repairs
    if (report.primaryOutcome === 'PENDING_REPAIRS' || report.resolutionStatus === 'AWAITING_REPAIR') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: '#fff1f2',
              color: '#be123c',
              border: '1px solid #fecdd3',
              width: 'fit-content',
            }}
          >
            <Wrench size={11} />
            <span>Awaiting Repair</span>
          </span>
          {report.followUpScheduleNumber ? (
            <span style={{ fontSize: '11px', color: 'var(--color-primary-700)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Clock size={10} /> Appt #{report.followUpScheduleNumber}
            </span>
          ) : (
            <span style={{ fontSize: '10px', color: 'var(--color-danger-text)', fontWeight: 600 }}>
              Revisit Required
            </span>
          )}
        </div>
      );
    }

    // Completed on-site without separate follow-up
    if (report.primaryOutcome === 'COMPLETED') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: 'var(--color-success-bg, #f0fdf4)',
            color: 'var(--color-success-text, #166534)',
            border: '1px solid var(--color-success-border, #bbf7d0)',
            width: 'fit-content',
          }}
        >
          <CheckCircle size={11} />
          <span>Resolved on-site</span>
        </span>
      );
    }

    return (
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        {report.resolutionStatus || 'N/A'}
      </span>
    );
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
            <span className="svr-kpi-sub">Distinct active unresolved parts</span>
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
            <span className="svr-kpi-sub">Distinct active unresolved repairs</span>
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

        {/* Resolution Status Filter */}
        <select
          value={resolutionStatusFilter}
          onChange={(e) => {
            setResolutionStatusFilter(e.target.value as 'ALL' | ServiceResolutionStatus);
            setPage(1);
          }}
          className="svr-filter-select"
          title="Filter by Resolution Status"
        >
          <option value="ALL">All Resolution States</option>
          <option value="OPEN">Open</option>
          <option value="AWAITING_PARTS">Awaiting Parts</option>
          <option value="AWAITING_REPAIR">Awaiting Repair</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CANCELLED">Cancelled</option>
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
                  <th style={{ padding: '12px 16px' }}>Planned & Performed Service</th>
                  <th style={{ padding: '12px 16px' }}>Customer & Site</th>
                  <th style={{ padding: '12px 16px' }}>Technician</th>
                  <th style={{ padding: '12px 16px' }}>Outcome</th>
                  <th style={{ padding: '12px 16px' }}>Resolution / Follow-up</th>
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

                    {/* Planned & Performed Service */}
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, width: '42px' }}>Plan:</span>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: getServiceTypeBadge(report.plannedServiceType).bg,
                              color: getServiceTypeBadge(report.plannedServiceType).text,
                              border: `1px solid ${getServiceTypeBadge(report.plannedServiceType).border}`,
                            }}
                          >
                            {getServiceTypeBadge(report.plannedServiceType).label}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, width: '42px' }}>Done:</span>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: getServiceTypeBadge(report.performedServiceType).bg,
                              color: getServiceTypeBadge(report.performedServiceType).text,
                              border: `1px solid ${getServiceTypeBadge(report.performedServiceType).border}`,
                            }}
                          >
                            {getServiceTypeBadge(report.performedServiceType).label}
                          </span>
                        </div>
                        {report.serviceTypeDeviationReason && (
                          <span
                            title={`Deviation Reason: ${report.serviceTypeDeviationReason}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '10px',
                              fontWeight: 600,
                              color: 'var(--color-warning-700, #b45309)',
                              backgroundColor: 'var(--color-warning-50, #fffbeb)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              border: '1px solid var(--color-warning-200, #fde68a)',
                              width: 'fit-content',
                              marginTop: '2px',
                            }}
                          >
                            <AlertTriangle size={10} />
                            <span>Deviated</span>
                          </span>
                        )}
                      </div>
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

                    {/* Resolution / Follow-up */}
                    <td style={{ padding: '12px 16px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>
                        Appt: {report.scheduleNumber || 'N/A'}
                      </div>
                      {renderResolutionBadge(report)}
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

            {/* Outcome & Resolution Status Banner */}
            <div className="p-3.5 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-slate-50">
              <div>
                <span className="text-xs text-slate-500 block uppercase font-semibold">Outcome & Resolution:</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-bold text-sm text-slate-900">
                    {detailedReport.primaryOutcome.replace('_', ' ')}
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor:
                        detailedReport.resolutionStatus === 'RESOLVED'
                          ? 'var(--color-success-bg, #f0fdf4)'
                          : detailedReport.resolutionStatus === 'AWAITING_PARTS'
                          ? '#fffbeb'
                          : detailedReport.resolutionStatus === 'AWAITING_REPAIR'
                          ? '#fff1f2'
                          : 'var(--color-neutral-100, #f1f5f9)',
                      color:
                        detailedReport.resolutionStatus === 'RESOLVED'
                          ? 'var(--color-success-text, #166534)'
                          : detailedReport.resolutionStatus === 'AWAITING_PARTS'
                          ? '#b45309'
                          : detailedReport.resolutionStatus === 'AWAITING_REPAIR'
                          ? '#be123c'
                          : 'var(--text-secondary, #475569)',
                      border: `1px solid ${
                        detailedReport.resolutionStatus === 'RESOLVED'
                          ? 'var(--color-success-border, #bbf7d0)'
                          : detailedReport.resolutionStatus === 'AWAITING_PARTS'
                          ? '#fde68a'
                          : detailedReport.resolutionStatus === 'AWAITING_REPAIR'
                          ? '#fecdd3'
                          : 'var(--border-subtle, #cbd5e1)'
                      }`,
                    }}
                  >
                    Status: {detailedReport.resolutionStatus || 'OPEN'}
                  </span>
                </div>
              </div>

              {detailedReport.followUpScheduleNumber && (
                <div className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                  Follow-up Revisit: #{detailedReport.followUpScheduleNumber}
                </div>
              )}
            </div>

            {/* Bidirectional Report Resolution Links */}
            {(detailedReport.originatingReportNumber || detailedReport.resolvingReportNumber) && (
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2 text-xs">
                {detailedReport.originatingReportNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-blue-900">
                      This visit is a <strong>follow-up revisit</strong> addressing pending items from:
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => detailedReport.originatingReportId && openDetailDrawer(detailedReport.originatingReportId)}
                      style={{ height: '26px', fontSize: '11px', padding: '0 8px' }}
                    >
                      <Link2 size={12} className="mr-1" />
                      View Original #{detailedReport.originatingReportNumber}
                    </Button>
                  </div>
                )}
                {detailedReport.resolvingReportNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-900">
                      Pending issues from this report were <strong>resolved</strong> by:
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => detailedReport.resolvingReportId && openDetailDrawer(detailedReport.resolvingReportId)}
                      style={{ height: '26px', fontSize: '11px', padding: '0 8px' }}
                    >
                      <CheckCircle size={12} className="mr-1 text-emerald-600" />
                      View Resolving #{detailedReport.resolvingReportNumber}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Service Execution & Planned Alignment */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
              <span className="text-xs text-slate-500 block uppercase font-semibold">
                Service Type Execution & Planned Alignment
              </span>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px] mb-1">Planned Service Type</span>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: getServiceTypeBadge(detailedReport.plannedServiceType).bg,
                      color: getServiceTypeBadge(detailedReport.plannedServiceType).text,
                      border: `1px solid ${getServiceTypeBadge(detailedReport.plannedServiceType).border}`,
                    }}
                  >
                    {getServiceTypeBadge(detailedReport.plannedServiceType).label}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px] mb-1">Performed Service Type</span>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: getServiceTypeBadge(detailedReport.performedServiceType).bg,
                      color: getServiceTypeBadge(detailedReport.performedServiceType).text,
                      border: `1px solid ${getServiceTypeBadge(detailedReport.performedServiceType).border}`,
                    }}
                  >
                    {getServiceTypeBadge(detailedReport.performedServiceType).label}
                  </span>
                </div>
              </div>

              {detailedReport.serviceTypeDeviationReason && (
                <div
                  style={{
                    backgroundColor: 'var(--color-warning-50, #fffbeb)',
                    border: '1px solid var(--color-warning-200, #fde68a)',
                    borderRadius: 'var(--radius-md, 8px)',
                    padding: '8px 12px',
                    marginTop: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--color-warning-800, #92400e)', fontSize: '11px' }}>
                    <AlertTriangle size={13} style={{ color: 'var(--color-warning-600, #d97706)' }} />
                    Deviation Justification Note:
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-warning-900, #78350f)', marginTop: '4px', fontStyle: 'italic', lineHeight: 1.4 }}>
                    &ldquo;{detailedReport.serviceTypeDeviationReason}&rdquo;
                  </div>
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

                    {/* Equipment Serial Numbers */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 text-[11px]">
                      <div>
                        <span className="text-slate-500 font-semibold block text-[10px] uppercase">IDU Serial #</span>
                        <span className="font-mono text-slate-900 font-semibold">
                          {asset.indoorSerialNumber || (asset.serialNumber && !asset.outdoorSerialNumber ? asset.serialNumber : 'Not recorded')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-semibold block text-[10px] uppercase">ODU Serial #</span>
                        <span className="font-mono text-slate-900 font-semibold">
                          {asset.outdoorSerialNumber || 'Not recorded'}
                        </span>
                      </div>
                    </div>

                    {/* Technical Specs & Location */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                      {(asset.floorLocation || asset.roomLocation) && (
                        <span>
                          <strong>Location:</strong> {[asset.floorLocation, asset.roomLocation].filter(Boolean).join(' • ')}
                        </span>
                      )}
                      {(asset.acType || asset.technology) && (
                        <span>
                          <strong>Type:</strong> {[asset.acType, asset.technology].filter(Boolean).join(' • ')}
                        </span>
                      )}
                      {(asset.capacityTons || asset.starRating) && (
                        <span>
                          <strong>Capacity:</strong> {[asset.capacityTons ? `${asset.capacityTons} TR` : null, asset.starRating].filter(Boolean).join(' • ')}
                        </span>
                      )}
                      {asset.refrigerantType && (
                        <span>
                          <strong>Refrigerant:</strong> {asset.refrigerantType}
                        </span>
                      )}
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
