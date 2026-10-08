import React, { useState, useEffect, useCallback } from 'react';
import {
  FileCheck2,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Repeat,
  XCircle,
  Trash2,
} from 'lucide-react';
import { apiClient, ApiError } from '@/services/api/client';
import {
  AmcContract,
  AmcPlan,
  AmcCoveredAsset,
  AmcFrequency,
  AmcStatus,
  Customer,
  AcAsset,
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

interface AmcContractsApiResponse {
  contracts: AmcContract[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface AmcMetricsApiResponse {
  metrics: {
    activeContracts: number;
    expiringSoonContracts: number;
    expiredContracts: number;
    coveredAssetsCount: number;
    upcomingPmCount: number;
    overduePmCount: number;
  };
}

interface AmcPlansApiResponse {
  plans: AmcPlan[];
}

interface AmcSingleApiResponse {
  contract: AmcContract;
}

interface PmSchedulesApiResponse {
  schedules: Array<{
    id: string;
    scheduleNumber: string;
    amcId: string | null;
    assetId: string;
    assetTag?: string | null;
    brand?: string | null;
    modelNumber?: string | null;
    siteName?: string | null;
    roomLocation?: string | null;
    scheduledDate: string;
    visitNumber: number | null;
    status: string;
    isSystemGenerated: boolean;
    notes: string | null;
  }>;
}

interface PmGenerationResultResponse {
  contractId: string;
  contractNumber: string;
  generatedCount: number;
  existingCount: number;
  skippedCount: number;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  generatedDates: string[];
}

interface CustomersApiResponse {
  customers: Customer[];
}

interface SitesApiResponse {
  sites: Array<{ id: string; siteName: string; isPrimary: boolean }>;
}

interface AssetsApiResponse {
  assets: AcAsset[];
}

export interface AmcManagementProps {
  onNavigate?: (page: string) => void;
  preselectedCustomerId?: string;
}

export const AmcManagement: React.FC<AmcManagementProps> = ({
  preselectedCustomerId,
}) => {
  const { showToast } = useToast();

  // State
  const [contracts, setContracts] = useState<AmcContract[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [frequencyFilter, setFrequencyFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Metrics & Plans
  const [metrics, setMetrics] = useState<AmcMetricsApiResponse['metrics'] | null>(null);
  const [plans, setPlans] = useState<AmcPlan[]>([]);

  // Selected Detail Contract
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [detailContract, setDetailContract] = useState<AmcContract | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'assets' | 'schedules'>('overview');
  const [schedules, setSchedules] = useState<PmSchedulesApiResponse['schedules']>([]);
  const [isSchedulesLoading, setIsSchedulesLoading] = useState(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [isAddAssetsModalOpen, setIsAddAssetsModalOpen] = useState(false);

  // Form states
  const [formCustomerId, setFormCustomerId] = useState(preselectedCustomerId || '');
  const [formPlanId, setFormPlanId] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formFrequency, setFormFrequency] = useState<AmcFrequency>('QUARTERLY');
  const [formTotalAmount, setFormTotalAmount] = useState<number>(0);
  const [formTotalVisits, setFormTotalVisits] = useState<number>(4);
  const [formNotes, setFormNotes] = useState('');
  const [formCoveredAssetIds, setFormCoveredAssetIds] = useState<string[]>([]);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Customer dropdown & asset selection options
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [availableAssets, setAvailableAssets] = useState<AcAsset[]>([]);
  const [isAssetsLoading, setIsAssetsLoading] = useState(false);

  // Fetch metrics & plans
  const fetchAuxData = useCallback(async () => {
    try {
      const [metricsRes, plansRes] = await Promise.all([
        apiClient.get<AmcMetricsApiResponse>('/amc-contracts/metrics'),
        apiClient.get<AmcPlansApiResponse>('/amc-contracts/plans'),
      ]);
      setMetrics(metricsRes.metrics);
      setPlans(plansRes.plans);
    } catch {
      // Non-blocking aux data fetch
    }
  }, []);

  // Fetch contracts
  const fetchContracts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('pageSize', String(pageSize));
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (frequencyFilter !== 'ALL') params.append('frequency', frequencyFilter);
      if (preselectedCustomerId) params.append('customerId', preselectedCustomerId);

      const res = await apiClient.get<AmcContractsApiResponse>(`/amc-contracts?${params.toString()}`);
      setContracts(res.contracts);
      setTotal(res.total);
    } catch (err) {
      showToast({
        title: 'Error loading AMC contracts',
        message: err instanceof ApiError ? err.message : 'Network error',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, statusFilter, frequencyFilter, preselectedCustomerId, showToast]);

  useEffect(() => {
    fetchAuxData();
  }, [fetchAuxData]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  // Fetch detail contract
  const fetchDetailContract = useCallback(async (id: string) => {
    try {
      const res = await apiClient.get<AmcSingleApiResponse>(`/amc-contracts/${id}`);
      setDetailContract(res.contract);
    } catch (err) {
      showToast({
        title: 'Error fetching contract details',
        message: err instanceof ApiError ? err.message : 'Unknown error',
        type: 'error',
      });
    }
  }, [showToast]);

  // Fetch schedules
  const fetchSchedules = useCallback(async (amcId: string) => {
    setIsSchedulesLoading(true);
    try {
      const res = await apiClient.get<PmSchedulesApiResponse>(`/amc-contracts/${amcId}/schedules`);
      setSchedules(res?.schedules || []);
    } catch (err) {
      showToast({
        title: 'Error fetching PM schedules',
        message: err instanceof ApiError ? err.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setIsSchedulesLoading(false);
    }
  }, [showToast]);

  const handleOpenDetail = (c: AmcContract) => {
    setSelectedContractId(c.id);
    setDetailContract(c);
    setIsDetailOpen(true);
    setDetailTab('overview');
    fetchDetailContract(c.id);
    fetchSchedules(c.id);
  };

  // Fetch customers when create modal opens
  const fetchCustomers = useCallback(async () => {
    try {
      const res = await apiClient.get<CustomersApiResponse>('/customers?pageSize=100');
      setCustomersList(res.customers || []);
    } catch {
      // Ignored
    }
  }, []);

  // Fetch customer assets when customer is selected
  const fetchCustomerAssets = useCallback(async (custId: string) => {
    if (!custId) {
      setAvailableAssets([]);
      return;
    }
    setIsAssetsLoading(true);
    try {
      const sitesRes = await apiClient.get<SitesApiResponse>(`/customers/${custId}/sites`);
      const sites = sitesRes.sites || [];
      const allAssets: AcAsset[] = [];

      for (const site of sites) {
        try {
          const assetsRes = await apiClient.get<AssetsApiResponse>(`/sites/${site.id}/assets`);
          if (assetsRes.assets) {
            allAssets.push(...assetsRes.assets.map((a) => ({ ...a, siteName: site.siteName })));
          }
        } catch {
          // ignore site asset fetch failure
        }
      }
      setAvailableAssets(allAssets);
    } catch (err) {
      showToast({
        title: 'Failed to load customer equipment',
        message: err instanceof ApiError ? err.message : 'Error fetching sites/assets',
        type: 'warning',
      });
    } finally {
      setIsAssetsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isCreateModalOpen || isRenewModalOpen || isAddAssetsModalOpen) {
      fetchCustomers();
    }
  }, [isCreateModalOpen, isRenewModalOpen, isAddAssetsModalOpen, fetchCustomers]);

  useEffect(() => {
    if (formCustomerId) {
      fetchCustomerAssets(formCustomerId);
    }
  }, [formCustomerId, fetchCustomerAssets]);

  // Handle plan selection in create modal
  const handlePlanSelect = (pId: string) => {
    setFormPlanId(pId);
    const chosen = plans.find((p) => p.id === pId);
    if (chosen) {
      setFormFrequency(chosen.defaultFrequency);
      setFormTotalVisits(chosen.defaultVisitsPerYear);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormCustomerId(preselectedCustomerId || '');
    setFormPlanId('');
    const today = new Date().toISOString().split('T')[0];
    const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setFormStartDate(today);
    setFormEndDate(oneYearLater);
    setFormFrequency('QUARTERLY');
    setFormTotalAmount(25000);
    setFormTotalVisits(4);
    setFormNotes('');
    setFormCoveredAssetIds([]);
  };

  const handleOpenCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(true);
  };

  // Submit Create Contract
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustomerId) {
      showToast({ title: 'Validation Error', message: 'Please select a customer', type: 'warning' });
      return;
    }
    if (!formStartDate || !formEndDate) {
      showToast({ title: 'Validation Error', message: 'Please specify contract start and end dates', type: 'warning' });
      return;
    }
    if (formEndDate < formStartDate) {
      showToast({ title: 'Validation Error', message: 'End date cannot precede start date', type: 'warning' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.post<AmcSingleApiResponse>('/amc-contracts', {
        customerId: formCustomerId,
        planId: formPlanId || null,
        startDate: formStartDate,
        endDate: formEndDate,
        frequency: formFrequency,
        totalAmount: Number(formTotalAmount),
        totalVisits: Number(formTotalVisits),
        coveredAssetIds: formCoveredAssetIds,
        notes: formNotes || null,
      });

      showToast({
        title: 'AMC Contract Created',
        message: `Contract ${res.contract.contractNumber} successfully created and active`,
        type: 'success',
      });

      setIsCreateModalOpen(false);
      fetchContracts();
      fetchAuxData();
    } catch (err) {
      showToast({
        title: 'Contract Creation Failed',
        message: err instanceof ApiError ? err.message : 'Failed to create contract',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate PM Obligations
  const handleGeneratePm = async (contractId: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiClient.post<PmGenerationResultResponse>(`/amc-contracts/${contractId}/generate-pm`, {});
      showToast({
        title: 'PM Obligations Synchronized',
        message: `Generated ${res.generatedCount} new obligations (${res.existingCount} already existed).`,
        type: 'success',
      });

      if (selectedContractId === contractId) {
        fetchDetailContract(contractId);
        fetchSchedules(contractId);
      }
      fetchContracts();
      fetchAuxData();
    } catch (err) {
      showToast({
        title: 'PM Generation Failed',
        message: err instanceof ApiError ? err.message : 'Could not generate schedules',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel Contract
  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailContract) return;
    if (!cancelReason.trim()) {
      showToast({ title: 'Validation Error', message: 'Please provide a cancellation reason', type: 'warning' });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post(`/amc-contracts/${detailContract.id}/cancel`, {
        reason: cancelReason.trim(),
      });

      showToast({
        title: 'Contract Cancelled',
        message: `Contract ${detailContract.contractNumber} cancelled`,
        type: 'warning',
      });

      setIsCancelModalOpen(false);
      setCancelReason('');
      fetchDetailContract(detailContract.id);
      fetchContracts();
      fetchAuxData();
    } catch (err) {
      showToast({
        title: 'Cancellation Failed',
        message: err instanceof ApiError ? err.message : 'Failed to cancel contract',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remove covered asset
  const handleRemoveAsset = async (assetId: string) => {
    if (!detailContract) return;
    if (!window.confirm('Remove this AC asset from AMC coverage? Future pending visits will be cancelled.')) return;

    try {
      await apiClient.delete(`/amc-contracts/${detailContract.id}/assets/${assetId}`);
      showToast({
        title: 'Asset Removed',
        message: 'AC asset removed from AMC coverage',
        type: 'info',
      });
      fetchDetailContract(detailContract.id);
      fetchSchedules(detailContract.id);
      fetchContracts();
      fetchAuxData();
    } catch (err) {
      showToast({
        title: 'Failed to Remove Asset',
        message: err instanceof ApiError ? err.message : 'Error removing asset',
        type: 'error',
      });
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: AmcStatus, isExpiringSoon?: boolean) => {
    if (status === 'ACTIVE' && isExpiringSoon) {
      return <Badge variant="warning">EXPIRING SOON</Badge>;
    }
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">ACTIVE</Badge>;
      case 'EXPIRING_SOON':
        return <Badge variant="warning">EXPIRING SOON</Badge>;
      case 'EXPIRED':
        return <Badge variant="neutral">EXPIRED</Badge>;
      case 'CANCELLED':
        return <Badge variant="danger">CANCELLED</Badge>;
      case 'RENEWED':
        return <Badge variant="info">RENEWED</Badge>;
      case 'DRAFT':
        return <Badge variant="neutral">DRAFT</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  // PM Schedule Status Badge Helper
  const renderScheduleBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'RESOLVED':
        return <Badge variant="success">COMPLETED</Badge>;
      case 'OVERDUE':
        return <Badge variant="danger">OVERDUE</Badge>;
      case 'DUE':
        return <Badge variant="warning">DUE TODAY</Badge>;
      case 'SCHEDULED':
      case 'PLANNED':
        return <Badge variant="info">PLANNED</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral">CANCELLED</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-6" style={{ padding: 'var(--space-6)' }}>
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              color: 'var(--text-normal)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <FileCheck2 style={{ color: 'var(--color-primary-500)', width: '28px', height: '28px' }} />
            AMC Contracts
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
            Manage commercial maintenance agreements, covered AC assets, and preventive maintenance obligations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              fetchContracts();
              fetchAuxData();
            }}
            disabled={isLoading}
          >
            <RefreshCw className={isLoading ? 'animate-spin' : ''} style={{ width: '16px', height: '16px' }} />
            Sync
          </Button>
          <Button variant="primary" onClick={handleOpenCreateModal}>
            <Plus style={{ width: '16px', height: '16px' }} />
            New AMC Contract
          </Button>
        </div>
      </div>

      {/* 2. KPI Metrics Bar */}
      {metrics && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
            }}
          >
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
              ACTIVE CONTRACTS
            </div>
            <div
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                color: 'var(--color-success-500)',
                marginTop: '4px',
              }}
            >
              {metrics.activeContracts}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
            }}
          >
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
              EXPIRING SOON (&le;30d)
            </div>
            <div
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                color: metrics.expiringSoonContracts > 0 ? 'var(--color-warning-500)' : 'var(--text-normal)',
                marginTop: '4px',
              }}
            >
              {metrics.expiringSoonContracts}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
            }}
          >
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
              COVERED AC ASSETS
            </div>
            <div
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                color: 'var(--color-primary-500)',
                marginTop: '4px',
              }}
            >
              {metrics.coveredAssetsCount}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
            }}
          >
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
              UPCOMING PM VISITS
            </div>
            <div
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                color: 'var(--color-info-500)',
                marginTop: '4px',
              }}
            >
              {metrics.upcomingPmCount}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
            }}
          >
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
              OVERDUE PM VISITS
            </div>
            <div
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                color: metrics.overduePmCount > 0 ? 'var(--color-danger-500)' : 'var(--text-muted)',
                marginTop: '4px',
              }}
            >
              {metrics.overduePmCount}
            </div>
          </div>
        </div>
      )}

      {/* 2.5 Contract View Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: 'var(--space-2)',
        }}
      >
        {[
          { id: 'ACTIVE', label: 'Active', count: metrics?.activeContracts },
          { id: 'EXPIRING_SOON', label: 'Expiring Soon', count: metrics?.expiringSoonContracts },
          { id: 'HISTORY', label: 'History (Renewed / Expired)' },
          { id: 'ALL', label: 'All Contracts' },
        ].map((tab) => {
          const isSelected =
            statusFilter === tab.id ||
            (tab.id === 'HISTORY' && ['HISTORY', 'RENEWED', 'EXPIRED', 'CANCELLED'].includes(statusFilter));
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatusFilter(tab.id);
                setPage(1);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                fontWeight: isSelected ? 600 : 500,
                color: isSelected ? 'var(--color-primary-600)' : 'var(--text-secondary)',
                backgroundColor: isSelected ? 'var(--bg-surface-subtle)' : 'transparent',
                border: isSelected ? '1px solid var(--color-primary-300)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: isSelected ? 'var(--color-primary-100)' : 'var(--bg-subtle)',
                    color: isSelected ? 'var(--color-primary-700)' : 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Search and Filtering Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          backgroundColor: 'var(--bg-surface)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
          <Input
            placeholder="Search by contract #, customer or remarks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search style={{ width: '16px', height: '16px', color: 'var(--text-muted)' }} />}
          />
        </div>

        <div style={{ minWidth: '150px' }}>
          <select
            className="input-base"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{ width: '100%', height: '38px', borderRadius: 'var(--radius-md)' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRING_SOON">Expiring Soon</option>
            <option value="EXPIRED">Expired</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="RENEWED">Renewed</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>

        <div style={{ minWidth: '150px' }}>
          <select
            className="input-base"
            value={frequencyFilter}
            onChange={(e) => {
              setFrequencyFilter(e.target.value);
              setPage(1);
            }}
            style={{ width: '100%', height: '38px', borderRadius: 'var(--radius-md)' }}
          >
            <option value="ALL">All Frequencies</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="HALF_YEARLY">Half-Yearly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </div>

        {(search || statusFilter !== 'ALL' || frequencyFilter !== 'ALL') && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
              setFrequencyFilter('ALL');
              setPage(1);
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* 4. Table / Directory View */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw className="animate-spin" style={{ width: '24px', height: '24px', margin: '0 auto 8px' }} />
            Loading maintenance contracts...
          </div>
        ) : contracts.length === 0 ? (
          <EmptyState
            icon={<FileCheck2 style={{ width: '48px', height: '48px', color: 'var(--text-muted)' }} />}
            title="No AMC contracts found"
            description={
              search || (statusFilter !== 'ALL' && ((metrics?.activeContracts || 0) + (metrics?.expiredContracts || 0) > 0))
                ? 'No maintenance agreements match your search filters.'
                : 'Get started by creating your first commercial maintenance agreement.'
            }
            actionLabel="Create AMC Contract"
            onAction={handleOpenCreateModal}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>CONTRACT</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>CUSTOMER</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>PLAN &amp; FREQUENCY</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>DATES</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>COVERED UNITS</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>VISITS</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>STATUS</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, textAlign: 'right' }}>
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background-color 0.15s ease',
                    }}
                    className="hover:bg-subtle"
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-normal)' }}>{c.contractNumber}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        &#8377;{Number(c.totalAmount).toLocaleString('en-IN')}
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-normal)' }}>
                        {c.customerName || 'Unknown Customer'}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {c.customerCode} • {c.customerPhone}
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-normal)' }}>
                        {c.planName || 'Custom AMC'}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {c.frequency}
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-normal)' }}>
                        {formatDate(c.startDate)} &rarr; {formatDate(c.endDate)}
                      </div>
                      {c.isExpiringSoon && (
                        <div style={{ fontSize: '11px', color: 'var(--color-warning-500)', fontWeight: 600 }}>
                          Expiring soon
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: 'var(--bg-subtle)',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                        }}
                      >
                        <Layers style={{ width: '12px', height: '12px' }} />
                        {c.coveredAssetsCount || 0} Units
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-normal)' }}>
                        {c.completedVisitsCount || 0} / {c.totalVisits} Completed
                      </div>
                      {c.nextPmDate && (
                        <div style={{ fontSize: '11px', color: 'var(--color-primary-500)' }}>
                          Next: {formatDate(c.nextPmDate)}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      {renderStatusBadge(c.status, c.isExpiringSoon)}
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenDetail(c)}
                        >
                          <Eye style={{ width: '14px', height: '14px' }} />
                          View
                        </Button>
                        {c.status === 'ACTIVE' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Generate / Sync PM Obligations"
                            onClick={() => handleGeneratePm(c.id)}
                            disabled={isSubmitting}
                          >
                            <Repeat style={{ width: '14px', height: '14px' }} />
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

        {/* Pagination Footer */}
        {total > pageSize && (
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            <div>
              Showing {Math.min((page - 1) * pageSize + 1, total)} to {Math.min(page * pageSize, total)} of {total} contracts
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft style={{ width: '14px', height: '14px' }} />
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight style={{ width: '14px', height: '14px' }} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Detail Drawer */}
      <Drawer
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={detailContract ? `Contract: ${detailContract.contractNumber}` : 'AMC Details'}
        width="640px"
      >
        {detailContract && (
          <div className="space-y-6">
            {/* Header pill summary */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-3) var(--space-4)',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-normal)' }}>
                  {detailContract.customerName}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {detailContract.customerCode} • {detailContract.customerPhone}
                </div>
              </div>
              <div>{renderStatusBadge(detailContract.status, detailContract.isExpiringSoon)}</div>
            </div>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', gap: 'var(--space-4)' }}>
              <button
                type="button"
                onClick={() => setDetailTab('overview')}
                style={{
                  padding: '8px 4px',
                  fontWeight: detailTab === 'overview' ? 600 : 400,
                  color: detailTab === 'overview' ? 'var(--color-primary-600)' : 'var(--text-muted)',
                  borderBottom: detailTab === 'overview' ? '2px solid var(--color-primary-600)' : 'none',
                }}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('assets')}
                style={{
                  padding: '8px 4px',
                  fontWeight: detailTab === 'assets' ? 600 : 400,
                  color: detailTab === 'assets' ? 'var(--color-primary-600)' : 'var(--text-muted)',
                  borderBottom: detailTab === 'assets' ? '2px solid var(--color-primary-600)' : 'none',
                }}
              >
                Covered Equipment ({detailContract.coveredAssets?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('schedules')}
                style={{
                  padding: '8px 4px',
                  fontWeight: detailTab === 'schedules' ? 600 : 400,
                  color: detailTab === 'schedules' ? 'var(--color-primary-600)' : 'var(--text-muted)',
                  borderBottom: detailTab === 'schedules' ? '2px solid var(--color-primary-600)' : 'none',
                }}
              >
                PM Obligations ({(schedules || []).length})
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {detailTab === 'overview' && (
              <div className="space-y-4">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Plan Name</div>
                    <div style={{ fontWeight: 500 }}>{detailContract.planName || 'Custom AMC'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Frequency</div>
                    <div style={{ fontWeight: 500 }}>{detailContract.frequency}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Start Date</div>
                    <div style={{ fontWeight: 500 }}>{formatDate(detailContract.startDate)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>End Date</div>
                    <div style={{ fontWeight: 500 }}>{formatDate(detailContract.endDate)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Contract Amount</div>
                    <div style={{ fontWeight: 600, color: 'var(--color-primary-600)' }}>
                      &#8377;{Number(detailContract.totalAmount).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Included Visits</div>
                    <div style={{ fontWeight: 500 }}>{detailContract.totalVisits} Visits</div>
                  </div>
                </div>

                {detailContract.notes && (
                  <div style={{ marginTop: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Remarks</div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-normal)' }}>{detailContract.notes}</div>
                  </div>
                )}

                {detailContract.status === 'CANCELLED' && detailContract.cancellationReason && (
                  <div
                    style={{
                      padding: 'var(--space-3)',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-danger-500)',
                    }}
                  >
                    <div style={{ color: 'var(--color-danger-500)', fontWeight: 600, fontSize: 'var(--text-xs)' }}>
                      CANCELLATION REASON
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)' }}>{detailContract.cancellationReason}</div>
                    {detailContract.cancelledAt && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Cancelled on {formatDate(detailContract.cancelledAt)}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', paddingTop: 'var(--space-4)' }}>
                  {detailContract.status === 'ACTIVE' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setFormCustomerId(detailContract.customerId);
                          setFormPlanId(detailContract.planId || '');
                          setFormStartDate(detailContract.startDate);
                          setFormEndDate(detailContract.endDate);
                          setFormFrequency(detailContract.frequency);
                          setFormTotalAmount(detailContract.totalAmount);
                          setFormTotalVisits(detailContract.totalVisits);
                          setFormNotes(detailContract.notes || '');
                          setIsEditModalOpen(true);
                        }}
                      >
                        <Edit2 style={{ width: '14px', height: '14px' }} />
                        Edit Agreement
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setIsCancelModalOpen(true)}
                      >
                        <XCircle style={{ width: '14px', height: '14px' }} />
                        Cancel Contract
                      </Button>
                    </>
                  )}
                  {['ACTIVE', 'EXPIRING_SOON', 'EXPIRED'].includes(detailContract.status) && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setFormCustomerId(detailContract.customerId);
                        setFormPlanId(detailContract.planId || '');
                        const prevEnd = new Date(detailContract.endDate);
                        const nextStart = new Date(prevEnd.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                        const nextEnd = new Date(prevEnd.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                        setFormStartDate(nextStart);
                        setFormEndDate(nextEnd);
                        setFormFrequency(detailContract.frequency);
                        setFormTotalAmount(detailContract.totalAmount);
                        setFormTotalVisits(detailContract.totalVisits);
                        setIsRenewModalOpen(true);
                      }}
                    >
                      <Repeat style={{ width: '14px', height: '14px' }} />
                      Renew Agreement
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: COVERED ASSETS */}
            {detailTab === 'assets' && (
              <div className="space-y-4">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {detailContract.coveredAssets?.length || 0} AC units covered under this commercial agreement
                  </div>
                  {detailContract.status === 'ACTIVE' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setFormCustomerId(detailContract.customerId);
                        setFormCoveredAssetIds([]);
                        fetchCustomerAssets(detailContract.customerId);
                        setIsAddAssetsModalOpen(true);
                      }}
                    >
                      <Plus style={{ width: '14px', height: '14px' }} />
                      Cover Additional Equipment
                    </Button>
                  )}
                </div>

                {!detailContract.coveredAssets || detailContract.coveredAssets.length === 0 ? (
                  <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No AC equipment attached to this contract yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {detailContract.coveredAssets.map((asset: AmcCoveredAsset) => (
                      <div
                        key={asset.id}
                        style={{
                          padding: '12px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          backgroundColor: 'var(--bg-surface)',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-normal)' }}>
                            {asset.brand || asset.asset?.brand || 'AC Unit'} • {asset.assetTag || asset.asset?.assetCode || asset.assetId}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            Site: {asset.siteName || 'Unknown Site'} • Model: {asset.modelNumber || 'N/A'} • SN:{' '}
                            {asset.serialNumber || 'N/A'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Location: {asset.floorLocation ? `${asset.floorLocation}, ` : ''}{asset.roomLocation || 'General Area'}
                          </div>
                        </div>

                        {detailContract.status === 'ACTIVE' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Remove from AMC"
                            onClick={() => handleRemoveAsset(asset.assetId)}
                          >
                            <Trash2 style={{ width: '14px', height: '14px', color: 'var(--color-danger-500)' }} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: PM SCHEDULES */}
            {detailTab === 'schedules' && (
              <div className="space-y-4">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    System-generated preventive maintenance visits
                  </div>
                  {detailContract.status === 'ACTIVE' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleGeneratePm(detailContract.id)}
                      disabled={isSubmitting}
                    >
                      <Repeat style={{ width: '14px', height: '14px' }} />
                      Regenerate / Sync PM
                    </Button>
                  )}
                </div>

                {isSchedulesLoading ? (
                  <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading obligations...
                  </div>
                ) : (schedules || []).length === 0 ? (
                  <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No preventive maintenance obligations generated yet. Click &quot;Regenerate / Sync PM&quot; to calculate.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {schedules.map((sch) => (
                      <div
                        key={sch.id}
                        style={{
                          padding: '12px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          backgroundColor: 'var(--bg-surface)',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-normal)' }}>
                            Visit #{sch.visitNumber || 1} &bull; {sch.scheduleNumber}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            Equipment: {sch.assetTag} ({sch.brand} {sch.modelNumber || ''}) &bull; {sch.siteName}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-primary-600)', marginTop: '2px' }}>
                            Target Date: {formatDate(sch.scheduledDate)}
                          </div>
                        </div>

                        <div>{renderScheduleBadge(sch.status)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* 6. CREATE AMC CONTRACT MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create AMC Maintenance Agreement"
        maxWidth="640px"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer Select */}
            <div>
              <label htmlFor="amc-customer-select" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)' }}>
                Customer *
              </label>
              <select
                id="amc-customer-select"
                className="input-base"
                style={{ width: '100%', marginTop: '4px' }}
                value={formCustomerId}
                onChange={(e) => setFormCustomerId(e.target.value)}
                required
              >
                <option value="">Select Customer</option>
                {customersList.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name} ({cust.customerCode})
                  </option>
                ))}
              </select>
            </div>

            {/* Plan Select */}
            <div>
              <label htmlFor="amc-plan-select" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)' }}>
                AMC Plan Template
              </label>
              <select
                id="amc-plan-select"
                className="input-base"
                style={{ width: '100%', marginTop: '4px' }}
                value={formPlanId}
                onChange={(e) => handlePlanSelect(e.target.value)}
              >
                <option value="">Custom Agreement (No Template)</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.defaultFrequency} • {p.defaultVisitsPerYear} visits)
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label htmlFor="amc-start-date" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)' }}>
                Start Date *
              </label>
              <Input
                id="amc-start-date"
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                required
              />
            </div>

            {/* End Date */}
            <div>
              <label htmlFor="amc-end-date" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)' }}>
                End Date *
              </label>
              <Input
                id="amc-end-date"
                type="date"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                required
              />
            </div>

            {/* Frequency */}
            <div>
              <label htmlFor="amc-frequency" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)' }}>
                PM Frequency *
              </label>
              <select
                id="amc-frequency"
                className="input-base"
                style={{ width: '100%', marginTop: '4px' }}
                value={formFrequency}
                onChange={(e) => setFormFrequency(e.target.value as AmcFrequency)}
                required
              >
                <option value="MONTHLY">Monthly (12 visits / yr)</option>
                <option value="QUARTERLY">Quarterly (4 visits / yr)</option>
                <option value="HALF_YEARLY">Half-Yearly (2 visits / yr)</option>
                <option value="YEARLY">Yearly (1 visit / yr)</option>
              </select>
            </div>

            {/* Included Visits */}
            <div>
              <label htmlFor="amc-visits" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)' }}>
                Included Visits *
              </label>
              <Input
                id="amc-visits"
                type="number"
                min="1"
                value={formTotalVisits}
                onChange={(e) => setFormTotalVisits(Number(e.target.value))}
                required
              />
            </div>

            {/* Commercial Amount */}
            <div>
              <label htmlFor="amc-amount" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)' }}>
                Commercial Amount (INR) *
              </label>
              <Input
                id="amc-amount"
                type="number"
                min="0"
                value={formTotalAmount}
                onChange={(e) => setFormTotalAmount(Number(e.target.value))}
                required
              />
            </div>
          </div>

          {/* Covered Assets Selection */}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)' }}>
              Covered AC Assets ({formCoveredAssetIds.length} selected)
            </label>
            {isAssetsLoading ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Loading equipment...</div>
            ) : availableAssets.length === 0 ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
                {formCustomerId ? 'No AC equipment registered for this customer yet.' : 'Select a customer above.'}
              </div>
            ) : (
              <div
                style={{
                  maxHeight: '160px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px',
                  marginTop: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                {availableAssets.map((asset) => (
                  <label
                    key={asset.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formCoveredAssetIds.includes(asset.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormCoveredAssetIds((prev) => [...prev, asset.id]);
                        } else {
                          setFormCoveredAssetIds((prev) => prev.filter((id) => id !== asset.id));
                        }
                      }}
                    />
                    <span>
                      <strong>{asset.assetTag}</strong> ({asset.brand} - {asset.modelNumber || 'N/A'}) &bull;{' '}
                      {asset.siteName}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)' }}>
              Contract Notes
            </label>
            <Textarea
              rows={2}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Commercial terms, special service instructions..."
            />
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '16px' }}>
            <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Contract'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 7. EDIT MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit AMC Agreement Details"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!detailContract) return;
            setIsSubmitting(true);
            try {
              await apiClient.patch(`/amc-contracts/${detailContract.id}`, {
                startDate: formStartDate,
                endDate: formEndDate,
                frequency: formFrequency,
                totalAmount: Number(formTotalAmount),
                totalVisits: Number(formTotalVisits),
                notes: formNotes || null,
              });
              showToast({ title: 'Contract Updated', message: 'Details updated successfully', type: 'success' });
              setIsEditModalOpen(false);
              fetchDetailContract(detailContract.id);
              fetchContracts();
            } catch (err) {
              showToast({
                title: 'Update Failed',
                message: err instanceof ApiError ? err.message : 'Error updating contract',
                type: 'error',
              });
            } finally {
              setIsSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Start Date</label>
              <Input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>End Date</label>
              <Input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Frequency</label>
              <select
                className="input-base"
                style={{ width: '100%', marginTop: '4px' }}
                value={formFrequency}
                onChange={(e) => setFormFrequency(e.target.value as AmcFrequency)}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="HALF_YEARLY">Half-Yearly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Total Visits</label>
              <Input type="number" min="1" value={formTotalVisits} onChange={(e) => setFormTotalVisits(Number(e.target.value))} required />
            </div>
            <div className="col-span-2">
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Total Amount (INR)</label>
              <Input type="number" min="0" value={formTotalAmount} onChange={(e) => setFormTotalAmount(Number(e.target.value))} required />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Notes</label>
            <Textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="ghost" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      {/* 8. CANCEL CONTRACT CONFIRMATION MODAL */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel AMC Contract"
      >
        <form onSubmit={handleCancelSubmit} className="space-y-4">
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-normal)' }}>
            Are you sure you want to cancel contract <strong>{detailContract?.contractNumber}</strong>?
            Future unfulfilled PM schedules will be automatically cancelled. Historical completed work is preserved.
          </p>
          <div>
            <label htmlFor="cancel-reason" style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Cancellation Reason *</label>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="E.g., Customer opted out, office relocated..."
              required
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="ghost" onClick={() => setIsCancelModalOpen(false)}>Abort</Button>
            <Button variant="danger" type="submit" disabled={isSubmitting}>Confirm Cancellation</Button>
          </div>
        </form>
      </Modal>

      {/* 9. RENEW CONTRACT MODAL */}
      <Modal
        isOpen={isRenewModalOpen}
        onClose={() => setIsRenewModalOpen(false)}
        title="Renew AMC Contract"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!detailContract) return;
            setIsSubmitting(true);
            try {
              const res = await apiClient.post<AmcSingleApiResponse>(`/amc-contracts/${detailContract.id}/renew`, {
                customerId: detailContract.customerId,
                startDate: formStartDate,
                endDate: formEndDate,
                frequency: formFrequency,
                totalAmount: Number(formTotalAmount),
                totalVisits: Number(formTotalVisits),
                notes: formNotes || null,
              });
              showToast({
                title: 'Contract Renewed',
                message: `New contract ${res.contract.contractNumber} generated successfully`,
                type: 'success',
              });
              setIsRenewModalOpen(false);
              fetchDetailContract(res.contract.id);
              fetchContracts();
              fetchAuxData();
            } catch (err) {
              showToast({
                title: 'Renewal Failed',
                message: err instanceof ApiError ? err.message : 'Error renewing contract',
                type: 'error',
              });
            } finally {
              setIsSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--bg-surface-subtle)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-primary-600)', textTransform: 'uppercase' }}>
              Automatic Equipment Carry-Forward
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: '8px' }}>
              All <strong>{detailContract?.coveredAssets?.length || 0} covered AC assets</strong> from contract {detailContract?.contractNumber || ''} will automatically carry forward into the renewed contract without manual re-selection.
            </p>
            {detailContract?.coveredAssets && detailContract.coveredAssets.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {detailContract.coveredAssets.map((a) => (
                  <Badge key={a.id} variant="brand">
                    {a.assetTag} {a.brand ? `• ${a.brand}` : ''}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Renewing will preserve contract <strong>{detailContract?.contractNumber || ''}</strong> in history as <strong>RENEWED</strong> and activate a linked successor contract with newly scheduled PM obligations.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Start Date</label>
              <Input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>End Date</label>
              <Input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Frequency</label>
              <select
                className="input-base"
                style={{ width: '100%', marginTop: '4px' }}
                value={formFrequency}
                onChange={(e) => setFormFrequency(e.target.value as AmcFrequency)}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="HALF_YEARLY">Half-Yearly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Total Visits</label>
              <Input type="number" min="1" value={formTotalVisits} onChange={(e) => setFormTotalVisits(Number(e.target.value))} required />
            </div>
            <div className="col-span-2">
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Commercial Amount (INR)</label>
              <Input type="number" min="0" value={formTotalAmount} onChange={(e) => setFormTotalAmount(Number(e.target.value))} required />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="ghost" onClick={() => setIsRenewModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>Confirm Renewal</Button>
          </div>
        </form>
      </Modal>

      {/* 10. ADD ADDITIONAL ASSETS MODAL */}
      <Modal
        isOpen={isAddAssetsModalOpen}
        onClose={() => setIsAddAssetsModalOpen(false)}
        title="Cover Additional Equipment"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!detailContract || formCoveredAssetIds.length === 0) return;
            setIsSubmitting(true);
            try {
              await apiClient.post(`/amc-contracts/${detailContract.id}/assets`, {
                assetIds: formCoveredAssetIds,
              });
              showToast({ title: 'Assets Added', message: 'Additional equipment added to AMC coverage', type: 'success' });
              setIsAddAssetsModalOpen(false);
              fetchDetailContract(detailContract.id);
              fetchSchedules(detailContract.id);
              fetchContracts();
              fetchAuxData();
            } catch (err) {
              showToast({
                title: 'Failed to Add Assets',
                message: err instanceof ApiError ? err.message : 'Error attaching equipment',
                type: 'error',
              });
            } finally {
              setIsSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Select additional AC units to include under contract <strong>{detailContract?.contractNumber}</strong>.
          </p>
          <div
            style={{
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {availableAssets
              .filter((a) => !(detailContract?.coveredAssets || []).some((ca) => ca.assetId === a.id))
              .map((asset) => (
                <label
                  key={asset.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={formCoveredAssetIds.includes(asset.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormCoveredAssetIds((prev) => [...prev, asset.id]);
                      } else {
                        setFormCoveredAssetIds((prev) => prev.filter((id) => id !== asset.id));
                      }
                    }}
                  />
                  <span>
                    <strong>{asset.assetTag}</strong> ({asset.brand} - {asset.modelNumber || 'N/A'}) &bull; {asset.siteName}
                  </span>
                </label>
              ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="ghost" onClick={() => setIsAddAssetsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmitting || formCoveredAssetIds.length === 0}>
              Attach Selected ({formCoveredAssetIds.length})
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
