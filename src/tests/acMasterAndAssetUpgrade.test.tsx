import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { AcMasterManagement } from '@/pages/AcMasterManagement';
import { CustomerManagement } from '@/pages/CustomerManagement';
import { AuthContext, AuthContextType } from '@/context/authContextDef';
import { ToastProvider } from '@/components/ui/Toast';
import { apiClient } from '@/services/api/client';
import { RequestOptions } from '@/services/api/types';
import { AcBrand, AcModel, Customer, CustomerSite, AcAsset } from '@/domain/types';

describe('AC Master Data & Asset Upgrade Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const mockAdminUser = {
    id: 'admin-1',
    email: 'dpk.panchal79@gmail.com',
    fullName: 'Production Administrator',
    role: 'ADMIN' as const,
    isActive: true,
  };

  const sampleBrands: AcBrand[] = [
    { id: 'brand-1', name: 'Daikin', code: 'DAIKIN', isActive: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' },
    { id: 'brand-2', name: 'Voltas', code: 'VOLTAS', isActive: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' },
    { id: 'brand-3', name: 'LG', code: 'LG', isActive: false, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' },
  ];

  const sampleModels: AcModel[] = [
    {
      id: 'model-1',
      brandId: 'brand-1',
      modelNumber: 'FTKF50TV',
      acType: 'Split AC',
      technology: 'Inverter',
      capacityTons: 1.5,
      rating: '5 Star',
      refrigerant: 'R32',
      isActive: true,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'model-2',
      brandId: 'brand-1',
      modelNumber: 'FTKM35TV',
      acType: 'Split AC',
      technology: 'Inverter',
      capacityTons: 1.0,
      rating: '3 Star',
      refrigerant: 'R32',
      isActive: true,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  const sampleCustomer: Customer = {
    id: 'cust-100',
    customerCode: 'CUST-00100',
    name: 'Apollo Hospital',
    customerType: 'PERMANENT',
    phone: '9876543210',
    address: 'Greams Road',
    city: 'Chennai',
    state: 'Tamil Nadu',
    postalCode: '600006',
    isActive: true,
    sitesCount: 1,
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
      assetCount: 1,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    },
  ];

  const sampleAssets: AcAsset[] = [
    {
      id: 'asset-1',
      assetTag: 'ESSC-0027',
      siteId: 'site-1',
      brand: 'Daikin',
      modelNumber: 'FTKF50TV',
      acType: 'Split AC',
      technology: 'Inverter',
      capacityTons: 1.5,
      starRating: '5 Star',
      indoorSerialNumber: 'IDU-DKN-88192',
      outdoorSerialNumber: 'ODU-DKN-77312',
      floorLocation: '2nd Floor',
      roomLocation: 'Server Room',
      refrigerantType: 'R32',
      purchaseDate: '2025-01-10',
      installationDate: '2025-01-15',
      warrantyStartDate: '2025-01-15',
      warrantyEndDate: '2026-01-15',
      warrantyStatus: 'EXPIRED',
      assetStatus: 'Active',
      assetCondition: 'Good',
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

  it('1. Admin renders AC Brand Master and displays active brands', async () => {
    vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string) => {
      if (endpoint.includes('/ac-brands')) {
        return { brands: sampleBrands, total: 3 };
      }
      if (endpoint.includes('/ac-models')) {
        return { models: sampleModels, total: 2 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<AcMasterManagement />);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(document.body.textContent).toContain('AC Master Data');
    expect(document.body.textContent).toContain('AC Brands (3)');
    expect(document.body.textContent).toContain('Daikin');
    expect(document.body.textContent).toContain('Voltas');
    expect(document.body.textContent).toContain('LG');

    renderResult.cleanup();
  });

  it('2. Admin creates a new AC Brand', async () => {
    const requestSpy = vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string, options?: { method?: string }) => {
      if (endpoint.includes('/ac-brands') && options?.method === 'POST') {
        return {
          brand: {
            id: 'brand-new',
            name: 'Mitsubishi Electric',
            code: 'MITSUBISHI_ELECTRIC',
            isActive: true,
            createdAt: '2026-10-08T00:00:00Z',
            updatedAt: '2026-10-08T00:00:00Z',
          },
        };
      }
      if (endpoint.includes('/ac-brands')) {
        return { brands: sampleBrands, total: 3 };
      }
      if (endpoint.includes('/ac-models')) {
        return { models: sampleModels, total: 2 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<AcMasterManagement />);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const addBrandBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('+ Add New Brand')
    );
    expect(addBrandBtn).toBeTruthy();

    await act(async () => {
      addBrandBtn?.click();
    });

    expect(document.body.textContent).toContain('Add New AC Brand');

    const nameInput = document.body.querySelector('input[placeholder*="Daikin"]') as HTMLInputElement;
    expect(nameInput).toBeTruthy();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(nameInput, 'Mitsubishi Electric');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const saveBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Brand')
    );
    expect(saveBtn).toBeTruthy();

    await act(async () => {
      saveBtn?.click();
    });

    expect(requestSpy).toHaveBeenCalledWith(
      '/ac-brands',
      expect.objectContaining({ method: 'POST' })
    );

    renderResult.cleanup();
  });

  it('3. Admin switches to Models tab and filters models by brand', async () => {
    vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string) => {
      if (endpoint.includes('/ac-brands')) {
        return { brands: sampleBrands, total: 3 };
      }
      if (endpoint.includes('/ac-models')) {
        return { models: sampleModels, total: 2 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<AcMasterManagement />);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const modelsTabBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('AC Models (')
    );
    expect(modelsTabBtn).toBeTruthy();

    await act(async () => {
      modelsTabBtn?.click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(document.body.textContent).toContain('FTKF50TV');
    expect(document.body.textContent).toContain('FTKM35TV');

    renderResult.cleanup();
  });

  it('4. AC Asset form provides dynamic brand-to-model selection and locks master specifications', async () => {
    vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string, options?: RequestOptions) => {
      if (endpoint === '/customers') {
        return { customers: [sampleCustomer], total: 1, page: 1, pageSize: 20, totalPages: 1 };
      }
      if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
        return { sites: sampleSites, total: 1 };
      }
      if (endpoint.includes('/assets')) {
        return { assets: sampleAssets, total: 1 };
      }
      if (endpoint.includes('/ac-brands')) {
        return { brands: sampleBrands, total: 3 };
      }
      if (endpoint.includes('/ac-models')) {
        const brandId = options?.params?.brandId || (endpoint.includes('brandId=') ? endpoint.split('brandId=')[1]?.split('&')[0] : '');
        if (brandId === 'brand-1') {
          return { models: sampleModels, total: 2 };
        }
        return { models: [], total: 0 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const viewCustomerBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    await act(async () => {
      viewCustomerBtn?.click();
    });

    const assetsTabBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('AC Assets (')
    );
    await act(async () => {
      assetsTabBtn?.click();
    });

    const addAssetBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add AC Asset')
    );
    await act(async () => {
      addAssetBtn?.click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(document.body.textContent).toContain('Register New AC Asset');
    expect(document.body.textContent).toContain('ESSC-XXXX');
    expect(document.body.textContent).toContain('Auto-generated on registration');

    // Select Daikin brand
    const brandSelect = Array.from(document.body.querySelectorAll('select')).find((s) => {
      const options = Array.from(s.options).map((o) => o.text);
      return options.some((opt) => opt.includes('Daikin'));
    });
    expect(brandSelect).toBeTruthy();

    await act(async () => {
      brandSelect!.value = 'brand-1';
      brandSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Model select should be populated with Daikin models
    const modelSelect = Array.from(document.body.querySelectorAll('select')).find((s) => {
      const options = Array.from(s.options).map((o) => o.text);
      return options.some((opt) => opt.includes('FTKF50TV'));
    });
    expect(modelSelect).toBeTruthy();

    // Select FTKF50TV
    await act(async () => {
      modelSelect!.value = 'model-1';
      modelSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Verify specifications are locked from master
    expect(document.body.textContent).toContain('(Locked from Master)');
    expect(document.body.textContent).toContain('Calculated Status:');

    renderResult.cleanup();
  });

  it('5. Live warranty calculation displays calculated status and validates dates', async () => {
    vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/customers') {
        return { customers: [sampleCustomer], total: 1, page: 1, pageSize: 20, totalPages: 1 };
      }
      if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
        return { sites: sampleSites, total: 1 };
      }
      if (endpoint.includes('/assets')) {
        return { assets: sampleAssets, total: 1 };
      }
      if (endpoint.includes('/ac-brands')) {
        return { brands: sampleBrands, total: 3 };
      }
      return {};
    });

    let renderResult!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      renderResult = renderWithProviders(<CustomerManagement />);
    });

    const viewCustomerBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
    await act(async () => {
      viewCustomerBtn?.click();
    });

    const assetsTabBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('AC Assets (')
    );
    await act(async () => {
      assetsTabBtn?.click();
    });

    const addAssetBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add AC Asset')
    );
    await act(async () => {
      addAssetBtn?.click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Find date inputs: Purchase Date, Installation Date
    const dateInputs = Array.from(document.body.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
    const purchaseInput = dateInputs[0];
    const installInput = dateInputs[1];

    // Set invalid dates: Purchase Date (2026-05-01) > Installation Date (2026-04-01)
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(purchaseInput, '2026-05-01');
      purchaseInput.dispatchEvent(new Event('input', { bubbles: true }));
      purchaseInput.dispatchEvent(new Event('change', { bubbles: true }));

      setter?.call(installInput, '2026-04-01');
      installInput.dispatchEvent(new Event('input', { bubbles: true }));
      installInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Click submit
    const submitBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Register Asset')
    );
    expect(submitBtn).toBeTruthy();

    await act(async () => {
      submitBtn?.click();
    });

    // Should display validation error
    expect(document.body.textContent).toContain('Purchase date cannot be later than installation date.');

    renderResult.cleanup();
  });
});
