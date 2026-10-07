import React, { useState, useEffect, useCallback } from 'react';
import {
  HardHat,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Edit2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  Calendar,
  Clock,
  MapPin,
  Wrench,
  UserCheck,
  UserX,
  Briefcase,
  FileText,
} from 'lucide-react';
import { apiClient, ApiError } from '@/services/api/client';
import {
  Technician,
  TechnicianStatus,
  WeekDay,
} from '@/domain/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useToast } from '@/components/ui/useToast';
import { formatDate } from '@/utils/formatters';

const STANDARD_AC_SKILLS = [
  'Split AC',
  'Window AC',
  'Cassette AC',
  'Ductable AC',
  'VRF / VRV',
  'Central AC',
  'Electrical Diagnosis',
  'Refrigeration Cycle',
  'Gas Charging',
  'Leak Detection & Repair',
  'Compressor Replacement',
  'PCB Repair & Diagnostics',
  'AC Installation & Commissioning',
  'Preventive Maintenance Cleaning',
];

const STANDARD_SERVICE_AREAS = [
  'Panvel',
  'Navi Mumbai',
  'Kharghar',
  'Vashi',
  'Belapur',
  'Nerul',
  'Airoli',
  'Thane',
  'Mumbai - Central',
  'Mumbai - Western',
  'Mumbai - South',
];

