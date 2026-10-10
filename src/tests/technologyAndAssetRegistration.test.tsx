import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { CustomerManagement } from '@/pages/CustomerManagement';
import { AuthContext, AuthContextType } from '@/context/authContextDef';
import { ToastProvider } from '@/components/ui/Toast';
import { apiClient } from '@/services/api/client';
import { AcBrand, AcModel, Customer, CustomerSite } from '@/domain/types';
import { normalizeTechnology, TECHNOLOGY_OPTIONS } from '@/utils/technology';

describe('Phase B: Technology Normalization & Form Integrity Tests', () => {
  describe('Technology Normalization Utility', () => {
    it('normalizes Inverter correctly', () => {
      expect(normalizeTechnology('Inverter')).toBe('Inverter');
      expect(normalizeTechnology('inverter')).toBe('Inverter');
      expect(normalizeTechnology('  Inverter  ')).toBe('Inverter');
    });

    it('normalizes Non Inverter (with space) to canonical Non-Inverter (with hyphen)', () => {
      expect(normalizeTechnology('Non Inverter')).toBe('Non-Inverter');
      expect(normalizeTechnology('non inverter')).toBe('Non-Inverter');
      expect(normalizeTechnology('  Non Inverter  ')).toBe('Non-Inverter');
    });

    it('normalizes Non-Inverter (with hyphen) to canonical Non-Inverter', () => {
      expect(normalizeTechnology('Non-Inverter')).toBe('Non-Inverter');
      expect(normalizeTechnology('non-inverter')).toBe('Non-Inverter');
      expect(normalizeTechnology('noninverter')).toBe('Non-Inverter');
    });

    it('normalizes Fixed Speed correctly', () => {
      expect(normalizeTechnology('Fixed Speed')).toBe('Fixed Speed');
      expect(normalizeTechnology('fixed speed')).toBe('Fixed Speed');
      expect(normalizeTechnology('fixed-speed')).toBe('Fixed Speed');
    });

    it('normalizes Variable Speed correctly', () => {
      expect(normalizeTechnology('Variable Speed')).toBe('Variable Speed');
      expect(normalizeTechnology('variable speed')).toBe('Variable Speed');
      expect(normalizeTechnology('variable-speed')).toBe('Variable Speed');
    });

    it('normalizes Unknown correctly', () => {
      expect(normalizeTechnology('Unknown')).toBe('Unknown');
      expect(normalizeTechnology('unknown')).toBe('Unknown');
    });

    it('handles null, undefined, and empty string without defaulting to Inverter', () => {
      expect(normalizeTechnology(null)).toBe('');
      expect(normalizeTechnology(undefined)).toBe('');
      expect(normalizeTechnology('')).toBe('');
      expect(normalizeTechnology('   ')).toBe('');
    });

    it('preserves unknown/custom technology values without inventing a specification', () => {
      expect(normalizeTechnology('Premium Series - Inverte')).toBe('Premium Series - Inverte');
      expect(normalizeTechnology('Dual Inverter')).toBe('Dual Inverter');
      expect(normalizeTechnology('Solar Hybrid')).toBe('Solar Hybrid');
    });

    it('has standard TECHNOLOGY_OPTIONS including Inverter, Non-Inverter, Fixed Speed, Variable Speed, and Unknown', () => {
      expect(TECHNOLOGY_OPTIONS).toContain('Inverter');
      expect(TECHNOLOGY_OPTIONS).toContain('Non-Inverter');
      expect(TECHNOLOGY_OPTIONS).toContain('Fixed Speed');
      expect(TECHNOLOGY_OPTIONS).toContain('Variable Speed');
      expect(TECHNOLOGY_OPTIONS).toContain('Unknown');
      // Must not contain the unnormalized version with space
      expect(TECHNOLOGY_OPTIONS).not.toContain('Non Inverter');
    });
  });

  describe('Asset Registration UI Workflow', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      document.body.innerHTML = '';
    });

    const mockAdminUser = {
      id: 'admin-1',
      email: 'admin@pys.internal',
      fullName: 'Administrator',
      role: 'ADMIN' as const,
      isActive: true,
    };

    const sampleBrands: AcBrand[] = [
      { id: 'brand-1', name: 'Mitsubishi Heavy', code: 'MITSUBISHI', isActive: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' },
      { id: 'brand-2', name: 'Daikin', code: 'DAIKIN', isActive: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' },
    ];

    const sampleModels: AcModel[] = [
      {
        id: 'model-1',
        brandId: 'brand-1',
        modelNumber: 'SRK24CW-S6',
        acType: 'Split AC',
        technology: 'Non Inverter', // Raw value with space
        capacityTons: 1.95,
        rating: '2 Star',
        refrigerant: null, // Missing in catalogue
        isActive: true,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'model-2',
        brandId: 'brand-2',
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
    ];

    const sampleCustomer: Customer = {
      id: 'cust-1',
      customerCode: 'CUST-00001',
      name: 'Test Customer',
      customerType: 'PERMANENT',
      phone: '9876543210',
      address: 'Test Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400001',
      isActive: true,
      sitesCount: 1,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    };

    const sampleSites: CustomerSite[] = [
      {
        id: 'site-1',
        customerId: 'cust-1',
        siteName: 'Main Facility',
        address: 'Test Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        contactPerson: 'Manager',
        contactPhone: '9876543210',
        isPrimary: true,
        isActive: true,
        assetCount: 0,
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      },
    ];

    const renderWithProviders = (ui: React.ReactNode) => {
      const defaultAuth: AuthContextType = {
        user: mockAdminUser,
        session: null,
        isLoading: false,
        error: null,
        login: vi.fn().mockResolvedValue({ success: true }),
        logout: vi.fn().mockResolvedValue(undefined),
        clearError: vi.fn(),
        refreshUser: vi.fn().mockResolvedValue(undefined),
      };

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <AuthContext.Provider value={defaultAuth}>
            <ToastProvider>{ui}</ToastProvider>
          </AuthContext.Provider>
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

    it('prefills parent model specifications without locking and without variant dropdown', async () => {
      vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string) => {
        if (endpoint === '/customers') {
          return { customers: [sampleCustomer], total: 1, page: 1, pageSize: 20, totalPages: 1 };
        }
        if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
          return { sites: sampleSites, total: 1 };
        }
        if (endpoint.includes('/assets')) {
          return { assets: [], total: 0 };
        }
        if (endpoint.includes('/ac-brands')) {
          return { brands: sampleBrands, total: 2 };
        }
        if (endpoint.includes('/ac-models')) {
          if (endpoint.includes('brand-1')) {
            return { models: [sampleModels[0]], total: 1 };
          }
          if (endpoint.includes('brand-2')) {
            return { models: [sampleModels[1]], total: 1 };
          }
          return { models: sampleModels, total: 2 };
        }
        return {};
      });

      const renderResult = renderWithProviders(<CustomerManagement />);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // View customer
      const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
      await act(async () => {
        viewBtn?.click();
      });

      // Switch to AC Assets tab
      const assetsTabBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('AC Assets')
      );
      await act(async () => {
        assetsTabBtn?.click();
      });

      // Open Add AC Asset modal
      const addAssetBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add AC Asset')
      );
      await act(async () => {
        addAssetBtn?.click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Ensure NO Model Variant dropdown exists in the modal
      expect(document.body.textContent).not.toContain('Model Variant');

      // Select brand-1 (Mitsubishi Heavy)
      const brandSelect = Array.from(document.body.querySelectorAll('select')).find((s) =>
        Array.from(s.options).some((o) => o.text.includes('Mitsubishi Heavy'))
      );
      expect(brandSelect).toBeTruthy();

      await act(async () => {
        brandSelect!.value = 'brand-1';
        brandSelect!.dispatchEvent(new Event('change', { bubbles: true }));
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Select model-1 (SRK24CW-S6)
      const modelSelect = Array.from(document.body.querySelectorAll('select')).find((s) =>
        Array.from(s.options).some((o) => o.text.includes('SRK24CW-S6'))
      );
      expect(modelSelect).toBeTruthy();

      await act(async () => {
        modelSelect!.value = 'model-1';
        modelSelect!.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Find Technology select
      const techSelect = Array.from(document.body.querySelectorAll('select')).find((s) =>
        Array.from(s.options).some((o) => o.value === 'Non-Inverter')
      );
      expect(techSelect).toBeTruthy();

      // Verified: Technology normalized from 'Non Inverter' to 'Non-Inverter'
      expect(techSelect!.value).toBe('Non-Inverter');
      expect(techSelect!.disabled).toBe(false);

      // Verified: Capacity prefilled to 1.95 and is editable
      const capInput = document.body.querySelector('input[placeholder="e.g. 1.5"]') as HTMLInputElement;
      expect(capInput).toBeTruthy();
      expect(capInput.value).toBe('1.95');
      expect(capInput.disabled).toBe(false);

      // Verified: Rating prefilled to 2 Star and is editable
      const ratingSelect = Array.from(document.body.querySelectorAll('select')).find((s) =>
        Array.from(s.options).some((o) => o.value === '2 Star')
      );
      expect(ratingSelect).toBeTruthy();
      expect(ratingSelect!.value).toBe('2 Star');
      expect(ratingSelect!.disabled).toBe(false);

      // Verified: Refrigerant in catalogue is null, so field is blank, NOT carrying over or defaulting to R32
      const refSelect = Array.from(document.body.querySelectorAll('select')).find((s) =>
        Array.from(s.options).some((o) => o.value === 'R410A')
      );
      expect(refSelect).toBeTruthy();
      expect(refSelect!.value).toBe(''); // Blank because catalogue refrigerant is null!

      // Switching brand resets dependent model and specifications
      await act(async () => {
        brandSelect!.value = 'brand-2';
        brandSelect!.dispatchEvent(new Event('change', { bubbles: true }));
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Verify specs were reset and did not retain stale values
      expect(techSelect!.value).toBe('');
      expect(capInput.value).toBe('');
      expect(ratingSelect!.value).toBe('');
      expect(refSelect!.value).toBe('');

      renderResult.cleanup();
    });

    it('Asset Specification Modal renders distinct IDU & ODU serial numbers, copy buttons, and full 6-section technical architecture', async () => {
      const sampleAsset = {
        id: 'asset-test-99',
        siteId: 'site-1',
        assetTag: 'ESSC-0003',
        brand: 'Voltas',
        modelNumber: '185V Vectra',
        indoorSerialNumber: 'VT-IDU-1001',
        outdoorSerialNumber: 'VT-ODU-2002',
        serialNumber: null,
        acType: 'Split AC',
        technology: 'Inverter',
        capacityTons: 1.5,
        starRating: '5 Star',
        refrigerantType: 'R-32',
        floorLocation: '2nd Floor',
        roomLocation: 'IT Server Room',
        purchaseDate: '2025-01-15',
        installationDate: '2025-01-20',
        warrantyStartDate: '2025-01-20',
        warrantyEndDate: '2026-01-19',
        warrantyStatus: 'ACTIVE',
        assetStatus: 'ACTIVE',
        assetCondition: 'EXCELLENT',
        isActive: true,
        createdAt: '2025-01-20T10:00:00Z',
        updatedAt: '2025-01-20T10:00:00Z',
        siteName: 'Headquarters',
        customerName: 'Aarti Sharma',
        customerCode: 'CUST-001',
      };

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      vi.spyOn(apiClient, 'request').mockImplementation(async (endpoint: string) => {
        if (endpoint === '/customers' || (endpoint.startsWith('/customers') && !endpoint.includes('/sites'))) {
          return { customers: [sampleCustomer], total: 1, page: 1, pageSize: 20, totalPages: 1 };
        }
        if (endpoint.includes('/sites') && !endpoint.includes('/assets')) {
          return { sites: sampleSites, total: 1 };
        }
        if (endpoint.includes('/assets')) {
          return { assets: [sampleAsset], total: 1 };
        }
        if (endpoint.includes('/ac-brands')) {
          return { brands: sampleBrands, total: 2 };
        }
        if (endpoint.includes('/ac-models')) {
          return { models: sampleModels, total: 2 };
        }
        if (endpoint.includes('/amc/history')) {
          return { currentAmc: null, history: [] };
        }
        return {};
      });

      let renderResult!: ReturnType<typeof renderWithProviders>;
      await act(async () => {
        renderResult = renderWithProviders(<CustomerManagement />);
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // View customer
      const viewBtn = renderResult.container.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
      await act(async () => {
        viewBtn?.click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Switch to AC Assets tab
      const assetsTabBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('AC Assets (')
      );
      await act(async () => {
        assetsTabBtn?.click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Click View on asset ESSC-0003 to open Asset Specification Modal
      const viewAssetBtn = document.body.querySelector('button[aria-label="View asset ESSC-0003"]') as HTMLButtonElement;
      expect(viewAssetBtn).toBeTruthy();

      await act(async () => {
        viewAssetBtn.click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Section A: Asset Identity
      expect(document.body.textContent).toContain('ESSC-0003');
      expect(document.body.textContent).toContain('Voltas • 185V Vectra');
      expect(document.body.textContent).toContain('Asset:ACTIVE');
      expect(document.body.textContent).toContain('Condition:EXCELLENT');

      // Section B: Equipment Identification (Highest Priority)
      expect(document.body.textContent).toContain('Equipment Identification (Unit Serial Numbers)');
      expect(document.body.textContent).toContain('Indoor Unit Serial (IDU)');
      expect(document.body.textContent).toContain('VT-IDU-1001');
      expect(document.body.textContent).toContain('Outdoor Unit Serial (ODU)');
      expect(document.body.textContent).toContain('VT-ODU-2002');

      // Test copy serial button
      const copyButtons = Array.from(document.body.querySelectorAll('button')).filter((b) =>
        b.getAttribute('title')?.includes('Copy')
      );
      expect(copyButtons.length).toBeGreaterThanOrEqual(2);

      await act(async () => {
        copyButtons[0].click();
      });
      expect(writeTextMock).toHaveBeenCalledWith('VT-IDU-1001');

      // Section C: Technical Specifications
      expect(document.body.textContent).toContain('Technical Specifications');
      expect(document.body.textContent).toContain('1.5 Ton');
      expect(document.body.textContent).toContain('5 Star');
      expect(document.body.textContent).toContain('R-32');

      // Section D: Installation & Location
      expect(document.body.textContent).toContain('Installation & Location Details');
      expect(document.body.textContent).toContain('2nd Floor');
      expect(document.body.textContent).toContain('IT Server Room');

      // Section E: Warranty Coverage
      expect(document.body.textContent).toContain('Manufacturer Warranty');

      renderResult.cleanup();
    });
  });
});
