import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarDays,
  Clock,
  UserCheck,
  AlertTriangle,
  Search,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Eye,
  Calendar,
  CheckCircle2,
  ShieldAlert,
  XCircle,
  MapPin,
} from 'lucide-react';
import {
  ServiceSchedule,
  ServiceScheduleStatus,
  TechnicianRecommendationItem,
  UnscheduledWorkItem,
  CreateServiceSchedulePayload,
} from '@/domain/types';
import { scheduleApi } from '@/services/scheduleApi';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Textarea } from '@/components/ui/Textarea';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useToast } from '@/components/ui/useToast';
import { formatDate } from '@/utils/formatters';

interface ServiceScheduleManagementProps {
  onNavigate?: (module: string) => void;
}

type ActiveViewTab = 'today' | 'calendar' | 'list' | 'unscheduled';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

export const ServiceScheduleManagement: React.FC<ServiceScheduleManagementProps> = ({
  onNavigate: _onNavigate,
}) => {
  const { showToast } = useToast();

  // Active View Tab
  const [activeTab, setActiveTab] = useState<ActiveViewTab>('today');

  // Operational Date for "Today" and "Calendar" views
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  // Data states
  const [schedules, setSchedules] = useState<ServiceSchedule[]>([]);
  const [_totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Unscheduled Work state
  const [unscheduledItems, setUnscheduledItems] = useState<UnscheduledWorkItem[]>([]);
  const [isLoadingUnscheduled, setIsLoadingUnscheduled] = useState<boolean>(false);

  // Filter states for List View
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ServiceScheduleStatus>('ALL');

  // Detail Drawer state
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [detailSchedule, setDetailSchedule] = useState<ServiceSchedule | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  // Schedule & Assign Modal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [scheduleToAssign, setScheduleToAssign] = useState<ServiceSchedule | null>(null);
  const [recommendations, setRecommendations] = useState<TechnicianRecommendationItem[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState<boolean>(false);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [isOverride, setIsOverride] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [assignSlotDate, setAssignSlotDate] = useState<string>('');
  const [assignSlotStart, setAssignSlotStart] = useState<string>('09:00');
  const [assignSlotEnd, setAssignSlotEnd] = useState<string>('11:00');
  const [isSubmittingAssignment, setIsSubmittingAssignment] = useState<boolean>(false);

  // Reschedule Modal state
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState<boolean>(false);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleStart, setRescheduleStart] = useState<string>('09:00');
  const [rescheduleEnd, setRescheduleEnd] = useState<string>('11:00');
  const [rescheduleReason, setRescheduleReason] = useState<string>('');
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState<boolean>(false);

  // Cancel Modal state
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState<boolean>(false);

  // Create Schedule Modal (from scratch or from Unscheduled Item)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [activeUnscheduledItem, setActiveUnscheduledItem] = useState<UnscheduledWorkItem | null>(null);
  const [createForm, setCreateForm] = useState<{
    scheduledDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    notes: string;
  }>({
    scheduledDate: new Date().toISOString().slice(0, 10),
    startTime: '09:00',
    endTime: '11:00',
    durationMinutes: 120,
    notes: '',
  });
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);

  // -------------------------------------------------------------------------
  // Data Fetching
  // -------------------------------------------------------------------------

  const fetchSchedules = useCallback(async () => {
    try {
      setIsLoading(true);
      if (activeTab === 'today') {
        const res = await scheduleApi.getSchedules({
          date: selectedDate,
          pageSize: 100,
        });
        const list = res.schedules ?? [];
        setSchedules(list);
        setTotalCount(res.total ?? list.length);
      } else if (activeTab === 'calendar') {
        const res = await scheduleApi.getCalendar(selectedDate, selectedDate);
        const list = res.schedules ?? [];
        setSchedules(list);
        setTotalCount(list.length);
      } else if (activeTab === 'list') {
        const res = await scheduleApi.getSchedules({
          search: searchTerm.trim() || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          page,
          pageSize,
        });
        const list = res.schedules ?? [];
        setSchedules(list);
        setTotalCount(res.total ?? list.length);
      }
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Error Loading Schedules', message: getErrorMessage(err, 'Failed to load schedules') });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeTab, selectedDate, searchTerm, statusFilter, page, showToast]);

  const fetchUnscheduledWork = useCallback(async () => {
    try {
      setIsLoadingUnscheduled(true);
      const res = await scheduleApi.getUnscheduledWork();
      const list = res.items ?? [];
      setUnscheduledItems(list);
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Queue Error', message: getErrorMessage(err, 'Failed to load unscheduled queue') });
    } finally {
      setIsLoadingUnscheduled(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  useEffect(() => {
    fetchUnscheduledWork();
  }, [fetchUnscheduledWork]);

  // Load schedule details when drawer opens
  const openDetailDrawer = async (scheduleId: string) => {
    setSelectedScheduleId(scheduleId);
    try {
      setIsLoadingDetail(true);
      const res = await scheduleApi.getScheduleById(scheduleId);
      setDetailSchedule(res.schedule ?? null);
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Error', message: getErrorMessage(err, 'Failed to load schedule details') });
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // -------------------------------------------------------------------------
  // Recommendation & Assignment Logic
  // -------------------------------------------------------------------------

  const openAssignModal = async (schedule: ServiceSchedule) => {
    setScheduleToAssign(schedule);
    setSelectedTechId(schedule.technicianId || '');
    setIsOverride(false);
    setOverrideReason('');
    setAssignSlotDate(schedule.scheduledDate);
    setAssignSlotStart(schedule.startTime || '09:00');
    setAssignSlotEnd(schedule.endTime || '11:00');
    setIsAssignModalOpen(true);

    try {
      setIsLoadingRecs(true);
      const res = await scheduleApi.getEligibleTechnicians(
        schedule.id,
        schedule.scheduledDate,
        schedule.startTime || '09:00',
        schedule.endTime || '11:00'
      );
      setRecommendations(res.recommendations ?? []);
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Recommendations Error', message: getErrorMessage(err, 'Failed to load technician recommendations') });
    } finally {
      setIsLoadingRecs(false);
    }
  };

  const handleRefreshRecommendations = async () => {
    if (!scheduleToAssign) return;
    try {
      setIsLoadingRecs(true);
      const res = await scheduleApi.getEligibleTechnicians(
        scheduleToAssign.id,
        assignSlotDate,
        assignSlotStart,
        assignSlotEnd
      );
      setRecommendations(res.recommendations ?? []);
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Refresh Error', message: getErrorMessage(err, 'Failed to refresh recommendations') });
    } finally {
      setIsLoadingRecs(false);
    }
  };

  const handleConfirmAssignment = async () => {
    if (!scheduleToAssign || !selectedTechId) {
      showToast({ type: 'error', title: 'Validation Error', message: 'Please select a technician to assign' });
      return;
    }

    const chosen = recommendations.find((r) => r.technicianId === selectedTechId);
    if (chosen && (!chosen.isAvailable || chosen.warnings.length > 0) && !isOverride) {
      showToast({ type: 'warning', title: 'Override Required', message: 'Technician has warnings or is outside availability. Please check Supervisor Override with reason.' });
      return;
    }

    if (isOverride && (!overrideReason || overrideReason.trim().length < 3)) {
      showToast({ type: 'error', title: 'Validation Error', message: 'A valid override reason (at least 3 characters) is required to override constraints' });
      return;
    }

    try {
      setIsSubmittingAssignment(true);
      await scheduleApi.assignTechnician(scheduleToAssign.id, {
        technicianId: selectedTechId,
        isOverride,
        overrideReason: isOverride ? overrideReason.trim() : undefined,
      });

      showToast({ type: 'success', title: 'Technician Assigned', message: `Technician assigned successfully to ${scheduleToAssign.scheduleNumber}` });
      setIsAssignModalOpen(false);
      fetchSchedules();
      fetchUnscheduledWork();
      if (selectedScheduleId === scheduleToAssign.id) {
        openDetailDrawer(scheduleToAssign.id);
      }
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Assignment Failed', message: getErrorMessage(err, 'Assignment failed. Check for schedule conflicts.') });
    } finally {
      setIsSubmittingAssignment(false);
    }
  };

  // -------------------------------------------------------------------------
  // Reschedule & Cancel Handlers
  // -------------------------------------------------------------------------

  const openRescheduleModal = (schedule: ServiceSchedule) => {
    setScheduleToAssign(schedule);
    setRescheduleDate(schedule.scheduledDate);
    setRescheduleStart(schedule.startTime || '09:00');
    setRescheduleEnd(schedule.endTime || '11:00');
    setRescheduleReason('');
    setIsRescheduleModalOpen(true);
  };

  const handleConfirmReschedule = async () => {
    if (!scheduleToAssign || !rescheduleDate) {
      showToast({ type: 'error', title: 'Validation Error', message: 'Please select a new scheduled date' });
      return;
    }

    try {
      setIsSubmittingReschedule(true);
      await scheduleApi.reschedule(scheduleToAssign.id, {
        scheduledDate: rescheduleDate,
        startTime: rescheduleStart,
        endTime: rescheduleEnd,
        reason: rescheduleReason.trim() || undefined,
      });

      showToast({ type: 'success', title: 'Rescheduled', message: `Schedule ${scheduleToAssign.scheduleNumber} rescheduled to ${formatDate(rescheduleDate)}` });
      setIsRescheduleModalOpen(false);
      fetchSchedules();
      if (selectedScheduleId === scheduleToAssign.id) {
        openDetailDrawer(scheduleToAssign.id);
      }
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Rescheduling Failed', message: getErrorMessage(err, 'Rescheduling failed. Check technician conflicts.') });
    } finally {
      setIsSubmittingReschedule(false);
    }
  };

  const openCancelModal = (schedule: ServiceSchedule) => {
    setScheduleToAssign(schedule);
    setCancelReason('');
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!scheduleToAssign || !cancelReason || cancelReason.trim().length < 3) {
      showToast({ type: 'error', title: 'Validation Error', message: 'Cancellation reason is required (at least 3 characters)' });
      return;
    }

    try {
      setIsSubmittingCancel(true);
      await scheduleApi.cancelSchedule(scheduleToAssign.id, {
        reason: cancelReason.trim(),
      });

      showToast({ type: 'success', title: 'Schedule Cancelled', message: `Schedule ${scheduleToAssign.scheduleNumber} has been cancelled` });
      setIsCancelModalOpen(false);
      fetchSchedules();
      fetchUnscheduledWork();
      if (selectedScheduleId === scheduleToAssign.id) {
        openDetailDrawer(scheduleToAssign.id);
      }
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Cancellation Failed', message: getErrorMessage(err, 'Failed to cancel schedule') });
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // -------------------------------------------------------------------------
  // Create Schedule for Unscheduled Item
  // -------------------------------------------------------------------------

  const openCreateForUnscheduled = (item: UnscheduledWorkItem) => {
    setActiveUnscheduledItem(item);
    setCreateForm({
      scheduledDate: item.dueDate || new Date().toISOString().slice(0, 10),
      startTime: '09:00',
      endTime: '11:00',
      durationMinutes: item.suggestedDurationMinutes || 120,
      notes: item.description ? `Source: ${item.identifier} — ${item.description}` : '',
    });
    setIsCreateModalOpen(true);
  };

  const handleConfirmCreate = async () => {
    if (!createForm.scheduledDate) {
      showToast({ type: 'error', title: 'Validation Error', message: 'Scheduled date is required' });
      return;
    }

    try {
      setIsSubmittingCreate(true);
      const payload: CreateServiceSchedulePayload = {
        scheduledDate: createForm.scheduledDate,
        startTime: createForm.startTime,
        endTime: createForm.endTime,
        durationMinutes: createForm.durationMinutes,
        notes: createForm.notes.trim() || undefined,
      };

      if (activeUnscheduledItem) {
        if (activeUnscheduledItem.type === 'SERVICE_REQUEST') {
          payload.serviceRequestId = activeUnscheduledItem.id;
        } else if (activeUnscheduledItem.type === 'PM_OBLIGATION') {
          payload.pmObligationId = activeUnscheduledItem.id;
          payload.amcId = activeUnscheduledItem.amcId;
          payload.assetId = activeUnscheduledItem.assetId || undefined;
          payload.visitNumber = activeUnscheduledItem.visitNumber ?? undefined;
        }
        payload.customerId = activeUnscheduledItem.customerId;
        payload.siteId = activeUnscheduledItem.siteId;
      }

      const res = await scheduleApi.createSchedule(payload);
      showToast({ type: 'success', title: 'Schedule Created', message: `Schedule ${res.schedule.scheduleNumber} created successfully!` });
      setIsCreateModalOpen(false);
      setActiveUnscheduledItem(null);
      fetchSchedules();
      fetchUnscheduledWork();

      // Open assign modal right away for newly created schedule
      openAssignModal(res.schedule);
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Creation Failed', message: getErrorMessage(err, 'Failed to create schedule') });
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // -------------------------------------------------------------------------
  // KPI Metrics Calculation
  // -------------------------------------------------------------------------

  const metrics = useMemo(() => {
    const list = Array.isArray(schedules) ? schedules : [];
    const queue = Array.isArray(unscheduledItems) ? unscheduledItems : [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayJobs = list.filter((s) => s.scheduledDate === todayStr);
    const assignedJobs = list.filter((s) => Boolean(s.technicianId));
    const unassignedJobs = list.filter((s) => !s.technicianId && s.status !== 'CANCELLED');

    return {
      todayCount: todayJobs.length,
      unscheduledCount: queue.length,
      assignedCount: assignedJobs.length,
      unassignedCount: unassignedJobs.length,
    };
  }, [schedules, unscheduledItems]);

  // Date stepper
  const handleDateShift = (days: number) => {
    const curr = new Date(selectedDate);
    curr.setDate(curr.getDate() + days);
    setSelectedDate(curr.toISOString().slice(0, 10));
  };

  return (
    <div className="module-container" style={{ padding: 'var(--space-6)', maxWidth: '1440px', margin: '0 auto' }}>
      {/* 1. Header & Title */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 'var(--space-6)',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <CalendarDays style={{ width: '28px', height: '28px', color: 'var(--color-brand)' }} />
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              Service Scheduling & Assignments
            </h1>
          </div>
          <p style={{ margin: 'var(--space-1) 0 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Phase 9 operational dispatch: appointment booking, skill/area matching, and conflict-free technician assignment.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsRefreshing(true);
              fetchSchedules();
              fetchUnscheduledWork();
            }}
            disabled={isRefreshing}
          >
            <RefreshCw className={isRefreshing ? 'animate-spin' : ''} style={{ width: '16px', height: '16px' }} />
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setActiveUnscheduledItem(null);
              setCreateForm({
                scheduledDate: selectedDate,
                startTime: '09:00',
                endTime: '11:00',
                durationMinutes: 120,
                notes: '',
              });
              setIsCreateModalOpen(true);
            }}
          >
            <Plus style={{ width: '16px', height: '16px' }} />
            New Appointment
          </Button>
        </div>
      </div>

      {/* 2. KPI Metrics Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-brand-50)', color: 'var(--color-brand)' }}>
            <Calendar style={{ width: '24px', height: '24px' }} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>TODAY'S VISITS</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-main)' }}>{metrics.todayCount}</div>
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            cursor: 'pointer',
            border: activeTab === 'unscheduled' ? '2px solid var(--color-brand)' : undefined,
          }}
          onClick={() => setActiveTab('unscheduled')}
        >
          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-warning-50)', color: 'var(--color-warning-solid)' }}>
            <AlertTriangle style={{ width: '24px', height: '24px' }} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>UNSCHEDULED QUEUE</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-warning-solid)' }}>
              {metrics.unscheduledCount}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-50)', color: 'var(--color-success-solid)' }}>
            <UserCheck style={{ width: '24px', height: '24px' }} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>ASSIGNED VISITS</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-main)' }}>{metrics.assignedCount}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-neutral-100)', color: 'var(--text-muted)' }}>
            <Clock style={{ width: '24px', height: '24px' }} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>UNASSIGNED SLOTS</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-main)' }}>{metrics.unassignedCount}</div>
          </div>
        </div>
      </div>

      {/* 3. Navigation View Switcher */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-neutral)',
          paddingBottom: 'var(--space-3)',
          marginBottom: 'var(--space-6)',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            className={`tab-btn ${activeTab === 'today' ? 'active font-bold text-brand' : 'text-muted'}`}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'today' ? 'var(--color-brand-50)' : 'transparent',
              color: activeTab === 'today' ? 'var(--color-brand)' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => setActiveTab('today')}
          >
            Today's Operations
          </button>

          <button
            className={`tab-btn ${activeTab === 'calendar' ? 'active font-bold text-brand' : 'text-muted'}`}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'calendar' ? 'var(--color-brand-50)' : 'transparent',
              color: activeTab === 'calendar' ? 'var(--color-brand)' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => setActiveTab('calendar')}
          >
            Day Calendar
          </button>

          <button
            className={`tab-btn ${activeTab === 'list' ? 'active font-bold text-brand' : 'text-muted'}`}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'list' ? 'var(--color-brand-50)' : 'transparent',
              color: activeTab === 'list' ? 'var(--color-brand)' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => setActiveTab('list')}
          >
            All Schedules
          </button>

          <button
            className={`tab-btn ${activeTab === 'unscheduled' ? 'active font-bold text-brand' : 'text-muted'}`}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'unscheduled' ? 'var(--color-warning-50)' : 'transparent',
              color: activeTab === 'unscheduled' ? 'var(--color-warning-solid)' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
            onClick={() => setActiveTab('unscheduled')}
          >
            Unscheduled Work
            {unscheduledItems.length > 0 && (
              <span
                style={{
                  backgroundColor: 'var(--color-warning-solid)',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '2px 8px',
                  fontSize: '11px',
                }}
              >
                {unscheduledItems.length}
              </span>
            )}
          </button>
        </div>

        {/* Date Selector for Today / Calendar views */}
        {(activeTab === 'today' || activeTab === 'calendar') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Button variant="secondary" size="sm" onClick={() => handleDateShift(-1)}>
              <ChevronLeft style={{ width: '16px', height: '16px' }} />
            </Button>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: '160px', padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--text-sm)' }}
            />
            <Button variant="secondary" size="sm" onClick={() => handleDateShift(1)}>
              <ChevronRight style={{ width: '16px', height: '16px' }} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
            >
              Today
            </Button>
          </div>
        )}
      </div>

      {/* 4. Tab View Content */}

      {/* VIEW A & B: TODAY / CALENDAR (Daily Operations View) */}
      {(activeTab === 'today' || activeTab === 'calendar') && (
        <div>
          <div style={{ marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
              {activeTab === 'today' ? `Operations on ${formatDate(selectedDate)}` : `Day Slots for ${formatDate(selectedDate)}`}
            </h2>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {schedules.length} {schedules.length === 1 ? 'service scheduled' : 'services scheduled'}
            </span>
          </div>

          {isLoading ? (
            <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <span className="animate-spin" style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--color-brand)', borderRightColor: 'transparent', borderRadius: '50%', marginBottom: 'var(--space-2)' }} />
              <div>Loading schedule appointments...</div>
            </div>
          ) : schedules.length === 0 ? (
            <div className="card" style={{ padding: 'var(--space-10)', textAlign: 'center' }}>
              <EmptyState
                icon={<CalendarDays style={{ width: '40px', height: '40px' }} />}
                title="No Services Scheduled For This Date"
                description={`There are currently no scheduled appointments for ${formatDate(selectedDate)}.`}
                actionLabel="Schedule from Queue"
                onAction={() => setActiveTab('unscheduled')}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="card"
                  style={{
                    padding: 'var(--space-4)',
                    display: 'grid',
                    gridTemplateColumns: '140px 1.5fr 1.5fr 1fr 180px',
                    alignItems: 'center',
                    gap: 'var(--space-4)',
                    borderLeft: schedule.technicianId ? '4px solid var(--color-success-solid)' : '4px solid var(--color-warning-solid)',
                  }}
                >
                  {/* Slot Time */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontWeight: 700, color: 'var(--text-main)', fontSize: 'var(--text-base)' }}>
                      <Clock style={{ width: '16px', height: '16px', color: 'var(--color-brand)' }} />
                      {schedule.startTime} – {schedule.endTime}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {schedule.durationMinutes} mins
                    </div>
                  </div>

                  {/* Customer & Physical Site */}
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 'var(--text-sm)' }}>
                      {schedule.customerName || 'Customer'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                      <MapPin style={{ width: '12px', height: '12px' }} />
                      {schedule.siteName} • {schedule.siteAddress || 'Site Address'}
                    </div>
                  </div>

                  {/* Asset & Source */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-brand)' }}>
                        {schedule.assetTag || 'Site-level Service'}
                      </span>
                      {schedule.brand && (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                          {schedule.brand} {schedule.modelNumber}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {schedule.serviceRequestNumber ? (
                        <span>Ticket: <strong>{schedule.serviceRequestNumber}</strong> ({schedule.serviceRequestType || 'General'})</span>
                      ) : schedule.amcContractNumber ? (
                        <span>AMC: <strong>{schedule.amcContractNumber}</strong> (Visit #{schedule.visitNumber || 1})</span>
                      ) : (
                        <span>Ref: {schedule.scheduleNumber}</span>
                      )}
                    </div>
                  </div>

                  {/* Assigned Technician & Status */}
                  <div>
                    <div style={{ marginBottom: 'var(--space-1)' }}>
                      <StatusBadge status={schedule.status} />
                    </div>
                    {schedule.technicianName ? (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-main)', fontWeight: 600 }}>
                        Tech: {schedule.technicianName} ({schedule.technicianCode})
                      </div>
                    ) : (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning-solid)', fontWeight: 600 }}>
                        ⚠ Unassigned
                      </div>
                    )}
                  </div>

                  {/* Operational Actions */}
                  <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openDetailDrawer(schedule.id)}
                      title="View Details"
                    >
                      <Eye style={{ width: '14px', height: '14px' }} />
                      Details
                    </Button>

                    <Button
                      variant={schedule.technicianId ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => openAssignModal(schedule)}
                      title={schedule.technicianId ? 'Reassign' : 'Assign Technician'}
                    >
                      <UserCheck style={{ width: '14px', height: '14px' }} />
                      {schedule.technicianId ? 'Reassign' : 'Assign'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW C: ALL SCHEDULES (Filterable List) */}
      {activeTab === 'list' && (
        <div>
          {/* Search & Status Filters */}
          <div
            className="card"
            style={{
              padding: 'var(--space-4)',
              display: 'flex',
              gap: 'var(--space-4)',
              alignItems: 'center',
              marginBottom: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: '240px' }}>
              <Input
                placeholder="Search schedule number, customer, site, asset tag..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>STATUS:</span>
              <select
                className="select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'ALL' | ServiceScheduleStatus);
                  setPage(1);
                }}
                style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-neutral)' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="RESCHEDULED">Rescheduled</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <span className="animate-spin" style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--color-brand)', borderRightColor: 'transparent', borderRadius: '50%', marginBottom: 'var(--space-2)' }} />
              <div>Loading schedules...</div>
            </div>
          ) : schedules.length === 0 ? (
            <div className="card" style={{ padding: 'var(--space-10)', textAlign: 'center' }}>
              <EmptyState
                icon={<Search style={{ width: '40px', height: '40px' }} />}
                title="No Matching Schedules"
                description="Try clearing your search query or changing the status filter."
              />
            </div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-neutral)', backgroundColor: 'var(--bg-canvas)' }}>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left' }}>SCHEDULE #</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left' }}>DATE & TIME</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left' }}>CUSTOMER & SITE</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left' }}>ASSET</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left' }}>TECHNICIAN</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left' }}>STATUS</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((schedule) => (
                    <tr key={schedule.id} style={{ borderBottom: '1px solid var(--border-neutral)' }}>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontFamily: 'monospace', fontWeight: 600 }}>
                        {schedule.scheduleNumber}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <div>{formatDate(schedule.scheduledDate)}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                          {schedule.startTime} – {schedule.endTime}
                        </div>
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <div style={{ fontWeight: 600 }}>{schedule.customerName || 'Customer'}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                          {schedule.siteName} • {schedule.siteAddress}
                        </div>
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-brand)', fontFamily: 'monospace' }}>
                          {schedule.assetTag || 'Site-level'}
                        </div>
                        {schedule.brand && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            {schedule.brand} {schedule.modelNumber}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        {schedule.technicianName ? (
                          <div style={{ fontWeight: 600 }}>{schedule.technicianName}</div>
                        ) : (
                          <span style={{ color: 'var(--color-warning-solid)', fontWeight: 600, fontSize: 'var(--text-xs)' }}>
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <StatusBadge status={schedule.status} />
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                          <Button variant="secondary" size="sm" onClick={() => openDetailDrawer(schedule.id)}>
                            <Eye style={{ width: '14px', height: '14px' }} />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openAssignModal(schedule)}
                            title={schedule.technicianId ? 'Reassign' : 'Assign'}
                          >
                            <UserCheck style={{ width: '14px', height: '14px' }} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW D: UNSCHEDULED WORK QUEUE */}
      {activeTab === 'unscheduled' && (
        <div>
          <div style={{ marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
                Unscheduled Work Queue
              </h2>
              <p style={{ margin: 'var(--space-1) 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Pending Service Requests and upcoming Preventive Maintenance obligations that require an appointment slot.
              </p>
            </div>
            <Badge variant="warning">{unscheduledItems.length} awaiting schedule</Badge>
          </div>

          {isLoadingUnscheduled ? (
            <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <span className="animate-spin" style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--color-brand)', borderRightColor: 'transparent', borderRadius: '50%', marginBottom: 'var(--space-2)' }} />
              <div>Scanning unscheduled obligations...</div>
            </div>
          ) : unscheduledItems.length === 0 ? (
            <div className="card" style={{ padding: 'var(--space-10)', textAlign: 'center' }}>
              <EmptyState
                icon={<CheckCircle2 style={{ width: '40px', height: '40px' }} />}
                title="All Work Is Scheduled"
                description="There are currently no unscheduled service requests or PM obligations in the queue."
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {unscheduledItems.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="card"
                  style={{
                    padding: 'var(--space-4)',
                    display: 'grid',
                    gridTemplateColumns: '130px 1.5fr 1.5fr 1fr 180px',
                    alignItems: 'center',
                    gap: 'var(--space-4)',
                    borderLeft: item.type === 'SERVICE_REQUEST' ? '4px solid var(--color-brand)' : '4px solid var(--color-amc-solid)',
                  }}
                >
                  {/* Identifier & Type */}
                  <div>
                    <div style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-main)', fontSize: 'var(--text-sm)' }}>
                      {item.identifier}
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <Badge variant={item.type === 'SERVICE_REQUEST' ? 'info' : 'amc'}>
                        {item.type === 'SERVICE_REQUEST' ? 'Breakdown' : 'PM Visit'}
                      </Badge>
                    </div>
                  </div>

                  {/* Customer & Site */}
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 'var(--text-sm)' }}>
                      {item.customerName}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {item.siteName} • {item.siteAddress}
                    </div>
                  </div>

                  {/* Asset Tag & Specs */}
                  <div>
                    <div style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-brand)', fontSize: 'var(--text-sm)' }}>
                      {item.assetTag || 'Site-level Service'}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {item.brand ? `${item.brand} ${item.modelNumber || ''}` : item.description}
                    </div>
                  </div>

                  {/* Due Date & Priority */}
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>DUE / REPORTED:</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 'var(--text-sm)' }}>
                      {formatDate(item.dueDate)}
                    </div>
                    {item.priority && (
                      <div style={{ marginTop: '2px', fontSize: 'var(--text-xs)', fontWeight: 600, color: item.priority === 'HIGH' || item.priority === 'URGENT' ? 'var(--color-error-solid)' : 'var(--text-muted)' }}>
                        Priority: {item.priority}
                      </div>
                    )}
                  </div>

                  {/* 1-Click Action */}
                  <div style={{ textAlign: 'right' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => openCreateForUnscheduled(item)}
                    >
                      <CalendarDays style={{ width: '14px', height: '14px' }} />
                      Schedule Slot
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. "Schedule & Assign" Modal with "Why This Technician" Recommendations */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={scheduleToAssign ? `Assign Technician — ${scheduleToAssign.scheduleNumber}` : 'Assign Technician'}
        maxWidth="780px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {scheduleToAssign && (
            <div
              style={{
                backgroundColor: 'var(--bg-canvas)',
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 'var(--space-2)',
                fontSize: 'var(--text-xs)',
              }}
            >
              <div><strong>Customer:</strong> {scheduleToAssign.customerName}</div>
              <div><strong>Site Area:</strong> {scheduleToAssign.siteAddress || scheduleToAssign.siteName}</div>
              <div><strong>Asset:</strong> {scheduleToAssign.assetTag || 'General'} ({scheduleToAssign.acType || scheduleToAssign.brand || 'HVAC'})</div>
              <div><strong>Date:</strong> {formatDate(assignSlotDate)} ({assignSlotStart} – {assignSlotEnd})</div>
            </div>
          )}

          {/* Time Slot Adjuster */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Date</label>
              <Input
                type="date"
                value={assignSlotDate}
                onChange={(e) => setAssignSlotDate(e.target.value)}
              />
            </div>
            <div style={{ width: '110px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Start Time</label>
              <Input
                type="time"
                value={assignSlotStart}
                onChange={(e) => setAssignSlotStart(e.target.value)}
              />
            </div>
            <div style={{ width: '110px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>End Time</label>
              <Input
                type="time"
                value={assignSlotEnd}
                onChange={(e) => setAssignSlotEnd(e.target.value)}
              />
            </div>
            <div style={{ alignSelf: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={handleRefreshRecommendations} disabled={isLoadingRecs}>
                <RefreshCw className={isLoadingRecs ? 'animate-spin' : ''} style={{ width: '14px', height: '14px' }} />
                Evaluate Technicians
              </Button>
            </div>
          </div>

          {/* "Why This Technician" List */}
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-main)', marginBottom: 'var(--space-2)' }}>
              Technician Recommendations & Availability
            </div>

            {isLoadingRecs ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                <span className="animate-spin" style={{ display: 'inline-block', width: '24px', height: '24px', border: '2px solid var(--color-brand)', borderRightColor: 'transparent', borderRadius: '50%', marginBottom: 'var(--space-2)' }} />
                <div>Evaluating working hours, service areas, and schedule conflicts...</div>
              </div>
            ) : recommendations.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
                No active technicians found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: '340px', overflowY: 'auto' }}>
                {recommendations.map((rec, idx) => {
                  const isSelected = selectedTechId === rec.technicianId;
                  const isRecommended = idx === 0 && rec.isEligible && !rec.hasConflict && rec.warnings.length === 0;

                  return (
                    <div
                      key={rec.technicianId}
                      onClick={() => setSelectedTechId(rec.technicianId)}
                      style={{
                        padding: 'var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? '2px solid var(--color-brand)' : '1px solid var(--border-neutral)',
                        backgroundColor: isSelected ? 'var(--color-brand-50)' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <input
                            type="radio"
                            checked={isSelected}
                            onChange={() => setSelectedTechId(rec.technicianId)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: 'var(--text-sm)' }}>
                            {rec.name}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            ({rec.technicianCode})
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          {rec.hasConflict ? (
                            <Badge variant="error">SCHEDULE CONFLICT</Badge>
                          ) : !rec.isEligible || rec.warnings.length > 0 ? (
                            <Badge variant="warning">CONSTRAINED</Badge>
                          ) : isRecommended ? (
                            <Badge variant="success">RECOMMENDED</Badge>
                          ) : (
                            <Badge variant="info">ELIGIBLE</Badge>
                          )}
                        </div>
                      </div>

                      {/* Reasons & Badges */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                        {rec.reasons.map((reason, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: '11px',
                              backgroundColor: 'var(--color-success-50)',
                              color: 'var(--color-success-solid)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 500,
                            }}
                          >
                            {reason}
                          </span>
                        ))}

                        {rec.warnings.map((warn, idx) => (
                          <span
                            key={`w-${idx}`}
                            style={{
                              fontSize: '11px',
                              backgroundColor: 'var(--color-error-50)',
                              color: 'var(--color-error-solid)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 600,
                            }}
                          >
                            {warn}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Supervisor Override Block */}
          {selectedTechId && (() => {
            const chosen = recommendations.find((r) => r.technicianId === selectedTechId);
            if (chosen && (!chosen.isAvailable || chosen.warnings.length > 0)) {
              return (
                <div
                  style={{
                    backgroundColor: 'var(--color-warning-50)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-warning-solid)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <ShieldAlert style={{ width: '18px', height: '18px', color: 'var(--color-warning-solid)' }} />
                    <span style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--color-warning-solid)' }}>
                      Supervisor Operational Override Required
                    </span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', cursor: 'pointer', marginBottom: 'var(--space-2)' }}>
                    <input
                      type="checkbox"
                      checked={isOverride}
                      onChange={(e) => setIsOverride(e.target.checked)}
                    />
                    <span>I confirm manual supervisor override for this technician assignment.</span>
                  </label>
                  {isOverride && (
                    <Input
                      placeholder="Enter override reason (e.g. Authorized emergency coverage by supervisor)..."
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      style={{ fontSize: 'var(--text-xs)' }}
                    />
                  )}
                </div>
              );
            }
            return null;
          })()}

          {/* Modal Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            <Button variant="secondary" onClick={() => setIsAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmAssignment}
              disabled={isSubmittingAssignment || !selectedTechId}
            >
              {isSubmittingAssignment ? 'Assigning...' : 'Confirm Assignment'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 6. Reschedule Modal */}
      <Modal
        isOpen={isRescheduleModalOpen}
        onClose={() => setIsRescheduleModalOpen(false)}
        title={scheduleToAssign ? `Reschedule — ${scheduleToAssign.scheduleNumber}` : 'Reschedule'}
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>New Date</label>
            <Input
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Start Time</label>
              <Input
                type="time"
                value={rescheduleStart}
                onChange={(e) => setRescheduleStart(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>End Time</label>
              <Input
                type="time"
                value={rescheduleEnd}
                onChange={(e) => setRescheduleEnd(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Reason for Rescheduling</label>
            <Textarea
              placeholder="e.g. Customer requested afternoon visit due to office hours..."
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value)}
              rows={3}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <Button variant="secondary" onClick={() => setIsRescheduleModalOpen(false)}>
              Back
            </Button>
            <Button variant="primary" onClick={handleConfirmReschedule} disabled={isSubmittingReschedule}>
              {isSubmittingReschedule ? 'Rescheduling...' : 'Confirm Reschedule'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 7. Cancel Schedule Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title={scheduleToAssign ? `Cancel Schedule — ${scheduleToAssign.scheduleNumber}` : 'Cancel Schedule'}
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Cancelling this schedule will release the assigned technician slot and preserve the cancellation record in the audit log.
          </p>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
              Cancellation Reason *
            </label>
            <Textarea
              placeholder="Provide reason for cancellation (e.g. Customer cancelled appointment, relocated, etc.)..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <Button variant="secondary" onClick={() => setIsCancelModalOpen(false)}>
              Keep Schedule
            </Button>
            <Button variant="danger" onClick={handleConfirmCancel} disabled={isSubmittingCancel}>
              {isSubmittingCancel ? 'Cancelling...' : 'Cancel Schedule'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 8. Create Schedule Modal (from Unscheduled Queue) */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={activeUnscheduledItem ? `Book Appointment for ${activeUnscheduledItem.identifier}` : 'New Service Schedule'}
        maxWidth="520px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {activeUnscheduledItem && (
            <div
              style={{
                backgroundColor: 'var(--bg-canvas)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)',
              }}
            >
              <div><strong>Customer:</strong> {activeUnscheduledItem.customerName}</div>
              <div><strong>Site:</strong> {activeUnscheduledItem.siteName} • {activeUnscheduledItem.siteAddress}</div>
              {activeUnscheduledItem.assetTag && <div><strong>Asset Tag:</strong> {activeUnscheduledItem.assetTag}</div>}
              <div><strong>Source:</strong> {activeUnscheduledItem.identifier} ({activeUnscheduledItem.type === 'SERVICE_REQUEST' ? 'Service Ticket' : 'AMC PM Obligation'})</div>
            </div>
          )}

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Scheduled Date *</label>
            <Input
              type="date"
              value={createForm.scheduledDate}
              onChange={(e) => setCreateForm({ ...createForm, scheduledDate: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Start Time</label>
              <Input
                type="time"
                value={createForm.startTime}
                onChange={(e) => setCreateForm({ ...createForm, startTime: e.target.value })}
              />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>End Time</label>
              <Input
                type="time"
                value={createForm.endTime}
                onChange={(e) => setCreateForm({ ...createForm, endTime: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Notes</label>
            <Textarea
              placeholder="Optional notes or instructions for the technician..."
              value={createForm.notes}
              onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
              rows={2}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmCreate} disabled={isSubmittingCreate}>
              {isSubmittingCreate ? 'Creating...' : 'Create & Assign Tech'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 9. Schedule Detail Drawer */}
      <Drawer
        isOpen={Boolean(selectedScheduleId)}
        onClose={() => setSelectedScheduleId(null)}
        title={detailSchedule ? detailSchedule.scheduleNumber : 'Schedule Details'}
        width="540px"
      >
        {isLoadingDetail || !detailSchedule ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <span className="animate-spin" style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--color-brand)', borderRightColor: 'transparent', borderRadius: '50%', marginBottom: 'var(--space-2)' }} />
            <div>Loading appointment details...</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {/* Status & Timing Banner */}
            <div
              style={{
                backgroundColor: 'var(--bg-canvas)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>STATUS</div>
                <div style={{ marginTop: '4px' }}>
                  <StatusBadge status={detailSchedule.status} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>APPOINTMENT SLOT</div>
                <div style={{ fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
                  {formatDate(detailSchedule.scheduledDate)}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand)', fontWeight: 600 }}>
                  {detailSchedule.startTime} – {detailSchedule.endTime} ({detailSchedule.durationMinutes} mins)
                </div>
              </div>
            </div>

            {/* Assigned Technician Card */}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                ASSIGNED OPERATIONAL RESOURCE
              </div>
              {detailSchedule.technicianName ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--text-main)' }}>
                      {detailSchedule.technicianName}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Code: {detailSchedule.technicianCode} • Phone: {detailSchedule.technicianPhone || 'N/A'}
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => openAssignModal(detailSchedule)}>
                    Reassign
                  </Button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: 'var(--color-warning-solid)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                    No technician currently assigned to this slot
                  </div>
                  <Button variant="primary" size="sm" onClick={() => openAssignModal(detailSchedule)}>
                    Assign Now
                  </Button>
                </div>
              )}
            </div>

            {/* Physical AC Asset Information (Section 28) */}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                PHYSICAL AC ASSET & LOCATION
              </div>
              {detailSchedule.assetTag ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--text-sm)' }}>
                  <div>
                    <strong>Asset Tag:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', color: 'var(--color-brand)', fontWeight: 700 }}>
                      {detailSchedule.assetTag}
                    </span>
                  </div>
                  {detailSchedule.brand && (
                    <div>
                      <strong>Brand / Model:</strong> {detailSchedule.brand} {detailSchedule.modelNumber || ''} ({detailSchedule.acType || 'AC'})
                    </div>
                  )}
                  {detailSchedule.roomLocation && (
                    <div>
                      <strong>Room / Location:</strong> {detailSchedule.roomLocation}
                    </div>
                  )}
                  <div>
                    <strong>Customer Site:</strong> {detailSchedule.siteName} — {detailSchedule.siteAddress}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  Site-level service request (No specific AC asset attached).
                </div>
              )}
            </div>

            {/* Source Obligation Linkage */}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                SERVICE SOURCE & CONTRACT LINK
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--text-sm)' }}>
                {detailSchedule.serviceRequestNumber ? (
                  <div>
                    <strong>Service Request:</strong> {detailSchedule.serviceRequestNumber} ({detailSchedule.serviceRequestType || 'General'})
                  </div>
                ) : detailSchedule.amcContractNumber ? (
                  <div>
                    <strong>AMC Contract:</strong> {detailSchedule.amcContractNumber} (Visit #{detailSchedule.visitNumber || 1})
                  </div>
                ) : (
                  <div>Direct Operational Schedule</div>
                )}
                <div>
                  <strong>Customer:</strong> {detailSchedule.customerName} ({detailSchedule.customerCode || 'N/A'})
                </div>
                {detailSchedule.notes && (
                  <div style={{ marginTop: 'var(--space-2)', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                    "{detailSchedule.notes}"
                  </div>
                )}
              </div>
            </div>

            {/* Assignment History Audit Log */}
            {detailSchedule.assignmentHistory && detailSchedule.assignmentHistory.length > 0 && (
              <div className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                  ASSIGNMENT AUDIT TRAIL
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {detailSchedule.assignmentHistory.map((hist) => (
                    <div
                      key={hist.id}
                      style={{
                        padding: 'var(--space-2)',
                        backgroundColor: 'var(--bg-canvas)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600 }}>{hist.technicianName} ({hist.technicianCode})</span>
                        <Badge variant={hist.status === 'ASSIGNED' ? 'success' : 'neutral'}>{hist.status}</Badge>
                      </div>
                      <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                        Assigned: {formatDate(hist.assignedAt)}
                        {hist.isOverride && <span style={{ color: 'var(--color-warning-solid)', marginLeft: '6px' }}>(Supervisor Override)</span>}
                      </div>
                      {hist.overrideReason && (
                        <div style={{ fontStyle: 'italic', marginTop: '2px', color: 'var(--text-muted)' }}>
                          Reason: {hist.overrideReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions Footer in Drawer */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', paddingTop: 'var(--space-2)' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openRescheduleModal(detailSchedule)}
              >
                <Calendar style={{ width: '14px', height: '14px' }} />
                Reschedule
              </Button>

              {detailSchedule.status !== 'CANCELLED' && detailSchedule.status !== 'COMPLETED' && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => openCancelModal(detailSchedule)}
                >
                  <XCircle style={{ width: '14px', height: '14px' }} />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default ServiceScheduleManagement;
