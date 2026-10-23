import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  UserPlus,
  Search,
  RefreshCw,
  Building2,
  Phone,
  Mail,
  MapPin,
  ArrowRightCircle,
  ArrowLeft,
  Edit2,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Wrench,
  Receipt,
  FileCheck2,
  Plus,
  Star,
  Snowflake,
  Copy,
  Check,
  Hash,
  Cpu,
  ShieldCheck,
  Activity,
  Clock,
} from 'lucide-react';
import { apiClient, ApiError } from '@/services/api/client';
import {
  Customer,
  CustomerType,
  CustomerSite,
  AcAsset,
  AcType,
  WarrantyStatus,
  AcBrand,
  AcModel,
  AcModelVariant,
  AssetAmcHistoryResponse,
  AssetHealthResponse,
} from '@/domain/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal, ModalCloseButton } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useToast } from '@/components/ui/useToast';
import { normalizeTechnology, TECHNOLOGY_OPTIONS } from '@/utils/technology';
import { ModalStepWizard, WizardStepItem } from '@/components/ui/ModalStepWizard';
import {
  calculateDefaultWarrantyEndDate,
  calculateWarrantyStatus,
  validateWarrantyAllocation,
} from '@/utils/warranty';

const FLOOR_OPTIONS = [
  'Basement',
  'Ground Floor',
  '1st Floor',
  '2nd Floor',
  '3rd Floor',
  '4th Floor',
  '5th Floor',
  'Terrace',
  'Other',
];

const getAmcBadgeProps = (amc?: { status: string; contractNumber?: string } | null): { variant: 'brand' | 'warning' | 'neutral' | 'danger'; label: string } => {
  if (!amc || !amc.status) return { variant: 'neutral', label: 'NO AMC' };
  switch (amc.status) {
    case 'ACTIVE':
      return { variant: 'brand', label: 'ACTIVE' };
    case 'EXPIRING_SOON':
      return { variant: 'warning', label: 'EXPIRING SOON' };
    case 'EXPIRED':
      return { variant: 'neutral', label: 'EXPIRED' };
    case 'CANCELLED':
      return { variant: 'danger', label: 'CANCELLED' };
    default:
      return { variant: 'neutral', label: amc.status.replace('_', ' ') };
  }
};

const ROOM_OPTIONS = [
  'Reception',
  'Waiting Area',
  'Manager Cabin',
  'Director Cabin',
  'Admin Office',
  'HR Cabin',
  'Accounts Department',
  'Sales Department',
  'Service Department',
  'IT Room',
  'Server Room',
  'Conference Room',
  'Meeting Room',
  'Training Room',
  'Staff Room',
  'Pantry',
  'Kitchen',
  'Cafeteria',
  'Customer Lounge',
  'Showroom',
  'Warehouse',
  'Store Room',
  'Workshop',
  'Technician Room',
  'Security Room',
  'Lobby',
  'Corridor',
  'Bedroom',
  'Living Room',
  'Dining Room',
  'Guest Room',
  'Other',
];

const AC_TYPE_OPTIONS = [
  'Split AC',
  'Window AC',
  'Cassette AC',
  'Floor Standing AC',
  'Tower AC',
  'Ductable AC',
  'Ceiling Suspended AC',
  'Portable AC',
  'Central AC',
  'Package AC',
  'VRF System',
  'VRV System',
  'AHU / FCU Connected System',
  'Other',
];

const RATING_OPTIONS = [
  '5 Star',
  '4 Star',
  '3 Star',
  '2 Star',
  '1 Star',
  'Not Rated',
  'Unknown',
];

const REFRIGERANT_OPTIONS = [
  'R32',
  'R410A',
  'R22',
  'R290',
  'Other',
  'Unknown',
];

const ASSET_STATUS_OPTIONS = [
  'Active',
  'Under Service',
  'Under Repair',
  'Temporarily Inactive',
  'Decommissioned',
  'Replaced',
  'Scrapped',
];

const ASSET_CONDITION_OPTIONS = [
  'Excellent',
  'Good',
  'Fair',
  'Needs Maintenance',
  'Poor',
  'Critical',
];

function computeLiveWarrantyStatus(startDate?: string, endDate?: string): WarrantyStatus {
  return calculateWarrantyStatus(startDate, endDate);
}

