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
      const axiosErr = err as {
        response?: { data?: { error?: { message?: string } } };
        message?: string;
      };
      showToast({
        type: 'error',
        title: 'Error',
        message:
          axiosErr?.response?.data?.error?.message ||
          axiosErr?.message ||
          'Failed to arrange follow-up',
      });
    } finally {
      setIsSubmittingFollowUp(false);
    }
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
    <div className="space-y-6">
      {/* 6.1 Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <FileText className="w-7 h-7 text-blue-600" />
            Service Visit Reports Register
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative technician on-site execution records, completion logs, and pending parts/repairs register.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="shadow-2xs"
          >
            <RefreshCw size={15} className={`mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {onNavigate && (
            <Button
              variant="primary"
              onClick={() => onNavigate('service-schedule')}
              className="shadow-2xs"
            >
              <Calendar size={15} className="mr-1.5" />
              Service Schedule Management
            </Button>
          )}
        </div>
      </div>

      {/* 6.2 Aligned KPI Cards (4 Compact Responsive Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Reports */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Reports
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {summaryStats.total}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Recorded visit logs</div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        {/* Service Completed */}
        <div className="bg-white p-4.5 rounded-xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/20 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              Service Completed
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-950 mt-1">
              {summaryStats.completed}
            </div>
            <div className="text-[11px] text-emerald-700/70 mt-0.5">Fully resolved on-site</div>
          </div>
          <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Pending for Parts */}
        <div className="bg-white p-4.5 rounded-xl border border-amber-200 bg-gradient-to-br from-white to-amber-50/20 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Pending for Parts
            </div>
            <div className="text-2xl font-bold font-mono text-amber-950 mt-1">
              {summaryStats.pendingParts}
            </div>
            <div className="text-[11px] text-amber-700/70 mt-0.5">Awaiting spare parts</div>
          </div>
          <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* Pending for Repairs */}
        <div className="bg-white p-4.5 rounded-xl border border-rose-200 bg-gradient-to-br from-white to-rose-50/20 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-rose-800 uppercase tracking-wider">
              Pending for Repairs
            </div>
            <div className="text-2xl font-bold font-mono text-rose-950 mt-1">
              {summaryStats.pendingRepairs}
            </div>
            <div className="text-[11px] text-rose-700/70 mt-0.5">Awaiting revisit / repair</div>
          </div>
          <div className="p-3 bg-rose-100 text-rose-700 rounded-xl">
            <Wrench className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 6.3 Coherent Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Input (Debounced) */}
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Report #, customer, or code..."
              className="pl-9 pr-8 text-sm"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                title="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Visit Type Filter */}
          <div className="md:col-span-2">
            <select
              value={visitTypeFilter}
              onChange={(e) => {
                setVisitTypeFilter(e.target.value as 'ALL' | ServiceVisitType);
                setPage(1);
              }}
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Visit Types</option>
              <option value="PREVENTIVE">AMC Preventive</option>
              <option value="SERVICE_REQUEST">Service Request</option>
            </select>
          </div>

          {/* Outcome Filter */}
          <div className="md:col-span-2">
            <select
              value={outcomeFilter}
              onChange={(e) => {
                setOutcomeFilter(e.target.value as 'ALL' | ServiceVisitOutcome);
                setPage(1);
              }}
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Outcomes</option>
              <option value="COMPLETED">Service Completed</option>
              <option value="PENDING_PARTS">Pending for Parts</option>
              <option value="PENDING_REPAIRS">Pending for Repairs</option>
            </select>
          </div>

          {/* Date range filters */}
          <div className="md:col-span-3 flex gap-2">
            <Input
              type="date"
              value={startDateFilter}
              onChange={(e) => {
                setStartDateFilter(e.target.value);
                setPage(1);
              }}
              title="From Date"
              placeholder="From"
              className="text-xs"
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
              className="text-xs"
            />
          </div>

          {/* Reset Filters button */}
          <div className="md:col-span-1 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              disabled={!hasActiveFilters}
              title="Reset All Filters"
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              <RotateCcw size={14} className="mr-1" /> Reset
            </Button>
          </div>
        </div>
      </div>

      {/* 6.4 Reports Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-14 text-center text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-2.5" />
            <div className="font-semibold text-slate-700">Loading service reports...</div>
            <div className="text-xs text-slate-400 mt-1">Fetching execution records and findings</div>
          </div>
        ) : reports.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState
              title="No Service Reports Found"
              description={
                hasActiveFilters
                  ? 'No visit reports match your selected filter criteria. Try adjusting or clearing filters.'
                  : 'No service visit reports recorded yet. File visit reports from scheduled appointments in Service Schedule Management.'
              }
              icon={<FileText size={44} className="text-slate-400" />}
              actionLabel={hasActiveFilters ? 'Clear All Filters' : undefined}
              onAction={hasActiveFilters ? handleResetFilters : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Report Number</th>
                  <th className="py-3 px-4">Visit Date & Time</th>
                  <th className="py-3 px-4">Visit Type</th>
                  <th className="py-3 px-4">Customer & Site</th>
                  <th className="py-3 px-4">Technician</th>
                  <th className="py-3 px-4">Outcome</th>
                  <th className="py-3 px-4">Appt / Follow-up</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Report Number */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      #{report.reportNumber}
                    </td>

                    {/* Visit Date & Time */}
                    <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                      <div className="font-medium text-slate-900">{formatDate(report.serviceDate)}</div>
                      {report.startTime && (
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                          <Clock size={11} className="text-slate-400" />
                          {report.startTime} - {report.endTime || 'End'}
                        </div>
                      )}
                    </td>

                    {/* Visit Type */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          report.visitType === 'PREVENTIVE'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {report.visitType === 'PREVENTIVE' ? 'AMC PM' : 'Service Request'}
                      </span>
                    </td>

                    {/* Customer & Site */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{report.customerName || 'N/A'}</div>
                      <div className="text-xs text-slate-500 truncate max-w-xs">{report.siteName}</div>
                    </td>

                    {/* Attending Technician */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-800 flex items-center gap-1">
                        <User size={12} className="text-slate-400" />
                        {report.technicianName || 'Unassigned'}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">{report.technicianCode}</div>
                    </td>

                    {/* Outcome Badge */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
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
                    <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                      <div className="text-slate-600 font-mono">Appt: {report.scheduleNumber || 'N/A'}</div>
                      {report.followUpScheduleId ? (
                        <div className="text-blue-700 font-semibold mt-0.5 flex items-center gap-1">
                          <Clock size={11} />
                          <span>Revisit: #{report.followUpScheduleNumber || 'Scheduled'}</span>
                        </div>
                      ) : report.primaryOutcome !== 'COMPLETED' ? (
                        <span className="text-amber-700 font-semibold block mt-0.5">
                          Follow-up Required
                        </span>
                      ) : null}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex justify-end items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openDetailDrawer(report.id)}
                          title="View Details"
                          className="h-8 px-2.5 text-xs shadow-2xs"
                        >
                          <Eye size={13} className="mr-1" /> View
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openPrintView(report)}
                          title="Print / Save PDF"
                          className="h-8 px-2.5 text-xs shadow-2xs"
                        >
                          <Printer size={13} />
                        </Button>
                        {report.primaryOutcome !== 'COMPLETED' && !report.followUpScheduleId && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => openFollowUpModal(report)}
                            title="Schedule Follow-up Revisit"
                            className="h-8 px-2.5 text-xs shadow-2xs bg-amber-600 hover:bg-amber-700"
                          >
                            <Clock size={13} className="mr-1" /> Revisit
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
                <span className="text-slate-500 block font-semibold mb-1 flex items-center gap-1">
                  <Building size={13} className="text-blue-600" /> Customer & Site
                </span>
                <div className="font-bold text-slate-900">{detailedReport.customerName}</div>
                <div className="text-slate-600 mt-0.5">{detailedReport.siteName}</div>
                <div className="text-slate-500 text-[11px] mt-0.5">{detailedReport.siteAddress}</div>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block font-semibold mb-1 flex items-center gap-1">
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
                      {item.recommendedAction && (
                        <div>
                          <strong>Recommended Action:</strong> {item.recommendedAction}
                        </div>
                      )}
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
