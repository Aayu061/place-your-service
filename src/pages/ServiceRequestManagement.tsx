import React, { useState, useEffect, useCallback } from 'react';
import {
  Wrench,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Edit2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Building2,
  Layers,
  History,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { apiClient, ApiError } from '@/services/api/client';
import {
  ServiceRequest,
  ServiceType,
  ServicePriority,
  ServiceStatus,
  Customer,
  CustomerSite,
  AcAsset,
} from '@/domain/types';
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

interface ServiceRequestsApiResponse {
  requests: ServiceRequest[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

interface ServiceRequestApiResponse {
  request: ServiceRequest;
}

interface CustomersListResponse {
  customers: Customer[];
}

interface SitesListResponse {
  sites: CustomerSite[];
}

interface AssetsListResponse {
  assets: AcAsset[];
}

interface ServiceRequestManagementProps {
  onNavigate?: (item: string) => void;
  initialCustomerId?: string;
  initialSiteId?: string;
  initialAssetId?: string;
}

export const ServiceRequestManagement: React.FC<ServiceRequestManagementProps> = ({
  initialCustomerId,
  initialSiteId,
  initialAssetId,
}) => {
  const { showToast } = useToast();

  const toast = useCallback((title: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    showToast({ title, type });
  }, [showToast]);

  // Directory state
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ServiceStatus>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | ServicePriority>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ServiceType>('ALL');
  const [page, setPage] = useState<number>(1);
  const [paginationMeta, setPaginationMeta] = useState({
    total: 0,
    page: 1,
    pageSize: 15,
    totalPages: 1,
  });

  // Selected Detail Drawer state
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState<ServiceRequest | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);

  // Create Request Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createCustomerList, setCreateCustomerList] = useState<Customer[]>([]);
  const [createSiteList, setCreateSiteList] = useState<CustomerSite[]>([]);
  const [createAssetList, setCreateAssetList] = useState<AcAsset[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState<boolean>(false);
  const [isLoadingSites, setIsLoadingSites] = useState<boolean>(false);
  const [isLoadingAssets, setIsLoadingAssets] = useState<boolean>(false);

  const [createFormData, setCreateFormData] = useState({
    customerId: initialCustomerId || '',
    siteId: initialSiteId || '',
    assetId: initialAssetId || '',
    requestType: 'BREAKDOWN' as ServiceType,
    priority: 'MEDIUM' as ServicePriority,
    description: '',
    preferredDate: '',
    notes: '',
  });
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  // Status Transition Modal state
  const [isTransitionModalOpen, setIsTransitionModalOpen] = useState<boolean>(false);
  const [targetStatus, setTargetStatus] = useState<ServiceStatus>('PENDING');
  const [transitionReason, setTransitionReason] = useState<string>('');
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  // Cancel Confirmation Modal state
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Edit Request Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editFormData, setEditFormData] = useState({
    requestType: 'BREAKDOWN' as ServiceType,
    priority: 'MEDIUM' as ServicePriority,
    description: '',
    preferredDate: '',
    notes: '',
  });
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Load requests from backend
  const fetchRequests = useCallback(async () => {
    try {
      setListError(null);
      const params: Record<string, string | number | undefined> = {
        page,
        pageSize: paginationMeta.pageSize,
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (priorityFilter !== 'ALL') params.priority = priorityFilter;
      if (typeFilter !== 'ALL') params.requestType = typeFilter;

      const res = await apiClient.get<ServiceRequestsApiResponse>('/service-requests', { params });
      setRequests(res.requests || []);
      setPaginationMeta({
        total: res.total || 0,
        page: res.page || 1,
        pageSize: res.pageSize || 15,
        totalPages: res.totalPages || 1,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof ApiError ? err.message : 'Failed to fetch service requests';
      setListError(errorMsg);
      toast(errorMsg, 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [page, paginationMeta.pageSize, debouncedSearch, statusFilter, priorityFilter, typeFilter, toast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Load single request detail when drawer opens
  const fetchRequestDetail = useCallback(async (id: string) => {
    try {
      setIsDetailLoading(true);
      const res = await apiClient.get<ServiceRequestApiResponse>(`/service-requests/${id}`);
      setDetailRequest(res.request);
    } catch (err: unknown) {
      const errorMsg = err instanceof ApiError ? err.message : 'Failed to load request details';
      toast(errorMsg, 'error');
    } finally {
      setIsDetailLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedRequestId) {
      fetchRequestDetail(selectedRequestId);
    } else {
      setDetailRequest(null);
    }
  }, [selectedRequestId, fetchRequestDetail]);

  // Load customers for create modal
  const loadCustomersForCreate = async () => {
    try {
      setIsLoadingCustomers(true);
      const res = await apiClient.get<CustomersListResponse>('/customers', {
        params: { pageSize: 100, status: 'ACTIVE' },
      });
      setCreateCustomerList(res.customers || []);
    } catch {
      toast('Could not load customers', 'error');
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  // Load sites when customer selected
  const loadSitesForCustomer = async (customerId: string) => {
    if (!customerId) {
      setCreateSiteList([]);
      return;
    }
    try {
      setIsLoadingSites(true);
      const res = await apiClient.get<SitesListResponse>(`/customers/${customerId}/sites`);
      setCreateSiteList(res.sites || []);
    } catch {
      toast('Could not load sites for selected customer', 'error');
    } finally {
      setIsLoadingSites(false);
    }
  };

  // Load assets when site selected
  const loadAssetsForSite = async (siteId: string) => {
    if (!siteId) {
      setCreateAssetList([]);
      return;
    }
    try {
      setIsLoadingAssets(true);
      const res = await apiClient.get<AssetsListResponse>(`/sites/${siteId}/assets`);
      setCreateAssetList(res.assets || []);
    } catch {
      toast('Could not load AC assets for selected site', 'error');
    } finally {
      setIsLoadingAssets(false);
    }
  };

  // Handle open create modal
  const handleOpenCreateModal = () => {
    loadCustomersForCreate();
    setCreateFormData({
      customerId: initialCustomerId || '',
      siteId: initialSiteId || '',
      assetId: initialAssetId || '',
      requestType: 'BREAKDOWN',
      priority: 'MEDIUM',
      description: '',
      preferredDate: '',
      notes: '',
    });
    setCreateErrors({});
    setIsCreateModalOpen(true);

    if (initialCustomerId) {
      loadSitesForCustomer(initialCustomerId);
    }
    if (initialSiteId) {
      loadAssetsForSite(initialSiteId);
    }
  };

  // Cascading Customer change
  const handleCustomerChange = (customerId: string) => {
    setCreateFormData((prev) => ({
      ...prev,
      customerId,
      siteId: '',
      assetId: '',
    }));
    setCreateSiteList([]);
    setCreateAssetList([]);
    if (customerId) {
      loadSitesForCustomer(customerId);
    }
  };

  // Cascading Site change
  const handleSiteChange = (siteId: string) => {
    setCreateFormData((prev) => ({
      ...prev,
      siteId,
      assetId: '',
    }));
    setCreateAssetList([]);
    if (siteId) {
      loadAssetsForSite(siteId);
    }
  };

  // Validate create form
  const validateCreateForm = () => {
    const errors: Record<string, string> = {};
    if (!createFormData.customerId) errors.customerId = 'Customer is required';
    if (!createFormData.siteId) errors.siteId = 'Site is required';
    if (!createFormData.description || createFormData.description.trim().length < 5) {
      errors.description = 'Problem description must be at least 5 characters long';
    }
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Create Request
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCreateForm()) return;

    try {
      setCreateSubmitting(true);
      const payload = {
        customerId: createFormData.customerId,
        siteId: createFormData.siteId,
        assetId: createFormData.assetId || null,
        requestType: createFormData.requestType,
        priority: createFormData.priority,
        description: createFormData.description.trim(),
        preferredDate: createFormData.preferredDate || null,
        notes: createFormData.notes.trim() || null,
      };

      const res = await apiClient.post<ServiceRequestApiResponse>('/service-requests', payload);
      toast(`Service Request ${res.request.requestNumber} created successfully`, 'success');
      setIsCreateModalOpen(false);
      fetchRequests();
      // Open detail drawer for newly created request
      setSelectedRequestId(res.request.id);
    } catch (err: unknown) {
      const errorMsg = err instanceof ApiError ? err.message : 'Failed to create service request';
      toast(errorMsg, 'error');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Submit Status Transition
  const handleTransitionSubmit = async () => {
    if (!detailRequest) return;
    try {
      setIsTransitioning(true);
      const res = await apiClient.post<ServiceRequestApiResponse>(
        `/service-requests/${detailRequest.id}/status`,
        {
          status: targetStatus,
          reason: transitionReason.trim() || undefined,
        }
      );
      toast(`Request transitioned to ${targetStatus}`, 'success');
      setDetailRequest(res.request);
      setIsTransitionModalOpen(false);
      setTransitionReason('');
      fetchRequests();
    } catch (err: unknown) {
      const errorMsg = err instanceof ApiError ? err.message : 'Status transition failed';
      toast(errorMsg, 'error');
    } finally {
      setIsTransitioning(false);
    }
  };

  // Submit Cancellation
  const handleCancelSubmit = async () => {
    if (!detailRequest) return;
    try {
      setIsCancelling(true);
      const res = await apiClient.post<ServiceRequestApiResponse>(
        `/service-requests/${detailRequest.id}/cancel`,
        {
          reason: cancellationReason.trim() || 'Cancelled by staff user',
        }
      );
      toast('Service Request marked as cancelled', 'success');
      setDetailRequest(res.request);
      setIsCancelModalOpen(false);
      setCancellationReason('');
      fetchRequests();
    } catch (err: unknown) {
      const errorMsg = err instanceof ApiError ? err.message : 'Failed to cancel request';
      toast(errorMsg, 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = () => {
    if (!detailRequest) return;
    setEditFormData({
      requestType: detailRequest.requestType,
      priority: detailRequest.priority,
      description: detailRequest.description,
      preferredDate: detailRequest.preferredDate || '',
      notes: detailRequest.notes || '',
    });
    setIsEditModalOpen(true);
  };

  // Submit Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailRequest) return;
    if (editFormData.description.trim().length < 5) {
      toast('Description must be at least 5 characters long', 'error');
      return;
    }

    try {
      setIsUpdating(true);
      const res = await apiClient.patch<ServiceRequestApiResponse>(
        `/service-requests/${detailRequest.id}`,
        {
          requestType: editFormData.requestType,
          priority: editFormData.priority,
          description: editFormData.description.trim(),
          preferredDate: editFormData.preferredDate || null,
          notes: editFormData.notes.trim() || null,
        }
      );
      toast('Service Request updated successfully', 'success');
      setDetailRequest(res.request);
      setIsEditModalOpen(false);
      fetchRequests();
    } catch (err: unknown) {
      const errorMsg = err instanceof ApiError ? err.message : 'Failed to update service request';
      toast(errorMsg, 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const getPriorityBadgeClass = (priority: ServicePriority) => {
    switch (priority) {
      case 'EMERGENCY':
      case 'URGENT':
        return 'badge-error';
      case 'HIGH':
        return 'badge-warning';
      case 'MEDIUM':
        return 'badge-info';
      case 'LOW':
      default:
        return 'badge-neutral';
    }
  };

  return (
    <div className="module-container" style={{ padding: 'var(--space-6)', maxWidth: '1440px', margin: '0 auto' }}>
      {/* 1. Header Area */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                color: 'var(--color-brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Wrench size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 0, color: 'var(--text-strong)' }}>
                Service Requests
              </h1>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                Track customer service requirements and operational requests.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Button
            variant="outline"
            size="md"
            leftIcon={<RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />}
            onClick={() => {
              setIsRefreshing(true);
              fetchRequests();
            }}
            disabled={isRefreshing}
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="md"
            leftIcon={<Plus size={16} />}
            onClick={handleOpenCreateModal}
            id="btn-new-service-request"
          >
            New Service Request
          </Button>
        </div>
      </div>

      {/* 2. Filters & Search Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)',
          backgroundColor: 'var(--bg-surface)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          alignItems: 'center',
        }}
      >
        <div style={{ flex: '1 1 260px' }}>
          <Input
            placeholder="Search by code, customer, site, asset, or symptom..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search size={16} />}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'ALL' | ServiceStatus);
              setPage(1);
            }}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-default)',
              fontSize: 'var(--text-sm)',
            }}
            aria-label="Filter by Status"
          >
            <option value="ALL">All Statuses</option>
            <option value="REQUESTED">Requested</option>
            <option value="PENDING">Pending</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="ON_HOLD">On Hold</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value as 'ALL' | ServicePriority);
              setPage(1);
            }}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-default)',
              fontSize: 'var(--text-sm)',
            }}
            aria-label="Filter by Priority"
          >
            <option value="ALL">All Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
            <option value="EMERGENCY">Emergency</option>
          </select>

          {/* Request Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as 'ALL' | ServiceType);
              setPage(1);
            }}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-default)',
              fontSize: 'var(--text-sm)',
            }}
            aria-label="Filter by Request Type"
          >
            <option value="ALL">All Types</option>
            <option value="BREAKDOWN">Breakdown</option>
            <option value="GENERAL_SERVICE">General Service</option>
            <option value="INSTALLATION">Installation</option>
            <option value="INSPECTION">Inspection</option>
            <option value="REPAIR">Repair</option>
            <option value="PREVENTIVE_MAINTENANCE">Preventive Maintenance</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      {/* 3. Main Requests Table / List State */}
      {isLoading ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-12)',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
          }}
          role="status"
        >
          <span
            className="animate-spin"
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid var(--color-brand)',
              borderRightColor: 'transparent',
              borderRadius: '50%',
              marginBottom: 'var(--space-3)',
            }}
          />
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Loading service requests...
          </span>
        </div>
      ) : listError ? (
        <div
          style={{
            padding: 'var(--space-8)',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid var(--color-error)',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
          }}
        >
          <AlertCircle size={32} color="var(--color-error)" style={{ margin: '0 auto var(--space-2)' }} />
          <h3 style={{ fontSize: 'var(--text-base)', color: 'var(--color-error)', margin: 0 }}>
            Unable to load service requests
          </h3>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 'var(--space-2) 0 var(--space-4)' }}>
            {listError}
          </p>
          <Button variant="outline" size="sm" onClick={fetchRequests}>
            Try Again
          </Button>
        </div>
      ) : requests.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
            padding: 'var(--space-8)',
          }}
        >
          {debouncedSearch || statusFilter !== 'ALL' || priorityFilter !== 'ALL' || typeFilter !== 'ALL' ? (
            <EmptyState
              title="No requests match your filters"
              description="Try adjusting your search criteria or resetting filters to see available requests."
              actionLabel="Reset Filters"
              onAction={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
                setPriorityFilter('ALL');
                setTypeFilter('ALL');
              }}
            />
          ) : (
            <EmptyState
              icon={<Wrench size={40} />}
              title="No service requests yet"
              description="Register your first customer service request to begin operational tracking."
              actionLabel="Create Service Request"
              onAction={handleOpenCreateModal}
            />
          )}
        </div>
      ) : (
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--bg-canvas)',
                    borderBottom: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Request ID</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Customer</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Site</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Scope / Asset</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Type</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Priority</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Status</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Created</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background-color 0.15s ease',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedRequestId(req.id)}
                    className="table-row-hover"
                  >
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--color-brand)' }}>
                      {req.requestNumber}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>
                        {req.customerName || 'Customer'}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {req.customerCode || req.customerPhone || ''}
                      </div>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-default)' }}>
                      {req.siteName || 'Site'}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      {req.assetId ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                          <Badge variant="brand">
                            AC ASSET
                          </Badge>
                          <span style={{ fontWeight: 500, color: 'var(--text-strong)' }}>
                            {req.assetTag || 'Asset'}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="neutral">
                          SITE LEVEL
                        </Badge>
                      )}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-default)' }}>
                      {req.requestType.replace(/_/g, ' ')}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <span className={`badge ${getPriorityBadgeClass(req.priority)}`}>
                        {req.priority}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <StatusBadge status={req.status} />
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                      {formatDate(req.createdAt)}
                    </td>
                    <td
                      style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Eye size={16} />}
                        onClick={() => setSelectedRequestId(req.id)}
                        aria-label={`View ${req.requestNumber}`}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4. Pagination Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 'var(--space-3) var(--space-4)',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              flexWrap: 'wrap',
              gap: 'var(--space-2)',
            }}
          >
            <div>
              Showing {requests.length} of {paginationMeta.total} requests (Page {paginationMeta.page} of {paginationMeta.totalPages})
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<ChevronLeft size={16} />}
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<ChevronRight size={16} />}
                disabled={page >= paginationMeta.totalPages}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Create Service Request Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => !createSubmitting && setIsCreateModalOpen(false)}
        title="Create Service Request"
        maxWidth="680px"
      >
        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Cascading Selectors */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            {/* Customer Select */}
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                Customer <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <select
                value={createFormData.customerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                disabled={createSubmitting || isLoadingCustomers}
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: createErrors.customerId ? '1px solid var(--color-error)' : '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: 'var(--text-sm)',
                }}
                id="select-customer"
              >
                <option value="">-- Select Customer --</option>
                {createCustomerList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.customerCode})
                  </option>
                ))}
              </select>
              {createErrors.customerId && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', marginTop: '2px', display: 'block' }}>
                  {createErrors.customerId}
                </span>
              )}
            </div>

            {/* Site Select */}
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                Site / Location <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <select
                value={createFormData.siteId}
                onChange={(e) => handleSiteChange(e.target.value)}
                disabled={createSubmitting || !createFormData.customerId || isLoadingSites}
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: createErrors.siteId ? '1px solid var(--color-error)' : '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: 'var(--text-sm)',
                }}
                id="select-site"
              >
                <option value="">
                  {!createFormData.customerId
                    ? '-- Select customer first --'
                    : createSiteList.length === 0
                    ? '-- No sites found --'
                    : '-- Select Site --'}
                </option>
                {createSiteList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.siteName} {s.isPrimary ? '(Primary)' : ''}
                  </option>
                ))}
              </select>
              {createErrors.siteId && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', marginTop: '2px', display: 'block' }}>
                  {createErrors.siteId}
                </span>
              )}
            </div>
          </div>

          {/* AC Asset Select (Optional) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                AC Asset (Optional)
              </label>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Scope: {createFormData.assetId ? 'AC ASSET' : 'SITE LEVEL'}
              </span>
            </div>

            <select
              value={createFormData.assetId}
              onChange={(e) => setCreateFormData((prev) => ({ ...prev, assetId: e.target.value }))}
              disabled={createSubmitting || !createFormData.siteId || isLoadingAssets}
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
                fontSize: 'var(--text-sm)',
              }}
              id="select-asset"
            >
              <option value="">
                {!createFormData.siteId
                  ? '-- Select site first --'
                  : createAssetList.length === 0
                  ? '-- No AC assets registered at this site --'
                  : '-- Entire Site (No specific asset) --'}
              </option>
              {createAssetList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.assetTag} - {a.brand} {a.modelNumber ? `(${a.modelNumber})` : ''}
                </option>
              ))}
            </select>
            {createFormData.siteId && createAssetList.length === 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                No AC assets registered at this site. Service request will be registered at Site Scope.
              </span>
            )}
          </div>

          {/* Request Type & Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                Request Type <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <select
                value={createFormData.requestType}
                onChange={(e) => setCreateFormData((prev) => ({ ...prev, requestType: e.target.value as ServiceType }))}
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: 'var(--text-sm)',
                }}
                id="select-request-type"
              >
                <option value="BREAKDOWN">Breakdown</option>
                <option value="GENERAL_SERVICE">General Service</option>
                <option value="INSTALLATION">Installation</option>
                <option value="INSPECTION">Inspection</option>
                <option value="REPAIR">Repair</option>
                <option value="PREVENTIVE_MAINTENANCE">Preventive Maintenance</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                Priority <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <select
                value={createFormData.priority}
                onChange={(e) => setCreateFormData((prev) => ({ ...prev, priority: e.target.value as ServicePriority }))}
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: 'var(--text-sm)',
                }}
                id="select-priority"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </div>
          </div>

          {/* Preferred Date */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Preferred Date (Optional)
            </label>
            <Input
              type="date"
              value={createFormData.preferredDate}
              onChange={(e) => setCreateFormData((prev) => ({ ...prev, preferredDate: e.target.value }))}
            />
          </div>

          {/* Problem Description */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Problem Description <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <Textarea
              placeholder="Describe the issue, symptom, affected area, and urgency..."
              rows={3}
              value={createFormData.description}
              onChange={(e) => setCreateFormData((prev) => ({ ...prev, description: e.target.value }))}
              id="input-problem-description"
            />
            {createErrors.description && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', marginTop: '2px', display: 'block' }}>
                {createErrors.description}
              </span>
            )}
          </div>

          {/* Operational Notes */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Operational Notes (Optional)
            </label>
            <Textarea
              placeholder="Any access instructions, gate pass requirements, or special observations..."
              rows={2}
              value={createFormData.notes}
              onChange={(e) => setCreateFormData((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={createSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={createSubmitting || !createFormData.customerId || !createFormData.siteId || createFormData.description.trim().length < 5}
              id="btn-submit-service-request"
            >
              {createSubmitting ? 'Creating...' : 'Create Service Request'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 6. Service Request Detail Drawer */}
      <Drawer
        isOpen={Boolean(selectedRequestId)}
        onClose={() => setSelectedRequestId(null)}
        title={detailRequest ? detailRequest.requestNumber : 'Service Request Details'}
        width="640px"
      >
        {isDetailLoading || !detailRequest ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-12)',
            }}
          >
            <span
              className="animate-spin"
              style={{
                width: '32px',
                height: '32px',
                border: '3px solid var(--color-brand)',
                borderRightColor: 'transparent',
                borderRadius: '50%',
                marginBottom: 'var(--space-3)',
              }}
            />
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Loading request details...
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* Header Status Card */}
            <div
              style={{
                backgroundColor: 'var(--bg-canvas)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Current Status
                </div>
                <div style={{ marginTop: 'var(--space-1)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <StatusBadge status={detailRequest.status} />
                  <span className={`badge ${getPriorityBadgeClass(detailRequest.priority)}`}>
                    {detailRequest.priority} PRIORITY
                  </span>
                </div>
              </div>

              {/* Action Buttons based on state */}
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {detailRequest.status !== 'CANCELLED' && detailRequest.status !== 'CLOSED' && (
                  <>
                    <Button variant="outline" size="sm" leftIcon={<Edit2 size={14} />} onClick={handleOpenEditModal}>
                      Edit
                    </Button>

                    {detailRequest.status === 'REQUESTED' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setTargetStatus('PENDING');
                          setIsTransitionModalOpen(true);
                        }}
                      >
                        Move to Pending
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      style={{ color: 'var(--color-error)' }}
                      leftIcon={<XCircle size={14} />}
                      onClick={() => setIsCancelModalOpen(true)}
                    >
                      Cancel Request
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Customer & Location Details */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--space-4)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Building2 size={14} /> CUSTOMER
                </div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginTop: 'var(--space-1)', color: 'var(--text-strong)' }}>
                  {detailRequest.customerName || 'Customer'}
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  {detailRequest.customerCode ? `Code: ${detailRequest.customerCode}` : ''}
                </div>
                {detailRequest.customerPhone && (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                    Phone: {detailRequest.customerPhone}
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Building2 size={14} /> SITE / LOCATION
                </div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginTop: 'var(--space-1)', color: 'var(--text-strong)' }}>
                  {detailRequest.siteName || 'Site'}
                </div>
                {detailRequest.siteAddress && (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                    {detailRequest.siteAddress}
                  </div>
                )}
              </div>
            </div>

            {/* Scope & Asset Card */}
            <div
              style={{
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: 'var(--space-2)' }}>
                <Layers size={14} /> SERVICE SCOPE
              </div>
              {detailRequest.assetId ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Badge variant="brand" style={{ marginBottom: '4px' }}>
                      AC ASSET SPECIFIC
                    </Badge>
                    <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--text-strong)' }}>
                      {detailRequest.assetTag}
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                      {detailRequest.assetBrand} {detailRequest.assetModel ? `— Model ${detailRequest.assetModel}` : ''}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <Badge variant="neutral" style={{ marginBottom: '4px' }}>
                    SITE WIDE / PREMISES
                  </Badge>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                    This service request applies to the premises at large (not tied to an individual AC unit).
                  </div>
                </div>
              )}
            </div>

            {/* Problem & Description */}
            <div
              style={{
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                PROBLEM DESCRIPTION
              </div>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-strong)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {detailRequest.description}
              </p>

              {detailRequest.notes && (
                <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    OPERATIONAL NOTES
                  </div>
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {detailRequest.notes}
                  </p>
                </div>
              )}

              {detailRequest.status === 'CANCELLED' && detailRequest.cancellationReason && (
                <div
                  style={{
                    marginTop: 'var(--space-4)',
                    padding: 'var(--space-3)',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid var(--color-error)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', fontWeight: 600, marginBottom: '2px' }}>
                    CANCELLATION REASON
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                    {detailRequest.cancellationReason}
                  </div>
                </div>
              )}
            </div>

            {/* Lifecycle Timeline */}
            <div
              style={{
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: 'var(--space-3)' }}>
                <History size={14} /> LIFECYCLE TIMELINE
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {/* Step 1: REQUESTED */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-brand)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                    }}
                  >
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                      REQUESTED
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Created on {formatDate(detailRequest.createdAt)}
                    </div>
                  </div>
                </div>

                {/* Step 2: PENDING / CANCELLED */}
                {detailRequest.status === 'CANCELLED' ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-error)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                      }}
                    >
                      <XCircle size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-error)' }}>
                        CANCELLED
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {detailRequest.cancelledAt ? `Cancelled on ${formatDate(detailRequest.cancelledAt)}` : 'Cancelled'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: detailRequest.status === 'PENDING' ? 'var(--color-warning)' : 'var(--bg-canvas)',
                        border: '2px solid var(--border-subtle)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                      }}
                    >
                      {detailRequest.status === 'PENDING' ? <CheckCircle2 size={16} /> : null}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: detailRequest.status === 'PENDING' ? 'var(--text-strong)' : 'var(--text-muted)' }}>
                        PENDING REVIEW
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {detailRequest.status === 'PENDING' ? 'Under active review by staff' : 'Awaiting review'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Future phases callout */}
                <div
                  style={{
                    marginTop: 'var(--space-2)',
                    padding: 'var(--space-2) var(--space-3)',
                    backgroundColor: 'var(--bg-canvas)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <Info size={14} />
                  <span>Subsequent stages (Scheduling, Technician Assignment, Execution) activate in Phase 7+.</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* 7. Transition Status Modal */}
      <Modal
        isOpen={isTransitionModalOpen}
        onClose={() => !isTransitioning && setIsTransitionModalOpen(false)}
        title="Transition Service Request Status"
        maxWidth="540px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Transition status from <strong>{detailRequest?.status}</strong> to <strong>{targetStatus}</strong>.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Operational Reason (Optional)
            </label>
            <Textarea
              placeholder="Reason for transitioning status..."
              rows={3}
              value={transitionReason}
              onChange={(e) => setTransitionReason(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <Button variant="outline" onClick={() => setIsTransitionModalOpen(false)} disabled={isTransitioning}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleTransitionSubmit} disabled={isTransitioning}>
              {isTransitioning ? 'Updating...' : `Confirm to ${targetStatus}`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 8. Cancel Confirmation Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => !isCancelling && setIsCancelModalOpen(false)}
        title="Cancel Service Request"
        maxWidth="540px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid var(--color-error)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-strong)',
            }}
          >
            <strong>Warning:</strong> The service request will be marked as cancelled. Historical and audit information will remain available, but no further service scheduling will occur.
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Cancellation Reason (Optional)
            </label>
            <Textarea
              placeholder="State reason for cancellation (e.g. duplicate request, customer cancelled, issue self-resolved)..."
              rows={3}
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              id="input-cancellation-reason"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <Button variant="outline" onClick={() => setIsCancelModalOpen(false)} disabled={isCancelling}>
              Keep Request
            </Button>
            <Button
              variant="primary"
              style={{ backgroundColor: 'var(--color-error)', borderColor: 'var(--color-error)' }}
              onClick={handleCancelSubmit}
              disabled={isCancelling}
              id="btn-confirm-cancel"
            >
              {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 9. Edit Request Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => !isUpdating && setIsEditModalOpen(false)}
        title="Edit Service Request"
        maxWidth="680px"
      >
        <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                Request Type
              </label>
              <select
                value={editFormData.requestType}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, requestType: e.target.value as ServiceType }))}
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <option value="BREAKDOWN">Breakdown</option>
                <option value="GENERAL_SERVICE">General Service</option>
                <option value="INSTALLATION">Installation</option>
                <option value="INSPECTION">Inspection</option>
                <option value="REPAIR">Repair</option>
                <option value="PREVENTIVE_MAINTENANCE">Preventive Maintenance</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                Priority
              </label>
              <select
                value={editFormData.priority}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, priority: e.target.value as ServicePriority }))}
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Preferred Date
            </label>
            <Input
              type="date"
              value={editFormData.preferredDate}
              onChange={(e) => setEditFormData((prev) => ({ ...prev, preferredDate: e.target.value }))}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Problem Description *
            </label>
            <Textarea
              rows={3}
              value={editFormData.description}
              onChange={(e) => setEditFormData((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Operational Notes
            </label>
            <Textarea
              rows={2}
              value={editFormData.notes}
              onChange={(e) => setEditFormData((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <Button variant="outline" type="button" onClick={() => setIsEditModalOpen(false)} disabled={isUpdating}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isUpdating || editFormData.description.trim().length < 5}>
              {isUpdating ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
