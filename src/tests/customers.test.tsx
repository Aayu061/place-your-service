import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { CustomerManagement } from '@/pages/CustomerManagement';
import { AuthContext, AuthContextType } from '@/context/authContextDef';
import { ToastProvider } from '@/components/ui/Toast';
import { apiClient, ApiError } from '@/services/api/client';
import { Customer } from '@/domain/types';

describe('Phase 4 Frontend Customer Management Suite', () => {
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
    id: 'cust-123',
    customerCode: 'CUST-100200',
    name: 'Metropolitan Hospital',
    companyName: 'Metro Health Ltd',
    customerType: 'TEMPORARY',
    phone: '9876543210',
    alternatePhone: '9876543211',
    email: 'facility@metro.example',
    address: 'Sector 5, Salt Lake',
    city: 'Kolkata',
    state: 'West Bengal',
    postalCode: '700091',
    notes: '24x7 emergency backup critical',
    isActive: true,
    siteName: 'Main Hospital Building',
    siteContactPerson: 'Dr. Sen',
    siteContactPhone: '9876543210',
    sitesCount: 1,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
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

  it('1. Renders customer management view with header, actions, and search bar', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      customers: [sampleCustomer],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    expect(renderResult.container.textContent).toContain('Customers');
    expect(renderResult.container.textContent).toContain('Manage customer accounts, branch locations');
    expect(renderResult.container.textContent).toContain('Add Customer');
    expect(renderResult.container.textContent).toContain('Refresh');

    renderResult.cleanup();
  });

  it('2. Displays customer list table with code, name, classification badge, and phone', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      customers: [sampleCustomer],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    expect(renderResult.container.textContent).toContain('CUST-100200');
    expect(renderResult.container.textContent).toContain('Metropolitan Hospital');
    expect(renderResult.container.textContent).toContain('Metro Health Ltd');
    expect(renderResult.container.textContent).toContain('TEMPORARY');
    expect(renderResult.container.textContent).toContain('9876543210');
    expect(renderResult.container.textContent).toContain('Active');

    renderResult.cleanup();
  });

  it('3. Renders EmptyState when zero customer records exist', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      customers: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    expect(renderResult.container.textContent).toContain('No customers registered');
    expect(renderResult.container.textContent).toContain('Add your first customer to begin');

    renderResult.cleanup();
  });

  it('4. Opens Add Customer modal when "+ Add Customer" button is clicked', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      customers: [sampleCustomer],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const addBtn = Array.from(renderResult.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Customer')
    );
    expect(addBtn).toBeDefined();

    await act(async () => {
      addBtn?.click();
    });

    expect(document.body.textContent).toContain('Register New Customer');
    expect(document.body.textContent).toContain('Customer / Client Name');
    expect(document.body.textContent).toContain('Primary Phone Number');
    expect(document.body.textContent).toContain('Street Address');

    renderResult.cleanup();
  });

  it('5. Opens Customer Detail drawer when view button is clicked', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      customers: [sampleCustomer],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    expect(viewBtn).toBeDefined();

    await act(async () => {
      viewBtn?.click();
    });

    expect(document.body.textContent).toContain('Metropolitan Hospital');
    expect(document.body.textContent).toContain('Code: CUST-100200');
    expect(document.body.textContent).toContain('Contact Information');
    expect(document.body.textContent).toContain('Location & Site Contact');
    expect(document.body.textContent).toContain('Planned in Phase 5');
    expect(document.body.textContent).toContain('Planned in Phase 6');
    expect(document.body.textContent).toContain('Planned in Phase 7');

    renderResult.cleanup();
  });

  it('6. Opens Convert to Permanent confirmation modal for TEMPORARY customer', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      customers: [sampleCustomer],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const convertBtn = renderResult.container.querySelector(
      'button[aria-label="Convert to Permanent"]'
    ) as HTMLButtonElement;
    expect(convertBtn).toBeDefined();

    await act(async () => {
      convertBtn?.click();
    });

    expect(document.body.textContent).toContain('Convert Customer to PERMANENT');
    expect(document.body.textContent).toContain('The customer ID and code (CUST-100200) will be strictly preserved.');
    expect(document.body.textContent).toContain('Confirm Conversion');

    renderResult.cleanup();
  });

  it('7. Displays error alert banner when API request fails', async () => {
    vi.spyOn(apiClient, 'request').mockRejectedValue(
      new ApiError(500, 'SERVER_ERROR', 'Network connection timeout')
    );

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    expect(renderResult.container.textContent).toContain('Network connection timeout');
    expect(renderResult.container.textContent).toContain('Retry');

    renderResult.cleanup();
  });

  it('8. Renders compact Back button in Customer Detail header, and clicking it returns to customers list', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      customers: [sampleCustomer],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    const mockNavigate = vi.fn();
    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement onNavigate={mockNavigate} />);
    });

    // Open Customer Detail drawer
    const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    expect(viewBtn).toBeDefined();

    await act(async () => {
      viewBtn.click();
    });

    // Back button exists in the drawer header
    const backBtn = document.body.querySelector('#customer-detail-back-btn') as HTMLButtonElement;
    expect(backBtn).not.toBeNull();
    expect(backBtn.textContent).toContain('Back');
    expect(backBtn.getAttribute('aria-label')).toBe('Back to customers list');
    expect(backBtn.getAttribute('type')).toBe('button');

    // Existing badges and actions remain intact in the drawer
    expect(document.body.textContent).toContain('Metropolitan Hospital');
    expect(document.body.textContent).toContain('TEMPORARY');
    expect(document.body.textContent).toContain('+ Service Request');
    expect(document.body.textContent).toContain('Edit');

    // Click Back
    await act(async () => {
      backBtn.click();
    });

    // Customer Detail drawer is closed and fallback navigation triggered
    expect(document.body.querySelector('#customer-detail-back-btn')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('customers');

    renderResult.cleanup();
  });

  it('9. Opens Customer Detail directly from URL query param and Back button navigates to list', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      customers: [sampleCustomer],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    // Mock URL with ?customerId=cust-123
    const originalLocation = window.location;
    // @ts-expect-error mock location
    delete window.location;
    // @ts-expect-error mock location
    window.location = new URL('http://localhost:5173/?customerId=cust-123');

    const mockNavigate = vi.fn();
    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement onNavigate={mockNavigate} />);
    });

    // Customer detail opens automatically via URL
    expect(document.body.textContent).toContain('Metropolitan Hospital');
    expect(document.body.textContent).toContain('Code: CUST-100200');

    const backBtn = document.body.querySelector('#customer-detail-back-btn') as HTMLButtonElement;
    expect(backBtn).not.toBeNull();

    // Click Back
    await act(async () => {
      backBtn.click();
    });

    expect(document.body.querySelector('#customer-detail-back-btn')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('customers');

    window.location = originalLocation;
    renderResult.cleanup();
  });

  it('10. Customer Detail Back button supports keyboard focus and visible focus state', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      customers: [sampleCustomer],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    await act(async () => {
      viewBtn.click();
    });

    const backBtn = document.body.querySelector('#customer-detail-back-btn') as HTMLButtonElement;
    expect(backBtn).not.toBeNull();

    // Verify focusable
    backBtn.focus();
    expect(document.activeElement).toBe(backBtn);

    renderResult.cleanup();
  });
});
