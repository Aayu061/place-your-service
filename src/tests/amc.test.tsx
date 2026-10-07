import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { AmcManagement } from '@/pages/AmcManagement';
import { AuthContext, AuthContextType } from '@/context/authContextDef';
import { ToastProvider } from '@/components/ui/Toast';
import { apiClient } from '@/services/api/client';
import { AmcContract, AmcPlan, Customer, AcAsset } from '@/domain/types';

describe('Phase 8 Frontend AMC Management Suite', () => {
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

  const samplePlan: AmcPlan = {
    id: 'plan-basic-1',
    planCode: 'PLAN-BASIC',
    name: 'Basic Comprehensive AMC',
    planName: 'Basic Comprehensive AMC',
    defaultFrequency: 'QUARTERLY',
    frequency: 'QUARTERLY',
    defaultVisitsPerYear: 4,
    totalVisits: 4,
    includedVisits: 4,
    description: 'Quarterly filter clean & general check',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const sampleCustomer: Customer = {
    id: 'cust-100',
    customerCode: 'CUST-0001',
    name: 'Acme Corporation',
    phone: '9876543210',
    email: 'contact@acme.corp',
    address: '100 Business Park',
    isActive: true,
    customerType: 'PERMANENT',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const sampleAsset: AcAsset = {
    id: 'asset-100',
    assetTag: 'AST-0001',
    assetCode: 'AST-0001',
    siteId: 'site-100',
    brand: 'Daikin',
    modelNumber: 'FTKF50',
    capacityTons: 1.5,
    acType: 'SPLIT',
    roomLocation: 'Conference Room 1',
    warrantyStatus: 'AMC_COVERED',
    isActive: true,
    installationDate: '2025-01-01',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const sampleContract: AmcContract = {
    id: 'amc-100',
    contractNumber: 'AMC-2026-0001',
    contractCode: 'AMC-2026-0001',
    customerId: 'cust-100',
    customerName: 'Acme Corporation',
    planId: 'plan-basic-1',
    planName: 'Basic Comprehensive AMC',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    frequency: 'QUARTERLY',
    contractAmount: 24000,
    totalAmount: 24000,
    includedVisits: 4,
    totalVisits: 4,
    status: 'ACTIVE',
    notes: 'Primary commercial contract',
    coveredAssetsCount: 1,
    completedVisitsCount: 1,
    coveredAssets: [
      {
        id: 'cov-100',
        amcId: 'amc-100',
        assetId: 'asset-100',
        assetTag: 'AST-0001',
        brand: 'Daikin',
        modelNumber: 'FTKF50',
        siteName: 'Headquarters',
        notes: null,
        createdAt: '2026-01-01T00:00:00Z',
        asset: sampleAsset,
      },
    ],
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
  };

  const setInputValue = (el: HTMLInputElement | HTMLTextAreaElement, val: string) => {
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const renderComponent = async (props: { preselectedCustomerId?: string; onNavigate?: () => void } = {}) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const mockAuthContext: AuthContextType = {
      user: mockAdminUser,
      session: null,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      refreshUser: vi.fn(),
    };

    await act(async () => {
      root.render(
        <AuthContext.Provider value={mockAuthContext}>
          <ToastProvider>
            <AmcManagement onNavigate={props.onNavigate} preselectedCustomerId={props.preselectedCustomerId} />
          </ToastProvider>
        </AuthContext.Provider>
      );
    });

    return {
      container,
      unmount: () => {
        act(() => {
          root.unmount();
        });
        container.remove();
      },
    };
  };

  it('1. Renders AMC Management view with header, KPI metrics, and New AMC Contract CTA', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/metrics')) {
        return {
          metrics: {
            totalContracts: 12,
            activeContracts: 8,
            expiringSoon: 2,
            expiredContracts: 2,
            totalCoveredAssets: 35,
            pmDueCount: 4,
            pmOverdueCount: 1,
          },
        } as never;
      }
      if (url.includes('/plans')) {
        return { plans: [samplePlan] } as never;
      }
      if (url.includes('/amc-contracts')) {
        return {
          contracts: [sampleContract],
          total: 1,
          page: 1,
          pageSize: 15,
          totalPages: 1,
        } as never;
      }
      return {} as never;
    });

    const { container, unmount } = await renderComponent();

    expect(container.textContent).toContain('AMC Contracts');
    expect(container.textContent).toContain('Manage commercial maintenance agreements');
    expect(container.textContent).toContain('New AMC Contract');
    expect(container.textContent).toContain('ACTIVE CONTRACTS');
    expect(container.textContent).toContain('AMC-2026-0001');
    expect(container.textContent).toContain('Acme Corporation');
    expect(container.textContent).toContain('QUARTERLY');

    unmount();
  });

  it('2. Renders empty state when no contracts exist', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/metrics')) {
        return {
          metrics: {
            totalContracts: 0,
            activeContracts: 0,
            expiringSoon: 0,
            expiredContracts: 0,
            totalCoveredAssets: 0,
            pmDueCount: 0,
            pmOverdueCount: 0,
          },
        } as never;
      }
      if (url.includes('/plans')) {
        return { plans: [] } as never;
      }
      if (url.includes('/amc-contracts')) {
        return {
          contracts: [],
          total: 0,
          page: 1,
          pageSize: 15,
          totalPages: 0,
        } as never;
      }
      return {} as never;
    });

    const { container, unmount } = await renderComponent();

    expect(container.textContent).toContain('No AMC contracts found');
    expect(container.textContent).toContain('Get started by creating your first commercial maintenance agreement');

    unmount();
  });

  it('3. Allows filtering by status and frequency', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/metrics')) {
        return { metrics: { totalContracts: 1, activeContracts: 1, expiringSoon: 0, expiredContracts: 0, totalCoveredAssets: 2, pmDueCount: 0, pmOverdueCount: 0 } } as never;
      }
      if (url.includes('/plans')) {
        return { plans: [samplePlan] } as never;
      }
      if (url.includes('/amc-contracts')) {
        return {
          contracts: [sampleContract],
          total: 1,
          page: 1,
          pageSize: 15,
          totalPages: 1,
        } as never;
      }
      return {} as never;
    });

    const { container, unmount } = await renderComponent();

    // Find status filter select
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      selects[0].value = 'ACTIVE';
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(getSpy).toHaveBeenCalledWith(expect.stringContaining('status=ACTIVE'));

    unmount();
  });

  it('4. Opens Create AMC modal, fetches customers & plans, and submits creation', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/metrics')) {
        return { metrics: { totalContracts: 0, activeContracts: 0, expiringSoon: 0, expiredContracts: 0, totalCoveredAssets: 0, pmDueCount: 0, pmOverdueCount: 0 } } as never;
      }
      if (url.includes('/plans')) {
        return { plans: [samplePlan] } as never;
      }
      if (url.includes('/customers')) {
        return { customers: [sampleCustomer] } as never;
      }
      if (url.includes('/assets')) {
        return { assets: [sampleAsset] } as never;
      }
      if (url.includes('/amc-contracts')) {
        return { contracts: [], total: 0, page: 1, pageSize: 15, totalPages: 0 } as never;
      }
      return {} as never;
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      contract: sampleContract,
    } as never);

    const { container, unmount } = await renderComponent();

    // Click "New AMC Contract" button
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New AMC Contract')
    );
    expect(newBtn).toBeDefined();

    await act(async () => {
      newBtn?.click();
    });

    expect(container.textContent).toContain('Create AMC Maintenance Agreement');

    // Fill customer select
    const customerSelect = document.body.querySelector('#amc-customer-select') as HTMLSelectElement;
    expect(customerSelect).toBeDefined();

    await act(async () => {
      customerSelect.value = sampleCustomer.id;
      customerSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Fill start and end dates and amount
    const startDateInput = document.body.querySelector('#amc-start-date') as HTMLInputElement;
    const endDateInput = document.body.querySelector('#amc-end-date') as HTMLInputElement;
    const amountInput = document.body.querySelector('#amc-amount') as HTMLInputElement;

    await act(async () => {
      if (startDateInput) setInputValue(startDateInput, '2026-01-01');
      if (endDateInput) setInputValue(endDateInput, '2026-12-31');
      if (amountInput) setInputValue(amountInput, '25000');
    });

    // Submit form
    const submitBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create Contract')
    );
    expect(submitBtn).toBeDefined();

    await act(async () => {
      submitBtn?.click();
    });

    expect(postSpy).toHaveBeenCalledWith('/amc-contracts', expect.objectContaining({
      customerId: sampleCustomer.id,
      totalAmount: 25000,
    }));

    unmount();
  });

  it('5. Opens Contract Detail drawer and loads overview, covered equipment, and PM schedules', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/metrics')) {
        return { metrics: { totalContracts: 1, activeContracts: 1, expiringSoon: 0, expiredContracts: 0, totalCoveredAssets: 1, pmDueCount: 0, pmOverdueCount: 0 } } as never;
      }
      if (url.includes('/plans')) {
        return { plans: [samplePlan] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}/schedules`)) {
        return {
          schedules: [
            {
              id: 'sch-100',
              amcId: sampleContract.id,
              assetId: sampleAsset.id,
              scheduleNumber: 'PM-2026-0001',
              assetTag: 'AST-0001',
              brand: 'Daikin',
              modelNumber: 'FTKF50',
              siteName: 'Headquarters',
              scheduledDate: '2026-04-01',
              visitNumber: 1,
              status: 'PLANNED',
              isSystemGenerated: true,
              notes: null,
            },
          ],
        } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}/assets`)) {
        return {
          assets: [
            {
              id: 'cov-100',
              amcId: sampleContract.id,
              assetId: sampleAsset.id,
              notes: null,
              createdAt: '2026-01-01T00:00:00Z',
              asset: sampleAsset,
            },
          ],
        } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}`)) {
        return {
          contract: sampleContract,
        } as never;
      }
      if (url.includes('/amc-contracts')) {
        return {
          contracts: [sampleContract],
          total: 1,
          page: 1,
          pageSize: 15,
          totalPages: 1,
        } as never;
      }
      return {} as never;
    });

    const { container, unmount } = await renderComponent();

    // Click on contract row or "View" button
    const viewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('View')
    );
    expect(viewBtn).toBeDefined();

    await act(async () => {
      viewBtn?.click();
    });

    // Check detail drawer rendered
    expect(container.textContent).toContain('Overview');
    expect(container.textContent).toContain('Included Visits');

    // Click on "Covered Equipment" tab
    const coveredTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Covered Equipment')
    );
    expect(coveredTabBtn).toBeDefined();

    await act(async () => {
      coveredTabBtn?.click();
    });

    expect(container.textContent).toContain('Daikin');
    expect(container.textContent).toContain('AST-0001');

    // Click on "PM Obligations" tab
    const pmTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('PM Obligations')
    );
    expect(pmTabBtn).toBeDefined();

    await act(async () => {
      pmTabBtn?.click();
    });

    expect(container.textContent).toContain('Regenerate / Sync PM');
    expect(container.textContent).toContain('PM-2026-0001');

    unmount();
  });

  it('6. Triggers idempotent PM generation from PM Schedule view', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/metrics')) {
        return { metrics: { totalContracts: 1, activeContracts: 1, expiringSoon: 0, expiredContracts: 0, totalCoveredAssets: 1, pmDueCount: 0, pmOverdueCount: 0 } } as never;
      }
      if (url.includes('/plans')) {
        return { plans: [samplePlan] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}/assets`)) {
        return { assets: [] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}/schedules`)) {
        return { schedules: [] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}`)) {
        return { contract: sampleContract } as never;
      }
      if (url.includes('/amc-contracts')) {
        return { contracts: [sampleContract], total: 1, page: 1, pageSize: 15, totalPages: 1 } as never;
      }
      return {} as never;
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      contractId: sampleContract.id,
      contractNumber: sampleContract.contractNumber,
      generatedCount: 4,
      existingCount: 0,
      skippedCount: 0,
      dateRange: { startDate: '2026-01-01', endDate: '2026-12-31' },
      generatedDates: ['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01'],
    } as never);

    const { container, unmount } = await renderComponent();

    // Open detail
    const viewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('View')
    );
    await act(async () => {
      viewBtn?.click();
    });

    // Go to PM tab
    const pmTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('PM Obligations')
    );
    await act(async () => {
      pmTabBtn?.click();
    });

    // Click "Regenerate / Sync PM"
    const genBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Regenerate / Sync PM')
    );
    expect(genBtn).toBeDefined();

    await act(async () => {
      genBtn?.click();
    });

    expect(postSpy).toHaveBeenCalledWith(`/amc-contracts/${sampleContract.id}/generate-pm`, {});

    unmount();
  });

  it('7. Cancels an AMC contract non-destructively with reason', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/metrics')) {
        return { metrics: { totalContracts: 1, activeContracts: 1, expiringSoon: 0, expiredContracts: 0, totalCoveredAssets: 1, pmDueCount: 0, pmOverdueCount: 0 } } as never;
      }
      if (url.includes('/plans')) {
        return { plans: [samplePlan] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}/schedules`)) {
        return { schedules: [] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}/assets`)) {
        return { assets: [] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}`)) {
        return { contract: sampleContract } as never;
      }
      if (url.includes('/amc-contracts')) {
        return { contracts: [sampleContract], total: 1, page: 1, pageSize: 15, totalPages: 1 } as never;
      }
      return {} as never;
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      contract: { ...sampleContract, status: 'CANCELLED', cancellationReason: 'Customer relocation' },
    } as never);

    const { container, unmount } = await renderComponent();

    // Open detail
    const viewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('View')
    );
    await act(async () => {
      viewBtn?.click();
    });

    // Click Cancel Contract button in drawer
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel Contract')
    );
    expect(cancelBtn).toBeDefined();

    await act(async () => {
      cancelBtn?.click();
    });

    expect(document.body.textContent).toContain('Cancel AMC Contract');

    // Enter reason
    const reasonInput = document.body.querySelector('#cancel-reason') as HTMLTextAreaElement;
    expect(reasonInput).toBeDefined();

    await act(async () => {
      if (reasonInput) setInputValue(reasonInput, 'Customer relocation to other state');
    });

    // Confirm cancel
    const cancelForm = document.body.querySelector('form[action=""]') || document.body.querySelector('form.space-y-4');
    const confirmCancelBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Cancellation')
    );
    expect(confirmCancelBtn).toBeDefined();

    await act(async () => {
      if (cancelForm) {
        cancelForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      } else {
        confirmCancelBtn?.click();
      }
    });

    expect(postSpy).toHaveBeenCalledWith(
      `/amc-contracts/${sampleContract.id}/cancel`,
      expect.objectContaining({
        reason: 'Customer relocation to other state',
      })
    );

    unmount();
  });

  it('8. Handles contract renewal modal and submits linked renewal', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/metrics')) {
        return { metrics: { totalContracts: 1, activeContracts: 1, expiringSoon: 0, expiredContracts: 0, totalCoveredAssets: 1, pmDueCount: 0, pmOverdueCount: 0 } } as never;
      }
      if (url.includes('/plans')) {
        return { plans: [samplePlan] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}/schedules`)) {
        return { schedules: [] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}/assets`)) {
        return { assets: [] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}`)) {
        return { contract: sampleContract } as never;
      }
      if (url.includes('/amc-contracts')) {
        return { contracts: [sampleContract], total: 1, page: 1, pageSize: 15, totalPages: 1 } as never;
      }
      return {} as never;
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      contract: {
        ...sampleContract,
        id: 'amc-101',
        contractNumber: 'AMC-2027-0001',
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        status: 'ACTIVE',
      },
    } as never);

    const { container, unmount } = await renderComponent();

    const viewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('View')
    );
    await act(async () => {
      viewBtn?.click();
    });

    // Click Renew Agreement button
    const renewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Renew Agreement')
    );
    expect(renewBtn).toBeDefined();

    await act(async () => {
      renewBtn?.click();
    });

    expect(document.body.textContent).toContain('Renew AMC Contract');

    const renewSubmitBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Renewal')
    );
    expect(renewSubmitBtn).toBeDefined();

    await act(async () => {
      renewSubmitBtn?.click();
    });

    expect(postSpy).toHaveBeenCalledWith(
      `/amc-contracts/${sampleContract.id}/renew`,
      expect.objectContaining({
        customerId: sampleContract.customerId,
      })
    );

    unmount();
  });

  it('9. Opens Add Covered Equipment modal and adds units to contract', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/metrics')) {
        return { metrics: { totalContracts: 1, activeContracts: 1, expiringSoon: 0, expiredContracts: 0, totalCoveredAssets: 0, pmDueCount: 0, pmOverdueCount: 0 } } as never;
      }
      if (url.includes('/plans')) {
        return { plans: [samplePlan] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}/schedules`)) {
        return { schedules: [] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}/assets`)) {
        return { assets: [] } as never;
      }
      if (url.includes(`/amc-contracts/${sampleContract.id}`)) {
        return { contract: { ...sampleContract, coveredAssets: [] } } as never;
      }
      if (url.includes(`/customers/${sampleContract.customerId}/sites`)) {
        return { sites: [{ id: 'site-100', siteName: 'Headquarters' }] } as never;
      }
      if (url.includes(`/sites/site-100/assets`)) {
        return { assets: [sampleAsset] } as never;
      }
      if (url.includes('/amc-contracts')) {
        return { contracts: [sampleContract], total: 1, page: 1, pageSize: 15, totalPages: 1 } as never;
      }
      return {} as never;
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      coveredAssets: [
        {
          id: 'cov-101',
          amcId: sampleContract.id,
          assetId: sampleAsset.id,
          createdAt: '2026-10-07T00:00:00Z',
        },
      ],
    } as never);

    const { container, unmount } = await renderComponent();

    const viewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('View')
    );
    await act(async () => {
      viewBtn?.click();
    });

    const coveredTab = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Covered Equipment')
    );
    await act(async () => {
      coveredTab?.click();
    });

    const addEqBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cover Additional Equipment')
    );
    expect(addEqBtn).toBeDefined();

    await act(async () => {
      addEqBtn?.click();
    });

    expect(document.body.textContent).toContain('Cover Additional Equipment');

    // Check the asset checkbox
    const checkboxes = Array.from(document.body.querySelectorAll('input[type="checkbox"]'));
    if (checkboxes.length > 0) {
      await act(async () => {
        (checkboxes[0] as HTMLInputElement).click();
      });
    }

    const saveEqBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Attach Selected')
    );

    await act(async () => {
      saveEqBtn?.click();
    });

    expect(postSpy).toHaveBeenCalledWith(
      `/amc-contracts/${sampleContract.id}/assets`,
      expect.any(Object)
    );

    unmount();
  });

  it('10. Handles structured conflict error when asset is already covered', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/metrics')) {
        return { metrics: { totalContracts: 0, activeContracts: 0, expiringSoon: 0, expiredContracts: 0, totalCoveredAssets: 0, pmDueCount: 0, pmOverdueCount: 0 } } as never;
      }
      if (url.includes('/plans')) {
        return { plans: [samplePlan] } as never;
      }
      if (url.includes('/customers')) {
        return { customers: [sampleCustomer] } as never;
      }
      if (url.includes('/amc-contracts')) {
        return { contracts: [], total: 0, page: 1, pageSize: 15, totalPages: 0 } as never;
      }
      return {} as never;
    });

    // Simulate 409 Conflict with structured error
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      message: 'One or more assets are already covered by an active AMC agreement',
      code: 'ASSET_ALREADY_COVERED',
      statusCode: 409,
    });

    const { container, unmount } = await renderComponent();

    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New AMC Contract')
    );
    await act(async () => {
      newBtn?.click();
    });

    const customerSelect = document.body.querySelector('#amc-customer-select') as HTMLSelectElement;
    await act(async () => {
      customerSelect.value = sampleCustomer.id;
      customerSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const startDateInput = document.body.querySelector('#amc-start-date') as HTMLInputElement;
    const endDateInput = document.body.querySelector('#amc-end-date') as HTMLInputElement;
    const amountInput = document.body.querySelector('#amc-amount') as HTMLInputElement;

    await act(async () => {
      if (startDateInput) setInputValue(startDateInput, '2026-01-01');
      if (endDateInput) setInputValue(endDateInput, '2026-12-31');
      if (amountInput) setInputValue(amountInput, '25000');
    });

    const submitBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create Contract')
    );

    await act(async () => {
      submitBtn?.click();
    });

    // Assert modal didn't crash and remained open on conflict
    expect(document.body.textContent).toContain('Create AMC Maintenance Agreement');

    unmount();
  });
});

