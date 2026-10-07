import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { ServiceRequestManagement } from '@/pages/ServiceRequestManagement';
import { AuthContext, AuthContextType } from '@/context/authContextDef';
import { ToastProvider } from '@/components/ui/Toast';
import { apiClient } from '@/services/api/client';
import { ServiceRequest, Customer, CustomerSite, AcAsset } from '@/domain/types';

describe('Phase 6 Frontend Service Request Management Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockAdminUser = {
    id: 'admin-1',
    email: 'admin@pys.internal',
    fullName: 'System Administrator',
    role: 'ADMIN' as const,
    isActive: true,
  };

  const sampleCustomer: Customer = {
    id: 'cust-100',
    customerCode: 'CUST-00100',
    name: 'Apollo Hospital',
    companyName: 'Apollo Healthcare Ltd',
    customerType: 'PERMANENT',
    phone: '9876543210',
    email: 'apollo@health.example',
    address: 'Greams Road',
    city: 'Chennai',
    state: 'Tamil Nadu',
    postalCode: '600006',
    isActive: true,
    siteName: 'Main Facility',
    sitesCount: 1,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  };

  const sampleSite: CustomerSite = {
    id: 'site-1',
    customerId: 'cust-100',
    siteName: 'Main Hospital Block',
    address: '10 Greams Road',
    city: 'Chennai',
    state: 'Tamil Nadu',
    postalCode: '600006',
    contactPerson: 'Dr. Ramesh',
    contactPhone: '9876543210',
    isPrimary: true,
    isActive: true,
    assetCount: 1,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  };

  const sampleAsset: AcAsset = {
    id: 'asset-1',
    assetTag: 'AC-001',
    siteId: 'site-1',
    brand: 'Daikin',
    modelNumber: 'FTKM50',
    acType: 'SPLIT',
    capacityTons: 1.5,
    serialNumber: 'DK-998877',
    warrantyStatus: 'UNDER_WARRANTY',
    isActive: true,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  };

  const sampleRequest: ServiceRequest = {
    id: 'sr-100',
    requestNumber: 'SR-2026-000101',
    customerId: 'cust-100',
    siteId: 'site-1',
    assetId: 'asset-1',
    requestType: 'BREAKDOWN',
    priority: 'HIGH',
    status: 'REQUESTED',
    description: 'ICU air conditioner not cooling, temperature rising',
    reportedDate: '2026-10-07T10:00:00Z',
    preferredDate: '2026-10-08',
    notes: 'Access via rear service elevator',
    createdAt: '2026-10-07T10:00:00Z',
    updatedAt: '2026-10-07T10:00:00Z',
    customerName: 'Apollo Hospital',
    customerCode: 'CUST-00100',
    customerPhone: '9876543210',
    siteName: 'Main Hospital Block',
    siteAddress: '10 Greams Road',
    assetTag: 'AC-001',
    assetBrand: 'Daikin',
    assetModel: 'FTKM50',
  };

  const renderWithProviders = (
    ui: React.ReactNode,
    authOverrides: Partial<AuthContextType> = {}
  ) => {
    const defaultAuth: AuthContextType = {
      user: mockAdminUser,
      session: null,
      isLoading: false,
      error: null,
      login: vi.fn().mockResolvedValue({ success: true }),
      logout: vi.fn().mockResolvedValue(undefined),
      clearError: vi.fn(),
      refreshUser: vi.fn().mockResolvedValue(undefined),
      ...authOverrides,
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ToastProvider>
          <AuthContext.Provider value={defaultAuth}>
            {ui}
          </AuthContext.Provider>
        </ToastProvider>
      );
    });

    return {
      container,
      cleanup: () => {
        act(() => {
          root.unmount();
        });
        container.remove();
      },
    };
  };

  const setInputValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (nativeValueSetter) {
      nativeValueSetter.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  it('1. Renders service request management header, actions, and search bar', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      requests: [sampleRequest],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<ServiceRequestManagement />);
    });

    expect(document.body.textContent).toContain('Service Requests');
    expect(document.body.textContent).toContain('Track customer service requirements and operational requests.');
    expect(document.body.querySelector('#btn-new-service-request')).toBeTruthy();
    expect(document.body.querySelector('input[placeholder*="Search by code"]')).toBeTruthy();

    renderResult.cleanup();
  });

  it('2. Displays service requests table with request ID, customer, site, scope, and status badge', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      requests: [sampleRequest],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<ServiceRequestManagement />);
    });

    expect(document.body.textContent).toContain('SR-2026-000101');
    expect(document.body.textContent).toContain('Apollo Hospital');
    expect(document.body.textContent).toContain('Main Hospital Block');
    expect(document.body.textContent).toContain('AC ASSET');
    expect(document.body.textContent).toContain('AC-001');
    expect(document.body.textContent).toContain('BREAKDOWN');
    expect(document.body.textContent).toContain('HIGH');
    expect(document.body.textContent).toContain('Requested');

    renderResult.cleanup();
  });

  it('3. Renders EmptyState when zero service requests exist', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      requests: [],
      total: 0,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<ServiceRequestManagement />);
    });

    expect(document.body.textContent).toContain('No service requests yet');
    expect(document.body.textContent).toContain('Create Service Request');

    renderResult.cleanup();
  });

  it('4. Opens Create Service Request modal and handles cascading customer -> site -> asset selectors', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/service-requests') {
        return { requests: [], total: 0 };
      }
      if (endpoint === '/customers') {
        return { customers: [sampleCustomer] };
      }
      if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
        return { sites: [sampleSite] };
      }
      if (endpoint.includes('/assets')) {
        return { assets: [sampleAsset] };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<ServiceRequestManagement />);
    });

    const newBtn = document.body.querySelector('#btn-new-service-request') as HTMLButtonElement;
    expect(newBtn).toBeTruthy();
    await act(async () => {
      newBtn.click();
    });

    expect(document.body.textContent).toContain('Create Service Request');

    // Customer selector exists
    const customerSelect = document.body.querySelector('#select-customer') as HTMLSelectElement;
    expect(customerSelect).toBeTruthy();

    // Select customer
    await act(async () => {
      customerSelect.value = 'cust-100';
      customerSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Site selector should now have the site
    const siteSelect = document.body.querySelector('#select-site') as HTMLSelectElement;
    expect(siteSelect).toBeTruthy();

    renderResult.cleanup();
  });

  it('5. Submits new service request and opens detail view', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/service-requests') {
        return { requests: [sampleRequest], total: 1 };
      }
      if (endpoint === `/service-requests/${sampleRequest.id}`) {
        return { request: sampleRequest };
      }
      if (endpoint === '/customers') {
        return { customers: [sampleCustomer] };
      }
      if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
        return { sites: [sampleSite] };
      }
      if (endpoint.includes('/assets')) {
        return { assets: [sampleAsset] };
      }
      return {};
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      request: sampleRequest,
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<ServiceRequestManagement />);
    });

    const newBtn = document.body.querySelector('#btn-new-service-request') as HTMLButtonElement;
    await act(async () => {
      newBtn.click();
    });

    // Populate required fields
    const customerSelect = document.body.querySelector('#select-customer') as HTMLSelectElement;
    await act(async () => {
      customerSelect.value = 'cust-100';
      customerSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const siteSelect = document.body.querySelector('#select-site') as HTMLSelectElement;
    await act(async () => {
      siteSelect.value = 'site-1';
      siteSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const descInput = document.body.querySelector('#input-problem-description') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(descInput, 'Refrigerant leak detected in conference room');
    });

    const submitBtn = document.body.querySelector('#btn-submit-service-request') as HTMLButtonElement;
    expect(submitBtn).toBeTruthy();

    await act(async () => {
      submitBtn.click();
    });

    expect(postSpy).toHaveBeenCalled();

    renderResult.cleanup();
  });

  it('6. Opens Service Request Detail Drawer and renders details, scope, and lifecycle timeline', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/service-requests') {
        return { requests: [sampleRequest], total: 1 };
      }
      if (endpoint === `/service-requests/${sampleRequest.id}`) {
        return { request: sampleRequest };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<ServiceRequestManagement />);
    });

    const viewBtn = document.body.querySelector('button[aria-label="View SR-2026-000101"]') as HTMLButtonElement;
    expect(viewBtn).toBeTruthy();

    await act(async () => {
      viewBtn.click();
    });

    expect(document.body.textContent).toContain('SR-2026-000101');
    expect(document.body.textContent).toContain('ICU air conditioner not cooling');
    expect(document.body.textContent).toContain('LIFECYCLE TIMELINE');
    expect(document.body.textContent).toContain('REQUESTED');

    renderResult.cleanup();
  });

  it('7. Transitions status to PENDING via status transition modal', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/service-requests') {
        return { requests: [sampleRequest], total: 1 };
      }
      if (endpoint === `/service-requests/${sampleRequest.id}`) {
        return { request: sampleRequest };
      }
      return {};
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      request: {
        ...sampleRequest,
        status: 'PENDING',
      },
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<ServiceRequestManagement />);
    });

    // Open detail
    const viewBtn = document.body.querySelector('button[aria-label="View SR-2026-000101"]') as HTMLButtonElement;
    await act(async () => {
      viewBtn.click();
    });

    // Click "Move to Pending" button
    const pendingBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Move to Pending')
    );
    expect(pendingBtn).toBeTruthy();

    await act(async () => {
      pendingBtn?.click();
    });

    expect(document.body.textContent).toContain('Transition Service Request Status');

    // Confirm transition
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm to PENDING')
    );
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      confirmBtn?.click();
    });

    expect(postSpy).toHaveBeenCalledWith(
      `/service-requests/${sampleRequest.id}/status`,
      expect.objectContaining({ status: 'PENDING' })
    );

    renderResult.cleanup();
  });

  it('8. Cancels service request with confirmation and reason', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/service-requests') {
        return { requests: [sampleRequest], total: 1 };
      }
      if (endpoint === `/service-requests/${sampleRequest.id}`) {
        return { request: sampleRequest };
      }
      return {};
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      request: {
        ...sampleRequest,
        status: 'CANCELLED',
        cancellationReason: 'Client resolved issue internally',
      },
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<ServiceRequestManagement />);
    });

    // Open detail
    const viewBtn = document.body.querySelector('button[aria-label="View SR-2026-000101"]') as HTMLButtonElement;
    await act(async () => {
      viewBtn.click();
    });

    // Click "Cancel Request" button
    const cancelBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel Request')
    );
    expect(cancelBtn).toBeTruthy();

    await act(async () => {
      cancelBtn?.click();
    });

    expect(document.body.textContent).toContain('Cancel Service Request');
    expect(document.body.textContent).toContain('The service request will be marked as cancelled');

    const reasonInput = document.body.querySelector('#input-cancellation-reason') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(reasonInput, 'Client resolved issue internally');
    });

    const confirmCancelBtn = document.body.querySelector('#btn-confirm-cancel') as HTMLButtonElement;
    await act(async () => {
      confirmCancelBtn.click();
    });

    expect(postSpy).toHaveBeenCalledWith(
      `/service-requests/${sampleRequest.id}/cancel`,
      expect.objectContaining({ reason: 'Client resolved issue internally' })
    );

    renderResult.cleanup();
  });
});