const ALL_WEEK_DAYS: WeekDay[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

interface TechniciansApiResponse {
  technicians: Technician[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

interface TechnicianApiResponse {
  technician: Technician;
}

export const TechnicianManagement: React.FC<{ onNavigate?: (item: string) => void }> = () => {
  const { showToast } = useToast();

  const toast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
      showToast({
        title: message,
        type,
      });
    },
    [showToast]
  );

  // Directory State
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filtering
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [skillFilter, setSkillFilter] = useState<string>('ALL');
  const [areaFilter, setAreaFilter] = useState<string>('ALL');

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Selected Technician & Drawer
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Add / Edit Modal
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);

  // Form Fields
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkillInput, setCustomSkillInput] = useState<string>('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [customAreaInput, setCustomAreaInput] = useState<string>('');
  const [selectedDays, setSelectedDays] = useState<WeekDay[]>([
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
  ]);
  const [workStart, setWorkStart] = useState<string>('09:00');
  const [workEnd, setWorkEnd] = useState<string>('18:00');
  const [formStatus, setFormStatus] = useState<TechnicianStatus>('AVAILABLE');
  const [maxDailyWorkload, setMaxDailyWorkload] = useState<number>(5);
  const [joiningDate, setJoiningDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Status Change Modal
  const [isStatusModalOpen, setIsStatusModalOpen] = useState<boolean>(false);
  const [targetStatus, setTargetStatus] = useState<TechnicianStatus>('AVAILABLE');
  const [statusReason, setStatusReason] = useState<string>('');
  const [statusSubmitting, setStatusSubmitting] = useState<boolean>(false);

  // Deactivate Confirmation Modal
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState<boolean>(false);
  const [deactivateReason, setDeactivateReason] = useState<string>('');
  const [deactivateSubmitting, setDeactivateSubmitting] = useState<boolean>(false);
  const [deactivateConflictError, setDeactivateConflictError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch Technicians List
  const fetchTechnicians = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams();
        if (debouncedSearch.trim()) queryParams.set('search', debouncedSearch.trim());
        if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
        if (activeFilter !== 'ALL') queryParams.set('isActive', activeFilter);
        if (skillFilter !== 'ALL') queryParams.set('skill', skillFilter);
        if (areaFilter !== 'ALL') queryParams.set('serviceArea', areaFilter);
        queryParams.set('page', String(page));
        queryParams.set('pageSize', String(pageSize));

        const res = await apiClient.get<TechniciansApiResponse>(
          `/technicians?${queryParams.toString()}`
        );

        const list = res.technicians || [];
        setTechnicians(list);
        setTotalRecords(res.total ?? list.length);
        setTotalPages(res.totalPages ?? 1);
      } catch (err: unknown) {
        const msg =
          err instanceof ApiError
            ? err.message
            : 'Failed to fetch technicians directory.';
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedSearch, statusFilter, activeFilter, skillFilter, areaFilter, page, pageSize]
  );

  useEffect(() => {
    fetchTechnicians();
  }, [fetchTechnicians]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTechnicians(true);
  };

  // Open Create Form
  const handleOpenCreateModal = () => {
    setFormMode('create');
    setName('');
    setPhone('');
    setEmail('');
    setSelectedSkills(['Split AC', 'Cassette AC']);
    setSelectedAreas(['Panvel', 'Navi Mumbai']);
    setSelectedDays(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']);
    setWorkStart('09:00');
    setWorkEnd('18:00');
    setFormStatus('AVAILABLE');
    setMaxDailyWorkload(5);
    setJoiningDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setCustomSkillInput('');
    setCustomAreaInput('');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  // Open Edit Form
  const handleOpenEditModal = (tech: Technician) => {
    setFormMode('edit');
    setName(tech.name);
    setPhone(tech.phone);
    setEmail(tech.email || '');
    setSelectedSkills(tech.specializations || tech.skills || []);
    setSelectedAreas(tech.serviceAreas || (tech.serviceArea ? [tech.serviceArea] : []));
    setSelectedDays(
      tech.workingDays ||
        tech.availability?.workingDays || [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
        ]
    );
    setWorkStart(
      tech.workingHours?.start || tech.availability?.workingHours?.start || '09:00'
    );
    setWorkEnd(
      tech.workingHours?.end || tech.availability?.workingHours?.end || '18:00'
    );
    setFormStatus(tech.status);
    setMaxDailyWorkload(tech.maxDailyWorkload || 5);
    setJoiningDate(tech.joiningDate ? tech.joiningDate.split('T')[0] : '');
    setNotes(tech.notes || '');
    setCustomSkillInput('');
    setCustomAreaInput('');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  // Open Detail Drawer
  const handleOpenDetail = async (tech: Technician) => {
    setSelectedTech(tech);
    setIsDrawerOpen(true);
    try {
      const res = await apiClient.get<TechnicianApiResponse>(`/technicians/${tech.id}`);
      if (res.technician) {
        setSelectedTech(res.technician);
      }
    } catch {
      // Use existing tech state if background detail fetch fails
    }
  };

  // Toggle Skill
  const handleToggleSkill = (skill: string) => {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter((s) => s !== skill));
    } else {
      setSelectedSkills([...selectedSkills, skill]);
    }
  };

  const handleAddCustomSkill = () => {
    if (customSkillInput.trim() && !selectedSkills.includes(customSkillInput.trim())) {
      setSelectedSkills([...selectedSkills, customSkillInput.trim()]);
      setCustomSkillInput('');
    }
  };

  // Toggle Area
  const handleToggleArea = (area: string) => {
    if (selectedAreas.includes(area)) {
      setSelectedAreas(selectedAreas.filter((a) => a !== area));
    } else {
      setSelectedAreas([...selectedAreas, area]);
    }
  };

  const handleAddCustomArea = () => {
    if (customAreaInput.trim() && !selectedAreas.includes(customAreaInput.trim())) {
      setSelectedAreas([...selectedAreas, customAreaInput.trim()]);
      setCustomAreaInput('');
    }
  };

  // Toggle Working Day
  const handleToggleDay = (day: WeekDay) => {
    if (selectedDays.includes(day)) {
      if (selectedDays.length === 1) {
        toast('Technician must have at least one working day', 'warning');
        return;
      }
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  // Submit Add or Edit Form
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Technician name is required');
      return;
    }
    if (!phone.trim()) {
      setFormError('Phone number is required');
      return;
    }
    if (workStart >= workEnd) {
      setFormError('Working start time must be strictly before end time');
      return;
    }
    if (selectedSkills.length === 0) {
      setFormError('Please select at least one skill specialization');
      return;
    }
    if (selectedAreas.length === 0) {
      setFormError('Please select at least one service area');
      return;
    }

    setFormSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        specializations: selectedSkills,
        serviceAreas: selectedAreas,
        status: formStatus,
        maxDailyWorkload: Number(maxDailyWorkload) || 5,
        joiningDate: joiningDate || null,
        notes: notes.trim() || null,
        workingDays: selectedDays,
        workingHours: { start: workStart, end: workEnd },
        availability: {
          workingDays: selectedDays,
          workingHours: { start: workStart, end: workEnd },
        },
      };

      if (formMode === 'create') {
        const res = await apiClient.post<TechnicianApiResponse>('/technicians', payload);
        toast(`Technician ${res.technician.name} created successfully`, 'success');
      } else if (selectedTech) {
        const res = await apiClient.patch<TechnicianApiResponse>(
          `/technicians/${selectedTech.id}`,
          payload
        );
        toast(`Technician ${res.technician.name} updated successfully`, 'success');
        if (selectedTech?.id === res.technician.id) {
          setSelectedTech(res.technician);
        }
      }

      setIsFormModalOpen(false);
      fetchTechnicians(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('An unexpected error occurred while saving technician.');
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Status Change Modal
  const handleOpenStatusModal = (tech: Technician) => {
    setSelectedTech(tech);
    setTargetStatus(tech.status);
    setStatusReason('');
    setIsStatusModalOpen(true);
  };

  // Submit Status Change
  const handleSubmitStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTech) return;

    setStatusSubmitting(true);
    try {
      const res = await apiClient.patch<TechnicianApiResponse>(
        `/technicians/${selectedTech.id}/status`,
        {
          status: targetStatus,
          reason: statusReason.trim() || undefined,
        }
      );

      toast(
        `Technician status updated to ${targetStatus}`,
        'success'
      );
      if (res.technician) {
        setSelectedTech(res.technician);
      }
      setIsStatusModalOpen(false);
      fetchTechnicians(true);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update status';
      toast(msg, 'error');
    } finally {
      setStatusSubmitting(false);
    }
  };

  // Activate Technician
  const handleActivateTechnician = async (tech: Technician) => {
    try {
      const res = await apiClient.post<TechnicianApiResponse>(
        `/technicians/${tech.id}/activate`
      );
      toast(`Technician ${tech.name} is now ACTIVE and available`, 'success');
      if (res.technician) {
        setSelectedTech(res.technician);
      }
      fetchTechnicians(true);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to activate technician';
      toast(msg, 'error');
    }
  };

  // Open Deactivate Modal
  const handleOpenDeactivateModal = (tech: Technician) => {
    setSelectedTech(tech);
    setDeactivateReason('');
    setDeactivateConflictError(null);
    setIsDeactivateModalOpen(true);
  };

  // Submit Deactivation
  const handleSubmitDeactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTech) return;

    setDeactivateSubmitting(true);
    setDeactivateConflictError(null);

    try {
      const res = await apiClient.post<TechnicianApiResponse>(
        `/technicians/${selectedTech.id}/deactivate`,
        {
          reason: deactivateReason.trim() || undefined,
        }
      );

      toast(`Technician ${selectedTech.name} has been deactivated`, 'info');
      if (res.technician) {
        setSelectedTech(res.technician);
      }
      setIsDeactivateModalOpen(false);
      fetchTechnicians(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const errDetails = err.details as { code?: string; activeAssignmentsCount?: number } | undefined;
        if (errDetails?.code === 'TECHNICIAN_HAS_ACTIVE_ASSIGNMENTS') {
          setDeactivateConflictError(
            `Cannot deactivate: Technician has ${errDetails.activeAssignmentsCount || 'active'} assignment(s) currently in progress. Please reassign or complete them first.`
          );
        } else {
          setDeactivateConflictError(err.message);
        }
      } else {
        setDeactivateConflictError('Failed to deactivate technician.');
      }
    } finally {
      setDeactivateSubmitting(false);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: TechnicianStatus, isActive: boolean) => {
    if (!isActive || status === 'INACTIVE') {
      return <Badge variant="neutral">INACTIVE</Badge>;
    }
    switch (status) {
      case 'AVAILABLE':
        return <Badge variant="success">AVAILABLE</Badge>;
      case 'BUSY':
        return <Badge variant="info">BUSY</Badge>;
      case 'ON_LEAVE':
        return <Badge variant="warning">ON LEAVE</Badge>;
      case 'OFF_DUTY':
        return <Badge variant="neutral">OFF DUTY</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="page-container" style={{ padding: 'var(--space-6)' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-6)',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--color-primary-100)',
                color: 'var(--color-primary-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HardHat size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 0 }}>
                Technicians
              </h1>
              <p
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                  marginTop: '2px',
                }}
              >
                Manage field personnel, specializations, operational service areas, and weekly availability.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button
            variant="outline"
            size="md"
            onClick={handleRefresh}
            disabled={refreshing}
            leftIcon={<RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleOpenCreateModal}
            leftIcon={<Plus size={16} />}
          >
            + Add Technician
          </Button>
        </div>
      </div>

      {/* Search and Filters Card */}
      <div
        className="card"
        style={{
          padding: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {/* Search Bar */}
          <div style={{ flex: '1 1 320px', position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-tertiary)',
              }}
            />
            <input
              type="text"
              placeholder="Search by technician code, name, phone, email, skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field"
              style={{
                paddingLeft: '36px',
                width: '100%',
                height: '40px',
                borderRadius: 'var(--radius-md)',
              }}
            />
          </div>

          {/* Operational Status Filter */}
          <div style={{ minWidth: '150px' }}>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="input-field"
              style={{ height: '40px', width: '100%' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="BUSY">Busy</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="OFF_DUTY">Off Duty</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {/* Active Lifecycle Filter */}
          <div style={{ minWidth: '140px' }}>
            <select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value);
                setPage(1);
              }}
              className="input-field"
              style={{ height: '40px', width: '100%' }}
            >
              <option value="ALL">All Personnel</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
          </div>

          {/* Skill Filter */}
          <div style={{ minWidth: '170px' }}>
            <select
              value={skillFilter}
              onChange={(e) => {
                setSkillFilter(e.target.value);
                setPage(1);
              }}
              className="input-field"
              style={{ height: '40px', width: '100%' }}
            >
              <option value="ALL">All Skills</option>
              {STANDARD_AC_SKILLS.map((sk) => (
                <option key={sk} value={sk}>
                  {sk}
                </option>
              ))}
            </select>
          </div>

          {/* Area Filter */}
          <div style={{ minWidth: '160px' }}>
            <select
              value={areaFilter}
              onChange={(e) => {
                setAreaFilter(e.target.value);
                setPage(1);
              }}
              className="input-field"
              style={{ height: '40px', width: '100%' }}
            >
              <option value="ALL">All Areas</option>
              {STANDARD_SERVICE_AREAS.map((ar) => (
                <option key={ar} value={ar}>
                  {ar}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-danger-50)',
            border: '1px solid var(--color-danger-200)',
            color: 'var(--color-danger-700)',
            marginBottom: 'var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchTechnicians()}>
            Retry
          </Button>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="card" style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  height: '52px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderRadius: 'var(--radius-md)',
                  animation: 'pulse 1.5s infinite ease-in-out',
                }}
              />
            ))}
          </div>
        </div>
      ) : technicians.length === 0 ? (
        debouncedSearch || statusFilter !== 'ALL' || skillFilter !== 'ALL' || areaFilter !== 'ALL' ? (
          <EmptyState
            title="No matching technicians found"
            description="No technician records match the selected search parameters or filters."
            actionLabel="Clear Filters"
            onAction={() => {
              setSearch('');
              setStatusFilter('ALL');
              setActiveFilter('ALL');
              setSkillFilter('ALL');
              setAreaFilter('ALL');
            }}
            icon={<HardHat size={36} />}
          />
        ) : (
          <EmptyState
            title="No technicians registered yet"
            description="Build your field service team by adding your first certified AC technician."
            actionLabel="+ Add Technician"
            onAction={handleOpenCreateModal}
            icon={<HardHat size={36} />}
          />
        )
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderBottom: '1px solid var(--border-default)',
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>TECHNICIAN</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>CONTACT</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>SKILLS / SPECIALIZATIONS</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>SERVICE AREAS</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>AVAILABILITY</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>STATUS</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {technicians.map((tech) => {
                  const skills = tech.specializations || tech.skills || [];
                  const areas = tech.serviceAreas || (tech.serviceArea ? [tech.serviceArea] : []);
                  const days = tech.workingDays || tech.availability?.workingDays || [];
                  const hours = tech.workingHours || tech.availability?.workingHours;

                  return (
                    <tr
                      key={tech.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background-color 0.15s',
                      }}
                      className="table-row-hover"
                    >
                      {/* Name & Code */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: 'var(--radius-full)',
                              backgroundColor: tech.isActive
                                ? 'var(--color-primary-100)'
                                : 'var(--color-neutral-200)',
                              color: tech.isActive
                                ? 'var(--color-primary-700)'
                                : 'var(--color-neutral-600)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 600,
                              fontSize: 'var(--text-xs)',
                            }}
                          >
                            {tech.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                              {tech.name}
                            </div>
                            <div
                              style={{
                                fontSize: 'var(--text-xs)',
                                fontFamily: 'monospace',
                                color: 'var(--color-text-secondary)',
                              }}
                            >
                              {tech.technicianCode}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: 'var(--text-sm)' }}>{tech.phone}</span>
                          {tech.email && (
                            <span
                              style={{
                                fontSize: 'var(--text-xs)',
                                color: 'var(--color-text-tertiary)',
                              }}
                            >
                              {tech.email}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Skills */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '240px' }}>
                          {skills.slice(0, 2).map((sk) => (
                            <span
                              key={sk}
                              style={{
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'var(--color-brand-subtle)',
                                color: 'var(--color-brand-strong)',
                              }}
                            >
                              {sk}
                            </span>
                          ))}
                          {skills.length > 2 && (
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'var(--bg-surface-subtle)',
                                color: 'var(--color-text-secondary)',
                              }}
                            >
                              +{skills.length - 2}
                            </span>
                          )}
                          {skills.length === 0 && (
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                              No skills listed
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Service Areas */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '200px' }}>
                          {areas.slice(0, 2).map((ar) => (
                            <span
                              key={ar}
                              style={{
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'var(--color-info-subtle)',
                                color: 'var(--color-info-strong)',
                              }}
                            >
                              {ar}
                            </span>
                          ))}
                          {areas.length > 2 && (
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'var(--bg-surface-subtle)',
                                color: 'var(--color-text-secondary)',
                              }}
                            >
                              +{areas.length - 2}
                            </span>
                          )}
                          {areas.length === 0 && (
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                              All areas
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Availability */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: 'var(--text-xs)' }}>
                          <div style={{ fontWeight: 500 }}>
                            {days.length === 7
                              ? 'Mon–Sun'
                              : days.length === 6 && !days.includes('SUNDAY')
                              ? 'Mon–Sat'
                              : days.length === 5 && !days.includes('SATURDAY') && !days.includes('SUNDAY')
                              ? 'Mon–Fri'
                              : `${days.length} days/wk`}
                          </div>
                          <div style={{ color: 'var(--color-text-tertiary)' }}>
                            {hours ? `${hours.start}–${hours.end}` : '09:00–18:00'}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 16px' }}>
                        {renderStatusBadge(tech.status, tech.isActive)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 'var(--space-2)',
                          }}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDetail(tech)}
                            leftIcon={<Eye size={13} />}
                          >
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEditModal(tech)}
                            leftIcon={<Edit2 size={13} />}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenStatusModal(tech)}
                          >
                            Status
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <div>
              Showing {technicians.length} of {totalRecords} technicians
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                leftIcon={<ChevronLeft size={14} />}
              >
                Previous
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                rightIcon={<ChevronRight size={14} />}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL DRAWER */}
      {selectedTech && (
        <Drawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          title={`Technician Profile: ${selectedTech.technicianCode}`}
          width="540px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* Header Profile Box */}
            <div
              style={{
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--color-primary-100)',
                    color: 'var(--color-primary-700)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 'var(--text-lg)',
                  }}
                >
                  {selectedTech.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700 }}>
                    {selectedTech.name}
                  </h3>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'monospace',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    Code: {selectedTech.technicianCode}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                {renderStatusBadge(selectedTech.status, selectedTech.isActive)}
                <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                  {selectedTech.isActive ? 'Active Employee' : 'Inactive Record'}
                </span>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenEditModal(selectedTech)}
                leftIcon={<Edit2 size={13} />}
              >
                Edit Info
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenStatusModal(selectedTech)}
                leftIcon={<Clock size={13} />}
              >
                Change Status
              </Button>
              {selectedTech.isActive ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenDeactivateModal(selectedTech)}
                  leftIcon={<UserX size={13} />}
                  style={{ color: 'var(--color-danger-600)' }}
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleActivateTechnician(selectedTech)}
                  leftIcon={<UserCheck size={13} />}
                >
                  Activate Technician
                </Button>
              )}
            </div>

            {/* Contact Details */}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <h4 style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                Contact & Personal Information
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Phone size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span style={{ color: 'var(--color-text-secondary)', width: '100px' }}>Primary Phone:</span>
                  <span style={{ fontWeight: 500 }}>{selectedTech.phone}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Mail size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span style={{ color: 'var(--color-text-secondary)', width: '100px' }}>Email Address:</span>
                  <span>{selectedTech.email || 'Not provided'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span style={{ color: 'var(--color-text-secondary)', width: '100px' }}>Joining Date:</span>
                  <span>{selectedTech.joiningDate ? formatDate(selectedTech.joiningDate) : 'Not specified'}</span>
                </div>
              </div>
            </div>

            {/* Skills / Specializations */}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-3)' }}>
                <Wrench size={15} style={{ color: 'var(--color-primary-600)' }} />
                <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  Technical Skills & AC Specializations
                </h4>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(selectedTech.specializations || selectedTech.skills || []).map((sk) => (
                  <Badge key={sk} variant="brand">
                    {sk}
                  </Badge>
                ))}
                {(selectedTech.specializations || selectedTech.skills || []).length === 0 && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    No specialized skills recorded.
                  </span>
                )}
              </div>
            </div>

            {/* Service Areas */}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-3)' }}>
                <MapPin size={15} style={{ color: 'var(--color-primary-600)' }} />
                <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  Operational Service Areas
                </h4>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(selectedTech.serviceAreas || (selectedTech.serviceArea ? [selectedTech.serviceArea] : [])).map((ar) => (
                  <Badge key={ar} variant="info">
                    {ar}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Availability Schedule */}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-3)' }}>
                <Clock size={15} style={{ color: 'var(--color-primary-600)' }} />
                <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  Weekly Availability Schedule
                </h4>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Working Days:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {(selectedTech.workingDays || selectedTech.availability?.workingDays || []).map((d) => (
                      <span
                        key={d}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-surface-subtle)',
                          border: '1px solid var(--border-default)',
                          fontWeight: 500,
                        }}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Working Hours: </span>
                  <span style={{ fontWeight: 600 }}>
                    {selectedTech.workingHours?.start || selectedTech.availability?.workingHours?.start || '09:00'}
                    {' — '}
                    {selectedTech.workingHours?.end || selectedTech.availability?.workingHours?.end || '18:00'}
                  </span>
                </div>
              </div>
            </div>

            {/* Operational Workload */}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-3)' }}>
                <Briefcase size={15} style={{ color: 'var(--color-primary-600)' }} />
                <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  Operational Workload & Capacity
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    Active Work Orders
                  </div>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {selectedTech.activeAssignmentsCount !== undefined ? selectedTech.activeAssignmentsCount : selectedTech.currentWorkload}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                    Derived from active assignments
                  </div>
                </div>

                <div
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    Max Daily Capacity
                  </div>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {selectedTech.maxDailyWorkload || 5} requests/day
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                    Scheduling threshold
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {selectedTech.notes && (
              <div className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-2)' }}>
                  <FileText size={15} style={{ color: 'var(--color-primary-600)' }} />
                  <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                    Operational Notes
                  </h4>
                </div>
                <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
                  {selectedTech.notes}
                </p>
              </div>
            )}
          </div>
        </Drawer>
      )}

      {/* CREATE / EDIT MODAL */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={formMode === 'create' ? '+ Add New Technician' : `Edit Technician: ${selectedTech?.technicianCode}`}
        maxWidth="680px"
      >
        <form onSubmit={handleSubmitForm} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {formError && (
            <div
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-danger-50)',
                border: '1px solid var(--color-danger-200)',
                color: 'var(--color-danger-700)',
                fontSize: 'var(--text-sm)',
              }}
            >
              {formError}
            </div>
          )}

          {/* Basic Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input
              label="Full Name *"
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Phone Number *"
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input
              label="Email Address (Optional)"
              type="email"
              placeholder="e.g. rahul.sharma@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Joining Date"
              type="date"
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
            />
          </div>

          {/* Skills Selection */}
          <div>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
              Skills & AC Specializations *
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {STANDARD_AC_SKILLS.map((sk) => {
                const isSelected = selectedSkills.includes(sk);
                return (
                  <button
                    key={sk}
                    type="button"
                    onClick={() => handleToggleSkill(sk)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)',
                      border: isSelected ? '1px solid var(--color-brand)' : '1px solid var(--border-default)',
                      backgroundColor: isSelected ? 'var(--color-brand)' : 'var(--bg-surface)',
                      color: isSelected ? '#ffffff' : 'var(--color-text-secondary)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {sk} {isSelected ? '✓' : '+'}
                  </button>
                );
              })}
            </div>
            {/* Custom Skill Input */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="Add other specialization..."
                value={customSkillInput}
                onChange={(e) => setCustomSkillInput(e.target.value)}
                className="input-field"
                style={{ height: '34px', fontSize: '12px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomSkill();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddCustomSkill}>
                Add
              </Button>
            </div>
          </div>

          {/* Service Areas Selection */}
          <div>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
              Service Areas *
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {STANDARD_SERVICE_AREAS.map((ar) => {
                const isSelected = selectedAreas.includes(ar);
                return (
                  <button
                    key={ar}
                    type="button"
                    onClick={() => handleToggleArea(ar)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)',
                      border: isSelected ? '1px solid var(--color-info-600)' : '1px solid var(--border-default)',
                      backgroundColor: isSelected ? 'var(--color-info-600)' : 'var(--bg-surface)',
                      color: isSelected ? '#ffffff' : 'var(--color-text-secondary)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {ar} {isSelected ? '✓' : '+'}
                  </button>
                );
              })}
            </div>
            {/* Custom Area Input */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="Add other service territory..."
                value={customAreaInput}
                onChange={(e) => setCustomAreaInput(e.target.value)}
                className="input-field"
                style={{ height: '34px', fontSize: '12px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomArea();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddCustomArea}>
                Add
              </Button>
            </div>
          </div>

          {/* Working Days & Hours */}
          <div
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
            }}
          >
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Weekly Working Schedule
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              {ALL_WEEK_DAYS.map((d) => {
                const isSelected = selectedDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleToggleDay(d)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: isSelected ? '1px solid var(--color-brand)' : '1px solid var(--border-default)',
                      backgroundColor: isSelected ? 'var(--color-brand-subtle)' : 'var(--bg-surface)',
                      color: isSelected ? 'var(--color-brand-strong)' : 'var(--color-text-secondary)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {d.substring(0, 3)}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <Input
                label="Start Time (HH:MM)"
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                required
              />
              <Input
                label="End Time (HH:MM)"
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Operational Capacity & Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input
              label="Max Daily Workload"
              type="number"
              min={1}
              max={20}
              value={maxDailyWorkload}
              onChange={(e) => setMaxDailyWorkload(Number(e.target.value) || 5)}
              helperText="Target daily capacity limit"
            />
            <div>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                Initial Status
              </label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as TechnicianStatus)}
                className="input-field"
                style={{ height: '38px', width: '100%' }}
              >
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="BUSY">BUSY</option>
                <option value="ON_LEAVE">ON_LEAVE</option>
                <option value="OFF_DUTY">OFF_DUTY</option>
              </select>
            </div>
          </div>

          <Textarea
            label="Internal Notes"
            placeholder="Qualifications, vehicle information, or certifications..."
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {/* Form Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-2)',
            }}
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsFormModalOpen(false)}
              disabled={formSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={formSubmitting}>
              {formSubmitting
                ? 'Saving...'
                : formMode === 'create'
                ? 'Create Technician'
                : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* QUICK STATUS CHANGE MODAL */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title={`Change Status: ${selectedTech?.technicianCode} (${selectedTech?.name})`}
        maxWidth="440px"
      >
        <form onSubmit={handleSubmitStatus} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
              Operational Status
            </label>
            <select
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value as TechnicianStatus)}
              className="input-field"
              style={{ width: '100%', height: '40px' }}
            >
              <option value="AVAILABLE">AVAILABLE (Eligible for assignment)</option>
              <option value="BUSY">BUSY (Active on assignment)</option>
              <option value="ON_LEAVE">ON LEAVE (Unavailable)</option>
              <option value="OFF_DUTY">OFF DUTY (Shift completed)</option>
            </select>
          </div>

          <Textarea
            label="Status Reason / Notes (Optional)"
            placeholder="e.g. Leave approved, shift handover, etc."
            rows={2}
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsStatusModalOpen(false)}
              disabled={statusSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={statusSubmitting}>
              {statusSubmitting ? 'Updating...' : 'Update Status'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* DEACTIVATE CONFIRMATION MODAL */}
      <Modal
        isOpen={isDeactivateModalOpen}
        onClose={() => setIsDeactivateModalOpen(false)}
        title={`Deactivate Technician: ${selectedTech?.name}`}
        maxWidth="460px"
      >
        <form onSubmit={handleSubmitDeactivate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {deactivateConflictError ? (
            <div
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-danger-50)',
                border: '1px solid var(--color-danger-200)',
                color: 'var(--color-danger-700)',
                fontSize: 'var(--text-sm)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>Deactivation Blocked</div>
              {deactivateConflictError}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              Deactivating this technician will mark their record as <strong>INACTIVE</strong> and remove them from future service assignments. All historical records will remain intact.
            </p>
          )}

          <Textarea
            label="Deactivation Reason"
            placeholder="e.g. Employment ended, extended absence, transferred..."
            rows={2}
            value={deactivateReason}
            onChange={(e) => setDeactivateReason(e.target.value)}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeactivateModalOpen(false)}
              disabled={deactivateSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={deactivateSubmitting}
              style={{ backgroundColor: 'var(--color-danger-600)', borderColor: 'var(--color-danger-600)' }}
            >
              {deactivateSubmitting ? 'Deactivating...' : 'Confirm Deactivation'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