interface CustomersApiResponse {
  customers: Customer[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

interface CustomerApiResponse {
  customer: Customer;
}

interface SitesApiResponse {
  sites: CustomerSite[];
  total?: number;
}

interface SiteApiResponse {
  site: CustomerSite;
}

interface AssetsApiResponse {
  assets: AcAsset[];
  total?: number;
}

interface AssetApiResponse {
  asset: AcAsset;
}

interface CustomerListMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ASSET_WIZARD_STEPS: WizardStepItem[] = [
  { id: 'specs', label: '1. Equipment & Specs', description: 'Brand, Model & Specs' },
  { id: 'serials', label: '2. Serials & Location', description: 'IDU/ODU & Room' },
  { id: 'warranty', label: '3. Warranty & Services', description: 'Dates & PM visits' },
];

export const CustomerManagement: React.FC<{ onNavigate?: (item: string) => void }> = ({ onNavigate }) => {
  const { showToast } = useToast();

  // List states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | CustomerType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState<number>(1);
  const [paginationMeta, setPaginationMeta] = useState<CustomerListMeta>({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });

  // Modals & Drawers
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [convertingCustomer, setConvertingCustomer] = useState<Customer | null>(null);
  const [statusTogglingCustomer, setStatusTogglingCustomer] = useState<Customer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const hasLoadedUrlCustomerRef = useRef(false);

  // Form Fields (used for both Add and Edit)
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<CustomerType>('TEMPORARY');
  const [formCompanyName, setFormCompanyName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAltPhone, setFormAltPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formState, setFormState] = useState('');
  const [formPostalCode, setFormPostalCode] = useState('');
  const [formSiteName, setFormSiteName] = useState('');
  const [formSiteContactPerson, setFormSiteContactPerson] = useState('');
  const [formSiteContactPhone, setFormSiteContactPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // --------------------------------------------------
  // Phase 5: Customer Sites & AC Asset Management State
  // --------------------------------------------------
  const [drawerTab, setDrawerTab] = useState<'overview' | 'sites' | 'assets'>('overview');
  const [sites, setSites] = useState<CustomerSite[]>([]);
  const [isLoadingSites, setIsLoadingSites] = useState<boolean>(false);
  const [sitesError, setSitesError] = useState<string | null>(null);

  const [assets, setAssets] = useState<AcAsset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState<boolean>(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  // Site Modals & Form
  const [isAddSiteModalOpen, setIsAddSiteModalOpen] = useState<boolean>(false);
  const [editingSite, setEditingSite] = useState<CustomerSite | null>(null);
  const [siteFormName, setSiteFormName] = useState('');
  const [siteFormAddress, setSiteFormAddress] = useState('');
  const [siteFormContactPerson, setSiteFormContactPerson] = useState('');
  const [siteFormContactPhone, setSiteFormContactPhone] = useState('');
  const [siteFormContactEmail, setSiteFormContactEmail] = useState('');
  const [siteFormIsPrimary, setSiteFormIsPrimary] = useState(false);
  const [siteFormNotes, setSiteFormNotes] = useState('');
  const [siteFormError, setSiteFormError] = useState<string | null>(null);
  const [isSubmittingSite, setIsSubmittingSite] = useState<boolean>(false);

  // Asset Modals & Form
  const [isAddAssetModalOpen, setIsAddAssetModalOpen] = useState<boolean>(false);
  const [assetWizardStep, setAssetWizardStep] = useState<number>(0);
  const [editingAsset, setEditingAsset] = useState<AcAsset | null>(null);
  const [viewingAsset, setViewingAsset] = useState<AcAsset | null>(null);
  const [copiedSerialKey, setCopiedSerialKey] = useState<string | null>(null);
  const [assetAmcHistory, setAssetAmcHistory] = useState<AssetAmcHistoryResponse | null>(null);
  const [isLoadingAssetAmcHistory, setIsLoadingAssetAmcHistory] = useState(false);
  const [showAssetAmcHistory, setShowAssetAmcHistory] = useState(false);
  const [assetHealth, setAssetHealth] = useState<AssetHealthResponse | null>(null);
  const [isLoadingAssetHealth, setIsLoadingAssetHealth] = useState(false);
  const [showAssetHealthTimeline, setShowAssetHealthTimeline] = useState(false);
  const [assetFormSiteId, setAssetFormSiteId] = useState('');
  const [assetFormTag, setAssetFormTag] = useState('');
  
  // Master data & specs
  const [availableBrands, setAvailableBrands] = useState<AcBrand[]>([]);
  const [availableModels, setAvailableModels] = useState<AcModel[]>([]);
  const [availableVariants, setAvailableVariants] = useState<AcModelVariant[]>([]);
  const [isLoadingMasterBrands, setIsLoadingMasterBrands] = useState(false);
  const [isLoadingMasterModels, setIsLoadingMasterModels] = useState(false);
  const [isLoadingMasterVariants, setIsLoadingMasterVariants] = useState(false);

  const [assetFormBrand, setAssetFormBrand] = useState('');
  const [assetFormBrandId, setAssetFormBrandId] = useState('');
  const [assetFormModel, setAssetFormModel] = useState('');
  const [assetFormModelId, setAssetFormModelId] = useState('');
  const [assetFormVariantId, setAssetFormVariantId] = useState('');
  const [assetFormType, setAssetFormType] = useState<AcType>('Split AC');
  const [assetFormTechnology, setAssetFormTechnology] = useState('');
  const [assetFormCapacity, setAssetFormCapacity] = useState('');
  const [assetFormRating, setAssetFormRating] = useState('');
  const [assetFormRefrigerant, setAssetFormRefrigerant] = useState('');

  // Serial numbers
  const [assetFormSerial, setAssetFormSerial] = useState('');
  const [assetFormIndoorSerial, setAssetFormIndoorSerial] = useState('');
  const [assetFormOutdoorSerial, setAssetFormOutdoorSerial] = useState('');
  const [assetFormHasSingleSerial, setAssetFormHasSingleSerial] = useState(false);

  // Locations
  const [assetFormFloor, setAssetFormFloor] = useState('Ground Floor');
  const [assetFormCustomFloor, setAssetFormCustomFloor] = useState('');
  const [assetFormRoom, setAssetFormRoom] = useState('Reception');
  const [assetFormCustomRoom, setAssetFormCustomRoom] = useState('');

  // Dates & Warranty
  const [assetFormPurchaseDate, setAssetFormPurchaseDate] = useState('');
  const [assetFormInstallDate, setAssetFormInstallDate] = useState('');
  const [assetFormWarrantyStartDate, setAssetFormWarrantyStartDate] = useState('');
  const [assetFormWarrantyEndDate, setAssetFormWarrantyEndDate] = useState('');
  const [assetFormWarranty, setAssetFormWarranty] = useState<WarrantyStatus>('UNDER_WARRANTY');
  const [isWarrantyEndDateOverridden, setIsWarrantyEndDateOverridden] = useState(false);

  // Warranty Service Allocation (numeric counts, whole numbers >= 0)
  const [assetFormTotalWarrantyServices, setAssetFormTotalWarrantyServices] = useState('');
  const [assetFormDryWarrantyVisits, setAssetFormDryWarrantyVisits] = useState('');
  const [assetFormJetWarrantyVisits, setAssetFormJetWarrantyVisits] = useState('');
  const [assetFormPumpdownWarrantyVisits, setAssetFormPumpdownWarrantyVisits] = useState('');

  // Dirty state tracking baseline snapshots
  const addAssetBaselineRef = React.useRef<Record<string, string> | null>(null);
  const editAssetBaselineRef = React.useRef<Record<string, string> | null>(null);

  // Status & Lifecycle
  const [assetFormStatus, setAssetFormStatus] = useState('Active');
  const [assetFormCondition, setAssetFormCondition] = useState('Good');
  const [assetFormNotes, setAssetFormNotes] = useState('');
  const [assetFormError, setAssetFormError] = useState<string | null>(null);
  const [isSubmittingAsset, setIsSubmittingAsset] = useState<boolean>(false);

  // Asset Filters inside drawer
  const [assetSearchTerm, setAssetSearchTerm] = useState('');
  const [assetSiteFilter, setAssetSiteFilter] = useState('ALL');
  const [assetTypeFilter, setAssetTypeFilter] = useState('ALL');
  const [assetWarrantyFilter, setAssetWarrantyFilter] = useState('ALL');

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch Customers from API
  const fetchCustomers = useCallback(async () => {
    setListError(null);
    try {
      const params: Record<string, string | number> = {
        page,
        pageSize: 20,
      };

      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      if (typeFilter !== 'ALL') {
        params.type = typeFilter;
      }
      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }

      const res = await apiClient.request<CustomersApiResponse>('/customers', {
        method: 'GET',
        params,
      });

      if (res && Array.isArray(res.customers)) {
        setCustomers(res.customers);
        if (res.total !== undefined) {
          setPaginationMeta({
            total: res.total,
            page: res.page || page,
            pageSize: res.pageSize || 20,
            totalPages: res.totalPages || 1,
          });
        }
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to retrieve customers from server.';
      setListError(message);
      showToast({ type: 'error', title: 'Network Error', message });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [page, debouncedSearch, typeFilter, statusFilter, showToast]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchCustomers();
  };

  const resetForm = () => {
    setFormName('');
    setFormType('TEMPORARY');
    setFormCompanyName('');
    setFormPhone('');
    setFormAltPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormCity('');
    setFormState('');
    setFormPostalCode('');
    setFormSiteName('');
    setFormSiteContactPerson('');
    setFormSiteContactPhone('');
    setFormNotes('');
    setFormError(null);
  };

  const isAddCustomerDirty = Boolean(
    formName ||
    formPhone ||
    formAltPhone ||
    formEmail ||
    formCompanyName ||
    formAddress ||
    formCity ||
    formSiteName ||
    formNotes
  );

  const openAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormName(customer.name);
    setFormType(customer.customerType);
    setFormCompanyName(customer.companyName || '');
    setFormPhone(customer.phone);
    setFormAltPhone(customer.alternatePhone || '');
    setFormEmail(customer.email || '');
    setFormAddress(customer.address);
    setFormCity(customer.city || '');
    setFormState(customer.state || '');
    setFormPostalCode(customer.postalCode || '');
    setFormSiteName(customer.siteName || '');
    setFormSiteContactPerson(customer.siteContactPerson || '');
    setFormSiteContactPhone(customer.siteContactPhone || '');
    setFormNotes(customer.notes || '');
    setFormError(null);
  };

  // Create Customer
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim() || formName.trim().length < 2) {
      setFormError('Customer name must be at least 2 characters long.');
      return;
    }
    if (!formPhone.trim() || formPhone.trim().length < 7) {
      setFormError('A valid primary phone number is required (min 7 digits).');
      return;
    }
    if (!formAddress.trim() || formAddress.trim().length < 3) {
      setFormError('A street address is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.post<CustomerApiResponse>('/customers', {
        name: formName.trim(),
        customerType: formType,
        companyName: formCompanyName.trim() || undefined,
        phone: formPhone.trim(),
        alternatePhone: formAltPhone.trim() || undefined,
        email: formEmail.trim() || undefined,
        address: formAddress.trim(),
        city: formCity.trim() || undefined,
        state: formState.trim() || undefined,
        postalCode: formPostalCode.trim() || undefined,
        siteName: formSiteName.trim() || undefined,
        siteContactPerson: formSiteContactPerson.trim() || undefined,
        siteContactPhone: formSiteContactPhone.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });

      showToast({
        type: 'success',
        title: 'Customer Created',
        message: `${res.customer.name} (${res.customer.customerCode}) has been registered.`,
      });

      setIsAddModalOpen(false);
      resetForm();
      fetchCustomers();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to register customer.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update Customer
  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setFormError(null);

    if (!formName.trim() || formName.trim().length < 2) {
      setFormError('Customer name must be at least 2 characters long.');
      return;
    }
    if (!formPhone.trim() || formPhone.trim().length < 7) {
      setFormError('A valid primary phone number is required.');
      return;
    }
    if (!formAddress.trim()) {
      setFormError('Address cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.patch<CustomerApiResponse>(`/customers/${editingCustomer.id}`, {
        name: formName.trim(),
        companyName: formCompanyName.trim() || null,
        phone: formPhone.trim(),
        alternatePhone: formAltPhone.trim() || null,
        email: formEmail.trim() || null,
        address: formAddress.trim(),
        city: formCity.trim() || null,
        state: formState.trim() || null,
        postalCode: formPostalCode.trim() || null,
        siteName: formSiteName.trim() || null,
        siteContactPerson: formSiteContactPerson.trim() || null,
        siteContactPhone: formSiteContactPhone.trim() || null,
        notes: formNotes.trim() || null,
      });

      showToast({
        type: 'success',
        title: 'Customer Updated',
        message: `Customer details for ${res.customer.name} have been updated.`,
      });

      setEditingCustomer(null);
      if (selectedCustomer?.id === editingCustomer.id) {
        setSelectedCustomer(res.customer);
      }
      fetchCustomers();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update customer.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Convert to Permanent
  const handleConvertToPermanent = async () => {
    if (!convertingCustomer) return;
    setIsSubmitting(true);

    try {
      const res = await apiClient.post<{ message: string; customer: Customer; alreadyPermanent: boolean }>(
        `/customers/${convertingCustomer.id}/convert-to-permanent`
      );

      showToast({
        type: 'success',
        title: 'Conversion Complete',
        message: `${res.customer.name} is now a PERMANENT customer. ID & historical data preserved.`,
      });

      if (selectedCustomer?.id === convertingCustomer.id) {
        setSelectedCustomer(res.customer);
      }
      setConvertingCustomer(null);
      fetchCustomers();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to convert customer.';
      showToast({ type: 'error', title: 'Conversion Failed', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Status
  const handleToggleStatus = async () => {
    if (!statusTogglingCustomer) return;
    const nextStatus = !statusTogglingCustomer.isActive;
    setIsSubmitting(true);

    try {
      const res = await apiClient.patch<CustomerApiResponse>(
        `/customers/${statusTogglingCustomer.id}/status`,
        { isActive: nextStatus }
      );

      showToast({
        type: 'success',
        title: nextStatus ? 'Customer Activated' : 'Customer Deactivated',
        message: `${res.customer.name} is now ${nextStatus ? 'active' : 'inactive'}.`,
      });

      if (selectedCustomer?.id === statusTogglingCustomer.id) {
        setSelectedCustomer(res.customer);
      }
      setStatusTogglingCustomer(null);
      fetchCustomers();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update customer status.';
      showToast({ type: 'error', title: 'Status Update Failed', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --------------------------------------------------
  // Phase 5: Customer Sites & AC Asset Handlers
  // --------------------------------------------------
  const loadSitesAndAssets = useCallback(async (customerId: string) => {
    setIsLoadingSites(true);
    setSitesError(null);
    try {
      const siteRes = await apiClient.request<SitesApiResponse>(`/customers/${customerId}/sites`, {
        method: 'GET',
      });
      const fetchedSites = siteRes?.sites || [];
      setSites(fetchedSites);

      if (fetchedSites.length > 0) {
        setIsLoadingAssets(true);
        setAssetsError(null);
        try {
          const assetPromises = fetchedSites.map((s) =>
            apiClient
              .request<AssetsApiResponse>(`/sites/${s.id}/assets`, { method: 'GET' })
              .then((r) => r?.assets || [])
              .catch(() => [])
          );
          const allAssetsResults = await Promise.all(assetPromises);
          const combined = allAssetsResults.flat();
          setAssets(combined);
        } catch (aErr) {
          const msg = aErr instanceof ApiError ? aErr.message : 'Failed to load assets';
          setAssetsError(msg);
        } finally {
          setIsLoadingAssets(false);
        }
      } else {
        setAssets([]);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load sites';
      setSitesError(msg);
    } finally {
      setIsLoadingSites(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      loadSitesAndAssets(selectedCustomer.id);
    } else {
      setSites([]);
      setAssets([]);
      setDrawerTab('overview');
    }
  }, [selectedCustomer, loadSitesAndAssets]);

  // Sync selectedCustomer with URL parameter (?customerId=UUID)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (selectedCustomer) {
        if (url.searchParams.get('customerId') !== selectedCustomer.id) {
          url.searchParams.set('customerId', selectedCustomer.id);
          window.history.replaceState({ inAppCustomer: true }, '', url.pathname + url.search + url.hash);
        }
      } else {
        if (url.searchParams.has('customerId') || url.searchParams.has('customer') || url.searchParams.has('id')) {
          url.searchParams.delete('customerId');
          url.searchParams.delete('customer');
          url.searchParams.delete('id');
          window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
        }
      }
    } catch {
      // Safe fallback in restricted environments
    }
  }, [selectedCustomer]);

  // Support direct URL opening or page refresh with ?customerId=UUID or ?customer=UUID
  useEffect(() => {
    if (typeof window === 'undefined' || hasLoadedUrlCustomerRef.current) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const urlCustomerId = params.get('customerId') || params.get('customer') || params.get('id');
      if (!urlCustomerId) return;
      if (selectedCustomer?.id === urlCustomerId) return;

      const match = customers.find((c) => c.id === urlCustomerId);
      if (match) {
        hasLoadedUrlCustomerRef.current = true;
        setSelectedCustomer(match);
      } else if (!isLoading) {
        hasLoadedUrlCustomerRef.current = true;
        apiClient
          .get<CustomerApiResponse>(`/customers/${urlCustomerId}`)
          .then((res) => {
            if (res.customer) {
              setSelectedCustomer(res.customer);
            }
          })
          .catch(() => {
            // Safe fallback if invalid customer ID
          });
      }
    } catch {
      // Safe fallback
    }
  }, [customers, isLoading, selectedCustomer]);

  // Back button handler: navigate to previous valid in-app route or fallback to customers list
  const handleCustomerDetailBack = useCallback(() => {
    hasLoadedUrlCustomerRef.current = true;
    setSelectedCustomer(null);
    setDrawerTab('overview');

    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('customerId') || url.searchParams.has('customer') || url.searchParams.has('id')) {
          url.searchParams.delete('customerId');
          url.searchParams.delete('customer');
          url.searchParams.delete('id');
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
          }
        }
      } catch {
        // Safe fallback
      }
    }

    if (onNavigate) {
      onNavigate('customers');
    }
  }, [onNavigate]);

  // Site Operations
  const openAddSiteModal = (prefillPrimary = false) => {
    setSiteFormName('');
    setSiteFormAddress(selectedCustomer?.address || '');
    setSiteFormContactPerson(selectedCustomer?.name || '');
    setSiteFormContactPhone(selectedCustomer?.phone || '');
    setSiteFormContactEmail(selectedCustomer?.email || '');
    setSiteFormIsPrimary(prefillPrimary || sites.length === 0);
    setSiteFormNotes('');
    setSiteFormError(null);
    setIsAddSiteModalOpen(true);
  };

  const openEditSiteModal = (site: CustomerSite) => {
    setEditingSite(site);
    setSiteFormName(site.siteName);
    setSiteFormAddress(site.address);
    setSiteFormContactPerson(site.contactPerson || '');
    setSiteFormContactPhone(site.contactPhone || '');
    setSiteFormContactEmail(site.contactEmail || '');
    setSiteFormIsPrimary(site.isPrimary);
    setSiteFormNotes(site.notes || '');
    setSiteFormError(null);
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    setIsSubmittingSite(true);
    setSiteFormError(null);

    try {
      await apiClient.post<SiteApiResponse>(`/customers/${selectedCustomer.id}/sites`, {
        siteName: siteFormName.trim(),
        address: siteFormAddress.trim(),
        contactPerson: siteFormContactPerson.trim() || undefined,
        contactPhone: siteFormContactPhone.trim() || undefined,
        contactEmail: siteFormContactEmail.trim() || undefined,
        isPrimary: siteFormIsPrimary,
        notes: siteFormNotes.trim() || undefined,
      });

      showToast({ type: 'success', title: 'Site Created', message: `Site '${siteFormName}' created successfully.` });
      setIsAddSiteModalOpen(false);
      await loadSitesAndAssets(selectedCustomer.id);
      fetchCustomers();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create site';
      setSiteFormError(msg);
      showToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsSubmittingSite(false);
    }
  };

  const handleUpdateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSite || !selectedCustomer) return;
    setIsSubmittingSite(true);
    setSiteFormError(null);

    try {
      await apiClient.patch<SiteApiResponse>(`/sites/${editingSite.id}`, {
        siteName: siteFormName.trim(),
        address: siteFormAddress.trim(),
        contactPerson: siteFormContactPerson.trim() || null,
        contactPhone: siteFormContactPhone.trim() || null,
        contactEmail: siteFormContactEmail.trim() || null,
        isPrimary: siteFormIsPrimary,
        notes: siteFormNotes.trim() || null,
      });

      showToast({ type: 'success', title: 'Site Updated', message: `Site '${siteFormName}' updated successfully.` });
      setEditingSite(null);
      await loadSitesAndAssets(selectedCustomer.id);
      fetchCustomers();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update site';
      setSiteFormError(msg);
      showToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsSubmittingSite(false);
    }
  };

  const handleSetPrimarySite = async (site: CustomerSite) => {
    if (!selectedCustomer) return;
    try {
      await apiClient.post<SiteApiResponse>(`/sites/${site.id}/set-primary`);
      showToast({ type: 'success', title: 'Primary Site Updated', message: `'${site.siteName}' is now the primary site.` });
      await loadSitesAndAssets(selectedCustomer.id);
      fetchCustomers();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to set primary site';
      showToast({ type: 'error', title: 'Error', message: msg });
    }
  };

  const handleToggleSiteStatus = async (site: CustomerSite) => {
    if (!selectedCustomer) return;
    try {
      await apiClient.patch<SiteApiResponse>(`/sites/${site.id}/status`, { isActive: !site.isActive });
      showToast({
        type: 'success',
        title: 'Site Status Changed',
        message: `'${site.siteName}' is now ${!site.isActive ? 'Active' : 'Inactive'}.`,
      });
      await loadSitesAndAssets(selectedCustomer.id);
      fetchCustomers();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to toggle site status';
      showToast({ type: 'error', title: 'Error', message: msg });
    }
  };

  // AC Asset Operations
  const loadAvailableBrands = useCallback(async () => {
    setIsLoadingMasterBrands(true);
    try {
      const res = await apiClient.get<{ data?: { brands: AcBrand[] }; brands?: AcBrand[] }>('/ac-brands?activeOnly=true&pageSize=100');
      const brandList = res.data?.brands || res.brands || [];
      setAvailableBrands(brandList);
    } catch {
      setAvailableBrands([]);
    } finally {
      setIsLoadingMasterBrands(false);
    }
  }, []);

  const handleBrandChange = async (selectedBrandVal: string) => {
    const found = availableBrands.find((b) => b.id === selectedBrandVal || b.name === selectedBrandVal);
    if (found) {
      setAssetFormBrandId(found.id);
      setAssetFormBrand(found.name);
      setAssetFormModelId('');
      setAssetFormModel('');
      setAssetFormVariantId('');
      setAvailableVariants([]);
      setAssetFormType('Split AC');
      setAssetFormTechnology('');
      setAssetFormCapacity('');
      setAssetFormRating('');
      setAssetFormRefrigerant('');

      setIsLoadingMasterModels(true);
      try {
        const res = await apiClient.get<{ data?: { models: AcModel[] }; models?: AcModel[] }>(
          `/ac-models?brandId=${found.id}&activeOnly=true&pageSize=100`
        );
        const modelList = res.data?.models || res.models || [];
        setAvailableModels(modelList);
      } catch {
        setAvailableModels([]);
      } finally {
        setIsLoadingMasterModels(false);
      }
    } else {
      setAssetFormBrandId('');
      setAssetFormBrand(selectedBrandVal);
      setAssetFormModelId('');
      setAssetFormModel('');
      setAssetFormVariantId('');
      setAvailableVariants([]);
      setAssetFormType('Split AC');
      setAssetFormTechnology('');
      setAssetFormCapacity('');
      setAssetFormRating('');
      setAssetFormRefrigerant('');
      setAvailableModels([]);
    }
  };

  const handleModelChange = async (selectedModelVal: string) => {
    const found = availableModels.find((m) => m.id === selectedModelVal || m.modelNumber === selectedModelVal);
    if (found) {
      setAssetFormModelId(found.id);
      setAssetFormModel(found.modelNumber);
      setAssetFormVariantId('');

      // Prefill available default specifications directly from parent model
      setAssetFormType(found.acType ? (found.acType as AcType) : 'Split AC');
      setAssetFormTechnology(found.technology ? normalizeTechnology(found.technology) : '');
      setAssetFormCapacity(found.capacityTons ? String(found.capacityTons) : '');
      setAssetFormRating(found.rating || '');
      setAssetFormRefrigerant(found.refrigerant || '');

      setIsLoadingMasterVariants(true);
      try {
        const res = await apiClient.get<{ data?: { variants?: AcModelVariant[] }; variants?: AcModelVariant[] }>(
          `/ac-models/${found.id}/variants?activeOnly=true`
        );
        const vList = res.data?.variants || res.variants || [];
        setAvailableVariants(vList);
      } catch {
        setAvailableVariants([]);
      } finally {
        setIsLoadingMasterVariants(false);
      }
    } else {
      setAssetFormModelId('');
      setAssetFormModel('');
      setAssetFormVariantId('');
      setAvailableVariants([]);
      setAssetFormTechnology('');
      setAssetFormCapacity('');
      setAssetFormRating('');
      setAssetFormRefrigerant('');
    }
  };

  const handleVariantChange = (selectedVariantVal: string) => {
    const foundVar = availableVariants.find((v) => v.id === selectedVariantVal || v.variantCode === selectedVariantVal);
    const parentModel = availableModels.find((m) => m.id === assetFormModelId || m.modelNumber === assetFormModel);

    if (foundVar) {
      setAssetFormVariantId(foundVar.id);
      if (foundVar.capacityTons) {
        setAssetFormCapacity(String(foundVar.capacityTons));
      } else if (parentModel?.capacityTons) {
        setAssetFormCapacity(String(parentModel.capacityTons));
      }
      if (foundVar.starRating) {
        setAssetFormRating(foundVar.starRating);
      } else if (parentModel?.rating) {
        setAssetFormRating(parentModel.rating);
      }
      if (foundVar.acType) {
        setAssetFormType(foundVar.acType as AcType);
      } else if (parentModel?.acType) {
        setAssetFormType(parentModel.acType as AcType);
      }
      if (foundVar.technology) {
        setAssetFormTechnology(normalizeTechnology(foundVar.technology));
      } else if (parentModel?.technology) {
        setAssetFormTechnology(normalizeTechnology(parentModel.technology));
      }

      // Required Cascade: Variant refrigerant -> Model refrigerant -> manual entry when neither supplies a value
      if (foundVar.refrigerant && foundVar.refrigerant.trim()) {
        setAssetFormRefrigerant(foundVar.refrigerant.trim());
      } else if (parentModel?.refrigerant && parentModel.refrigerant.trim()) {
        setAssetFormRefrigerant(parentModel.refrigerant.trim());
      } else {
        setAssetFormRefrigerant('');
      }
    } else {
      setAssetFormVariantId('');
      // Restore parent model default specifications
      if (parentModel) {
        setAssetFormCapacity(parentModel.capacityTons ? String(parentModel.capacityTons) : '');
        setAssetFormRating(parentModel.rating || '');
        setAssetFormType(parentModel.acType ? (parentModel.acType as AcType) : 'Split AC');
        setAssetFormTechnology(parentModel.technology ? normalizeTechnology(parentModel.technology) : '');
        setAssetFormRefrigerant(parentModel.refrigerant || '');
      }
    }
  };

  const handleOpenAssetDrawer = async (asset: AcAsset) => {
    setViewingAsset(asset);
    setCopiedSerialKey(null);
    setShowAssetAmcHistory(false);
    setAssetAmcHistory(null);
    setShowAssetHealthTimeline(false);
    setIsLoadingAssetHealth(true);
    setAssetHealth(null);

    // Fetch fresh asset specs
    apiClient
      .get<{ asset?: AcAsset; data?: { asset: AcAsset } }>(`/assets/${asset.id}`)
      .then((res) => {
        const freshAsset = res.data?.asset || res.asset;
        if (freshAsset && freshAsset.id === asset.id) {
          setViewingAsset(freshAsset);
        }
      })
      .catch(() => {});

    // Fetch asset health and reliability metrics
    apiClient
      .get<AssetHealthResponse>(`/assets/${asset.id}/health`)
      .then((healthRes) => {
        if (healthRes && healthRes.assetId === asset.id) {
          setAssetHealth(healthRes);
        }
      })
      .catch(() => setAssetHealth(null))
      .finally(() => setIsLoadingAssetHealth(false));
  };

  const handleCopySerial = async (serial: string, key: 'idu' | 'odu') => {
    try {
      await navigator.clipboard.writeText(serial);
      setCopiedSerialKey(key);
      showToast({
        type: 'success',
        title: 'Copied to Clipboard',
        message: `${key === 'idu' ? 'Indoor Unit (IDU)' : 'Outdoor Unit (ODU)'} serial number copied.`,
      });
      setTimeout(() => setCopiedSerialKey((curr) => (curr === key ? null : curr)), 2000);
    } catch {
      showToast({ type: 'error', title: 'Copy Failed', message: 'Unable to copy serial number to clipboard.' });
    }
  };

  const handleToggleAssetAmcHistory = async (assetId: string) => {
    if (showAssetAmcHistory) {
      setShowAssetAmcHistory(false);
      return;
    }
    setIsLoadingAssetAmcHistory(true);
    setShowAssetAmcHistory(true);
    try {
      const res = await apiClient.get<AssetAmcHistoryResponse>(`/assets/${assetId}/amc-history`);
      setAssetAmcHistory(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load AMC history';
      showToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsLoadingAssetAmcHistory(false);
    }
  };

  const handleWarrantyStartDateChange = (newStartDate: string) => {
    setAssetFormWarrantyStartDate(newStartDate);
    if (!isWarrantyEndDateOverridden && newStartDate) {
      const computedEnd = calculateDefaultWarrantyEndDate(newStartDate);
      setAssetFormWarrantyEndDate(computedEnd);
    }
  };

  const handleWarrantyEndDateChange = (newEndDate: string) => {
    setAssetFormWarrantyEndDate(newEndDate);
    const expectedDefault = assetFormWarrantyStartDate
      ? calculateDefaultWarrantyEndDate(assetFormWarrantyStartDate)
      : '';
    setIsWarrantyEndDateOverridden(Boolean(newEndDate && newEndDate !== expectedDefault));
  };

  const handleRestoreDefaultWarrantyEndDate = () => {
    if (assetFormWarrantyStartDate) {
      const defaultEnd = calculateDefaultWarrantyEndDate(assetFormWarrantyStartDate);
      setAssetFormWarrantyEndDate(defaultEnd);
      setIsWarrantyEndDateOverridden(false);
    }
  };

  const isAddAssetDirty = Boolean(
    isAddAssetModalOpen &&
      addAssetBaselineRef.current &&
      (assetFormSiteId !== addAssetBaselineRef.current.siteId ||
        assetFormBrand !== addAssetBaselineRef.current.brand ||
        assetFormModel !== addAssetBaselineRef.current.model ||
        assetFormSerial !== addAssetBaselineRef.current.serial ||
        assetFormIndoorSerial !== addAssetBaselineRef.current.indoorSerial ||
        assetFormOutdoorSerial !== addAssetBaselineRef.current.outdoorSerial ||
        assetFormType !== addAssetBaselineRef.current.type ||
        assetFormPurchaseDate !== addAssetBaselineRef.current.purchaseDate ||
        assetFormInstallDate !== addAssetBaselineRef.current.installDate ||
        assetFormWarrantyStartDate !== addAssetBaselineRef.current.warrantyStartDate ||
        assetFormWarrantyEndDate !== addAssetBaselineRef.current.warrantyEndDate ||
        assetFormTotalWarrantyServices !== addAssetBaselineRef.current.totalServices ||
        assetFormDryWarrantyVisits !== addAssetBaselineRef.current.dryVisits ||
        assetFormJetWarrantyVisits !== addAssetBaselineRef.current.jetVisits ||
        assetFormPumpdownWarrantyVisits !== addAssetBaselineRef.current.pumpdownVisits ||
        assetFormNotes !== addAssetBaselineRef.current.notes)
  );

  const isEditAssetDirty = Boolean(
    editingAsset &&
      editAssetBaselineRef.current &&
      (assetFormBrand !== editAssetBaselineRef.current.brand ||
        assetFormModel !== editAssetBaselineRef.current.model ||
        assetFormSerial !== editAssetBaselineRef.current.serial ||
        assetFormIndoorSerial !== editAssetBaselineRef.current.indoorSerial ||
        assetFormOutdoorSerial !== editAssetBaselineRef.current.outdoorSerial ||
        assetFormType !== editAssetBaselineRef.current.type ||
        assetFormPurchaseDate !== editAssetBaselineRef.current.purchaseDate ||
        assetFormInstallDate !== editAssetBaselineRef.current.installDate ||
        assetFormWarrantyStartDate !== editAssetBaselineRef.current.warrantyStartDate ||
        assetFormWarrantyEndDate !== editAssetBaselineRef.current.warrantyEndDate ||
        assetFormTotalWarrantyServices !== editAssetBaselineRef.current.totalServices ||
        assetFormDryWarrantyVisits !== editAssetBaselineRef.current.dryVisits ||
        assetFormJetWarrantyVisits !== editAssetBaselineRef.current.jetVisits ||
        assetFormPumpdownWarrantyVisits !== editAssetBaselineRef.current.pumpdownVisits ||
        assetFormStatus !== editAssetBaselineRef.current.status ||
        assetFormCondition !== editAssetBaselineRef.current.condition ||
        assetFormNotes !== editAssetBaselineRef.current.notes)
  );

  const openAddAssetModal = (defaultSiteId?: string) => {
    const targetSiteId = defaultSiteId || (sites.length > 0 ? sites[0].id : '');
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultEndStr = calculateDefaultWarrantyEndDate(todayStr);

    setAssetFormSiteId(targetSiteId);
    setAssetFormTag('');
    setAssetFormBrand('');
    setAssetFormBrandId('');
    setAssetFormModel('');
    setAssetFormModelId('');
    setAssetFormVariantId('');
    setAvailableVariants([]);
    setAssetFormSerial('');
    setAssetFormIndoorSerial('');
    setAssetFormOutdoorSerial('');
    setAssetFormHasSingleSerial(false);
    setAssetFormType('Split AC');
    setAssetFormTechnology('');
    setAssetFormCapacity('');
    setAssetFormRating('');
    setAssetFormRefrigerant('');
    setAssetFormFloor('Ground Floor');
    setAssetFormCustomFloor('');
    setAssetFormRoom('Reception');
    setAssetFormCustomRoom('');
    setAssetFormPurchaseDate(todayStr);
    setAssetFormInstallDate(todayStr);
    setAssetFormWarrantyStartDate(todayStr);
    setAssetFormWarrantyEndDate(defaultEndStr);
    setIsWarrantyEndDateOverridden(false);
    setAssetFormTotalWarrantyServices('');
    setAssetFormDryWarrantyVisits('');
    setAssetFormJetWarrantyVisits('');
    setAssetFormPumpdownWarrantyVisits('');
    setAssetFormWarranty('UNDER_WARRANTY');
    setAssetFormStatus('Active');
    setAssetFormCondition('Good');
    setAssetFormNotes('');
    setAssetFormError(null);

    addAssetBaselineRef.current = {
      siteId: targetSiteId,
      brand: '',
      model: '',
      serial: '',
      indoorSerial: '',
      outdoorSerial: '',
      type: 'Split AC',
      purchaseDate: todayStr,
      installDate: todayStr,
      warrantyStartDate: todayStr,
      warrantyEndDate: defaultEndStr,
      totalServices: '',
      dryVisits: '',
      jetVisits: '',
      pumpdownVisits: '',
      notes: '',
    };

    setAssetWizardStep(0);
    setIsAddAssetModalOpen(true);
    loadAvailableBrands();
  };

  const openEditAssetModal = (asset: AcAsset) => {
    setEditingAsset(asset);
    setAssetFormSiteId(asset.siteId);
    setAssetFormTag(asset.assetTag);
    setAssetFormBrand(asset.brand);
    setAssetFormBrandId(asset.brandId || '');
    setAssetFormModel(asset.modelNumber || '');
    setAssetFormModelId(asset.modelId || '');
    setAssetFormVariantId(asset.variantId || '');
    setAssetFormSerial(asset.serialNumber || '');
    setAssetFormIndoorSerial(asset.indoorSerialNumber || '');
    setAssetFormOutdoorSerial(asset.outdoorSerialNumber || '');
    setAssetFormHasSingleSerial(!!asset.serialNumber && !asset.indoorSerialNumber);
    setAssetFormType(asset.acType);
    setAssetFormTechnology(asset.technology ? normalizeTechnology(asset.technology) : '');
    setAssetFormCapacity(asset.capacityTons ? String(asset.capacityTons) : '');
    setAssetFormRating(asset.starRating || '');
    setAssetFormInstallDate(asset.installationDate || '');
    setAssetFormPurchaseDate(asset.purchaseDate || '');
    setAssetFormWarrantyStartDate(asset.warrantyStartDate || '');
    setAssetFormWarrantyEndDate(asset.warrantyEndDate || '');

    const expectedDefault = asset.warrantyStartDate ? calculateDefaultWarrantyEndDate(asset.warrantyStartDate) : '';
    setIsWarrantyEndDateOverridden(Boolean(asset.warrantyEndDate && asset.warrantyEndDate !== expectedDefault));

    const totalServStr = asset.totalWarrantyServices !== null && asset.totalWarrantyServices !== undefined ? String(asset.totalWarrantyServices) : '';
    const dryStr = asset.dryWarrantyVisits !== null && asset.dryWarrantyVisits !== undefined ? String(asset.dryWarrantyVisits) : '';
    const jetStr = asset.jetWarrantyVisits !== null && asset.jetWarrantyVisits !== undefined ? String(asset.jetWarrantyVisits) : '';
    const pumpdownStr = asset.pumpdownWarrantyVisits !== null && asset.pumpdownWarrantyVisits !== undefined ? String(asset.pumpdownWarrantyVisits) : '';

    setAssetFormTotalWarrantyServices(totalServStr);
    setAssetFormDryWarrantyVisits(dryStr);
    setAssetFormJetWarrantyVisits(jetStr);
    setAssetFormPumpdownWarrantyVisits(pumpdownStr);

    setAssetFormFloor(FLOOR_OPTIONS.includes(asset.floorLocation || '') ? asset.floorLocation! : (asset.floorLocation ? 'Other' : 'Ground Floor'));
    setAssetFormCustomFloor(FLOOR_OPTIONS.includes(asset.floorLocation || '') ? '' : (asset.floorLocation || ''));
    setAssetFormRoom(ROOM_OPTIONS.includes(asset.roomLocation || '') ? asset.roomLocation! : (asset.roomLocation ? 'Other' : 'Reception'));
    setAssetFormCustomRoom(ROOM_OPTIONS.includes(asset.roomLocation || '') ? '' : (asset.roomLocation || ''));
    setAssetFormRefrigerant(asset.refrigerantType || '');
    setAssetFormWarranty(asset.warrantyStatus);
    setAssetFormStatus(asset.assetStatus || (asset.isActive ? 'Active' : 'Temporarily Inactive'));
    setAssetFormCondition(asset.assetCondition || 'Good');
    setAssetFormNotes(asset.notes || '');
    setAssetFormError(null);

    if (asset.modelId) {
      apiClient
        .get<{ data?: { variants?: AcModelVariant[] }; variants?: AcModelVariant[] }>(
          `/ac-models/${asset.modelId}/variants?activeOnly=true`
        )
        .then((res) => {
          setAvailableVariants(res.data?.variants || res.variants || []);
        })
        .catch(() => {
          setAvailableVariants([]);
        });
    } else {
      setAvailableVariants([]);
    }

    editAssetBaselineRef.current = {
      brand: asset.brand,
      model: asset.modelNumber || '',
      serial: asset.serialNumber || '',
      indoorSerial: asset.indoorSerialNumber || '',
      outdoorSerial: asset.outdoorSerialNumber || '',
      type: asset.acType,
      purchaseDate: asset.purchaseDate || '',
      installDate: asset.installationDate || '',
      warrantyStartDate: asset.warrantyStartDate || '',
      warrantyEndDate: asset.warrantyEndDate || '',
      totalServices: totalServStr,
      dryVisits: dryStr,
      jetVisits: jetStr,
      pumpdownVisits: pumpdownStr,
      notes: asset.notes || '',
      status: asset.assetStatus || (asset.isActive ? 'Active' : 'Temporarily Inactive'),
      condition: asset.assetCondition || 'Good',
    };
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetFormSiteId || !selectedCustomer) return;

    if (assetFormPurchaseDate && assetFormInstallDate && assetFormPurchaseDate > assetFormInstallDate) {
      setAssetFormError('Purchase date cannot be later than installation date.');
      return;
    }
    if (assetFormWarrantyStartDate && assetFormWarrantyEndDate && assetFormWarrantyEndDate < assetFormWarrantyStartDate) {
      setAssetFormError('Warranty end date cannot be earlier than warranty start date.');
      return;
    }

    const parseWarrantyCount = (val: string): number | null => {
      const trimmed = val.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      return isNaN(n) ? NaN : n;
    };

    const parsedTotal = parseWarrantyCount(assetFormTotalWarrantyServices);
    const parsedDry = parseWarrantyCount(assetFormDryWarrantyVisits);
    const parsedJet = parseWarrantyCount(assetFormJetWarrantyVisits);
    const parsedPumpdown = parseWarrantyCount(assetFormPumpdownWarrantyVisits);

    const allocValidation = validateWarrantyAllocation({
      totalWarrantyServices: parsedTotal,
      dryWarrantyVisits: parsedDry,
      jetWarrantyVisits: parsedJet,
      pumpdownWarrantyVisits: parsedPumpdown,
    });

    if (!allocValidation.isValid) {
      setAssetFormError(allocValidation.error || 'Invalid warranty service allocation.');
      return;
    }

    setIsSubmittingAsset(true);
    setAssetFormError(null);

    try {
      const isSingle =
        assetFormType.toLowerCase().includes('window') ||
        assetFormType.toLowerCase().includes('portable') ||
        assetFormType.toLowerCase().includes('package') ||
        assetFormHasSingleSerial;

      const finalFloor = assetFormFloor === 'Other' && assetFormCustomFloor ? assetFormCustomFloor : assetFormFloor;
      const finalRoom = assetFormRoom === 'Other' && assetFormCustomRoom ? assetFormCustomRoom : assetFormRoom;

      await apiClient.post<AssetApiResponse>(`/sites/${assetFormSiteId}/assets`, {
        assetTag: assetFormTag.trim() || undefined,
        brand: assetFormBrand.trim(),
        brandId: assetFormBrandId || undefined,
        modelNumber: assetFormModel.trim() || undefined,
        modelId: assetFormModelId || undefined,
        variantId: assetFormVariantId || undefined,
        serialNumber: (isSingle ? assetFormSerial : (assetFormSerial || assetFormIndoorSerial)).trim() || undefined,
        indoorSerialNumber: !isSingle ? assetFormIndoorSerial.trim() || undefined : undefined,
        outdoorSerialNumber: !isSingle ? assetFormOutdoorSerial.trim() || undefined : undefined,
        acType: assetFormType,
        technology: assetFormTechnology ? normalizeTechnology(assetFormTechnology) : undefined,
        capacityTons: assetFormCapacity ? parseFloat(assetFormCapacity) : undefined,
        starRating: assetFormRating.trim() || undefined,
        installationDate: assetFormInstallDate || undefined,
        purchaseDate: assetFormPurchaseDate || undefined,
        warrantyStartDate: assetFormWarrantyStartDate || undefined,
        warrantyEndDate: assetFormWarrantyEndDate || undefined,
        totalWarrantyServices: parsedTotal,
        dryWarrantyVisits: parsedDry,
        jetWarrantyVisits: parsedJet,
        pumpdownWarrantyVisits: parsedPumpdown,
        floorLocation: finalFloor.trim() || undefined,
        roomLocation: finalRoom.trim() || undefined,
        refrigerantType: assetFormRefrigerant.trim() || undefined,
        warrantyStatus: assetFormWarrantyEndDate
          ? computeLiveWarrantyStatus(assetFormWarrantyStartDate, assetFormWarrantyEndDate)
          : assetFormWarranty,
        assetStatus: assetFormStatus,
        assetCondition: assetFormCondition,
        notes: assetFormNotes.trim() || undefined,
      });

      showToast({ type: 'success', title: 'Asset Created', message: 'AC Asset registered successfully.' });
      setIsAddAssetModalOpen(false);
      await loadSitesAndAssets(selectedCustomer.id);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to register asset';
      setAssetFormError(msg);
      showToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsSubmittingAsset(false);
    }
  };

  const handleUpdateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAsset || !selectedCustomer) return;

    if (assetFormPurchaseDate && assetFormInstallDate && assetFormPurchaseDate > assetFormInstallDate) {
      setAssetFormError('Purchase date cannot be later than installation date.');
      return;
    }
    if (assetFormWarrantyStartDate && assetFormWarrantyEndDate && assetFormWarrantyEndDate < assetFormWarrantyStartDate) {
      setAssetFormError('Warranty end date cannot be earlier than warranty start date.');
      return;
    }

    const parseWarrantyCount = (val: string): number | null => {
      const trimmed = val.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      return isNaN(n) ? NaN : n;
    };

    const parsedTotal = parseWarrantyCount(assetFormTotalWarrantyServices);
    const parsedDry = parseWarrantyCount(assetFormDryWarrantyVisits);
    const parsedJet = parseWarrantyCount(assetFormJetWarrantyVisits);
    const parsedPumpdown = parseWarrantyCount(assetFormPumpdownWarrantyVisits);

    const allocValidation = validateWarrantyAllocation({
      totalWarrantyServices: parsedTotal,
      dryWarrantyVisits: parsedDry,
      jetWarrantyVisits: parsedJet,
      pumpdownWarrantyVisits: parsedPumpdown,
    });

    if (!allocValidation.isValid) {
      setAssetFormError(allocValidation.error || 'Invalid warranty service allocation.');
      return;
    }

    setIsSubmittingAsset(true);
    setAssetFormError(null);

    try {
      const finalFloor = assetFormFloor === 'Other' && assetFormCustomFloor ? assetFormCustomFloor : assetFormFloor;
      const finalRoom = assetFormRoom === 'Other' && assetFormCustomRoom ? assetFormCustomRoom : assetFormRoom;

      await apiClient.patch<AssetApiResponse>(`/assets/${editingAsset.id}`, {
        brand: assetFormBrand.trim(),
        brandId: assetFormBrandId || null,
        modelNumber: assetFormModel.trim() || null,
        modelId: assetFormModelId || null,
        variantId: assetFormVariantId || null,
        serialNumber: (assetFormHasSingleSerial ? assetFormSerial : (assetFormSerial || assetFormIndoorSerial)).trim() || null,
        indoorSerialNumber: !assetFormHasSingleSerial ? assetFormIndoorSerial.trim() || null : null,
        outdoorSerialNumber: !assetFormHasSingleSerial ? assetFormOutdoorSerial.trim() || null : null,
        acType: assetFormType,
        technology: assetFormTechnology ? normalizeTechnology(assetFormTechnology) : null,
        capacityTons: assetFormCapacity ? parseFloat(assetFormCapacity) : null,
        starRating: assetFormRating.trim() || null,
        installationDate: assetFormInstallDate || null,
        purchaseDate: assetFormPurchaseDate || null,
        warrantyStartDate: assetFormWarrantyStartDate || null,
        warrantyEndDate: assetFormWarrantyEndDate || null,
        totalWarrantyServices: parsedTotal,
        dryWarrantyVisits: parsedDry,
        jetWarrantyVisits: parsedJet,
        pumpdownWarrantyVisits: parsedPumpdown,
        floorLocation: finalFloor.trim() || null,
        roomLocation: finalRoom.trim() || null,
        refrigerantType: assetFormRefrigerant.trim() || null,
        warrantyStatus: assetFormWarrantyEndDate
          ? computeLiveWarrantyStatus(assetFormWarrantyStartDate, assetFormWarrantyEndDate)
          : assetFormWarranty,
        assetStatus: assetFormStatus,
        assetCondition: assetFormCondition,
        notes: assetFormNotes.trim() || null,
      });

      showToast({ type: 'success', title: 'Asset Updated', message: 'AC Asset details updated successfully.' });
      setEditingAsset(null);
      await loadSitesAndAssets(selectedCustomer.id);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update asset';
      setAssetFormError(msg);
      showToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsSubmittingAsset(false);
    }
  };

  const handleToggleAssetStatus = async (asset: AcAsset) => {
    if (!selectedCustomer) return;
    try {
      await apiClient.patch<AssetApiResponse>(`/assets/${asset.id}/status`, {
        isActive: !asset.isActive,
      });
      showToast({
        type: 'success',
        title: 'Asset Status Changed',
        message: `'${asset.assetTag}' is now ${!asset.isActive ? 'Active' : 'Inactive'}.`,
      });
      await loadSitesAndAssets(selectedCustomer.id);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to toggle asset status';
      showToast({ type: 'error', title: 'Error', message: msg });
    }
  };

  // Filtered Assets inside drawer
  const filteredAssets = assets.filter((asset) => {
    if (assetSiteFilter !== 'ALL' && asset.siteId !== assetSiteFilter) {
      return false;
    }
    if (assetTypeFilter !== 'ALL' && asset.acType !== assetTypeFilter) {
      return false;
    }
    if (assetWarrantyFilter !== 'ALL' && asset.warrantyStatus !== assetWarrantyFilter) {
      return false;
    }
    if (assetSearchTerm.trim()) {
      const q = assetSearchTerm.toLowerCase();
      const matchTag = asset.assetTag.toLowerCase().includes(q);
      const matchBrand = asset.brand.toLowerCase().includes(q);
      const matchModel = (asset.modelNumber || '').toLowerCase().includes(q);
      const matchSerial = (asset.serialNumber || '').toLowerCase().includes(q);
      const matchLoc = (asset.roomLocation || '').toLowerCase().includes(q);
      if (!matchTag && !matchBrand && !matchModel && !matchSerial && !matchLoc) {
        return false;
      }
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* 1. Page Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Users size={24} style={{ color: 'var(--color-brand)' }} />
            <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
              Customers
            </h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
            Manage customer accounts, branch locations, contacts, and service history without duplicates.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isRefreshing}
            leftIcon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={openAddModal}
            leftIcon={<UserPlus size={16} />}
          >
            Add Customer
          </Button>
        </div>
      </div>

      {/* 2. Search & Filters Bar */}
      <div
        className="card"
        style={{
          padding: 'var(--space-4)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)', flex: 1 }}>
          {/* Search Box */}
          <div style={{ minWidth: '260px', flex: 1, maxWidth: '420px', position: 'relative' }}>
            <Input
              id="customer-search"
              placeholder="Search by name, company, phone, email, code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>

          {/* Type Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>
              Type:
            </span>
            <select
              aria-label="Filter by customer type"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as 'ALL' | CustomerType);
                setPage(1);
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">All Types</option>
              <option value="TEMPORARY">Temporary Only</option>
              <option value="PERMANENT">Permanent Only</option>
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>
              Status:
            </span>
            <select
              aria-label="Filter by customer status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE');
                setPage(1);
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>
        </div>

        {(searchTerm || typeFilter !== 'ALL' || statusFilter !== 'ALL') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchTerm('');
              setTypeFilter('ALL');
              setStatusFilter('ALL');
              setPage(1);
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* 3. Error Banner */}
      {listError && (
        <div
          role="alert"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: 'var(--color-danger, #ef4444)',
            fontSize: 'var(--text-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AlertCircle size={18} />
            <span>{listError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchCustomers}>
            Retry
          </Button>
        </div>
      )}

      {/* 4. Customer Table or States */}
      {isLoading ? (
        <div className="card" style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
          <div
            className="animate-spin"
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid var(--color-brand)',
              borderRightColor: 'transparent',
              borderRadius: '50%',
              margin: '0 auto var(--space-4)',
            }}
          />
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Loading customer records...
          </div>
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={<Users size={40} />}
          title={debouncedSearch || typeFilter !== 'ALL' || statusFilter !== 'ALL' ? 'No matching customers' : 'No customers registered'}
          description={
            debouncedSearch || typeFilter !== 'ALL' || statusFilter !== 'ALL'
              ? 'Try refining your search terms or clearing selected filters.'
              : 'Add your first customer to begin recording services, AMC contracts, and AC assets.'
          }
          actionLabel={debouncedSearch || typeFilter !== 'ALL' || statusFilter !== 'ALL' ? 'Reset Filters' : '+ Add Customer'}
          onAction={
            debouncedSearch || typeFilter !== 'ALL' || statusFilter !== 'ALL'
              ? () => {
                  setSearchTerm('');
                  setTypeFilter('ALL');
                  setStatusFilter('ALL');
                }
              : openAddModal
          }
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-surface-subtle)' }}>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                    CUSTOMER CODE
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                    NAME & COMPANY
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                    CLASSIFICATION
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                    CONTACT INFO
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                    LOCATION
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                    STATUS
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background-color 0.15s ease',
                    }}
                    className="table-row-hover"
                  >
                    {/* Code */}
                    <td style={{ padding: '14px 16px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      <span
                        style={{
                          backgroundColor: 'var(--bg-surface-subtle)',
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-default)',
                        }}
                      >
                        {c.customerCode}
                      </span>
                    </td>

                    {/* Name & Company */}
                    <td style={{ padding: '14px 16px' }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 'var(--text-sm)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedCustomer(c)}
                        title="Click to view details"
                      >
                        {c.name}
                      </div>
                      {c.companyName && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <Building2 size={11} />
                          <span>{c.companyName}</span>
                        </div>
                      )}
                    </td>

                    {/* Classification */}
                    <td style={{ padding: '14px 16px' }}>
                      <Badge variant={c.customerType === 'PERMANENT' ? 'brand' : 'warning'}>
                        {c.customerType}
                      </Badge>
                    </td>

                    {/* Contact Info */}
                    <td style={{ padding: '14px 16px', fontSize: 'var(--text-xs)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                        <Phone size={12} style={{ color: 'var(--text-muted)' }} />
                        <span>{c.phone}</span>
                      </div>
                      {c.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          <Mail size={12} />
                          <span>{c.email}</span>
                        </div>
                      )}
                    </td>

                    {/* Location */}
                    <td style={{ padding: '14px 16px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span>{c.city ? `${c.city}${c.state ? `, ${c.state}` : ''}` : c.address}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '14px 16px' }}>
                      <Badge variant={c.isActive ? 'success' : 'neutral'}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          isIconOnly
                          onClick={() => setSelectedCustomer(c)}
                          title="View customer overview"
                          aria-label="View customer"
                        >
                          <Eye size={15} />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          isIconOnly
                          onClick={() => openEditModal(c)}
                          title="Edit customer details"
                          aria-label="Edit customer"
                        >
                          <Edit2 size={15} />
                        </Button>

                        {c.customerType === 'TEMPORARY' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            isIconOnly
                            onClick={() => setConvertingCustomer(c)}
                            title="Convert to Permanent"
                            aria-label="Convert to Permanent"
                            style={{ color: 'var(--color-brand)' }}
                          >
                            <ArrowRightCircle size={16} />
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          isIconOnly
                          onClick={() => setStatusTogglingCustomer(c)}
                          title={c.isActive ? 'Deactivate customer' : 'Activate customer'}
                          aria-label={c.isActive ? 'Deactivate customer' : 'Activate customer'}
                          style={{ color: c.isActive ? 'var(--text-muted)' : 'var(--color-success)' }}
                        >
                          {c.isActive ? <XCircle size={15} /> : <CheckCircle size={15} />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Summary & Pagination */}
          <div
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--border-default)',
              backgroundColor: 'var(--bg-surface-subtle)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            <div>
              Showing {customers.length} of {paginationMeta.total || customers.length} customer records
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Button
                variant="outline"
                size="sm"
                isIconOnly
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </Button>
              <span style={{ fontWeight: 500, padding: '0 4px' }}>
                Page {page} of {paginationMeta.totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                isIconOnly
                disabled={page >= paginationMeta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ADD CUSTOMER MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => !isSubmitting && setIsAddModalOpen(false)}
        title="Register New Customer"
        description="Create a client profile with primary site and contact details."
        maxWidth="680px"
        isDirty={isAddCustomerDirty}
        onConfirmDiscard={resetForm}
      >
        {({ requestClose }) => (
          <form onSubmit={handleCreateCustomer}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {formError && (
              <div
                role="alert"
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: 'var(--color-danger, #ef4444)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                {formError}
              </div>
            )}

            {/* Section A: Customer Identity & Type */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
              <Input
                id="add-customer-name"
                label="Customer / Client Name *"
                placeholder="e.g. Acme Commercial Ltd or Rahul Sharma"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />

              <div>
                <label
                  htmlFor="add-customer-type"
                  style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '6px' }}
                >
                  Customer Type *
                </label>
                <select
                  id="add-customer-type"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as CustomerType)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    backgroundColor: 'var(--bg-surface)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <option value="TEMPORARY">TEMPORARY (Breakdown / One-time)</option>
                  <option value="PERMANENT">PERMANENT (Contract / Established)</option>
                </select>
              </div>
            </div>

            {/* Section B: Contact & Business */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <Input
                id="add-customer-phone"
                label="Primary Phone Number *"
                placeholder="e.g. 9876543210"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                required
              />

              <Input
                id="add-customer-alt-phone"
                label="Alternate Phone Number"
                placeholder="e.g. 02228945612"
                value={formAltPhone}
                onChange={(e) => setFormAltPhone(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <Input
                id="add-customer-email"
                label="Email Address"
                type="email"
                placeholder="e.g. contact@acme.example"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />

              <Input
                id="add-customer-company"
                label="Company / Business Name"
                placeholder="e.g. Acme Enterprises Pvt Ltd"
                value={formCompanyName}
                onChange={(e) => setFormCompanyName(e.target.value)}
              />
            </div>

            {/* Section C: Address */}
            <Input
              id="add-customer-address"
              label="Street Address *"
              placeholder="e.g. Unit 401, Tech Park, Link Road"
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
              <Input
                id="add-customer-city"
                label="City"
                placeholder="e.g. Mumbai"
                value={formCity}
                onChange={(e) => setFormCity(e.target.value)}
              />

              <Input
                id="add-customer-state"
                label="State"
                placeholder="e.g. Maharashtra"
                value={formState}
                onChange={(e) => setFormState(e.target.value)}
              />

              <Input
                id="add-customer-postal"
                label="Pincode / Postal Code"
                placeholder="e.g. 400001"
                value={formPostalCode}
                onChange={(e) => setFormPostalCode(e.target.value)}
              />
            </div>

            {/* Section D: Site & Site Contact */}
            <div
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                PRIMARY SITE / FACILITY CONTACT
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
                <Input
                  id="add-site-name"
                  label="Building / Site Name"
                  placeholder="e.g. Head Office or Block B"
                  value={formSiteName}
                  onChange={(e) => setFormSiteName(e.target.value)}
                />

                <Input
                  id="add-site-person"
                  label="Site Contact Person"
                  placeholder="e.g. Mr. Sharma (Facility Mgr)"
                  value={formSiteContactPerson}
                  onChange={(e) => setFormSiteContactPerson(e.target.value)}
                />

                <Input
                  id="add-site-phone"
                  label="Site Contact Phone"
                  placeholder="e.g. 9822334455"
                  value={formSiteContactPhone}
                  onChange={(e) => setFormSiteContactPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Section E: Notes */}
            <Textarea
              id="add-customer-notes"
              label="Operational Notes"
              placeholder="Special instructions, gate pass requirements, preferred service hours..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                id="btn-submit-customer"
              >
                Register Customer
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>

      {/* 6. EDIT CUSTOMER MODAL */}
      <Modal
        isOpen={!!editingCustomer}
        onClose={() => !isSubmitting && setEditingCustomer(null)}
        title={`Edit Customer — ${editingCustomer?.name || ''}`}
        description={`Update account details and contact information for ${editingCustomer?.customerCode}.`}
        maxWidth="680px"
      >
        <form onSubmit={handleUpdateCustomer}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {formError && (
              <div
                role="alert"
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: 'var(--color-danger, #ef4444)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                {formError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
              <Input
                id="edit-customer-name"
                label="Customer / Client Name *"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />

              <Input
                id="edit-customer-company"
                label="Company Name"
                value={formCompanyName}
                onChange={(e) => setFormCompanyName(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <Input
                id="edit-customer-phone"
                label="Primary Phone Number *"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                required
              />

              <Input
                id="edit-customer-alt-phone"
                label="Alternate Phone"
                value={formAltPhone}
                onChange={(e) => setFormAltPhone(e.target.value)}
              />
            </div>

            <Input
              id="edit-customer-email"
              label="Email Address"
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />

            <Input
              id="edit-customer-address"
              label="Street Address *"
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
              <Input
                id="edit-customer-city"
                label="City"
                value={formCity}
                onChange={(e) => setFormCity(e.target.value)}
              />

              <Input
                id="edit-customer-state"
                label="State"
                value={formState}
                onChange={(e) => setFormState(e.target.value)}
              />

              <Input
                id="edit-customer-postal"
                label="Pincode"
                value={formPostalCode}
                onChange={(e) => setFormPostalCode(e.target.value)}
              />
            </div>

            <div
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                PRIMARY SITE / FACILITY CONTACT
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
                <Input
                  id="edit-site-name"
                  label="Site / Branch Name"
                  value={formSiteName}
                  onChange={(e) => setFormSiteName(e.target.value)}
                />

                <Input
                  id="edit-site-person"
                  label="Contact Person"
                  value={formSiteContactPerson}
                  onChange={(e) => setFormSiteContactPerson(e.target.value)}
                />

                <Input
                  id="edit-site-phone"
                  label="Site Phone"
                  value={formSiteContactPhone}
                  onChange={(e) => setFormSiteContactPhone(e.target.value)}
                />
              </div>
            </div>

            <Textarea
              id="edit-customer-notes"
              label="Operational Notes"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingCustomer(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* 7. CONVERT TO PERMANENT CONFIRMATION MODAL */}
      <Modal
        isOpen={!!convertingCustomer}
        onClose={() => !isSubmitting && setConvertingCustomer(null)}
        title="Convert Customer to PERMANENT"
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-brand-subtle)',
              border: '1px solid var(--color-brand)',
            }}
          >
            <ArrowRightCircle size={28} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                {convertingCustomer?.name} ({convertingCustomer?.customerCode})
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                Currently classified as: <Badge variant="warning">TEMPORARY</Badge>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <p style={{ marginBottom: '8px' }}>
              Converting to <strong>PERMANENT</strong> transitions this customer into an established client record.
            </p>
            <ul style={{ paddingLeft: '20px', margin: '8px 0', fontSize: 'var(--text-xs)' }}>
              <li>The customer ID and code <strong>({convertingCustomer?.customerCode})</strong> will be strictly preserved.</li>
              <li>Existing site details, service history, and notes remain intact.</li>
              <li>No duplicate record will ever be created.</li>
              <li>This operation is safe and idempotent.</li>
            </ul>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConvertingCustomer(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              variant="primary"
              onClick={handleConvertToPermanent}
              isLoading={isSubmitting}
            >
              Confirm Conversion
            </Button>
          </div>
        </div>
      </Modal>

      {/* 8. STATUS TOGGLE CONFIRMATION MODAL */}
      <Modal
        isOpen={!!statusTogglingCustomer}
        onClose={() => !isSubmitting && setStatusTogglingCustomer(null)}
        title={statusTogglingCustomer?.isActive ? 'Deactivate Customer' : 'Activate Customer'}
        maxWidth="460px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Are you sure you want to mark <strong>{statusTogglingCustomer?.name}</strong> as{' '}
            <strong>{statusTogglingCustomer?.isActive ? 'Inactive' : 'Active'}</strong>?
          </p>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            This customer record and all historical associations remain safely in the database.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStatusTogglingCustomer(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              variant={statusTogglingCustomer?.isActive ? 'danger' : 'primary'}
              onClick={handleToggleStatus}
              isLoading={isSubmitting}
            >
              {statusTogglingCustomer?.isActive ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        </div>
      </Modal>      {/* 9. CUSTOMER DETAIL DRAWER */}
      <Drawer
        isOpen={!!selectedCustomer}
        onClose={handleCustomerDetailBack}
        title={selectedCustomer?.name || 'Customer Profile'}
        description={`Code: ${selectedCustomer?.customerCode || ''}`}
        width="640px"
        closeLabel="Close customer details"
        onBack={drawerTab !== 'overview' ? () => setDrawerTab('overview') : undefined}
        backLabel="Overview"
        headerActions={
          <Button
            id="customer-detail-back-btn"
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCustomerDetailBack}
            aria-label="Back to customers list"
            title="Back"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </Button>
        }
      >
        {selectedCustomer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {/* Header Badge Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Badge variant={selectedCustomer.customerType === 'PERMANENT' ? 'brand' : 'warning'}>
                  {selectedCustomer.customerType}
                </Badge>
                <Badge variant={selectedCustomer.isActive ? 'success' : 'neutral'}>
                  {selectedCustomer.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                {onNavigate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate('service-requests')}
                    leftIcon={<Wrench size={13} />}
                  >
                    + Service Request
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditModal(selectedCustomer)}
                  leftIcon={<Edit2 size={13} />}
                >
                  Edit
                </Button>

                {selectedCustomer.customerType === 'TEMPORARY' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setConvertingCustomer(selectedCustomer)}
                    leftIcon={<ArrowRightCircle size={13} />}
                  >
                    Convert
                  </Button>
                )}
              </div>
            </div>

            {/* Tab Navigation */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-default)',
                gap: 'var(--space-2)',
              }}
            >
              <button
                type="button"
                onClick={() => setDrawerTab('overview')}
                style={{
                  padding: '8px 14px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: drawerTab === 'overview' ? '2px solid var(--color-brand)' : '2px solid transparent',
                  color: drawerTab === 'overview' ? 'var(--color-brand)' : 'var(--text-muted)',
                }}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('sites')}
                style={{
                  padding: '8px 14px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: drawerTab === 'sites' ? '2px solid var(--color-brand)' : '2px solid transparent',
                  color: drawerTab === 'sites' ? 'var(--color-brand)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Layers size={13} />
                Sites ({sites.length})
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('assets')}
                style={{
                  padding: '8px 14px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: drawerTab === 'assets' ? '2px solid var(--color-brand)' : '2px solid transparent',
                  color: drawerTab === 'assets' ? 'var(--color-brand)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Snowflake size={13} />
                AC Assets ({assets.length})
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {drawerTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                {/* Contact Details Section */}
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Contact Information
                  </div>
                  <div className="card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Primary Phone:</span>
                      <span style={{ fontWeight: 600 }}>{selectedCustomer.phone}</span>
                    </div>
                    {selectedCustomer.alternatePhone && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Alternate Phone:</span>
                        <span>{selectedCustomer.alternatePhone}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Email:</span>
                      <span>{selectedCustomer.email || 'None registered'}</span>
                    </div>
                    {selectedCustomer.companyName && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Company:</span>
                        <span>{selectedCustomer.companyName}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Address & Primary Site Section */}
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Location & Site Contact
                  </div>
                  <div className="card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: 'var(--text-xs)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Billing Address: </span>
                      <span style={{ fontWeight: 500 }}>{selectedCustomer.address}</span>
                      {(selectedCustomer.city || selectedCustomer.state) && (
                        <div>{selectedCustomer.city}, {selectedCustomer.state} - {selectedCustomer.postalCode}</div>
                      )}
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', marginTop: '4px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-brand)' }}>
                        PRIMARY SITE: {selectedCustomer.siteName || 'Main Branch'}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>
                        Contact: {selectedCustomer.siteContactPerson || selectedCustomer.name} (
                        {selectedCustomer.siteContactPhone || selectedCustomer.phone})
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes Section */}
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Operational Notes
                  </div>
                  <div className="card" style={{ padding: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {selectedCustomer.notes || 'No notes added for this customer.'}
                  </div>
                </div>

                {/* Linked Modules Telemetry */}
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Linked Operational Modules
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <div
                      className="telemetry-interactive-card"
                      onClick={() => setDrawerTab('sites')}
                      title="View Customer Sites"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ padding: '6px', borderRadius: 'var(--radius-md)', background: 'rgba(37, 99, 235, 0.1)', color: 'var(--color-brand)' }}>
                          <Layers size={15} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                            Sites & Branch Locations
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {sites.length} Physical Service Site{sites.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <Badge variant="success">Active</Badge>
                    </div>

                    <div
                      className="telemetry-interactive-card"
                      onClick={() => setDrawerTab('assets')}
                      title="View Customer Assets"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ padding: '6px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)' }}>
                          <Wrench size={15} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                            AC Asset Register
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {assets.length} Registered Equipment Unit{assets.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <Badge variant="success">Active</Badge>
                    </div>

                    <div
                      className="telemetry-interactive-card"
                      onClick={() => {
                        if (onNavigate) onNavigate('services');
                      }}
                      title="View Service Requests"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ padding: '6px', borderRadius: 'var(--radius-md)', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)' }}>
                          <Wrench size={15} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                            Service Requests & Work Orders
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Dispatch & Field Job Logging
                          </div>
                        </div>
                      </div>
                      <Badge variant="brand">Operational</Badge>
                    </div>

                    <div
                      className="telemetry-interactive-card"
                      onClick={() => {
                        if (onNavigate) onNavigate('amc');
                      }}
                      title="View AMC Maintenance Agreements"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ padding: '6px', borderRadius: 'var(--radius-md)', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                          <FileCheck2 size={15} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                            AMC Preventive Contracts
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Multi-Asset Preventive Coverage
                          </div>
                        </div>
                      </div>
                      <Badge variant="brand">Operational</Badge>
                    </div>

                    <div
                      className="telemetry-interactive-card"
                      onClick={() => {
                        if (onNavigate) onNavigate('invoices');
                      }}
                      title="View Invoices & Payments"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ padding: '6px', borderRadius: 'var(--radius-md)', background: 'rgba(100, 116, 139, 0.1)', color: 'var(--text-muted)' }}>
                          <Receipt size={15} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                            Payment History & Invoices
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Direct Billing & Ledger Integration
                          </div>
                        </div>
                      </div>
                      <Badge variant="neutral">Connected</Badge>
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <div>Registered: {new Date(selectedCustomer.createdAt).toLocaleString()}</div>
                  <div>Last Updated: {new Date(selectedCustomer.updatedAt).toLocaleString()}</div>
                </div>
              </div>
            )}

            {/* TAB 2: SITES */}
            {drawerTab === 'sites' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>Branch & Site Locations</h4>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Manage physical service locations for {selectedCustomer.name}
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => openAddSiteModal()}
                    leftIcon={<Plus size={14} />}
                  >
                    Add Site
                  </Button>
                </div>

                {sitesError && (
                  <div
                    style={{
                      padding: 'var(--space-3)',
                      backgroundColor: 'var(--color-danger-subtle)',
                      border: '1px solid var(--color-danger)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-danger)',
                    }}
                  >
                    {sitesError}
                  </div>
                )}

                {isLoadingSites ? (
                  <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                    Loading customer sites...
                  </div>
                ) : sites.length === 0 ? (
                  <EmptyState
                    title="No Sites Configured"
                    description="This customer does not have any physical branches or sites registered yet."
                    actionLabel="+ Add Primary Site"
                    onAction={() => openAddSiteModal(true)}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {sites.map((site) => (
                      <div
                        key={site.id}
                        className="card"
                        style={{
                          padding: 'var(--space-3)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--space-2)',
                          borderLeft: site.isPrimary ? '3px solid var(--color-brand)' : '1px solid var(--border-default)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{site.siteName}</span>
                            {site.isPrimary ? (
                              <Badge variant="brand">PRIMARY</Badge>
                            ) : (
                              <Badge variant="neutral">SECONDARY</Badge>
                            )}
                            <Badge variant={site.isActive ? 'success' : 'neutral'}>
                              {site.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Snowflake size={12} />
                              {site.assetCount || 0} Assets
                            </span>
                          </div>
                        </div>

                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <MapPin size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                          <span>{site.address}</span>
                        </div>

                        {(site.contactPerson || site.contactPhone) && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Phone size={13} style={{ flexShrink: 0 }} />
                            <span>
                              {site.contactPerson ? `${site.contactPerson} • ` : ''}
                              {site.contactPhone || 'No phone'}
                              {site.contactEmail ? ` • ${site.contactEmail}` : ''}
                            </span>
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', marginTop: '4px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {!site.isPrimary && site.isActive && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSetPrimarySite(site)}
                                leftIcon={<Star size={12} />}
                              >
                                Set Primary
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAddAssetModal(site.id)}
                              leftIcon={<Plus size={12} />}
                            >
                              Add Asset
                            </Button>
                          </div>

                          <div style={{ display: 'flex', gap: '6px' }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditSiteModal(site)}
                              leftIcon={<Edit2 size={12} />}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleSiteStatus(site)}
                            >
                              {site.isActive ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: AC ASSETS */}
            {drawerTab === 'assets' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>AC Asset Register</h4>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Physical air-conditioning units deployed across customer locations
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => openAddAssetModal()}
                    leftIcon={<Plus size={14} />}
                    disabled={sites.length === 0}
                  >
                    Add AC Asset
                  </Button>
                </div>

                {assetsError && (
                  <div
                    style={{
                      padding: 'var(--space-3)',
                      backgroundColor: 'var(--color-danger-subtle)',
                      border: '1px solid var(--color-danger)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-danger)',
                    }}
                  >
                    {assetsError}
                  </div>
                )}

                {/* Filters Row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  <div style={{ flex: '1 1 180px' }}>
                    <Input
                      placeholder="Search asset tag, brand, serial..."
                      value={assetSearchTerm}
                      onChange={(e) => setAssetSearchTerm(e.target.value)}
                      leftIcon={<Search size={14} />}
                    />
                  </div>

                  <select
                    className="select"
                    value={assetSiteFilter}
                    onChange={(e) => setAssetSiteFilter(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                  >
                    <option value="ALL">All Sites</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.siteName}</option>
                    ))}
                  </select>

                  <select
                    className="select"
                    value={assetTypeFilter}
                    onChange={(e) => setAssetTypeFilter(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                  >
                    <option value="ALL">All Types</option>
                    <option value="SPLIT">Split</option>
                    <option value="WINDOW">Window</option>
                    <option value="CASSETTE">Cassette</option>
                    <option value="PACKAGE">Package</option>
                    <option value="TOWER">Tower</option>
                    <option value="DUCTABLE">Ductable</option>
                    <option value="VRV_VRF">VRV/VRF</option>
                    <option value="OTHER">Other</option>
                  </select>

                  <select
                    className="select"
                    value={assetWarrantyFilter}
                    onChange={(e) => setAssetWarrantyFilter(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                  >
                    <option value="ALL">All Warranties</option>
                    <option value="UNDER_WARRANTY">Under Warranty</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="AMC_COVERED">AMC Covered</option>
                    <option value="OUT_OF_WARRANTY">Out of Warranty</option>
                  </select>
                </div>

                {isLoadingAssets ? (
                  <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                    Loading AC assets...
                  </div>
                ) : filteredAssets.length === 0 ? (
                  <EmptyState
                    title="No AC Assets Found"
                    description={
                      sites.length === 0
                        ? 'Please register at least one site before adding AC assets.'
                        : 'No AC units match your active filter criteria.'
                    }
                    actionLabel={sites.length > 0 ? '+ Register AC Asset' : undefined}
                    onAction={sites.length > 0 ? () => openAddAssetModal() : undefined}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {filteredAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="card"
                        style={{
                          padding: 'var(--space-3)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--space-2)',
                        }}
                      >
                        {/* 1. Header: Asset Code, Brand + Model, Type + Capacity & Statuses */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-brand)' }}>
                                {asset.assetTag}
                              </span>
                              <span style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                                {asset.brand} {asset.modelNumber ? `• ${asset.modelNumber}` : ''}
                              </span>
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {asset.acType}{asset.capacityTons ? ` • ${asset.capacityTons} Ton` : ''}
                            </div>
                          </div>

                          {/* Secondary Status Badges */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {/* Condition: only surface when attention is required */}
                            {asset.assetCondition && ['Needs Maintenance', 'Poor', 'Critical', 'NEEDS_MAINTENANCE', 'POOR', 'CRITICAL'].includes(asset.assetCondition) && (
                              <Badge variant="warning">
                                {asset.assetCondition.replace('_', ' ').toUpperCase()}
                              </Badge>
                            )}

                            {/* Inactive Asset Status: only surface if inactive */}
                            {(!asset.isActive || asset.assetStatus === 'Inactive' || asset.assetStatus === 'Decommissioned') && (
                              <Badge variant="neutral">
                                INACTIVE
                              </Badge>
                            )}

                            {/* Warranty Status */}
                            <span style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Warranty:</span>
                              <Badge
                                variant={
                                  asset.warrantyStatus === 'UNDER_WARRANTY'
                                    ? 'success'
                                    : asset.warrantyStatus === 'EXPIRING_SOON'
                                    ? 'warning'
                                    : asset.warrantyStatus === 'EXPIRED'
                                    ? 'danger'
                                    : 'neutral'
                                }
                              >
                                {asset.warrantyStatus === 'UNDER_WARRANTY' ? 'ACTIVE' : asset.warrantyStatus.replace('_', ' ')}
                              </Badge>
                            </span>

                            {/* AMC Status (Clean & Concise) */}
                            <span style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>AMC:</span>
                              {(() => {
                                const badge = getAmcBadgeProps(asset.currentAmc);
                                return <Badge variant={badge.variant}>{badge.label}</Badge>;
                              })()}
                            </span>
                          </div>
                        </div>

                        {/* 2. Middle Section: Site & Location */}
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Site: </span>
                            <span style={{ fontWeight: 500 }}>{asset.siteName || 'Residence'}</span>
                          </div>
                          {(asset.floorLocation || asset.roomLocation) && (
                            <div>
                              <span style={{ color: 'var(--text-muted)' }}>Location: </span>
                              <span style={{ fontWeight: 500 }}>
                                {asset.floorLocation ? `${asset.floorLocation}, ` : ''}{asset.roomLocation || ''}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 3. Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', marginTop: '4px' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenAssetDrawer(asset)}
                            leftIcon={<Eye size={12} />}
                            aria-label={`View asset ${asset.assetTag}`}
                          >
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditAssetModal(asset)}
                            leftIcon={<Edit2 size={12} />}
                            aria-label={`Edit asset ${asset.assetTag}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleAssetStatus(asset)}
                            aria-label={`${asset.isActive ? 'Deactivate' : 'Activate'} asset ${asset.assetTag}`}
                          >
                            {asset.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
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

      {/* 10. ADD SITE MODAL */}
      <Modal
        isOpen={isAddSiteModalOpen}
        onClose={() => setIsAddSiteModalOpen(false)}
        title="Add Customer Site"
        description={`Add a physical branch or location for ${selectedCustomer?.name || 'customer'}`}
      >
        <form onSubmit={handleCreateSite} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {siteFormError && (
            <div style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>
              {siteFormError}
            </div>
          )}

          <Input
            label="Site Name *"
            placeholder="e.g. Head Office, Andheri Branch"
            value={siteFormName}
            onChange={(e) => setSiteFormName(e.target.value)}
            required
          />

          <Input
            label="Address *"
            placeholder="Street address, building number, locality"
            value={siteFormAddress}
            onChange={(e) => setSiteFormAddress(e.target.value)}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input
              label="Contact Person"
              placeholder="Site supervisor / facility manager"
              value={siteFormContactPerson}
              onChange={(e) => setSiteFormContactPerson(e.target.value)}
            />

            <Input
              label="Contact Phone"
              placeholder="e.g. 9876543210"
              value={siteFormContactPhone}
              onChange={(e) => setSiteFormContactPhone(e.target.value)}
            />
          </div>

          <Input
            label="Contact Email"
            type="email"
            placeholder="facility@branch.example"
            value={siteFormContactEmail}
            onChange={(e) => setSiteFormContactEmail(e.target.value)}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={siteFormIsPrimary}
              onChange={(e) => setSiteFormIsPrimary(e.target.checked)}
            />
            <span>Set as PRIMARY site for this customer</span>
          </label>

          <Textarea
            label="Operational Notes"
            placeholder="Specific site access guidelines, entry gates, elevator restrictions"
            value={siteFormNotes}
            onChange={(e) => setSiteFormNotes(e.target.value)}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setIsAddSiteModalOpen(false)} disabled={isSubmittingSite}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmittingSite}>
              Save Site
            </Button>
          </div>
        </form>
      </Modal>

      {/* 11. EDIT SITE MODAL */}
      <Modal
        isOpen={!!editingSite}
        onClose={() => setEditingSite(null)}
        title="Edit Customer Site"
        description={`Updating details for site: ${editingSite?.siteName || ''}`}
      >
        <form onSubmit={handleUpdateSite} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {siteFormError && (
            <div style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>
              {siteFormError}
            </div>
          )}

          <Input
            label="Site Name *"
            value={siteFormName}
            onChange={(e) => setSiteFormName(e.target.value)}
            required
          />

          <Input
            label="Address *"
            value={siteFormAddress}
            onChange={(e) => setSiteFormAddress(e.target.value)}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input
              label="Contact Person"
              value={siteFormContactPerson}
              onChange={(e) => setSiteFormContactPerson(e.target.value)}
            />

            <Input
              label="Contact Phone"
              value={siteFormContactPhone}
              onChange={(e) => setSiteFormContactPhone(e.target.value)}
            />
          </div>

          <Input
            label="Contact Email"
            type="email"
            value={siteFormContactEmail}
            onChange={(e) => setSiteFormContactEmail(e.target.value)}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={siteFormIsPrimary}
              onChange={(e) => setSiteFormIsPrimary(e.target.checked)}
            />
            <span>Set as PRIMARY site for this customer</span>
          </label>

          <Textarea
            label="Operational Notes"
            value={siteFormNotes}
            onChange={(e) => setSiteFormNotes(e.target.value)}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setEditingSite(null)} disabled={isSubmittingSite}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmittingSite}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* 12. ADD AC ASSET MODAL */}
      <Modal
        isOpen={isAddAssetModalOpen}
        onClose={() => setIsAddAssetModalOpen(false)}
        isDirty={isAddAssetDirty}
        onConfirmDiscard={() => {
          setIsAddAssetModalOpen(false);
          setAssetFormError(null);
        }}
        title="Register New AC Asset"
        description="Add a physical AC unit to this customer's site register with permanent ESSC asset code"
      >
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <ModalStepWizard
            steps={ASSET_WIZARD_STEPS}
            activeStep={assetWizardStep}
            onStepClick={(step) => setAssetWizardStep(step)}
          />
        </div>

        <form noValidate onSubmit={handleCreateAsset} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '72vh', overflowY: 'auto', paddingRight: '4px' }}>
          {assetFormError && (
            <div style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>
              {assetFormError}
            </div>
          )}

          {/* STEP 1: EQUIPMENT SPECS */}
          <div style={{ display: assetWizardStep === 0 ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* 1. BASIC INFORMATION */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)', marginBottom: 'var(--space-3)' }}>
              1. Basic Information
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Installation Site *
                </label>
                <select
                  className="select"
                  value={assetFormSiteId}
                  onChange={(e) => setAssetFormSiteId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.siteName} {s.isPrimary ? '(PRIMARY)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                    Asset Tag / Code
                  </label>
                  <div
                    style={{
                      padding: '8px 12px',
                      fontSize: 'var(--text-xs)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px dashed var(--border-default)',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{assetFormTag || 'ESSC-XXXX'}</span>
                    <Badge variant="neutral">Auto-generated on registration</Badge>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                    Brand *
                  </label>
                  <select
                    className="select"
                    value={assetFormBrandId}
                    onChange={(e) => handleBrandChange(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                  >
                    <option value="">{isLoadingMasterBrands ? 'Loading brands...' : 'Select AC Brand...'}</option>
                    {availableBrands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 'var(--space-3)' }}>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Model Number *
                </label>
                <select
                  className="select"
                  value={assetFormModelId}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={!assetFormBrandId || isLoadingMasterModels}
                  required
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  <option value="">
                    {isLoadingMasterModels
                      ? 'Loading models...'
                      : !assetFormBrandId
                      ? 'Select brand first'
                      : availableModels.length === 0
                      ? 'No models available for this brand'
                      : 'Select Model...'}
                  </option>
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.modelNumber}
                    </option>
                  ))}
                </select>
              </div>

              {availableVariants.length > 0 && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                    Model Variant (Optional)
                  </label>
                  <select
                    className="select"
                    aria-label="Model Variant"
                    value={assetFormVariantId}
                    onChange={(e) => handleVariantChange(e.target.value)}
                    disabled={isLoadingMasterVariants}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                  >
                    <option value="">Default Model Specifications (No Variant)</option>
                    {availableVariants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.variantCode || `${v.capacityTons}T ${v.starRating || ''} ${v.technology || ''}`.trim()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                    AC Type *
                  </label>
                  <select
                    className="select"
                    value={assetFormType}
                    onChange={(e) => setAssetFormType(e.target.value as AcType)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 'var(--text-sm)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    {AC_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                    Technology
                  </label>
                  <select
                    className="select"
                    value={assetFormTechnology}
                    onChange={(e) => setAssetFormTechnology(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 'var(--text-sm)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <option value="">Select Technology...</option>
                    {TECHNOLOGY_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    {assetFormTechnology && !(TECHNOLOGY_OPTIONS as readonly string[]).includes(assetFormTechnology) && (
                      <option key={assetFormTechnology} value={assetFormTechnology}>
                        {assetFormTechnology}
                      </option>
                    )}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <Input
                    label="Capacity (Tons)"
                    type="number"
                    step="0.1"
                    placeholder="e.g. 1.5"
                    value={assetFormCapacity}
                    onChange={(e) => setAssetFormCapacity(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                    Rating
                  </label>
                  <select
                    className="select"
                    value={assetFormRating}
                    onChange={(e) => setAssetFormRating(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 'var(--text-sm)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <option value="">Select Rating...</option>
                    {RATING_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    {assetFormRating && !RATING_OPTIONS.includes(assetFormRating) && (
                      <option key={assetFormRating} value={assetFormRating}>
                        {assetFormRating}
                      </option>
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                    Refrigerant
                  </label>
                  <select
                    className="select"
                    value={assetFormRefrigerant}
                    onChange={(e) => setAssetFormRefrigerant(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 'var(--text-sm)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <option value="">Select Refrigerant...</option>
                    {REFRIGERANT_OPTIONS.map((ref) => (
                      <option key={ref} value={ref}>
                        {ref}
                      </option>
                    ))}
                    {assetFormRefrigerant && !REFRIGERANT_OPTIONS.includes(assetFormRefrigerant) && (
                      <option key={assetFormRefrigerant} value={assetFormRefrigerant}>
                        {assetFormRefrigerant}
                      </option>
                    )}
                  </select>
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* STEP 2: SERIALS & LOCATION */}
          <div style={{ display: assetWizardStep === 1 ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* 2. UNIT IDENTIFICATION */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)' }}>
                2. Unit Identification
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={assetFormHasSingleSerial}
                  onChange={(e) => setAssetFormHasSingleSerial(e.target.checked)}
                />
                Single unit serial only
              </label>
            </div>

            {assetFormType === 'Window AC' || assetFormType === 'Portable AC' || assetFormType === 'Package AC' || assetFormHasSingleSerial ? (
              <Input
                label="Serial Number *"
                placeholder="e.g. SN-98214451"
                value={assetFormSerial}
                onChange={(e) => setAssetFormSerial(e.target.value)}
                required
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <Input
                  label="Indoor Unit Serial Number *"
                  placeholder="e.g. IDU-DKN-88192"
                  value={assetFormIndoorSerial}
                  onChange={(e) => setAssetFormIndoorSerial(e.target.value)}
                  required
                />
                <Input
                  label="Outdoor Unit Serial Number *"
                  placeholder="e.g. ODU-DKN-77312"
                  value={assetFormOutdoorSerial}
                  onChange={(e) => setAssetFormOutdoorSerial(e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          {/* 3. LOCATION DETAILS */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)', marginBottom: 'var(--space-3)' }}>
              3. Location Details
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Floor Location *
                </label>
                <select
                  className="select"
                  value={assetFormFloor}
                  onChange={(e) => setAssetFormFloor(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  {FLOOR_OPTIONS.map((fl) => (
                    <option key={fl} value={fl}>
                      {fl}
                    </option>
                  ))}
                </select>
                {assetFormFloor === 'Other' && (
                  <Input
                    label=""
                    placeholder="Specify floor..."
                    value={assetFormCustomFloor}
                    onChange={(e) => setAssetFormCustomFloor(e.target.value)}
                    required
                    style={{ marginTop: '6px' }}
                  />
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Room / Cabin Location *
                </label>
                <select
                  className="select"
                  value={assetFormRoom}
                  onChange={(e) => setAssetFormRoom(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  {ROOM_OPTIONS.map((rm) => (
                    <option key={rm} value={rm}>
                      {rm}
                    </option>
                  ))}
                </select>
                {assetFormRoom === 'Other' && (
                  <Input
                    label=""
                    placeholder="Specify room/cabin..."
                    value={assetFormCustomRoom}
                    onChange={(e) => setAssetFormCustomRoom(e.target.value)}
                    required
                    style={{ marginTop: '6px' }}
                  />
                )}
              </div>
            </div>
          </div>
          </div>

          {/* STEP 3: WARRANTY & LIFECYCLE */}
          <div style={{ display: assetWizardStep === 2 ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* 4. DATES & WARRANTY */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)' }}>
                4. Dates & Warranty
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Calculated Status:</span>
                <Badge
                  variant={
                    computeLiveWarrantyStatus(assetFormWarrantyStartDate, assetFormWarrantyEndDate) === 'UNDER_WARRANTY'
                      ? 'success'
                      : computeLiveWarrantyStatus(assetFormWarrantyStartDate, assetFormWarrantyEndDate) === 'EXPIRING_SOON'
                      ? 'warning'
                      : computeLiveWarrantyStatus(assetFormWarrantyStartDate, assetFormWarrantyEndDate) === 'EXPIRED'
                      ? 'danger'
                      : 'neutral'
                  }
                >
                  {computeLiveWarrantyStatus(assetFormWarrantyStartDate, assetFormWarrantyEndDate).replace('_', ' ')}
                </Badge>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <Input
                label="Purchase Date *"
                type="date"
                value={assetFormPurchaseDate}
                onChange={(e) => setAssetFormPurchaseDate(e.target.value)}
                required
              />

              <Input
                label="Installation Date *"
                type="date"
                value={assetFormInstallDate}
                onChange={(e) => setAssetFormInstallDate(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <Input
                label="Warranty Start Date"
                type="date"
                value={assetFormWarrantyStartDate}
                onChange={(e) => handleWarrantyStartDateChange(e.target.value)}
              />

              <div>
                <Input
                  label="Warranty End Date (365-Day Inclusive)"
                  type="date"
                  value={assetFormWarrantyEndDate}
                  onChange={(e) => handleWarrantyEndDateChange(e.target.value)}
                />
                {isWarrantyEndDateOverridden && assetFormWarrantyStartDate && (
                  <div style={{ marginTop: '4px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={handleRestoreDefaultWarrantyEndDate}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-brand)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      Restore 365-day default
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 5. WARRANTY SERVICE ALLOCATION */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)' }}>
                5. Warranty Service Allocation
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Manufacturer Entitlement (Separate from AMC)
              </span>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
              Specify included warranty services provided by the OEM. If the visit breakdown is unknown, record the total count and leave the visit types blank.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
              <Input
                label="Total Warranty Services"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 4"
                value={assetFormTotalWarrantyServices}
                onChange={(e) => setAssetFormTotalWarrantyServices(e.target.value)}
              />

              <Input
                label="Dry Service Visits"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 2"
                value={assetFormDryWarrantyVisits}
                onChange={(e) => setAssetFormDryWarrantyVisits(e.target.value)}
              />

              <Input
                label="Jet Service Visits"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 1"
                value={assetFormJetWarrantyVisits}
                onChange={(e) => setAssetFormJetWarrantyVisits(e.target.value)}
              />

              <Input
                label="Pumpdown Visits"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 1"
                value={assetFormPumpdownWarrantyVisits}
                onChange={(e) => setAssetFormPumpdownWarrantyVisits(e.target.value)}
              />
            </div>

            {/* Reconciliation Feedback */}
            {(() => {
              const parseWarrantyCount = (val: string): number | null => {
                const trimmed = val.trim();
                if (!trimmed) return null;
                const n = Number(trimmed);
                return isNaN(n) ? NaN : n;
              };
              const total = parseWarrantyCount(assetFormTotalWarrantyServices);
              const dry = parseWarrantyCount(assetFormDryWarrantyVisits);
              const jet = parseWarrantyCount(assetFormJetWarrantyVisits);
              const pumpdown = parseWarrantyCount(assetFormPumpdownWarrantyVisits);

              if (total === null && dry === null && jet === null && pumpdown === null) {
                return (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Leave blank if manufacturer warranty visits are not specified.
                  </div>
                );
              }

              const validation = validateWarrantyAllocation({
                totalWarrantyServices: total,
                dryWarrantyVisits: dry,
                jetWarrantyVisits: jet,
                pumpdownWarrantyVisits: pumpdown,
              });

              if (!validation.isValid) {
                return (
                  <div style={{ fontSize: '12px', color: 'var(--color-danger, #ef4444)', fontWeight: 500 }}>
                    ⚠️ {validation.error}
                  </div>
                );
              }

              if (validation.isExplicitAllocation) {
                return (
                  <div style={{ fontSize: '12px', color: 'var(--color-success, #10b981)', fontWeight: 500 }}>
                    ✓ Allocation reconciled: {dry ?? 0} Dry + {jet ?? 0} Jet + {pumpdown ?? 0} Pumpdown = {total} Total Services
                  </div>
                );
              }

              return (
                <div style={{ fontSize: '12px', color: 'var(--color-brand, #2563eb)' }}>
                  ℹ️ Total recorded: {total} services. Visit type breakdown is unspecified (no fabricated values).
                </div>
              );
            })()}
          </div>

          {/* 6. ASSET STATUS */}
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)', marginBottom: 'var(--space-3)' }}>
              6. Asset Status
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Asset Status *
                </label>
                <select
                  className="select"
                  value={assetFormStatus}
                  onChange={(e) => setAssetFormStatus(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  {ASSET_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Asset Condition *
                </label>
                <select
                  className="select"
                  value={assetFormCondition}
                  onChange={(e) => setAssetFormCondition(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  {ASSET_CONDITION_OPTIONS.map((cd) => (
                    <option key={cd} value={cd}>
                      {cd}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Textarea
              label="Technical Notes"
              placeholder="Specific piping details, outdoor unit location, service access requirements (optional)"
              value={assetFormNotes}
              onChange={(e) => setAssetFormNotes(e.target.value)}
            />
          </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
            <ModalCloseButton type="button" disabled={isSubmittingAsset}>
              Cancel
            </ModalCloseButton>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {assetWizardStep > 0 && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setAssetWizardStep((s) => Math.max(0, s - 1))}
                  disabled={isSubmittingAsset}
                >
                  Back
                </Button>
              )}
              {assetWizardStep < 2 && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setAssetWizardStep((s) => Math.min(2, s + 1))}
                >
                  Next Step →
                </Button>
              )}
              <Button variant="primary" type="submit" isLoading={isSubmittingAsset}>
                Register Asset
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* 13. EDIT AC ASSET MODAL */}
      <Modal
        isOpen={!!editingAsset}
        onClose={() => setEditingAsset(null)}
        isDirty={isEditAssetDirty}
        onConfirmDiscard={() => {
          setEditingAsset(null);
          setAssetFormError(null);
        }}
        title={`Edit AC Asset: ${editingAsset?.assetTag || ''}`}
        description="Update specifications, serial numbers, warranty, or condition"
      >
        <form noValidate onSubmit={handleUpdateAsset} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '75vh', overflowY: 'auto', paddingRight: '4px' }}>
          {assetFormError && (
            <div style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>
              {assetFormError}
            </div>
          )}

          {/* 1. BASIC SPECIFICATIONS */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)', marginBottom: 'var(--space-3)' }}>
              1. Basic Information
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <Input
                label="Brand *"
                value={assetFormBrand}
                onChange={(e) => setAssetFormBrand(e.target.value)}
                required
              />

              <Input
                label="Model Number"
                value={assetFormModel}
                onChange={(e) => setAssetFormModel(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  AC Type *
                </label>
                <select
                  className="select"
                  value={assetFormType}
                  onChange={(e) => setAssetFormType(e.target.value as AcType)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  {AC_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Technology
                </label>
                <select
                  className="select"
                  value={assetFormTechnology}
                  onChange={(e) => setAssetFormTechnology(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  <option value="">Select Technology...</option>
                  {TECHNOLOGY_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  {assetFormTechnology && !(TECHNOLOGY_OPTIONS as readonly string[]).includes(assetFormTechnology) && (
                    <option key={assetFormTechnology} value={assetFormTechnology}>
                      {assetFormTechnology}
                    </option>
                  )}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
              <Input
                label="Capacity (Tons)"
                type="number"
                step="0.1"
                value={assetFormCapacity}
                onChange={(e) => setAssetFormCapacity(e.target.value)}
              />

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Rating
                </label>
                <select
                  className="select"
                  value={assetFormRating}
                  onChange={(e) => setAssetFormRating(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  <option value="">Select Rating...</option>
                  {RATING_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  {assetFormRating && !RATING_OPTIONS.includes(assetFormRating) && (
                    <option key={assetFormRating} value={assetFormRating}>
                      {assetFormRating}
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Refrigerant
                </label>
                <select
                  className="select"
                  value={assetFormRefrigerant}
                  onChange={(e) => setAssetFormRefrigerant(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  <option value="">Select Refrigerant...</option>
                  {REFRIGERANT_OPTIONS.map((ref) => (
                    <option key={ref} value={ref}>
                      {ref}
                    </option>
                  ))}
                  {assetFormRefrigerant && !REFRIGERANT_OPTIONS.includes(assetFormRefrigerant) && (
                    <option key={assetFormRefrigerant} value={assetFormRefrigerant}>
                      {assetFormRefrigerant}
                    </option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* 2. UNIT IDENTIFICATION */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)' }}>
                2. Unit Identification
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={assetFormHasSingleSerial}
                  onChange={(e) => setAssetFormHasSingleSerial(e.target.checked)}
                />
                Single serial only
              </label>
            </div>

            {assetFormHasSingleSerial ? (
              <Input
                label="Serial Number"
                value={assetFormSerial}
                onChange={(e) => setAssetFormSerial(e.target.value)}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <Input
                  label="Indoor Unit Serial Number"
                  value={assetFormIndoorSerial}
                  onChange={(e) => setAssetFormIndoorSerial(e.target.value)}
                />
                <Input
                  label="Outdoor Unit Serial Number"
                  value={assetFormOutdoorSerial}
                  onChange={(e) => setAssetFormOutdoorSerial(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* 3. LOCATION DETAILS */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)', marginBottom: 'var(--space-3)' }}>
              3. Location Details
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Floor Location
                </label>
                <select
                  className="select"
                  value={assetFormFloor}
                  onChange={(e) => setAssetFormFloor(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  {FLOOR_OPTIONS.map((fl) => (
                    <option key={fl} value={fl}>
                      {fl}
                    </option>
                  ))}
                </select>
                {assetFormFloor === 'Other' && (
                  <Input
                    label=""
                    placeholder="Specify floor..."
                    value={assetFormCustomFloor}
                    onChange={(e) => setAssetFormCustomFloor(e.target.value)}
                    style={{ marginTop: '6px' }}
                  />
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Room / Cabin Location
                </label>
                <select
                  className="select"
                  value={assetFormRoom}
                  onChange={(e) => setAssetFormRoom(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  {ROOM_OPTIONS.map((rm) => (
                    <option key={rm} value={rm}>
                      {rm}
                    </option>
                  ))}
                </select>
                {assetFormRoom === 'Other' && (
                  <Input
                    label=""
                    placeholder="Specify room/cabin..."
                    value={assetFormCustomRoom}
                    onChange={(e) => setAssetFormCustomRoom(e.target.value)}
                    style={{ marginTop: '6px' }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* 4. DATES & WARRANTY */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)' }}>
                4. Dates & Warranty
              </div>
              <Badge
                variant={
                  computeLiveWarrantyStatus(assetFormWarrantyStartDate, assetFormWarrantyEndDate) === 'UNDER_WARRANTY'
                    ? 'success'
                    : computeLiveWarrantyStatus(assetFormWarrantyStartDate, assetFormWarrantyEndDate) === 'EXPIRING_SOON'
                    ? 'warning'
                    : computeLiveWarrantyStatus(assetFormWarrantyStartDate, assetFormWarrantyEndDate) === 'EXPIRED'
                    ? 'danger'
                    : 'neutral'
                }
              >
                {computeLiveWarrantyStatus(assetFormWarrantyStartDate, assetFormWarrantyEndDate).replace('_', ' ')}
              </Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <Input
                label="Purchase Date"
                type="date"
                value={assetFormPurchaseDate}
                onChange={(e) => setAssetFormPurchaseDate(e.target.value)}
              />
              <Input
                label="Installation Date"
                type="date"
                value={assetFormInstallDate}
                onChange={(e) => setAssetFormInstallDate(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <Input
                label="Warranty Start Date"
                type="date"
                value={assetFormWarrantyStartDate}
                onChange={(e) => handleWarrantyStartDateChange(e.target.value)}
              />

              <div>
                <Input
                  label="Warranty End Date (365-Day Inclusive)"
                  type="date"
                  value={assetFormWarrantyEndDate}
                  onChange={(e) => handleWarrantyEndDateChange(e.target.value)}
                />
                {isWarrantyEndDateOverridden && assetFormWarrantyStartDate && (
                  <div style={{ marginTop: '4px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={handleRestoreDefaultWarrantyEndDate}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-brand)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      Restore 365-day default
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 5. WARRANTY SERVICE ALLOCATION */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)' }}>
                5. Warranty Service Allocation
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Manufacturer Entitlement (Separate from AMC)
              </span>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
              Specify included warranty services provided by the OEM. If the visit breakdown is unknown, record the total count and leave the visit types blank.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
              <Input
                label="Total Warranty Services"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 4"
                value={assetFormTotalWarrantyServices}
                onChange={(e) => setAssetFormTotalWarrantyServices(e.target.value)}
              />

              <Input
                label="Dry Service Visits"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 2"
                value={assetFormDryWarrantyVisits}
                onChange={(e) => setAssetFormDryWarrantyVisits(e.target.value)}
              />

              <Input
                label="Jet Service Visits"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 1"
                value={assetFormJetWarrantyVisits}
                onChange={(e) => setAssetFormJetWarrantyVisits(e.target.value)}
              />

              <Input
                label="Pumpdown Visits"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 1"
                value={assetFormPumpdownWarrantyVisits}
                onChange={(e) => setAssetFormPumpdownWarrantyVisits(e.target.value)}
              />
            </div>

            {/* Reconciliation Feedback */}
            {(() => {
              const parseWarrantyCount = (val: string): number | null => {
                const trimmed = val.trim();
                if (!trimmed) return null;
                const n = Number(trimmed);
                return isNaN(n) ? NaN : n;
              };
              const total = parseWarrantyCount(assetFormTotalWarrantyServices);
              const dry = parseWarrantyCount(assetFormDryWarrantyVisits);
              const jet = parseWarrantyCount(assetFormJetWarrantyVisits);
              const pumpdown = parseWarrantyCount(assetFormPumpdownWarrantyVisits);

              if (total === null && dry === null && jet === null && pumpdown === null) {
                return (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Leave blank if manufacturer warranty visits are not specified.
                  </div>
                );
              }

              const validation = validateWarrantyAllocation({
                totalWarrantyServices: total,
                dryWarrantyVisits: dry,
                jetWarrantyVisits: jet,
                pumpdownWarrantyVisits: pumpdown,
              });

              if (!validation.isValid) {
                return (
                  <div style={{ fontSize: '12px', color: 'var(--color-danger, #ef4444)', fontWeight: 500 }}>
                    ⚠️ {validation.error}
                  </div>
                );
              }

              if (validation.isExplicitAllocation) {
                return (
                  <div style={{ fontSize: '12px', color: 'var(--color-success, #10b981)', fontWeight: 500 }}>
                    ✓ Allocation reconciled: {dry ?? 0} Dry + {jet ?? 0} Jet + {pumpdown ?? 0} Pumpdown = {total} Total Services
                  </div>
                );
              }

              return (
                <div style={{ fontSize: '12px', color: 'var(--color-brand, #2563eb)' }}>
                  ℹ️ Total recorded: {total} services. Visit type breakdown is unspecified (no fabricated values).
                </div>
              );
            })()}
          </div>

          {/* 6. ASSET STATUS & CONDITION */}
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)', marginBottom: 'var(--space-3)' }}>
              6. Asset Status & Condition
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Asset Status
                </label>
                <select
                  className="select"
                  value={assetFormStatus}
                  onChange={(e) => setAssetFormStatus(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  {ASSET_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                  Asset Condition
                </label>
                <select
                  className="select"
                  value={assetFormCondition}
                  onChange={(e) => setAssetFormCondition(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                >
                  {ASSET_CONDITION_OPTIONS.map((cd) => (
                    <option key={cd} value={cd}>
                      {cd}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Textarea
              label="Technical Notes"
              value={assetFormNotes}
              onChange={(e) => setAssetFormNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <ModalCloseButton type="button" disabled={isSubmittingAsset}>
              Cancel
            </ModalCloseButton>
            <Button variant="primary" type="submit" isLoading={isSubmittingAsset}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* 14. VIEW AC ASSET SPECIFICATIONS MODAL */}
      <Modal
        isOpen={!!viewingAsset}
        onClose={() => {
          setViewingAsset(null);
          setShowAssetAmcHistory(false);
          setAssetAmcHistory(null);
          setCopiedSerialKey(null);
        }}
        title={`Asset Specifications: ${viewingAsset?.assetTag || ''}`}
        description={`${viewingAsset?.brand || ''} ${viewingAsset?.modelNumber ? `• ${viewingAsset.modelNumber}` : ''}`}
      >
        {viewingAsset && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '75vh', overflowY: 'auto' }}>
            {/* SECTION A: ASSET IDENTITY & OPERATIONAL STATUSES */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3)',
                backgroundColor: 'var(--bg-surface-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}
            >
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Permanent Asset Code
                </span>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--color-brand)', fontFamily: 'var(--font-mono)' }}>
                  {viewingAsset.assetTag}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {viewingAsset.brand} {viewingAsset.modelNumber ? `• ${viewingAsset.modelNumber}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Asset:</span>
                  <Badge variant={viewingAsset.assetStatus === 'Active' || viewingAsset.isActive ? 'success' : 'neutral'}>
                    {viewingAsset.assetStatus ? viewingAsset.assetStatus.toUpperCase() : viewingAsset.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </Badge>
                </span>
                <span style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Condition:</span>
                  <Badge variant={viewingAsset.assetCondition === 'Excellent' || viewingAsset.assetCondition === 'Good' ? 'neutral' : 'warning'}>
                    {viewingAsset.assetCondition ? viewingAsset.assetCondition.toUpperCase() : 'GOOD'}
                  </Badge>
                </span>
                <span style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Warranty:</span>
                  <Badge
                    variant={
                      viewingAsset.warrantyStatus === 'UNDER_WARRANTY'
                        ? 'success'
                        : viewingAsset.warrantyStatus === 'EXPIRING_SOON'
                        ? 'warning'
                        : viewingAsset.warrantyStatus === 'EXPIRED'
                        ? 'danger'
                        : 'neutral'
                    }
                  >
                    {viewingAsset.warrantyStatus === 'UNDER_WARRANTY' ? 'ACTIVE' : viewingAsset.warrantyStatus.replace('_', ' ')}
                  </Badge>
                </span>
                <span style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>AMC:</span>
                  {(() => {
                    const badge = getAmcBadgeProps(viewingAsset.currentAmc);
                    return <Badge variant={badge.variant}>{badge.label}</Badge>;
                  })()}
                </span>
              </div>
            </div>

            {/* SECTION B: EQUIPMENT IDENTIFICATION (HIGHEST PRIORITY) */}
            <div
              className="card"
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-3)' }}>
                <Hash size={16} style={{ color: 'var(--color-brand)' }} />
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)' }}>
                  Equipment Identification (Unit Serial Numbers)
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
                {/* Indoor Unit Serial */}
                <div
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Indoor Unit Serial (IDU)
                    </span>
                    {viewingAsset.indoorSerialNumber ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopySerial(viewingAsset.indoorSerialNumber!, 'idu')}
                        title="Copy Indoor Unit Serial Number"
                        style={{ height: '24px', padding: '0 6px', fontSize: '11px' }}
                      >
                        {copiedSerialKey === 'idu' ? <Check size={12} style={{ color: 'var(--color-success-solid, #10b981)' }} /> : <Copy size={12} />}
                        <span style={{ marginLeft: '4px' }}>{copiedSerialKey === 'idu' ? 'Copied' : 'Copy'}</span>
                      </Button>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: viewingAsset.indoorSerialNumber ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {viewingAsset.indoorSerialNumber || (viewingAsset.serialNumber ? `${viewingAsset.serialNumber} (Single)` : 'Not recorded')}
                  </div>
                </div>

                {/* Outdoor Unit Serial */}
                <div
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Outdoor Unit Serial (ODU)
                    </span>
                    {viewingAsset.outdoorSerialNumber ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopySerial(viewingAsset.outdoorSerialNumber!, 'odu')}
                        title="Copy Outdoor Unit Serial Number"
                        style={{ height: '24px', padding: '0 6px', fontSize: '11px' }}
                      >
                        {copiedSerialKey === 'odu' ? <Check size={12} style={{ color: 'var(--color-success-solid, #10b981)' }} /> : <Copy size={12} />}
                        <span style={{ marginLeft: '4px' }}>{copiedSerialKey === 'odu' ? 'Copied' : 'Copy'}</span>
                      </Button>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: viewingAsset.outdoorSerialNumber ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {viewingAsset.outdoorSerialNumber || 'Not recorded'}
                  </div>
                </div>
              </div>

              {/* Model Number & Manufacturer context */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)', fontSize: 'var(--text-xs)' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Brand / Manufacturer</span>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{viewingAsset.brand}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Parent Model Number</span>
                  <div style={{ fontWeight: 600, marginTop: '2px', fontFamily: 'var(--font-mono)' }}>{viewingAsset.modelNumber || 'Not recorded'}</div>
                </div>
              </div>
            </div>

            {/* SECTION C: TECHNICAL SPECIFICATIONS */}
            <div className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-2)' }}>
                <Cpu size={16} style={{ color: 'var(--color-brand)' }} />
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Technical Specifications
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>AC Configuration</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{viewingAsset.acType}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Compressor Technology</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>
                    {viewingAsset.technology ? normalizeTechnology(viewingAsset.technology) : 'Standard'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Cooling Capacity</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>
                    {viewingAsset.capacityTons ? `${viewingAsset.capacityTons} Ton` : 'Not recorded'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Energy Efficiency Rating</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{viewingAsset.starRating || 'Not recorded'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Refrigerant Gas</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{viewingAsset.refrigerantType || 'Not recorded'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Operating Condition</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{viewingAsset.assetCondition || 'Good'}</div>
                </div>
              </div>
            </div>

            {/* SECTION D: INSTALLATION AND LOCATION */}
            <div className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-2)' }}>
                <MapPin size={16} style={{ color: 'var(--color-brand)' }} />
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Installation & Location Details
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Customer Account</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>
                    {viewingAsset.customerName || selectedCustomer?.name || 'Customer'}
                    {viewingAsset.customerCode ? ` (${viewingAsset.customerCode})` : selectedCustomer?.customerCode ? ` (${selectedCustomer.customerCode})` : ''}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Installation Site</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{viewingAsset.siteName || 'Residence'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Floor Level</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{viewingAsset.floorLocation || 'Ground Floor'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Room / Cabin Location</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{viewingAsset.roomLocation || 'General Area'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Equipment Purchase Date</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{viewingAsset.purchaseDate || 'Not recorded'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>On-site Commissioning Date</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{viewingAsset.installationDate || 'Not recorded'}</div>
                </div>
              </div>
            </div>

            {/* SECTION E: WARRANTY COVERAGE */}
            <div className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={16} style={{ color: 'var(--color-brand)' }} />
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    Manufacturer Warranty
                  </span>
                </div>
                <span style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Status:</span>
                  <Badge
                    variant={
                      viewingAsset.warrantyStatus === 'UNDER_WARRANTY'
                        ? 'success'
                        : viewingAsset.warrantyStatus === 'EXPIRING_SOON'
                        ? 'warning'
                        : viewingAsset.warrantyStatus === 'EXPIRED'
                        ? 'danger'
                        : 'neutral'
                    }
                  >
                    {viewingAsset.warrantyStatus === 'UNDER_WARRANTY' ? 'ACTIVE' : viewingAsset.warrantyStatus.replace('_', ' ')}
                  </Badge>
                </span>
              </div>
              <div style={{ fontSize: 'var(--text-xs)' }}>
                <div style={{ color: 'var(--text-muted)' }}>Coverage Period</div>
                <div style={{ fontWeight: 600, marginTop: '2px' }}>
                  {viewingAsset.warrantyStartDate && viewingAsset.warrantyEndDate
                    ? `${viewingAsset.warrantyStartDate} → ${viewingAsset.warrantyEndDate}`
                    : viewingAsset.warrantyEndDate
                    ? `Expires: ${viewingAsset.warrantyEndDate}`
                    : 'No warranty dates registered'}
                </div>

                {/* Dedicated Warranty Service Allocation Display */}
                <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>Warranty Service Allocation:</div>
                  {viewingAsset.totalWarrantyServices !== null && viewingAsset.totalWarrantyServices !== undefined ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <Badge variant="brand">Total: {viewingAsset.totalWarrantyServices} Services</Badge>
                      {viewingAsset.dryWarrantyVisits !== null && viewingAsset.dryWarrantyVisits !== undefined ? (
                        <span style={{ color: 'var(--text-secondary)' }}>• Dry: {viewingAsset.dryWarrantyVisits}</span>
                      ) : null}
                      {viewingAsset.jetWarrantyVisits !== null && viewingAsset.jetWarrantyVisits !== undefined ? (
                        <span style={{ color: 'var(--text-secondary)' }}>• Jet: {viewingAsset.jetWarrantyVisits}</span>
                      ) : null}
                      {viewingAsset.pumpdownWarrantyVisits !== null && viewingAsset.pumpdownWarrantyVisits !== undefined ? (
                        <span style={{ color: 'var(--text-secondary)' }}>• Pumpdown: {viewingAsset.pumpdownWarrantyVisits}</span>
                      ) : null}
                      {viewingAsset.dryWarrantyVisits === null && viewingAsset.jetWarrantyVisits === null && viewingAsset.pumpdownWarrantyVisits === null && (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>(Breakdown unspecified)</span>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No warranty service count recorded</div>
                  )}
                </div>

                <div style={{ color: 'var(--text-secondary)', marginTop: '6px', fontSize: '11px' }}>
                  Warranty entitlements and AMC obligations are independent; warranty counts do not consume AMC visit balances.
                </div>
              </div>
            </div>

            {/* 4. CURRENT AMC */}
            <div
              className="card"
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                backgroundColor: viewingAsset.currentAmc ? 'var(--color-brand-subtle, rgba(37, 99, 235, 0.04))' : 'var(--bg-surface-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileCheck2 size={16} style={{ color: 'var(--color-brand)' }} />
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-brand)' }}>
                    Current AMC
                  </span>
                </div>
                {(() => {
                  const badge = getAmcBadgeProps(viewingAsset.currentAmc);
                  return <Badge variant={badge.variant}>{badge.label}</Badge>;
                })()}
              </div>

              {viewingAsset.currentAmc ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {viewingAsset.currentAmc.contractNumber}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: '8px' }}>
                        {viewingAsset.currentAmc.frequency}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      {viewingAsset.currentAmc.startDate} → {viewingAsset.currentAmc.endDate}
                    </div>
                  </div>

                  {/* Visit Progress: Single clean metric */}
                  <div style={{ backgroundColor: 'var(--bg-surface)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>PM Visit Progress</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-brand)' }}>
                      {viewingAsset.currentAmc.completedVisits} / {viewingAsset.currentAmc.totalVisits} Completed
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    {onNavigate && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setViewingAsset(null);
                          setShowAssetAmcHistory(false);
                          setAssetAmcHistory(null);
                          onNavigate('amc');
                        }}
                      >
                        View AMC
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleAssetAmcHistory(viewingAsset.id)}
                      isLoading={isLoadingAssetAmcHistory}
                    >
                      {showAssetAmcHistory ? 'Hide AMC History' : 'AMC History'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    No Active AMC
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {onNavigate && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setViewingAsset(null);
                          setShowAssetAmcHistory(false);
                          setAssetAmcHistory(null);
                          onNavigate('amc');
                        }}
                      >
                        Create AMC
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleAssetAmcHistory(viewingAsset.id)}
                      isLoading={isLoadingAssetAmcHistory}
                    >
                      {showAssetAmcHistory ? 'Hide AMC History' : 'AMC History'}
                    </Button>
                  </div>
                </div>
              )}

              {/* AMC HISTORY SUB-SECTION (LOADED ON DEMAND) */}
              {showAssetAmcHistory && (
                <div
                  style={{
                    marginTop: 'var(--space-3)',
                    paddingTop: 'var(--space-3)',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                    AMC HISTORY — {viewingAsset.assetTag}
                  </div>

                  {isLoadingAssetAmcHistory ? (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: 'var(--space-2)' }}>
                      Loading historical contracts...
                    </div>
                  ) : !assetAmcHistory || (assetAmcHistory.history.length === 0 && !assetAmcHistory.currentAmc) ? (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: 'var(--space-2)' }}>
                      No historical AMC contracts found for this asset.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                      {/* Current AMC item if available */}
                      {assetAmcHistory.currentAmc && (
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-brand)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                            CURRENT
                          </div>
                          <div
                            style={{
                              padding: 'var(--space-2)',
                              backgroundColor: 'var(--bg-surface)',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--color-brand)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--color-brand)' }}>
                                {assetAmcHistory.currentAmc.contractNumber}
                              </span>
                              <Badge variant="brand">{assetAmcHistory.currentAmc.status}</Badge>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                              <span>{assetAmcHistory.currentAmc.startDate} → {assetAmcHistory.currentAmc.endDate}</span>
                              <span style={{ fontWeight: 600 }}>{assetAmcHistory.currentAmc.completedVisits} / {assetAmcHistory.currentAmc.totalVisits} Completed</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* History items */}
                      {(() => {
                        const historicalContracts = assetAmcHistory.history.filter(
                          (h) => !assetAmcHistory.currentAmc || h.id !== assetAmcHistory.currentAmc.id
                        );
                        if (historicalContracts.length === 0) return null;
                        return (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                              HISTORY
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                              {historicalContracts.map((h) => (
                                <div
                                  key={h.id}
                                  style={{
                                    padding: 'var(--space-2)',
                                    backgroundColor: 'var(--bg-surface)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-subtle)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 600, fontSize: 'var(--text-xs)' }}>{h.contractNumber}</span>
                                    <Badge
                                      variant={
                                        h.status === 'ACTIVE'
                                          ? 'success'
                                          : h.status === 'RENEWED'
                                          ? 'brand'
                                          : h.status === 'EXPIRED'
                                          ? 'danger'
                                          : 'neutral'
                                      }
                                    >
                                      {h.status}
                                    </Badge>
                                  </div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                                    <span>{h.startDate} → {h.endDate}</span>
                                    <span>{h.completedVisits} / {h.totalVisits} Completed</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 5. ASSET RELIABILITY & MAINTENANCE INTELLIGENCE */}
            <div
              className="card"
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={16} style={{ color: 'var(--color-brand)' }} />
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
                    Asset Reliability & Health
                  </span>
                </div>
                {assetHealth && (
                  <Badge
                    variant={
                      assetHealth.reliabilityRating === 'EXCELLENT'
                        ? 'success'
                        : assetHealth.reliabilityRating === 'GOOD'
                        ? 'brand'
                        : assetHealth.reliabilityRating === 'FAIR'
                        ? 'warning'
                        : 'danger'
                    }
                  >
                    {assetHealth.reliabilityRating} ({assetHealth.reliabilityScore}/100)
                  </Badge>
                )}
              </div>

              {isLoadingAssetHealth ? (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: 'var(--space-2)' }}>
                  Calculating equipment reliability index...
                </div>
              ) : !assetHealth ? (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  Reliability metrics will populate as service visits and inspection reports are logged.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {/* Reliability Score Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      <span>Equipment Reliability Index</span>
                      <span style={{ fontWeight: 600 }}>{assetHealth.reliabilityScore}%</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${assetHealth.reliabilityScore}%`,
                          height: '100%',
                          backgroundColor:
                            assetHealth.reliabilityScore >= 85
                              ? '#10b981'
                              : assetHealth.reliabilityScore >= 70
                              ? 'var(--color-brand)'
                              : assetHealth.reliabilityScore >= 50
                              ? '#f59e0b'
                              : '#ef4444',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* 4 Metrics Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <div style={{ padding: 'var(--space-2)', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Service Visits</div>
                      <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                        {assetHealth.metrics.totalServiceVisits}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {assetHealth.metrics.preventiveCount} PM / {assetHealth.metrics.breakdownCount} Breakdown
                      </div>
                    </div>

                    <div style={{ padding: 'var(--space-2)', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Refrigerant Status</div>
                      <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: assetHealth.metrics.refrigerantLeakIncidents > 0 ? '#ef4444' : '#10b981', marginTop: '2px' }}>
                        {assetHealth.metrics.totalRefrigerantAddedKg > 0 ? `${assetHealth.metrics.totalRefrigerantAddedKg} kg` : 'Intact'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {assetHealth.metrics.refrigerantLeakIncidents > 0 ? `${assetHealth.metrics.refrigerantLeakIncidents} top-up incident(s)` : 'No leaks recorded'}
                      </div>
                    </div>

                    <div style={{ padding: 'var(--space-2)', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Parts Replaced</div>
                      <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                        {assetHealth.metrics.totalPartsReplaced}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                        Components replaced
                      </div>
                    </div>

                    <div style={{ padding: 'var(--space-2)', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Last Serviced</div>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                        {assetHealth.metrics.lastServiceDate || 'None'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {assetHealth.metrics.daysSinceLastService !== null ? `${assetHealth.metrics.daysSinceLastService} days ago` : 'No past visit'}
                      </div>
                    </div>
                  </div>

                  {/* Toggle Timeline Button */}
                  {assetHealth.timeline.length > 0 && (
                    <div style={{ marginTop: '2px' }}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAssetHealthTimeline((prev) => !prev)}
                        leftIcon={<Clock size={14} />}
                      >
                        {showAssetHealthTimeline ? 'Hide Maintenance Timeline' : `Maintenance Activity Timeline (${assetHealth.timeline.length})`}
                      </Button>
                    </div>
                  )}

                  {/* Maintenance Timeline */}
                  {showAssetHealthTimeline && assetHealth.timeline.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                        paddingTop: 'var(--space-2)',
                        borderTop: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Activity Timeline
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: '280px', overflowY: 'auto' }}>
                        {assetHealth.timeline.map((event) => (
                          <div
                            key={event.id}
                            style={{
                              padding: 'var(--space-2)',
                              backgroundColor: 'var(--bg-surface-subtle)',
                              borderRadius: 'var(--radius-sm)',
                              borderLeft: `3px solid ${
                                event.type === 'BREAKDOWN'
                                  ? '#ef4444'
                                  : event.type === 'REFRIGERANT_ADDED'
                                  ? '#f59e0b'
                                  : event.type === 'PARTS_REPLACED'
                                  ? 'var(--color-brand)'
                                  : '#10b981'
                              }`,
                              fontSize: 'var(--text-xs)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{event.title}</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{event.date}</span>
                            </div>
                            <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>{event.description}</div>
                            {(event.technicianName || event.reportNumber) && (
                              <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {event.technicianName && <span>Tech: {event.technicianName}</span>}
                                {event.reportNumber && <span>Report: {event.reportNumber}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {viewingAsset.notes && (
              <div className="card" style={{ padding: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>Technical Notes:</div>
                <div>{viewingAsset.notes}</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setViewingAsset(null);
                  setShowAssetAmcHistory(false);
                  setAssetAmcHistory(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
