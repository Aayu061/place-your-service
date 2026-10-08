import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { ServiceScheduleManagement } from '@/pages/ServiceScheduleManagement';
import { AuthContext, AuthContextType } from '@/context/authContextDef';
import { ToastProvider } from '@/components/ui/Toast';
import { scheduleApi } from '@/services/scheduleApi';
import { ServiceSchedule, TechnicianRecommendationItem, UnscheduledWorkItem } from '@/domain/types';

describe('Phase 9 Frontend Service Scheduling & Technician Assignment Suite', () => {
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

  const sampleSchedule: ServiceSchedule = {
    id: 'sched-101',
    scheduleNumber: 'SCH-2026-00001',
    amcId: null,
    amcContractNumber: null,
    serviceRequestId: 'sr-101',
    serviceRequestNumber: 'SR-2026-0001',
    serviceRequestType: 'BREAKDOWN',
    serviceRequestPriority: 'HIGH',
    customerId: 'cust-101',
    customerName: 'Sachin Parekh',
    customerCode: 'CUST-1001',
    customerPhone: '9820112233',
    siteId: 'site-101',
    siteName: 'Residence',
    siteAddress: 'Plot 45, Sector 19, Panvel, Navi Mumbai',
    assetId: 'asset-101',
    assetTag: 'ESSC-0001',
    brand: 'Mitsubishi Heavy',
    modelNumber: 'SRK24CW',
    acType: 'SPLIT',
    roomLocation: 'Living Room',
    scheduledDate: new Date().toISOString().slice(0, 10),
    startTime: '10:00',
    endTime: '12:00',
    durationMinutes: 120,
    visitNumber: null,
    status: 'SCHEDULED',
    isSystemGenerated: false,
    technicianId: null,
    technicianName: null,
    technicianCode: null,
    technicianPhone: null,
    activeAssignment: null,
    assignmentHistory: [],
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    rescheduledFromId: null,
    notes: 'AC not cooling',
    createdBy: 'admin-1',
    updatedBy: null,
    createdAt: '2026-10-08T10:00:00Z',
    updatedAt: '2026-10-08T10:00:00Z',
  };

  const sampleAssignedSchedule: ServiceSchedule = {
    ...sampleSchedule,
    id: 'sched-102',
    scheduleNumber: 'SCH-2026-00002',
    status: 'ASSIGNED',
    technicianId: 'tech-100',
    technicianName: 'Raj Patel',
    technicianCode: 'TECH-0001',
    technicianPhone: '9892001122',
    activeAssignment: {
      id: 'assign-1',
      technicianId: 'tech-100',
      technicianCode: 'TECH-0001',
      technicianName: 'Raj Patel',
      technicianPhone: '9892001122',
      assignedBy: 'admin-1',
      assignedAt: '2026-10-08T10:00:00Z',
      isOverride: false,
      status: 'ASSIGNED',
      createdAt: '2026-10-08T10:00:00Z',
    },
    assignmentHistory: [
      {
        id: 'assign-1',
        technicianId: 'tech-100',
        technicianCode: 'TECH-0001',
        technicianName: 'Raj Patel',
        technicianPhone: '9892001122',
        assignedBy: 'admin-1',
        assignedAt: '2026-10-08T10:00:00Z',
        isOverride: false,
        status: 'ASSIGNED',
        createdAt: '2026-10-08T10:00:00Z',
      },
    ],
  };

  const sampleUnscheduledItem: UnscheduledWorkItem = {
    type: 'SERVICE_REQUEST',
    id: 'sr-101',
    identifier: 'SR-2026-0001',
    customerId: 'cust-101',
    customerName: 'Sachin Parekh',
    siteId: 'site-101',
    siteName: 'Residence',
    siteAddress: 'Panvel, Navi Mumbai',
    assetId: 'asset-101',
    assetTag: 'ESSC-0001',
    brand: 'Mitsubishi Heavy',
    modelNumber: 'SRK24CW',
    acType: 'SPLIT',
    dueDate: '2026-10-15',
    priority: 'HIGH',
    description: 'AC not cooling',
    suggestedDurationMinutes: 120,
  };

  const sampleRecommendation: TechnicianRecommendationItem = {
    technicianId: 'tech-100',
    technicianCode: 'TECH-0001',
    name: 'Raj Patel',
    phone: '9892001122',
    specializations: ['SPLIT', 'INVERTER'],
    serviceAreas: ['Panvel', 'Navi Mumbai'],
    status: 'AVAILABLE',
    isActive: true,
    isEligible: true,
    score: 80,
    scoreBreakdown: {
      areaScore: 40,
      availabilityScore: 20,
      proximityScore: 0,
      workloadScore: 10,
      skillScore: 10,
    },
    areaMatch: true,
    isAvailable: true,
    skillMatch: true,
    hasConflict: false,
    dailyWorkload: 1,
    maxDailyWorkload: 5,
    reasons: ['✓ Service area match', '✓ Available during schedule slot', '✓ Skill match'],
    warnings: [],
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
            <ServiceScheduleManagement onNavigate={onNavigate} />
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

  it('1. Renders Service Scheduling page with KPI cards and view tabs', async () => {
    vi.spyOn(scheduleApi, 'getSchedules').mockResolvedValueOnce({
      schedules: [sampleSchedule],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    } as never);

    vi.spyOn(scheduleApi, 'getUnscheduledWork').mockResolvedValueOnce({
      items: [sampleUnscheduledItem],
    } as never);

    const { container, unmount } = await renderComponent();

    expect(container.textContent).toContain('Service Scheduling & Assignments');
    expect(container.textContent).toContain("TODAY'S VISITS");
    expect(container.textContent).toContain('UNSCHEDULED QUEUE');
    expect(container.textContent).toContain("Today's Operations");
    expect(container.textContent).toContain('Unscheduled Work');

    unmount();
  });

  it("2. Displays today's scheduled appointment with slot time, customer, and asset tag", async () => {
    vi.spyOn(scheduleApi, 'getSchedules').mockResolvedValueOnce({
      schedules: [sampleSchedule],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    } as never);

    vi.spyOn(scheduleApi, 'getUnscheduledWork').mockResolvedValueOnce({
      items: [],
    } as never);

    const { container, unmount } = await renderComponent();

    expect(container.textContent).toContain('10:00 – 12:00');
    expect(container.textContent).toContain('Sachin Parekh');
    expect(container.textContent).toContain('ESSC-0001');
    expect(container.textContent).toContain('Mitsubishi Heavy');
    expect(container.textContent).toContain('Unassigned');

    unmount();
  });

  it('3. Switches to Unscheduled Work tab and displays actionable queue', async () => {
    vi.spyOn(scheduleApi, 'getSchedules').mockResolvedValue({
      schedules: [],
      total: 0,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    } as never);

    vi.spyOn(scheduleApi, 'getUnscheduledWork').mockResolvedValue({
      items: [sampleUnscheduledItem],
    } as never);

    const { container, unmount } = await renderComponent();

    // Click on Unscheduled Work tab
    const unscheduledTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Unscheduled Work')
    );
    expect(unscheduledTabBtn).toBeDefined();

    await act(async () => {
      unscheduledTabBtn?.click();
    });

    expect(container.textContent).toContain('Unscheduled Work Queue');
    expect(container.textContent).toContain('SR-2026-0001');
    expect(container.textContent).toContain('Schedule Slot');

    unmount();
  });

  it('4. Opens Schedule & Assign modal and shows "Why this technician" recommendations', async () => {
    vi.spyOn(scheduleApi, 'getSchedules').mockResolvedValue({
      schedules: [sampleSchedule],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    } as never);

    vi.spyOn(scheduleApi, 'getUnscheduledWork').mockResolvedValue({
      items: [],
    } as never);

    vi.spyOn(scheduleApi, 'getEligibleTechnicians').mockResolvedValue({
      recommendations: [sampleRecommendation],
    } as never);

    const { container, unmount } = await renderComponent();

    // Click "Assign" button
    const assignBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Assign')
    );
    expect(assignBtn).toBeDefined();

    await act(async () => {
      assignBtn?.click();
    });

    expect(container.textContent).toContain('Assign Technician');
    expect(container.textContent).toContain('Raj Patel');
    expect(container.textContent).toContain('TECH-0001');
    expect(container.textContent).toContain('Match Score: 80/80');
    expect(container.textContent).toContain('✓ Service area match');

    unmount();
  });

  it('5. Successfully assigns technician to the schedule', async () => {
    vi.spyOn(scheduleApi, 'getSchedules').mockResolvedValue({
      schedules: [sampleSchedule],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    } as never);

    vi.spyOn(scheduleApi, 'getUnscheduledWork').mockResolvedValue({
      items: [],
    } as never);

    vi.spyOn(scheduleApi, 'getEligibleTechnicians').mockResolvedValue({
      recommendations: [sampleRecommendation],
    } as never);

    const assignSpy = vi.spyOn(scheduleApi, 'assignTechnician').mockResolvedValue({
      schedule: sampleAssignedSchedule,
    } as never);

    const { container, unmount } = await renderComponent();

    // Click "Assign" button
    const assignBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Assign')
    );

    await act(async () => {
      assignBtn?.click();
    });

    // Select the radio button for technician
    const radio = container.querySelector('input[type="radio"]') as HTMLInputElement;
    if (radio) {
      await act(async () => {
        radio.click();
      });
    }

    // Click "Confirm Assignment"
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Assignment')
    );
    expect(confirmBtn).toBeDefined();

    await act(async () => {
      confirmBtn?.click();
    });

    expect(assignSpy).toHaveBeenCalledWith('sched-101', expect.objectContaining({
      technicianId: 'tech-100',
    }));

    unmount();
  });

  it('6. Opens Detail drawer displaying complete asset, contract, and audit information', async () => {
    vi.spyOn(scheduleApi, 'getSchedules').mockResolvedValue({
      schedules: [sampleAssignedSchedule],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    } as never);

    vi.spyOn(scheduleApi, 'getUnscheduledWork').mockResolvedValue({
      items: [],
    } as never);

    vi.spyOn(scheduleApi, 'getScheduleById').mockResolvedValue({
      schedule: sampleAssignedSchedule,
    } as never);

    const { container, unmount } = await renderComponent();

    // Click "Details" button
    const detailsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Details')
    );
    expect(detailsBtn).toBeDefined();

    await act(async () => {
      detailsBtn?.click();
    });

    expect(container.textContent).toContain('PHYSICAL AC ASSET & LOCATION');
    expect(container.textContent).toContain('ESSC-0001');
    expect(container.textContent).toContain('Mitsubishi Heavy');
    expect(container.textContent).toContain('Living Room');
    expect(container.textContent).toContain('ASSIGNED OPERATIONAL RESOURCE');
    expect(container.textContent).toContain('Raj Patel');
    expect(container.textContent).toContain('ASSIGNMENT AUDIT TRAIL');

    unmount();
  });
});
