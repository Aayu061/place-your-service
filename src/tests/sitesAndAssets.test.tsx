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
import { Customer, CustomerSite, AcAsset } from '@/domain/types';

describe('Phase 5 Frontend Site + AC Asset Management Suite', () => {
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
    sitesCount: 2,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  };

  const sampleSites: CustomerSite[] = [
    {
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
      assetCount: 3,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    },
    {
      id: 'site-2',
      customerId: 'cust-100',
      siteName: 'Diagnostic Annex',
      address: '12 Greams Lane',
      city: 'Chennai',
      state: 'Tamil Nadu',
      postalCode: '600006',
      contactPerson: 'Sister Mary',
      contactPhone: '9876543211',
      isPrimary: false,
      isActive: true,
      assetCount: 1,
      createdAt: '2026-10-02T10:00:00Z',
      updatedAt: '2026-10-02T10:00:00Z',
    },
  ];

  const sampleAssets: AcAsset[] = [
    {
      id: 'asset-1',
      assetTag: 'AC-001',
      siteId: 'site-1',
      brand: 'Daikin',
      modelNumber: 'FTKM50',
      acType: 'SPLIT',
      capacityTons: 1.5,
      serialNumber: 'DK-998877',
      floorLocation: '2nd Floor',
      roomLocation: 'ICU Ward 3',
      refrigerantType: 'R32',
      installationDate: '2025-01-15',
      warrantyStatus: 'UNDER_WARRANTY',
      isActive: true,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    },
    {
      id: 'asset-2',
      assetTag: 'AC-002',
      siteId: 'site-1',
      brand: 'Voltas',
      modelNumber: 'V-CAS-2T',
      acType: 'CASSETTE',
      capacityTons: 2.0,
      serialNumber: 'VT-443322',
      floorLocation: 'Ground Floor',
      roomLocation: 'Reception',
      refrigerantType: 'R410A',
      warrantyStatus: 'EXPIRED',
      isActive: true,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    },
  ];

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

  it('1. Displays Sites tab and renders physical site cards with real asset counts', async () => {
    vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/customers') {
        return { customers: [sampleCustomer], total: 1, page: 1, pageSize: 20, totalPages: 1 };
      }
      if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
        return { sites: sampleSites, total: 2 };
      }
      if (endpoint.includes('/sites/site-1/assets')) {
        return { assets: [sampleAssets[0]], total: 1 };
      }
      if (endpoint.includes('/sites/site-2/assets')) {
        return { assets: [sampleAssets[1]], total: 1 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    expect(viewBtn).toBeTruthy();
    await act(async () => {
      viewBtn.click();
    });

    // Customer Drawer should open with customer name
    expect(document.body.textContent).toContain('Apollo Hospital');

    // Switch to Sites tab
    const sitesTabBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Sites (')
    );
    expect(sitesTabBtn).toBeTruthy();
    await act(async () => {
      sitesTabBtn?.click();
    });

    // Verify sites rendered
    expect(document.body.textContent).toContain('Main Hospital Block');
    expect(document.body.textContent).toContain('Diagnostic Annex');
    expect(document.body.textContent).toContain('PRIMARY');
    expect(document.body.textContent).toContain('3 Assets');
    expect(document.body.textContent).toContain('1 Assets');

    renderResult.cleanup();
  });

  it('2. Shows empty state when customer has no registered sites', async () => {
    vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/customers') {
        return { customers: [sampleCustomer], total: 1, page: 1, pageSize: 20, totalPages: 1 };
      }
      if (endpoint.includes('/sites')) {
        return { sites: [], total: 0 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    await act(async () => {
      viewBtn.click();
    });

    // Switch to Sites tab
    const sitesTabBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Sites (')
    );
    await act(async () => {
      sitesTabBtn?.click();
    });

    expect(document.body.textContent).toContain('No Sites Configured');
    expect(document.body.textContent).toContain('This customer does not have any physical branches or sites registered yet.');

    renderResult.cleanup();
  });

  it('3. Opens Add Site modal and submits new physical site', async () => {
    const requestSpy = vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string, options?: { method?: string; data?: unknown }) => {
      if (options?.method === 'POST' && endpoint.includes('/sites')) {
        return {
          site: {
            id: 'site-3',
            customerId: 'cust-100',
            siteName: 'Research Wing',
            address: '50 Bio Park',
            city: 'Chennai',
            state: 'Tamil Nadu',
            isPrimary: false,
            isActive: true,
            assetCount: 0,
          },
          message: 'Site created successfully',
        };
      }
      if (endpoint === '/customers') {
        return { customers: [sampleCustomer], total: 1, page: 1, pageSize: 20, totalPages: 1 };
      }
      if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
        return { sites: sampleSites, total: 2 };
      }
      if (endpoint.includes('/assets')) {
        return { assets: sampleAssets, total: 2 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    await act(async () => {
      viewBtn.click();
    });

    // Switch to Sites tab
    const sitesTabBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Sites (')
    );
    await act(async () => {
      sitesTabBtn?.click();
    });

    // Click "+ Add Site" button
    const addSiteBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Add Site')
    );
    expect(addSiteBtn).toBeTruthy();
    await act(async () => {
      addSiteBtn?.click();
    });

    expect(document.body.textContent).toContain('Add Customer Site');

    // Submit the form
    const submitBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Save Site')
    );
    expect(submitBtn).toBeTruthy();
    await act(async () => {
      submitBtn?.click();
    });

    expect(requestSpy).toHaveBeenCalledWith(
      '/customers/cust-100/sites',
      expect.objectContaining({
        method: 'POST',
      })
    );

    renderResult.cleanup();
  });

  it('4. Triggers atomic promotion of secondary site to primary', async () => {
    const requestSpy = vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string, options?: { method?: string; data?: unknown }) => {
      if (options?.method === 'POST' && endpoint.includes('/set-primary')) {
        return {
          site: { ...sampleSites[1], isPrimary: true },
          message: 'Site promoted to primary location',
        };
      }
      if (endpoint === '/customers') {
        return { customers: [sampleCustomer], total: 1, page: 1, pageSize: 20, totalPages: 1 };
      }
      if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
        return { sites: sampleSites, total: 2 };
      }
      if (endpoint.includes('/assets')) {
        return { assets: sampleAssets, total: 2 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    await act(async () => {
      viewBtn.click();
    });

    // Switch to Sites tab
    const sitesTabBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Sites (')
    );
    await act(async () => {
      sitesTabBtn?.click();
    });

    // Find "Set Primary" button for Diagnostic Annex
    const setPrimaryBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Set Primary')
    );
    expect(setPrimaryBtn).toBeTruthy();
    await act(async () => {
      setPrimaryBtn?.click();
    });

    expect(requestSpy).toHaveBeenCalledWith(
      '/sites/site-2/set-primary',
      expect.objectContaining({ method: 'POST' })
    );

    renderResult.cleanup();
  });

  it('5. Switches to AC Assets tab and renders inventory list with details', async () => {
    vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/customers') {
        return { customers: [sampleCustomer], total: 1, page: 1, pageSize: 20, totalPages: 1 };
      }
      if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
        return { sites: sampleSites, total: 2 };
      }
      if (endpoint.includes('/sites/site-1/assets')) {
        return { assets: [sampleAssets[0]], total: 1 };
      }
      if (endpoint.includes('/sites/site-2/assets')) {
        return { assets: [sampleAssets[1]], total: 1 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    await act(async () => {
      viewBtn.click();
    });

    // Switch to AC Assets tab
    const assetsTabBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('AC Assets (')
    );
    expect(assetsTabBtn).toBeTruthy();
    await act(async () => {
      assetsTabBtn?.click();
    });

    // Verify assets rendered in cards
    expect(document.body.textContent).toContain('AC-001');
    expect(document.body.textContent).toContain('Daikin');
    expect(document.body.textContent).toContain('FTKM50');
    expect(document.body.textContent).toContain('1.5 T');
    expect(document.body.textContent).toContain('ICU Ward 3');
    expect(document.body.textContent).toContain('AC-002');
    expect(document.body.textContent).toContain('Voltas');
    expect(document.body.textContent).toContain('EXPIRED');

    renderResult.cleanup();
  });

  it('6. Shows empty state when no AC assets exist for selected customer', async () => {
    vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/customers') {
        return { customers: [sampleCustomer], total: 1, page: 1, pageSize: 20, totalPages: 1 };
      }
      if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
        return { sites: sampleSites, total: 2 };
      }
      if (endpoint.includes('/assets')) {
        return { assets: [], total: 0 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    await act(async () => {
      viewBtn.click();
    });

    // Switch to AC Assets tab
    const assetsTabBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('AC Assets (')
    );
    await act(async () => {
      assetsTabBtn?.click();
    });

    expect(document.body.textContent).toContain('No AC Assets Found');
    expect(document.body.textContent).toContain('No AC units match your active filter criteria.');

    renderResult.cleanup();
  });

  it('7. Opens AC Asset specs modal when clicking View', async () => {
    vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/customers') {
        return { customers: [sampleCustomer], total: 1, page: 1, pageSize: 20, totalPages: 1 };
      }
      if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
        return { sites: sampleSites, total: 2 };
      }
      if (endpoint.includes('/sites/site-1/assets')) {
        return { assets: [sampleAssets[0]], total: 1 };
      }
      if (endpoint.includes('/sites/site-2/assets')) {
        return { assets: [sampleAssets[1]], total: 1 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    await act(async () => {
      viewBtn.click();
    });

    // Switch to AC Assets tab
    const assetsTabBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('AC Assets (')
    );
    await act(async () => {
      assetsTabBtn?.click();
    });

    // Click View on the first asset
    const viewAssetBtn = document.body.querySelector('button[aria-label="View asset AC-001"]') as HTMLButtonElement;
    expect(viewAssetBtn).toBeTruthy();
    await act(async () => {
      viewAssetBtn.click();
    });

    // Asset Detail modal should open
    expect(document.body.textContent).toContain('Asset Specifications: AC-001');
    expect(document.body.textContent).toContain('Daikin • FTKM50');
    expect(document.body.textContent).toContain('DK-998877');
    expect(document.body.textContent).toContain('R32');

    renderResult.cleanup();
  });

  it('8. Handles duplicate asset conflict (409) with informative error notification', async () => {
    vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string, options?: { method?: string; data?: unknown }) => {
      if (options?.method === 'POST' && endpoint.includes('/assets')) {
        throw new ApiError(409, 'DUPLICATE_ASSET', 'An AC asset with this serial number already exists.');
      }
      if (endpoint === '/customers') {
        return { customers: [sampleCustomer], total: 1, page: 1, pageSize: 20, totalPages: 1 };
      }
      if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
        return { sites: sampleSites, total: 2 };
      }
      if (endpoint.includes('/sites/site-1/assets')) {
        return { assets: [sampleAssets[0]], total: 1 };
      }
      if (endpoint.includes('/sites/site-2/assets')) {
        return { assets: [sampleAssets[1]], total: 1 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    await act(async () => {
      viewBtn.click();
    });

    // Switch to AC Assets tab
    const assetsTabBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('AC Assets (')
    );
    await act(async () => {
      assetsTabBtn?.click();
    });

    // Open Add AC Asset modal
    const addAssetBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Add AC Asset')
    );
    expect(addAssetBtn).toBeTruthy();
    await act(async () => {
      addAssetBtn?.click();
    });

    // Click submit
    const submitBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Register Asset')
    );
    expect(submitBtn).toBeTruthy();
    await act(async () => {
      submitBtn?.click();
    });

    // Verify error notification
    expect(document.body.textContent).toContain('An AC asset with this serial number already exists.');

    renderResult.cleanup();
  });
});
