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
  Mail,
  CreditCard,
  CheckCircle,
  Send,
  Printer,
  Shield,
  Calculator,
} from 'lucide-react';
import { UpiQrCode } from '@/components/common/UpiQrCode';
import { COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';
import { AmcQuotationPrintModal } from '@/components/amc/AmcQuotationPrintModal';
import { AmcPlanRateCards } from '@/components/amc/AmcPlanRateCards';
import { apiClient, ApiError } from '@/services/api/client';
import { calculateAmcQuote, AmcQuoteResult } from '@/domain/amcRateCard';
import {
  AmcContract,
  AmcPlan,
  AmcCoveredAsset,
  AmcFrequency,
  AmcStatus,
  Customer,
  AcAsset,
  PlannedServiceType,
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
import { ModalStepWizard, WizardStepItem } from '@/components/ui/ModalStepWizard';
import { getAmcCadenceSlotCount } from '@/utils/amcCadence';

const AMC_WIZARD_STEPS: WizardStepItem[] = [
  { id: 'terms', label: '1. Commercial Terms', description: 'Customer & billing' },
  { id: 'allocation', label: '2. PM Allocation', description: 'Dry / Jet visits' },
  { id: 'assets', label: '3. Covered Equipment', description: 'Protected units' },
];

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
    plannedServiceType?: PlannedServiceType | null;
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
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  const [statusFilter, setStatusFilter] = useState<string>(() => new URLSearchParams(window.location.search).get('status') || 'ACTIVE');
  const [frequencyFilter, setFrequencyFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [primarySection, setPrimarySection] = useState<'CONTRACTS' | 'RATE_CARDS'>('CONTRACTS');

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
  const [createModalStep, setCreateModalStep] = useState<number>(0);
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
  const [formDryVisits, setFormDryVisits] = useState<number>(0);
  const [formJetVisits, setFormJetVisits] = useState<number>(0);
  const [formPumpdownVisits, setFormPumpdownVisits] = useState<number>(0);
  const [formNotes, setFormNotes] = useState('');
  const [formCoveredAssetIds, setFormCoveredAssetIds] = useState<string[]>([]);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Payment & Quotation states
  const [formPaymentMethod, setFormPaymentMethod] = useState<'ONLINE' | 'CASH' | 'CHEQUE'>('ONLINE');
  const [formDirectActivate, setFormDirectActivate] = useState<boolean>(false);
  const [isPrintQuotationModalOpen, setIsPrintQuotationModalOpen] = useState(false);
  const [isSendQuotationModalOpen, setIsSendQuotationModalOpen] = useState(false);
  const [quotationRecipientEmail, setQuotationRecipientEmail] = useState('');
  const [isSendingQuotation, setIsSendingQuotation] = useState(false);
  const [isClearPaymentModalOpen, setIsClearPaymentModalOpen] = useState(false);
  const [clearPaymentMethod, setClearPaymentMethod] = useState<'ONLINE' | 'CASH' | 'CHEQUE'>('ONLINE');
  const [clearPaymentAmount, setClearPaymentAmount] = useState<number>(0);
  const [clearPaymentRef, setClearPaymentRef] = useState('');
  const [clearPaymentNotes, setClearPaymentNotes] = useState('');
  const [isClearingPayment, setIsClearingPayment] = useState(false);

  // Derived live PM service allocation calculation
  const allocatedVisits = formDryVisits + formJetVisits + formPumpdownVisits;
  const remainingVisits = formTotalVisits - allocatedVisits;
  const isAllocationValid = allocatedVisits === formTotalVisits && formTotalVisits > 0;
  const cadenceSlotCount = getAmcCadenceSlotCount(formStartDate, formEndDate, formFrequency);
  const isCadenceValid = cadenceSlotCount > 0 && cadenceSlotCount === Number(formTotalVisits);

  // Customer dropdown & asset selection options
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [availableAssets, setAvailableAssets] = useState<AcAsset[]>([]);
  const [isAssetsLoading, setIsAssetsLoading] = useState(false);

  // Fetch metrics & plans
  const fetchAuxData = useCallback(async () => {
    try {
      const [metricsRes, plansRes] = await Promise.all([
        apiClient.get<AmcMetricsApiResponse>('/amc-contracts/metrics'),
        apiClient.get<AmcPlansApiResponse>('/amc-contracts/plans?includeInactive=true'),
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

  const handleOpenDetail = useCallback((c: AmcContract) => {
    setSelectedContractId(c.id);
    setDetailContract(c);
    setIsDetailOpen(true);
    setDetailTab('overview');
    fetchDetailContract(c.id);
    fetchSchedules(c.id);
  }, [fetchDetailContract, fetchSchedules]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (search.trim()) url.searchParams.set('search', search.trim()); else url.searchParams.delete('search');
    if (statusFilter !== 'ALL') url.searchParams.set('status', statusFilter); else url.searchParams.delete('status');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [search, statusFilter]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const recordId = params.get('workspace') === 'amc' && params.get('recordType') === 'amc' ? params.get('recordId') : null;
    if (!recordId || selectedContractId === recordId) return;
    const contract = contracts.find((item) => item.id === recordId);
    if (contract) handleOpenDetail(contract);
    else {
      setSelectedContractId(recordId);
      setIsDetailOpen(true);
      fetchDetailContract(recordId);
      fetchSchedules(recordId);
    }
  }, [contracts, selectedContractId, fetchDetailContract, fetchSchedules, handleOpenDetail]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedContractId) {
      url.searchParams.set('recordId', selectedContractId);
      url.searchParams.set('recordType', 'amc');
    } else if (url.searchParams.get('recordType') === 'amc') {
      url.searchParams.delete('recordId'); url.searchParams.delete('recordType');
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [selectedContractId]);

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
      if (chosen.planCode?.includes('JACKET-2')) {
        setFormDryVisits(0);
        setFormJetVisits(2);
        setFormPumpdownVisits(0);
      } else if (chosen.planCode?.includes('JACKET-3')) {
        setFormDryVisits(0);
        setFormJetVisits(3);
        setFormPumpdownVisits(0);
      } else if (chosen.planCode?.includes('STANDALONE-PUMP')) {
        setFormDryVisits(0);
        setFormJetVisits(0);
        setFormPumpdownVisits(1);
      } else if (chosen.planCode?.includes('STANDALONE-JET')) {
        setFormDryVisits(0);
        setFormJetVisits(1);
        setFormPumpdownVisits(0);
      } else {
        const total = chosen.defaultVisitsPerYear || 4;
        const jet = Math.min(2, Math.max(1, Math.floor(total / 2)));
        setFormJetVisits(jet);
        setFormDryVisits(Math.max(0, total - jet));
        setFormPumpdownVisits(0);
      }
    }
  };

  // Live Authoritative Quote Calculation
  const selectedPlanObj = plans.find((p) => p.id === formPlanId);
  const selectedAssetsList = availableAssets.filter((a) => formCoveredAssetIds.includes(a.id));
  const liveQuote: AmcQuoteResult | null =
    selectedPlanObj && selectedAssetsList.length > 0
      ? calculateAmcQuote(selectedPlanObj as any, selectedAssetsList)
      : null;

  const handleApplyCalculatedQuote = () => {
    if (liveQuote) {
      setFormTotalAmount(liveQuote.totalAmount);
      showToast({
        title: 'Quote Applied',
        message: `Applied authoritative rate calculation of ₹${liveQuote.totalAmount.toLocaleString('en-IN')} (incl. ${liveQuote.gstRatePercent}% GST).`,
        type: 'info',
      });
    }
  };

  // Reset form
  const resetForm = () => {
    setFormCustomerId(preselectedCustomerId || '');
    setFormPlanId('');
    const today = new Date().toISOString().split('T')[0];
    const oneYearLater = new Date(`${today}T00:00:00.000Z`);
    oneYearLater.setUTCFullYear(oneYearLater.getUTCFullYear() + 1);
    oneYearLater.setUTCDate(oneYearLater.getUTCDate() - 1);
    setFormStartDate(today);
    setFormEndDate(oneYearLater.toISOString().slice(0, 10));
    setFormFrequency('QUARTERLY');
    setFormTotalAmount(25000);
    setFormTotalVisits(4);
    setFormDryVisits(0);
    setFormJetVisits(0);
    setFormPumpdownVisits(0);
    setFormNotes('');
    setFormCoveredAssetIds([]);
    setCreateModalStep(0);
  };

  const isCreateDirty = Boolean(
    formCustomerId ||
    formPlanId ||
    formStartDate ||
    formEndDate ||
    formNotes ||
    formCoveredAssetIds.length > 0 ||
    formTotalAmount > 0
  );

  const handleOpenCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(true);
  };

  // Submit Create Contract
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
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
    if (!isAllocationValid) {
      showToast({
        title: 'Validation Error',
        message: `Total PM service allocation (${allocatedVisits}) must exactly equal included visits (${formTotalVisits}).`,
        type: 'warning',
      });
      return;
    }
    if (!isCadenceValid) {
      showToast({
        title: 'Validation Error',
        message: `This contract term produces ${cadenceSlotCount} cadence dates. Included visits must match that count.`,
        type: 'warning',
      });
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
        dryServiceVisits: Number(formDryVisits),
        jetServiceVisits: Number(formJetVisits),
        pumpdownServiceVisits: Number(formPumpdownVisits),
        coveredAssetIds: formCoveredAssetIds,
        notes: formNotes || null,
        status: formDirectActivate ? 'ACTIVE' : 'DRAFT',
      });

      showToast({
        title: formDirectActivate ? 'AMC Contract Activated' : 'AMC Quotation Created',
        message: formDirectActivate
          ? `Contract ${res.contract.contractNumber} successfully created and active.`
          : `Quotation ${res.contract.contractNumber} created. You can now send it to the client and clear payment before activation.`,
        type: 'success',
      });

      setIsCreateModalOpen(false);
      if (!formDirectActivate) {
        setStatusFilter('DRAFT');
      }
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

  const handleActivateContract = async () => {
    if (!detailContract) return;
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/amc-contracts/${detailContract.id}/status`, {
        status: 'ACTIVE',
      });
      showToast({
        title: 'AMC Contract Activated',
        message: `Contract ${detailContract.contractNumber} is now active and preventive maintenance obligations have been generated.`,
        type: 'success',
      });
      fetchDetailContract(detailContract.id);
      fetchSchedules(detailContract.id);
      fetchContracts();
      fetchAuxData();
    } catch (err) {
      showToast({
        title: 'Activation Failed',
        message: err instanceof ApiError ? err.message : 'Failed to activate contract',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendQuotation = async () => {
    if (!detailContract || !quotationRecipientEmail.trim()) return;
    setIsSendingQuotation(true);
    try {
      await apiClient.post(`/amc-contracts/${detailContract.id}/send-quotation`, {
        recipientEmail: quotationRecipientEmail.trim(),
      });
      showToast({
        title: 'Quotation Dispatched',
        message: `AMC Quotation email successfully sent to ${quotationRecipientEmail}.`,
        type: 'success',
      });
      setIsSendQuotationModalOpen(false);
    } catch (err) {
      showToast({
        title: 'Email Dispatch Failed',
        message: err instanceof ApiError ? err.message : 'Failed to send quotation email',
        type: 'error',
      });
    } finally {
      setIsSendingQuotation(false);
    }
  };

  const handleClearPayment = async () => {
    if (!detailContract || clearPaymentAmount <= 0) return;
    setIsClearingPayment(true);
    try {
      await apiClient.post(`/amc-contracts/${detailContract.id}/clear-payment`, {
        paymentMethod: clearPaymentMethod,
        amount: Number(clearPaymentAmount),
        externalPaymentReference: clearPaymentRef.trim() || null,
        notes: clearPaymentNotes.trim() || null,
      });
      showToast({
        title: 'Payment Cleared',
        message: `Recorded payment clearance of ₹${Number(clearPaymentAmount).toLocaleString('en-IN')} for ${detailContract.contractNumber}.`,
        type: 'success',
      });
      setIsClearPaymentModalOpen(false);
      fetchDetailContract(detailContract.id);
      fetchContracts();
      fetchAuxData();
    } catch (err) {
      showToast({
        title: 'Payment Clearance Failed',
        message: err instanceof ApiError ? err.message : 'Failed to clear payment',
        type: 'error',
      });
    } finally {
      setIsClearingPayment(false);
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

      {/* Primary Section Switcher */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-default)',
          paddingBottom: '8px',
        }}
      >
        <button
          type="button"
          onClick={() => setPrimarySection('CONTRACTS')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            border: 'none',
            backgroundColor: primarySection === 'CONTRACTS' ? 'var(--color-primary-500)' : 'transparent',
            color: primarySection === 'CONTRACTS' ? '#ffffff' : 'var(--text-secondary)',
            transition: 'all 0.15s ease',
          }}
        >
          <FileCheck2 size={16} />
          Contracts &amp; Maintenance ({total})
        </button>

        <button
          type="button"
          onClick={() => setPrimarySection('RATE_CARDS')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            border: 'none',
            backgroundColor: primarySection === 'RATE_CARDS' ? 'var(--color-primary-500)' : 'transparent',
            color: primarySection === 'RATE_CARDS' ? '#ffffff' : 'var(--text-secondary)',
            transition: 'all 0.15s ease',
          }}
        >
          <Shield size={16} />
          Rate Cards &amp; Plans ({plans.length})
        </button>
      </div>

      {primarySection === 'RATE_CARDS' ? (
        <AmcPlanRateCards plans={plans} onPlansUpdated={fetchAuxData} />
      ) : (
        <>
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
          { id: 'DRAFT', label: 'Quotations / Drafts' },
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
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-normal)', fontWeight: 500 }}>
                        {c.completedVisitsCount || 0} / {c.totalVisits} Cycles Completed
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {c.coveredAssetsCount || 1} units &bull; {c.totalVisits * (c.coveredAssetsCount || 1)} obligations
                      </div>
                      {c.nextPmDate && (
                        <div style={{ fontSize: '11px', color: 'var(--color-primary-500)', marginTop: '2px' }}>
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
        </>
      )}

      {/* 5. Detail Drawer */}
      <Drawer
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={detailContract ? `Contract: ${detailContract.contractNumber}` : 'AMC Details'}
        width="640px"
        onBack={detailTab !== 'overview' ? () => setDetailTab('overview') : undefined}
        backLabel="Overview"
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
                    <div style={{ fontWeight: 500 }}>{detailContract.totalVisits} Visits ({detailContract.totalVisits} Cycles / Unit)</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {detailContract.totalVisits * (detailContract.coveredAssets?.length || 1)} total obligations across {detailContract.coveredAssets?.length || 1} units
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Visit Progress</div>
                    <div style={{ fontWeight: 600, color: 'var(--color-primary-600)' }}>
                      {detailContract.completedVisitsCount || 0} / {detailContract.totalVisits} Cycles Completed
                    </div>
                  </div>
                </div>

                {/* PM Service Allocation Details */}
                <div
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--surface-subtle, rgba(0, 0, 0, 0.02))',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)', marginBottom: '8px' }}>
                    Configured PM Service Allocation
                  </div>
                  {detailContract.dryServiceVisits != null ||
                  detailContract.jetServiceVisits != null ||
                  detailContract.pumpdownServiceVisits != null ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Dry Service</div>
                        <div style={{ fontWeight: 600 }}>{detailContract.dryServiceVisits ?? 0} Visits</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Jet Service</div>
                        <div style={{ fontWeight: 600 }}>{detailContract.jetServiceVisits ?? 0} Visits</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pumpdown Service</div>
                        <div style={{ fontWeight: 600 }}>{detailContract.pumpdownServiceVisits ?? 0} Visits</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Not specified <span style={{ fontSize: '11px' }}>(Legacy contract with alternating PM default)</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  {detailContract.previousContractId && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Renewal Relationship</div>
                      <div style={{ fontWeight: 500, color: 'var(--color-primary-600)', fontSize: 'var(--text-xs)' }}>
                        Renewed from predecessor AMC agreement (Asset coverage carried forward)
                      </div>
                    </div>
                  )}
                  {detailContract.status === 'RENEWED' && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Renewal Relationship</div>
                      <div style={{ fontWeight: 500, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                        Historical predecessor contract (Renewed into active successor agreement)
                      </div>
                    </div>
                  )}
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

                {/* Payment & Settlement Particulars */}
                <div
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--surface-subtle, rgba(0, 0, 0, 0.02))',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    marginTop: 'var(--space-3)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)' }}>
                      Payment & Settlement Status
                    </div>
                    <Badge
                      variant={
                        detailContract.paymentStatus === 'PAID'
                          ? 'success'
                          : detailContract.paymentStatus === 'PARTIALLY_PAID'
                          ? 'warning'
                          : 'neutral'
                      }
                    >
                      {detailContract.paymentStatus || 'PENDING'}
                    </Badge>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Quotation Due</div>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>
                        &#8377;{Number(detailContract.totalAmount).toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Amount Cleared</div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-success-600, #16a34a)' }}>
                        &#8377;{Number(detailContract.totalAmountPaid || 0).toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Balance Remaining</div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '13px',
                          color:
                            (detailContract.paymentBalanceDue ?? detailContract.totalAmount) > 0
                              ? 'var(--color-danger-600, #dc2626)'
                              : 'var(--color-success-600, #16a34a)',
                        }}
                      >
                        &#8377;{Number(detailContract.paymentBalanceDue ?? detailContract.totalAmount).toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      borderTop: '1px solid var(--border-subtle)',
                      paddingTop: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                      <div><strong>Bank:</strong> {COMPANY_BANK_DETAILS.bankName} (A/C: {COMPANY_BANK_DETAILS.accountNumber})</div>
                      <div><strong>IFSC:</strong> {COMPANY_BANK_DETAILS.ifscCode} | <strong>UPI:</strong> {COMPANY_BANK_DETAILS.upiId}</div>
                    </div>
                    <UpiQrCode
                      amount={detailContract.paymentBalanceDue ?? detailContract.totalAmount}
                      note={`AMC ${detailContract.contractNumber}`}
                      size={72}
                      showScanText={true}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: 'var(--space-4)' }}>
                  {detailContract.status === 'DRAFT' && (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isSubmitting}
                        onClick={handleActivateContract}
                      >
                        <CheckCircle style={{ width: '14px', height: '14px' }} />
                        Activate Contract
                      </Button>
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
                          setFormDryVisits(detailContract.dryServiceVisits ?? 0);
                          setFormJetVisits(detailContract.jetServiceVisits ?? 0);
                          setFormPumpdownVisits(detailContract.pumpdownServiceVisits ?? 0);
                          setFormNotes(detailContract.notes || '');
                          setIsEditModalOpen(true);
                        }}
                      >
                        <Edit2 style={{ width: '14px', height: '14px' }} />
                        Edit Quotation
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsPrintQuotationModalOpen(true)}
                      >
                        <Printer style={{ width: '14px', height: '14px' }} />
                        Print Quotation
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setQuotationRecipientEmail(
                            detailContract.customerPhone
                              ? `${detailContract.customerCode || 'client'}@placeyourservice.internal`
                              : ''
                          );
                          setIsSendQuotationModalOpen(true);
                        }}
                      >
                        <Mail style={{ width: '14px', height: '14px' }} />
                        Send Quotation
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setClearPaymentAmount(detailContract.paymentBalanceDue ?? detailContract.totalAmount);
                          setClearPaymentRef('');
                          setClearPaymentNotes('');
                          setIsClearPaymentModalOpen(true);
                        }}
                      >
                        <CreditCard style={{ width: '14px', height: '14px' }} />
                        Record Clearance
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setIsCancelModalOpen(true)}
                      >
                        <XCircle style={{ width: '14px', height: '14px' }} />
                        Cancel
                      </Button>
                    </>
                  )}
                  {detailContract.status === 'ACTIVE' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsPrintQuotationModalOpen(true)}
                      >
                        <Printer style={{ width: '14px', height: '14px' }} />
                        Print Agreement / Quote
                      </Button>
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
                      {(detailContract.paymentBalanceDue ?? 0) > 0 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setClearPaymentAmount(detailContract.paymentBalanceDue ?? detailContract.totalAmount);
                            setClearPaymentRef('');
                            setClearPaymentNotes('');
                            setIsClearPaymentModalOpen(true);
                          }}
                        >
                          <CreditCard style={{ width: '14px', height: '14px' }} />
                          Record Clearance
                        </Button>
                      )}
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
                  {['EXPIRING_SOON', 'EXPIRED'].includes(detailContract.status) && (
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
                        const hasBreakdown = detailContract.dryServiceVisits != null || detailContract.jetServiceVisits != null || detailContract.pumpdownServiceVisits != null;
                        const tVisits = detailContract.totalVisits || 1;
                        setFormDryVisits(hasBreakdown ? (detailContract.dryServiceVisits ?? 0) : Math.ceil(tVisits / 2));
                        setFormJetVisits(hasBreakdown ? (detailContract.jetServiceVisits ?? 0) : Math.floor(tVisits / 2));
                        setFormPumpdownVisits(hasBreakdown ? (detailContract.pumpdownServiceVisits ?? 0) : 0);
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

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {sch.plannedServiceType ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor:
                                  sch.plannedServiceType === 'JET_SERVICE'
                                    ? 'var(--color-primary-50, #eff6ff)'
                                    : sch.plannedServiceType === 'PUMPDOWN_SERVICE'
                                    ? 'var(--color-warning-50, #fffbeb)'
                                    : 'var(--color-neutral-100, #f1f5f9)',
                                color:
                                  sch.plannedServiceType === 'JET_SERVICE'
                                    ? 'var(--color-primary-700, #1d4ed8)'
                                    : sch.plannedServiceType === 'PUMPDOWN_SERVICE'
                                    ? 'var(--color-warning-700, #b45309)'
                                    : 'var(--color-neutral-700, #334155)',
                                border: `1px solid ${
                                  sch.plannedServiceType === 'JET_SERVICE'
                                    ? 'var(--color-primary-200, #bfdbfe)'
                                    : sch.plannedServiceType === 'PUMPDOWN_SERVICE'
                                    ? 'var(--color-warning-200, #fde68a)'
                                    : 'var(--color-neutral-300, #cbd5e1)'
                                }`,
                              }}
                            >
                              {sch.plannedServiceType === 'DRY_SERVICE' && 'Dry Service'}
                              {sch.plannedServiceType === 'JET_SERVICE' && 'Jet Service'}
                              {sch.plannedServiceType === 'PUMPDOWN_SERVICE' && 'Pumpdown Service'}
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-muted, #94a3b8)',
                              }}
                            >
                              Not specified
                            </span>
                          )}
                          {renderScheduleBadge(sch.status)}
                        </div>
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
        description="Establish commercial maintenance terms, PM service allocation, and covered AC equipment."
        maxWidth="780px"
        isDirty={isCreateDirty}
        onConfirmDiscard={resetForm}
      >
        {({ requestClose }) => (
          <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Step Wizard Header */}
            <ModalStepWizard
              steps={AMC_WIZARD_STEPS}
              activeStep={createModalStep}
              onStepClick={setCreateModalStep}
            />

            {/* STEP 1: COMMERCIAL TERMS */}
            <div style={{ display: createModalStep === 0 ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div className="form-grid-2">
                {/* Customer Select */}
                <div>
                  <label htmlFor="amc-customer-select" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Customer *
                  </label>
                  <select
                    id="amc-customer-select"
                    className="input-neomorph"
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
                  <label htmlFor="amc-plan-select" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    AMC Plan Template
                  </label>
                  <select
                    id="amc-plan-select"
                    className="input-neomorph"
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
                  <label htmlFor="amc-start-date" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label htmlFor="amc-end-date" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      End Date *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (formStartDate) {
                          const d = new Date(formStartDate);
                          d.setFullYear(d.getFullYear() + 1);
                          setFormEndDate(d.toISOString().split('T')[0]);
                        }
                      }}
                      style={{ fontSize: '10px', color: 'var(--color-brand)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      +1 Year Standard
                    </button>
                  </div>
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
                  <label htmlFor="amc-frequency" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    PM Frequency *
                  </label>
                  <select
                    id="amc-frequency"
                    className="input-neomorph"
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
                  <label htmlFor="amc-visits" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
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
                  {cadenceSlotCount > 0 && cadenceSlotCount !== Number(formTotalVisits) && (
                    <span style={{ fontSize: '10px', color: 'var(--color-warning-600, #d97706)', marginTop: '2px', display: 'block' }}>
                      Notice: Term cadence anticipates {cadenceSlotCount} {formFrequency.toLowerCase()} slots
                    </span>
                  )}
                </div>

                {/* Live Authoritative Rate Chart Calculation Box */}
                {liveQuote && (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      backgroundColor: 'rgba(2, 132, 199, 0.05)',
                      border: '1px solid rgba(2, 132, 199, 0.25)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        <Calculator size={15} color="#0284c7" />
                        Authoritative Rate Chart Calculation ({selectedAssetsList.length} units selected):
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        Base: ₹{liveQuote.baseAmount.toLocaleString('en-IN')} + GST ({liveQuote.gstRatePercent}%): ₹{liveQuote.gstAmount.toLocaleString('en-IN')} = <strong>₹{liveQuote.totalAmount.toLocaleString('en-IN')}</strong>
                      </div>
                      {liveQuote.warnings.length > 0 && (
                        <div style={{ fontSize: '10px', color: 'var(--color-warning-600, #d97706)', marginTop: '4px', fontWeight: 600 }}>
                          ⚠️ {liveQuote.warnings.join(' • ')}
                        </div>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleApplyCalculatedQuote}
                    >
                      Apply Quote (₹{liveQuote.totalAmount.toLocaleString('en-IN')})
                    </Button>
                  </div>
                )}

                {/* Commercial Amount */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="amc-amount" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
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

                {/* Payment Mode / Terms */}
                <div>
                  <label htmlFor="amc-payment-method" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Payment Mode / Terms
                  </label>
                  <select
                    id="amc-payment-method"
                    className="input-base"
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value as 'ONLINE' | 'CASH' | 'CHEQUE')}
                    style={{ width: '100%', height: '38px', borderRadius: 'var(--radius-md)' }}
                  >
                    <option value="ONLINE">Online (UPI / NEFT / IMPS)</option>
                    <option value="CASH">Cash Payment</option>
                    <option value="CHEQUE">Bank Cheque</option>
                  </select>
                </div>

                {/* Direct Activate Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '18px' }}>
                  <input
                    id="amc-direct-activate"
                    type="checkbox"
                    checked={formDirectActivate}
                    onChange={(e) => setFormDirectActivate(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary-600)', cursor: 'pointer' }}
                  />
                  <label htmlFor="amc-direct-activate" style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    Directly Activate Agreement (Schedule PM Visits Now)
                  </label>
                </div>

                {/* Live Demo Company Bank Details & Dynamic Amount-Encoded UPI QR */}
                <div
                  style={{
                    gridColumn: '1 / -1',
                    backgroundColor: 'var(--bg-surface-subtle, #f8fafc)',
                    border: '1px solid var(--border-default, #cbd5e1)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    marginTop: '4px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <CreditCard size={14} color="#0284c7" />
                      Company Payment Particulars & UPI QR
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <div><strong>Payee:</strong> {COMPANY_BANK_DETAILS.accountHolderName}</div>
                      <div><strong>Bank:</strong> {COMPANY_BANK_DETAILS.bankName} (A/C: {COMPANY_BANK_DETAILS.accountNumber})</div>
                      <div><strong>IFSC:</strong> {COMPANY_BANK_DETAILS.ifscCode} | <strong>Branch:</strong> {COMPANY_BANK_DETAILS.branchName}</div>
                      <div><strong>UPI ID:</strong> <span style={{ color: '#0284c7', fontWeight: 600 }}>{COMPANY_BANK_DETAILS.upiId}</span></div>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                      QR code dynamically encodes commercial amount &#8377;{Number(formTotalAmount || 0).toLocaleString('en-IN')}.
                    </div>
                  </div>

                  <UpiQrCode
                    amount={Number(formTotalAmount) || 0}
                    note={`AMC Quotation - ${customersList.find((c) => c.id === formCustomerId)?.name || 'Agreement'}`}
                    size={88}
                    showScanText={true}
                    showDetails={false}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="amc-notes" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)' }}>
                  Contract Notes
                </label>
                <Textarea
                  id="amc-notes"
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Commercial terms, special service instructions, payment schedules..."
                />
              </div>
            </div>

            {/* STEP 2: PM VISIT ALLOCATION */}
            <div style={{ display: createModalStep === 1 ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div
                style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-default)',
                  backgroundColor: 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Preventive Maintenance Service Allocation *
                  </label>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: isAllocationValid ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                      color: isAllocationValid ? 'var(--color-success-text)' : 'var(--color-error-text)',
                      border: `1px solid ${isAllocationValid ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
                    }}
                  >
                    {allocatedVisits} / {formTotalVisits} Allocated
                  </span>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)', margin: '0 0 var(--space-4) 0' }}>
                  Distribute the {formTotalVisits} included annual PM visits across Dry, Jet, and Pumpdown services. The sum must strictly equal total included visits.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
                  <div
                    style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                  >
                    <label htmlFor="amc-dry-visits" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Dry Service Visits
                    </label>
                    <select
                      id="amc-dry-visits"
                      className="input-neomorph"
                      style={{ width: '100%' }}
                      value={formDryVisits}
                      onChange={(e) => setFormDryVisits(Number(e.target.value))}
                    >
                      {Array.from({ length: Math.max(0, formTotalVisits) + 1 }, (_, i) => (
                        <option key={i} value={i}>
                          {i} {i === 1 ? 'visit' : 'visits'}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                      Standard filter & coil check
                    </span>
                  </div>

                  <div
                    style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                  >
                    <label htmlFor="amc-jet-visits" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Jet Service Visits
                    </label>
                    <select
                      id="amc-jet-visits"
                      className="input-neomorph"
                      style={{ width: '100%' }}
                      value={formJetVisits}
                      onChange={(e) => setFormJetVisits(Number(e.target.value))}
                    >
                      {Array.from({ length: Math.max(0, formTotalVisits) + 1 }, (_, i) => (
                        <option key={i} value={i}>
                          {i} {i === 1 ? 'visit' : 'visits'}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                      High-pressure deep wash
                    </span>
                  </div>

                  <div
                    style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                  >
                    <label htmlFor="amc-pumpdown-visits" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Pumpdown Visits
                    </label>
                    <select
                      id="amc-pumpdown-visits"
                      className="input-neomorph"
                      style={{ width: '100%' }}
                      value={formPumpdownVisits}
                      onChange={(e) => setFormPumpdownVisits(Number(e.target.value))}
                    >
                      {Array.from({ length: Math.max(0, formTotalVisits) + 1 }, (_, i) => (
                        <option key={i} value={i}>
                          {i} {i === 1 ? 'visit' : 'visits'}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                      Refrigerant recovery & overhaul
                    </span>
                  </div>
                </div>

                {/* Live calculation summary */}
                <div
                  style={{
                    marginTop: 'var(--space-4)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: isAllocationValid ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: `1px solid ${isAllocationValid ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <span>Total Plan: <strong>{formTotalVisits}</strong></span>
                    <span>Allocated: <strong>{allocatedVisits}</strong></span>
                    <span>Remaining: <strong>{remainingVisits}</strong></span>
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      color: isAllocationValid ? 'var(--color-success-solid)' : 'var(--color-error-solid)',
                    }}
                  >
                    {isAllocationValid
                      ? '✓ Allocation balanced & verified'
                      : remainingVisits > 0
                      ? `⚠️ ${remainingVisits} visit(s) remaining to allocate`
                      : `⚠️ Allocation exceeds by ${Math.abs(remainingVisits)} visit(s)`}
                  </span>
                </div>
              </div>
            </div>

            {/* STEP 3: COVERED AC ASSETS */}
            <div style={{ display: createModalStep === 2 ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-normal)' }}>
                  Covered AC Assets ({formCoveredAssetIds.length} of {availableAssets.length} selected)
                </label>
                {availableAssets.length > 0 && (
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                      type="button"
                      onClick={() => setFormCoveredAssetIds(availableAssets.map((a) => a.id))}
                      style={{ fontSize: '11px', color: 'var(--color-brand)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Select All
                    </button>
                    <span style={{ color: 'var(--border-default)' }}>|</span>
                    <button
                      type="button"
                      onClick={() => setFormCoveredAssetIds([])}
                      style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {isAssetsLoading ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  Loading customer equipment register...
                </div>
              ) : availableAssets.length === 0 ? (
                <div
                  style={{
                    padding: 'var(--space-6)',
                    textAlign: 'center',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px dashed var(--border-default)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {formCustomerId ? 'No AC equipment registered for this customer yet.' : 'Select a customer on Step 1 to choose equipment.'}
                </div>
              ) : (
                <div
                  style={{
                    maxHeight: '220px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.6)',
                  }}
                >
                  {availableAssets.map((asset) => (
                    <label
                      key={asset.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: 'var(--text-xs)',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: formCoveredAssetIds.includes(asset.id) ? 'var(--color-primary-50)' : 'var(--bg-surface)',
                        border: formCoveredAssetIds.includes(asset.id) ? '1px solid var(--color-primary-200)' : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                            {asset.assetTag}
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {asset.brand} &bull; {asset.modelNumber || 'Standard Model'}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          📍 {asset.siteName || 'Primary Site'} {asset.roomLocation ? `• Room: ${asset.roomLocation}` : ''}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Step 3 Live Rate Calculation Breakdown */}
              {liveQuote && (
                <div
                  style={{
                    backgroundColor: 'rgba(2, 132, 199, 0.05)',
                    border: '1px solid rgba(2, 132, 199, 0.25)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calculator size={14} color="#0284c7" />
                      Calculated Commercial Total:
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: '#0284c7' }}>
                      ₹{liveQuote.totalAmount.toLocaleString('en-IN')}{' '}
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        (incl. {liveQuote.gstRatePercent}% GST)
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>Covered Units: <strong>{liveQuote.lines.length}</strong></span>
                    <span>Base Subtotal: <strong>₹{liveQuote.baseAmount.toLocaleString('en-IN')}</strong></span>
                    <span>GST Amount: <strong>₹{liveQuote.gstAmount.toLocaleString('en-IN')}</strong></span>
                  </div>

                  {liveQuote.warnings.length > 0 && (
                    <div style={{ marginTop: '6px', color: 'var(--color-warning-600, #d97706)', fontWeight: 600, fontSize: '10px' }}>
                      ⚠️ {liveQuote.warnings.join(' • ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <Button variant="ghost" type="button" onClick={requestClose}>
                Cancel
              </Button>

              <div style={{ display: 'flex', gap: '8px' }}>
                {createModalStep > 0 && (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setCreateModalStep((s) => s - 1)}
                  >
                    Back
                  </Button>
                )}

                {createModalStep < 2 ? (
                  <Button
                    variant="primary"
                    type="button"
                    onClick={() => setCreateModalStep((s) => s + 1)}
                  >
                    Next Step ➔
                  </Button>
                ) : null}

                <Button
                  variant="primary"
                  type="submit"
                  disabled={isSubmitting || !isAllocationValid || !isCadenceValid}
                  title={!isCadenceValid ? 'Included visits must match cadence dates in the contract term' : !isAllocationValid ? 'Total allocation must equal included visits to create agreement' : undefined}
                  id="btn-submit-amc-contract"
                >
                  {isSubmitting ? 'Creating...' : 'Create Contract'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* 7. EDIT CONTRACT / QUOTATION MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={detailContract?.status === 'DRAFT' ? 'Edit AMC Quotation' : 'Edit AMC Agreement Details'}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!detailContract) return;
            if (!isCadenceValid || !isAllocationValid) {
              showToast({
                title: 'Validation Error',
                message: `Contract terms require ${cadenceSlotCount} cadence dates and a matching Dry, Jet, and Pumpdown allocation.`,
                type: 'warning',
              });
              return;
            }
            setIsSubmitting(true);
            try {
              await apiClient.patch(`/amc-contracts/${detailContract.id}`, {
                planId: formPlanId || null,
                startDate: formStartDate,
                endDate: formEndDate,
                frequency: formFrequency,
                totalAmount: Number(formTotalAmount),
                totalVisits: Number(formTotalVisits),
                dryServiceVisits: Number(formDryVisits),
                jetServiceVisits: Number(formJetVisits),
                pumpdownServiceVisits: Number(formPumpdownVisits),
                notes: formNotes || null,
              });
              showToast({ title: 'Quotation Updated', message: 'Details updated successfully', type: 'success' });
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
            <div className="col-span-2">
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>AMC Plan / Scheme</label>
              <select
                className="input-base"
                style={{ width: '100%', marginTop: '4px' }}
                value={formPlanId}
                onChange={(e) => {
                  const pId = e.target.value;
                  setFormPlanId(pId);
                  const selectedPlan = plans.find((p) => p.id === pId);
                  if (selectedPlan) {
                    if (selectedPlan.defaultFrequency) setFormFrequency(selectedPlan.defaultFrequency);
                    if (selectedPlan.defaultVisitsPerYear) setFormTotalVisits(selectedPlan.defaultVisitsPerYear);
                  }
                }}
              >
                <option value="">Custom / Unspecified Plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.planCode}) — {p.defaultVisitsPerYear} visits/yr
                  </option>
                ))}
              </select>
            </div>

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
                <option value="MONTHLY">Monthly (12 visits)</option>
                <option value="BI_MONTHLY">Bi-Monthly (6 visits)</option>
                <option value="QUARTERLY">Quarterly (4 visits)</option>
                <option value="FOUR_MONTHLY">Four-Monthly (3 visits)</option>
                <option value="HALF_YEARLY">Half-Yearly (2 visits)</option>
                <option value="YEARLY">Yearly (1 visit)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Total Included Visits</label>
              <Input
                type="number"
                min="1"
                value={formTotalVisits}
                onChange={(e) => setFormTotalVisits(Number(e.target.value))}
                required
              />
              {cadenceSlotCount > 0 && cadenceSlotCount !== Number(formTotalVisits) && (
                <span style={{ fontSize: '10px', color: 'var(--color-warning-600, #d97706)', marginTop: '2px', display: 'block' }}>
                  Notice: Term cadence anticipates {cadenceSlotCount} {formFrequency.toLowerCase()} slots
                </span>
              )}
            </div>

            {/* PM Breakdown Allocation */}
            <div className="col-span-2" style={{ padding: '8px 12px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  PM Service Visit Breakdown
                </span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: isAllocationValid ? 'var(--color-success-text)' : 'var(--color-error-text)' }}>
                  Allocated: {allocatedVisits} / {formTotalVisits} {isAllocationValid ? '✓' : `(${remainingVisits} remaining)`}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '10.5px', fontWeight: 600 }}>Dry Services</label>
                  <Input
                    type="number"
                    min="0"
                    value={formDryVisits}
                    onChange={(e) => setFormDryVisits(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10.5px', fontWeight: 600 }}>Jet Services</label>
                  <Input
                    type="number"
                    min="0"
                    value={formJetVisits}
                    onChange={(e) => setFormJetVisits(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10.5px', fontWeight: 600 }}>Pumpdown</label>
                  <Input
                    type="number"
                    min="0"
                    value={formPumpdownVisits}
                    onChange={(e) => setFormPumpdownVisits(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  />
                </div>
              </div>
            </div>

            {/* Live Rate Chart Recalculation Suggestion */}
            {liveQuote && (
              <div
                style={{
                  gridColumn: 'span 2',
                  padding: '10px 14px',
                  backgroundColor: 'rgba(2, 132, 199, 0.08)',
                  border: '1px solid rgba(2, 132, 199, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 700 }}>
                    Official Rate Chart Quote: ₹{liveQuote.totalAmount.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                    Base: ₹{liveQuote.baseAmount.toLocaleString('en-IN')} + {liveQuote.gstRatePercent}% GST (₹{liveQuote.gstAmount.toLocaleString('en-IN')})
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleApplyCalculatedQuote}
                  style={{ fontSize: '11px', height: '28px', padding: '0 10px' }}
                >
                  ⚡ Apply Quote
                </Button>
              </div>
            )}

            <div className="col-span-2">
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Total Quotation Amount (INR)</label>
              <Input type="number" min="0" value={formTotalAmount} onChange={(e) => setFormTotalAmount(Number(e.target.value))} required />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Internal Notes / Terms</label>
            <Textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>Save Quotation</Button>
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
            <Button type="button" variant="ghost" onClick={() => setIsCancelModalOpen(false)}>Abort</Button>
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
            if (!isCadenceValid || !isAllocationValid) {
              showToast({
                title: 'Validation Error',
                message: `Renewal requires ${cadenceSlotCount} cadence dates and a matching Dry, Jet, and Pumpdown allocation.`,
                type: 'warning',
              });
              return;
            }
            setIsSubmitting(true);
            try {
              const res = await apiClient.post<AmcSingleApiResponse>(`/amc-contracts/${detailContract.id}/renew`, {
                customerId: detailContract.customerId,
                startDate: formStartDate,
                endDate: formEndDate,
                frequency: formFrequency,
                totalAmount: Number(formTotalAmount),
                totalVisits: Number(formTotalVisits),
                dryServiceVisits: Number(formDryVisits),
                jetServiceVisits: Number(formJetVisits),
                pumpdownServiceVisits: Number(formPumpdownVisits),
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
              <Input
                type="number"
                min="1"
                value={formTotalVisits}
                onChange={(e) => setFormTotalVisits(Number(e.target.value))}
                required
              />
              {cadenceSlotCount > 0 && cadenceSlotCount !== Number(formTotalVisits) && (
                <span style={{ fontSize: '10px', color: 'var(--color-warning-600, #d97706)', marginTop: '2px', display: 'block' }}>
                  Notice: Term cadence anticipates {cadenceSlotCount} {formFrequency.toLowerCase()} slots
                </span>
              )}
            </div>
            <div className="col-span-2">
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Commercial Amount (INR)</label>
              <Input type="number" min="0" value={formTotalAmount} onChange={(e) => setFormTotalAmount(Number(e.target.value))} required />
            </div>

            {/* PREVENTIVE MAINTENANCE VISIT BREAKDOWN ALLOCATION */}
            <div
              className="col-span-2"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                  Preventive Maintenance Service Allocation *
                </label>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: isAllocationValid ? 'var(--color-success-600, #16a34a)' : 'var(--color-danger-600, #dc2626)',
                  }}
                >
                  {allocatedVisits} / {formTotalVisits} Allocated
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', margin: '0 0 var(--space-3) 0' }}>
                Allocate the renewed PM visits across Dry, Jet and Pumpdown services. Inherited from previous contract by default.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
                <div>
                  <label htmlFor="renew-dry-visits" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>
                    Dry Service Visits
                  </label>
                  <select
                    id="renew-dry-visits"
                    className="input-base"
                    style={{ width: '100%', marginTop: '4px' }}
                    value={formDryVisits}
                    onChange={(e) => setFormDryVisits(Number(e.target.value))}
                  >
                    {Array.from({ length: Math.max(0, formTotalVisits) + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        {i} {i === 1 ? 'visit' : 'visits'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="renew-jet-visits" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>
                    Jet Service Visits
                  </label>
                  <select
                    id="renew-jet-visits"
                    className="input-base"
                    style={{ width: '100%', marginTop: '4px' }}
                    value={formJetVisits}
                    onChange={(e) => setFormJetVisits(Number(e.target.value))}
                  >
                    {Array.from({ length: Math.max(0, formTotalVisits) + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        {i} {i === 1 ? 'visit' : 'visits'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="renew-pumpdown-visits" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>
                    Pumpdown Service Visits
                  </label>
                  <select
                    id="renew-pumpdown-visits"
                    className="input-base"
                    style={{ width: '100%', marginTop: '4px' }}
                    value={formPumpdownVisits}
                    onChange={(e) => setFormPumpdownVisits(Number(e.target.value))}
                  >
                    {Array.from({ length: Math.max(0, formTotalVisits) + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        {i} {i === 1 ? 'visit' : 'visits'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!isAllocationValid && (
                <p style={{ fontSize: '11px', color: 'var(--color-danger-600, #dc2626)', marginTop: 'var(--space-2)', fontWeight: 500 }}>
                  Allocation sum ({allocatedVisits}) must equal total included visits ({formTotalVisits}).
                </p>
              )}
              {formStartDate && formEndDate && !isCadenceValid && (
                <p style={{ fontSize: '11px', color: 'var(--color-danger-600, #dc2626)', marginTop: 'var(--space-2)', fontWeight: 500 }}>
                  The renewal term has {cadenceSlotCount} cadence dates; included visits must match.
                </p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="ghost" onClick={() => setIsRenewModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmitting || !isAllocationValid || !isCadenceValid}>Confirm Renewal</Button>
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
            <Button type="button" variant="ghost" onClick={() => setIsAddAssetsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmitting || formCoveredAssetIds.length === 0}>
              Attach Selected ({formCoveredAssetIds.length})
            </Button>
          </div>
        </form>
      </Modal>

      {/* PRINTABLE AMC QUOTATION & PROPOSAL MODAL */}
      {detailContract && (
        <AmcQuotationPrintModal
          isOpen={isPrintQuotationModalOpen}
          onClose={() => setIsPrintQuotationModalOpen(false)}
          contract={{
            id: detailContract.id,
            contractNumber: detailContract.contractNumber,
            customerName: detailContract.customerName,
            customerCode: detailContract.customerCode,
            customerPhone: detailContract.customerPhone,
            customerEmail: detailContract.customerEmail,
            customerAddress: detailContract.customerAddress,
            planName: detailContract.planName,
            startDate: detailContract.startDate,
            endDate: detailContract.endDate,
            frequency: detailContract.frequency,
            totalVisits: detailContract.totalVisits,
            dryServiceVisits: detailContract.dryServiceVisits,
            jetServiceVisits: detailContract.jetServiceVisits,
            pumpdownServiceVisits: detailContract.pumpdownServiceVisits,
            totalAmount: detailContract.totalAmount,
            paymentBalanceDue: detailContract.paymentBalanceDue,
            status: detailContract.status,
            notes: detailContract.notes,
            coveredAssets: detailContract.coveredAssets?.map((a: any) => ({
              assetTag: a.assetTag,
              brand: a.brand,
              modelNumber: a.modelNumber,
              serialNumber: a.serialNumber,
              capacityTonnage: a.capacityTonnage,
              locationRoom: a.locationRoom,
            })),
          }}
          onEmailSent={fetchContracts}
        />
      )}

      {/* 11. SEND QUOTATION MODAL */}
      <Modal
        isOpen={isSendQuotationModalOpen}
        onClose={() => setIsSendQuotationModalOpen(false)}
        title="Send AMC Contract Quotation"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendQuotation();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="quotation-email" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              Client Recipient Email *
            </label>
            <Input
              id="quotation-email"
              type="email"
              placeholder="e.g. client@example.com"
              value={quotationRecipientEmail}
              onChange={(e) => setQuotationRecipientEmail(e.target.value)}
              required
            />
          </div>

          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg-surface-subtle, #f8fafc)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default, #cbd5e1)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, color: '#0284c7', marginBottom: '4px' }}>
              Quotation Summary: {detailContract?.contractNumber}
            </div>
            <div><strong>Total Quotation Amount:</strong> &#8377;{Number(detailContract?.totalAmount || 0).toLocaleString('en-IN')}</div>
            <div><strong>Term:</strong> {detailContract?.startDate} to {detailContract?.endDate} ({detailContract?.totalVisits} visits)</div>
            <div><strong>Covered Equipment:</strong> {detailContract?.coveredAssets?.length || 0} AC unit(s)</div>
            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
              Includes company bank transfer details (A/C: {COMPANY_BANK_DETAILS.accountNumber}, IFSC: {COMPANY_BANK_DETAILS.ifscCode}) and an instant UPI payment link.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="ghost" onClick={() => setIsSendQuotationModalOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isSendingQuotation || !quotationRecipientEmail.trim()}
            >
              <Send style={{ width: '14px', height: '14px' }} />
              {isSendingQuotation ? 'Sending Quotation...' : 'Dispatch Quotation Email'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 12. RECORD PAYMENT CLEARANCE MODAL */}
      <Modal
        isOpen={isClearPaymentModalOpen}
        onClose={() => setIsClearPaymentModalOpen(false)}
        title="Record AMC Payment Clearance"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleClearPayment();
          }}
          className="space-y-4"
        >
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg-surface-subtle, #f8fafc)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default, #cbd5e1)',
              fontSize: '12px',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Contract: {detailContract?.contractNumber}
            </div>
            <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
              Quotation Due: &#8377;{Number(detailContract?.totalAmount || 0).toLocaleString('en-IN')} &bull; Balance Remaining: <strong>&#8377;{Number(detailContract?.paymentBalanceDue ?? detailContract?.totalAmount).toLocaleString('en-IN')}</strong>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="clear-pay-method" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Payment Method *
              </label>
              <select
                id="clear-pay-method"
                className="input-base"
                value={clearPaymentMethod}
                onChange={(e) => setClearPaymentMethod(e.target.value as 'ONLINE' | 'CASH' | 'CHEQUE')}
                style={{ width: '100%', height: '38px', borderRadius: 'var(--radius-md)' }}
              >
                <option value="ONLINE">Online (UPI / NEFT / IMPS)</option>
                <option value="CASH">Cash Payment</option>
                <option value="CHEQUE">Bank Cheque</option>
              </select>
            </div>

            <div>
              <label htmlFor="clear-pay-amount" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Cleared Amount (INR) *
              </label>
              <Input
                id="clear-pay-amount"
                type="number"
                min="1"
                step="0.01"
                value={clearPaymentAmount}
                onChange={(e) => setClearPaymentAmount(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="clear-pay-ref" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              {clearPaymentMethod === 'ONLINE' ? 'UPI UTR / Bank Reference No.' : clearPaymentMethod === 'CHEQUE' ? 'Cheque Number' : 'Cash Receipt Reference'}
            </label>
            <Input
              id="clear-pay-ref"
              placeholder={clearPaymentMethod === 'ONLINE' ? 'e.g. UPI-9876543210 / UTR' : clearPaymentMethod === 'CHEQUE' ? 'e.g. CHQ-100293' : 'e.g. Cash Receipt #'}
              value={clearPaymentRef}
              onChange={(e) => setClearPaymentRef(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="clear-pay-notes" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              Settlement Notes
            </label>
            <Textarea
              id="clear-pay-notes"
              rows={2}
              placeholder="e.g. Received full annual advance via ICICI UPI..."
              value={clearPaymentNotes}
              onChange={(e) => setClearPaymentNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="ghost" onClick={() => setIsClearPaymentModalOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isClearingPayment || clearPaymentAmount <= 0}
            >
              <CheckCircle style={{ width: '14px', height: '14px' }} />
              {isClearingPayment ? 'Processing Clearance...' : 'Confirm Payment Clearance'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
