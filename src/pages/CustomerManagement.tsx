import React, { useState, useEffect, useCallback } from 'react';
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
  Edit2,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Layers,
  Wrench,
  Receipt,
  FileCheck2,
} from 'lucide-react';
import { apiClient, ApiError } from '@/services/api/client';
import { Customer, CustomerType } from '@/domain/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useToast } from '@/components/ui/useToast';

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

interface CustomerListMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const CustomerManagement: React.FC<{ onNavigate?: (item: string) => void }> = () => {
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
        description="Create a temporary or permanent customer account with site details."
        maxWidth="680px"
      >
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
                onClick={() => setIsAddModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
              >
                Register Customer
              </Button>
            </div>
          </div>
        </form>
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
      </Modal>

      {/* 9. CUSTOMER DETAIL DRAWER */}
      <Drawer
        isOpen={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        title={selectedCustomer?.name || 'Customer Profile'}
        description={`Code: ${selectedCustomer?.customerCode || ''}`}
        width="560px"
      >
        {selectedCustomer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
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

            {/* Planned Modules Architecture Sections (Truthful Placeholders as per Section 22) */}
            <div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Linked Operational Modules
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={14} style={{ color: 'var(--color-brand)' }} />
                    <span>Sites & Branch Locations</span>
                  </div>
                  <Badge variant="neutral">Planned in Phase 5</Badge>
                </div>

                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Wrench size={14} style={{ color: 'var(--color-brand)' }} />
                    <span>AC Asset Register</span>
                  </div>
                  <Badge variant="neutral">Planned in Phase 5</Badge>
                </div>

                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} style={{ color: 'var(--color-brand)' }} />
                    <span>Service Requests & Work Orders</span>
                  </div>
                  <Badge variant="neutral">Planned in Phase 6</Badge>
                </div>

                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileCheck2 size={14} style={{ color: 'var(--color-brand)' }} />
                    <span>AMC Preventive Contracts</span>
                  </div>
                  <Badge variant="neutral">Planned in Phase 7</Badge>
                </div>

                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Receipt size={14} style={{ color: 'var(--color-brand)' }} />
                    <span>Payment History & Invoices</span>
                  </div>
                  <Badge variant="neutral">Planned in Phase 10</Badge>
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
      </Drawer>
    </div>
  );
};
