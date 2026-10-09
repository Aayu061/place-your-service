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
    expect(container.textContent).toContain('RECOMMENDED');
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

  it('7. Displays SCHEDULE CONFLICT badge for conflicting technician and preserves PM obligation references', async () => {
    const conflictingRec: TechnicianRecommendationItem = {
      ...sampleRecommendation,
      technicianId: 'tech-200',
      name: 'Amit Shah',
      technicianCode: 'TECH-0002',
      hasConflict: true,
      warnings: ['⚠ Schedule conflict: assigned to SCH-2026-0001 (10:00–12:00)'],
    };

    vi.spyOn(scheduleApi, 'getSchedules').mockResolvedValue({
      schedules: [sampleSchedule],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    } as never);

    vi.spyOn(scheduleApi, 'getUnscheduledWork').mockResolvedValue({
      items: [
        {
          type: 'PM_OBLIGATION',
          id: 'pm-ob-101',
          identifier: 'PM-2026-0001',
          customerId: 'cust-1',
          customerName: 'Acme Corp',
          siteId: 'site-1',
          siteName: 'Headquarters',
          siteAddress: '123 Main St',
          assetId: 'asset-1',
          assetTag: 'ESSC-0001',
          brand: 'Mitsubishi Heavy',
          modelNumber: 'MSZ-01',
          acType: 'SPLIT',
          dueDate: '2026-10-15',
          amcId: 'amc-101',
          amcContractNumber: 'AMC-2026-0001',
          visitNumber: 1,
          suggestedDurationMinutes: 120,
        },
      ],
    } as never);

    vi.spyOn(scheduleApi, 'getEligibleTechnicians').mockResolvedValue({
      recommendations: [conflictingRec],
    } as never);

    const { container, unmount } = await renderComponent();

    const assignBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Assign')
    );
    await act(async () => {
      assignBtn?.click();
    });

    expect(container.textContent).toContain('Amit Shah');
    expect(container.textContent).toContain('SCHEDULE CONFLICT');
    expect(container.textContent).toContain('⚠ Schedule conflict: assigned to SCH-2026-0001 (10:00–12:00)');

    unmount();
  });

  it('8. Schedules PM obligation with nullable customerId/siteId without sending null values in payload', async () => {
    const pmItem: UnscheduledWorkItem = {
      type: 'PM_OBLIGATION',
      id: 'pm-ob-999',
      identifier: 'PM-2026-0099',
      customerId: null,
      customerName: 'AMC Client',
      siteId: null,
      siteName: 'Covered Site',
      siteAddress: 'Covered Address',
      assetId: 'asset-999',
      assetTag: 'ESSC-9999',
      brand: 'Daikin',
      modelNumber: 'FTKF50',
      acType: 'SPLIT',
      dueDate: '2026-10-25',
      amcId: 'amc-999',
      amcContractNumber: 'AMC-2026-0999',
      visitNumber: 2,
      suggestedDurationMinutes: 120,
    };

    vi.spyOn(scheduleApi, 'getSchedules').mockResolvedValue({
      schedules: [],
      total: 0,
      page: 1,
      pageSize: 15,
      totalPages: 0,
    } as never);

    vi.spyOn(scheduleApi, 'getUnscheduledWork').mockResolvedValue({
      items: [pmItem],
    } as never);

    const createSpy = vi.spyOn(scheduleApi, 'createSchedule').mockResolvedValue({
      schedule: {
        ...sampleSchedule,
        id: 'pm-ob-999',
        pmObligationId: 'pm-ob-999',
        scheduleNumber: 'PM-2026-0099',
      },
    } as never);

    vi.spyOn(scheduleApi, 'getEligibleTechnicians').mockResolvedValue({
      recommendations: [],
    } as never);

    const { container, unmount } = await renderComponent();

    // Click "Unscheduled Work" view tab
    const unscheduledTab = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Unscheduled Work')
    );
    expect(unscheduledTab).toBeDefined();

    await act(async () => {
      unscheduledTab?.click();
    });

    expect(container.textContent).toContain('PM-2026-0099');

    // Click "Schedule Slot" button
    const scheduleSlotBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Schedule Slot')
    );
    expect(scheduleSlotBtn).toBeDefined();

    await act(async () => {
      scheduleSlotBtn?.click();
    });

    // Modal opens, click "Create & Assign Tech"
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create & Assign Tech')
    );
    expect(submitBtn).toBeDefined();

    await act(async () => {
      submitBtn?.click();
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const sentPayload = createSpy.mock.calls[0][0];

    // CRITICAL: verify payload does NOT contain customerId: null or siteId: null
    expect(sentPayload.pmObligationId).toBe('pm-ob-999');
    expect(sentPayload.amcId).toBe('amc-999');
    expect(sentPayload.assetId).toBe('asset-999');
    expect(sentPayload.visitNumber).toBe(2);
    expect(sentPayload.customerId).toBeUndefined();
    expect(sentPayload.siteId).toBeUndefined();

    unmount();
  });

  it('9. Filters unscheduled work queue between Preventive Maintenance (AMC) and Service Requests (Breakdown)', async () => {
    const mixedQueue: UnscheduledWorkItem[] = [
      {
        id: 'sr-1',
        type: 'SERVICE_REQUEST',
        identifier: 'SR-2026-0001',
        customerName: 'Customer A',
        siteName: 'Site A',
        siteAddress: 'Address A',
        assetId: 'asset-1',
        assetTag: 'ESSC-0001',
        brand: 'Daikin',
        modelNumber: 'FTKF50TV',
        acType: 'SPLIT',
        description: 'AC not cooling',
        priority: 'HIGH',
        dueDate: '2026-10-15',
        suggestedDurationMinutes: 120,
      },
      {
        id: 'pm-1',
        type: 'PM_OBLIGATION',
        identifier: 'PM-2026-0001',
        customerName: 'Customer B',
        siteName: 'Site B',
        siteAddress: 'Address B',
        assetId: 'asset-2',
        assetTag: 'ESSC-0002',
        brand: 'Voltas',
        modelNumber: '185V',
        acType: 'SPLIT',
        description: 'Q1 Preventive Maintenance',
        dueDate: '2026-10-20',
        suggestedDurationMinutes: 90,
        amcId: 'amc-1',
        visitNumber: 1,
      },
    ];

    vi.spyOn(scheduleApi, 'getUnscheduledWork').mockResolvedValue({
      items: mixedQueue,
    } as never);
    vi.spyOn(scheduleApi, 'getSchedules').mockResolvedValue({
      schedules: [],
      total: 0,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    } as never);

    const { container, unmount } = await renderComponent();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Switch to unscheduled tab
    const unscheduledTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Unscheduled Work')
    );
    await act(async () => {
      unscheduledTabBtn?.click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Verify both items show in ALL
    expect(container.textContent).toContain('SR-2026-0001');
    expect(container.textContent).toContain('PM-2026-0001');

    // Filter to Preventive Maintenance
    const pmFilterBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Preventive Maintenance')
    );
    await act(async () => {
      pmFilterBtn?.click();
    });

    expect(container.textContent).toContain('PM-2026-0001');
    expect(container.textContent).not.toContain('SR-2026-0001');

    // Filter to Service Requests
    const srFilterBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Service Requests (1)')
    );
    await act(async () => {
      srFilterBtn?.click();
    });

    expect(container.textContent).toContain('SR-2026-0001');
    expect(container.textContent).not.toContain('PM-2026-0001');

    unmount();
  });
});
