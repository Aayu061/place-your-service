import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { TechnicianManagement } from '@/pages/TechnicianManagement';
import { AuthContext, AuthContextType } from '@/context/authContextDef';
import { ToastProvider } from '@/components/ui/Toast';
import { apiClient } from '@/services/api/client';
import { Technician } from '@/domain/types';

describe('Phase 7 Frontend Technician Management Suite', () => {
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

  const sampleTechnician: Technician = {
    id: 'tech-100',
    technicianCode: 'TECH-0001',
    name: 'Rahul Sharma',
    phone: '9876543210',
    email: 'rahul.sharma@example.com',
    specializations: ['Split AC', 'Cassette AC', 'VRF / VRV'],
    skills: ['Split AC', 'Cassette AC', 'VRF / VRV'],
    serviceAreas: ['Panvel', 'Navi Mumbai', 'Kharghar'],
    serviceArea: 'Panvel',
    status: 'AVAILABLE',
    isActive: true,
    maxDailyWorkload: 5,
    currentWorkload: 0,
    joiningDate: '2025-06-12',
    notes: 'Senior commercial AC specialist',
    workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    workingHours: { start: '09:00', end: '18:00' },
    availability: {
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      workingHours: { start: '09:00', end: '18:00' },
    },
    activeAssignmentsCount: 0,
    createdAt: '2026-10-07T10:00:00Z',
    updatedAt: '2026-10-07T10:00:00Z',
  };

  const renderComponent = async (onNavigate = vi.fn()) => {
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
            <TechnicianManagement onNavigate={onNavigate} />
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

  it('1. Renders Technician management view with header and actions', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      technicians: [sampleTechnician],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    } as never);

    const { container, unmount } = await renderComponent();

    expect(container.textContent).toContain('Technicians');
    expect(container.textContent).toContain('Manage field personnel');
    expect(container.textContent).toContain('+ Add Technician');
    expect(container.textContent).toContain('Refresh');

    unmount();
  });

  it('2. Displays technician list table with name, code, contact, skills, and status', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      technicians: [sampleTechnician],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    } as never);

    const { container, unmount } = await renderComponent();

    expect(container.textContent).toContain('Rahul Sharma');
    expect(container.textContent).toContain('TECH-0001');
    expect(container.textContent).toContain('9876543210');
    expect(container.textContent).toContain('rahul.sharma@example.com');
    expect(container.textContent).toContain('Split AC');
    expect(container.textContent).toContain('Panvel');
    expect(container.textContent).toContain('AVAILABLE');

    unmount();
  });

  it('3. Renders EmptyState when zero technicians exist', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      technicians: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    } as never);

    const { container, unmount } = await renderComponent();

    expect(container.textContent).toContain('No technicians registered yet');
    expect(container.textContent).toContain('+ Add Technician');

    unmount();
  });

  it('4. Opens Add Technician modal when "+ Add Technician" button is clicked', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      technicians: [],
      total: 0,
    } as never);

    const { container, unmount } = await renderComponent();

    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ Add Technician')
    );
    expect(addBtn).toBeDefined();

    await act(async () => {
      addBtn?.click();
    });

    expect(document.body.textContent).toContain('+ Add New Technician');
    expect(document.body.textContent).toContain('Full Name *');
    expect(document.body.textContent).toContain('Phone Number *');
    expect(document.body.textContent).toContain('Skills & AC Specializations *');
    expect(document.body.textContent).toContain('Service Areas *');
    expect(document.body.textContent).toContain('Weekly Working Schedule');

    unmount();
  });

  it('5. Submits new technician and triggers POST /technicians', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      technicians: [],
      total: 0,
    } as never);

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      technician: sampleTechnician,
    } as never);

    const { container, unmount } = await renderComponent();

    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ Add Technician')
    );

    await act(async () => {
      addBtn?.click();
    });

    // Fill form
    const inputs = document.body.querySelectorAll('input');
    const nameInput = Array.from(inputs).find((i) => i.placeholder?.includes('Rahul Sharma'));
    const phoneInput = Array.from(inputs).find((i) => i.placeholder?.includes('9876543210'));

    const setVal = (el: HTMLInputElement, val: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    await act(async () => {
      if (nameInput) setVal(nameInput, 'Suresh Patil');
      if (phoneInput) setVal(phoneInput, '9822334455');
    });

    const submitBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create Technician')
    );

    await act(async () => {
      submitBtn?.click();
    });

    expect(postSpy).toHaveBeenCalledWith(
      '/technicians',
      expect.objectContaining({
        name: 'Suresh Patil',
        phone: '9822334455',
      })
    );

    unmount();
  });

  it('6. Opens Technician Detail drawer when View button is clicked', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes(`/technicians/${sampleTechnician.id}`)) {
        return {
          technician: sampleTechnician,
        } as never;
      }
      return {
        technicians: [sampleTechnician],
        total: 1,
      } as never;
    });

    const { container, unmount } = await renderComponent();

    const viewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('View')
    );
    expect(viewBtn).toBeDefined();

    await act(async () => {
      viewBtn?.click();
    });

    expect(document.body.textContent).toContain('Technician Profile: TECH-0001');
    expect(document.body.textContent).toContain('Technical Skills & AC Specializations');
    expect(document.body.textContent).toContain('Weekly Availability Schedule');
    expect(document.body.textContent).toContain('Operational Workload & Capacity');

    unmount();
  });

  it('7. Opens and submits operational status change modal', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      technicians: [sampleTechnician],
      total: 1,
    } as never);

    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValueOnce({
      technician: { ...sampleTechnician, status: 'ON_LEAVE' },
    } as never);

    const { container, unmount } = await renderComponent();

    const statusBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'Status'
    );
    expect(statusBtn).toBeDefined();

    await act(async () => {
      statusBtn?.click();
    });

    expect(document.body.textContent).toContain(`Change Status: ${sampleTechnician.technicianCode}`);

    const updateBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent === 'Update Status'
    );

    await act(async () => {
      updateBtn?.click();
    });

    expect(patchSpy).toHaveBeenCalledWith(
      `/technicians/${sampleTechnician.id}/status`,
      expect.objectContaining({
        status: 'AVAILABLE',
      })
    );

    unmount();
  });

  it('8. Opens deactivation confirmation modal from drawer', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes(`/technicians/${sampleTechnician.id}`)) {
        return {
          technician: sampleTechnician,
        } as never;
      }
      return {
        technicians: [sampleTechnician],
        total: 1,
      } as never;
    });

    const { container, unmount } = await renderComponent();

    const viewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('View')
    );

    await act(async () => {
      viewBtn?.click();
    });

    const deactivateBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Deactivate')
    );
    expect(deactivateBtn).toBeDefined();

    await act(async () => {
      deactivateBtn?.click();
    });

    expect(document.body.textContent).toContain(`Deactivate Technician: ${sampleTechnician.name}`);
    expect(document.body.textContent).toContain('Confirm Deactivation');

    unmount();
  });
});
