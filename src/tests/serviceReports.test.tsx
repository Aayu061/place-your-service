import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { ServiceReportsManagement } from '@/pages/ServiceReportsManagement';
import { ServiceVisitReportModal } from '@/components/serviceReports/ServiceVisitReportModal';
import { ServiceReportPrintView } from '@/components/serviceReports/ServiceReportPrintView';
import { ToastProvider } from '@/components/ui/Toast';
import { serviceReportApi } from '@/services/serviceReportApi';
import {
  ServiceVisitReport,
  ServiceSchedule,
} from '@/domain/types';
import { ApiError } from '@/services/api/client';

describe('Service Visit Reports & Completion Management Frontend Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockCompletedReport: ServiceVisitReport = {
    id: 'rep-001',
    reportNumber: 'SVR-2026-9001',
    visitType: 'SERVICE_REQUEST',
    scheduleId: 'sched-101',
    scheduleNumber: 'SCH-2026-00001',
    amcId: null,
    pmObligationId: null,
    serviceRequestId: 'sr-101',
    serviceRequestNumber: 'SR-2026-0001',
    customerId: 'cust-101',
    customerName: 'Sachin Parekh',
    customerPhone: '9820112233',
    siteId: 'site-101',
    siteName: 'Residence',
    siteAddress: 'Plot 45, Sector 19, Panvel, Navi Mumbai',
    technicianId: 'tech-101',
    technicianName: 'Raj Patel',
    technicianCode: 'TECH-0001',
    serviceDate: '2026-10-10',
    startTime: '10:00',
    endTime: '11:45',
    primaryOutcome: 'COMPLETED',
    resolutionStatus: 'RESOLVED',
    status: 'COMPLETED',
    technicianRemarks: 'Comprehensive coil cleaning and electrical terminal tightening completed successfully.',
    customerRepresentative: 'Sachin Parekh',
    customerAcknowledgement: 'Air conditioner cooling restored to normal operating temperature.',
    followUpScheduleId: null,
    createdBy: 'admin-1',
    updatedBy: null,
    createdAt: '2026-10-10T11:45:00Z',
    updatedAt: '2026-10-10T11:45:00Z',
    assets: [
      {
        id: 'rep-asset-001',
        reportId: 'rep-001',
        assetId: 'asset-101',
        assetTag: 'ESSC-0001',
        brand: 'Mitsubishi Heavy',
        modelNumber: 'SRK24CW',
        roomLocation: 'Living Room',
        faultReported: 'Cooling low and unusual fan vibration',
        diagnosisFindings: 'Dust accumulated on condenser coils, minor electrical resistance on relay',
        workPerformed: 'Pressure washed coils, cleaned blower wheel, tightened contacts',
        assetOutcome: 'COMPLETED',
        finalCondition: 'Good',
        refrigerantAdded: false,
        refrigerantQtyKg: null,
        notes: 'Running delta T is 14 degrees C',
        createdAt: '2026-10-10T11:45:00Z',
        updatedAt: '2026-10-10T11:45:00Z',
      },
    ],
    items: [],
  };

  const mockPendingPartsReport: ServiceVisitReport = {
    id: 'rep-002',
    reportNumber: 'SVR-2026-9002',
    visitType: 'SERVICE_REQUEST',
    scheduleId: 'sched-102',
    scheduleNumber: 'SCH-2026-00002',
    amcId: null,
    pmObligationId: null,
    serviceRequestId: 'sr-102',
    serviceRequestNumber: 'SR-2026-0002',
    customerId: 'cust-102',
    customerName: 'Aarti Sharma',
    customerPhone: '9833221100',
    siteId: 'site-102',
    siteName: 'Office Suite',
    siteAddress: 'Andheri East, Mumbai',
    technicianId: 'tech-102',
    technicianName: 'Amit Verma',
    technicianCode: 'TECH-0002',
    serviceDate: '2026-10-10',
    startTime: '13:00',
    endTime: '14:30',
    primaryOutcome: 'PENDING_PARTS',
    resolutionStatus: 'AWAITING_PARTS',
    status: 'PENDING_PARTS',
    technicianRemarks: 'Outdoor fan motor failed open-circuit. Replacement required.',
    customerRepresentative: 'Office Manager',
    customerAcknowledgement: 'Pending procurement of replacement motor.',
    followUpScheduleId: null,
    createdBy: 'admin-1',
    updatedBy: null,
    createdAt: '2026-10-10T14:30:00Z',
    updatedAt: '2026-10-10T14:30:00Z',
    assets: [
      {
        id: 'rep-asset-002',
        reportId: 'rep-002',
        assetId: 'asset-102',
        assetTag: 'ESSC-0002',
        brand: 'Daikin',
        modelNumber: 'FTKF50',
        roomLocation: 'Server Room',
        faultReported: 'High temperature alarm',
        diagnosisFindings: 'ODU Fan motor burned out',
        workPerformed: 'Electrical testing performed, verified winding open circuit',
        assetOutcome: 'PENDING_PARTS',
        finalCondition: 'Poor',
        refrigerantAdded: false,
        refrigerantQtyKg: null,
        notes: 'Needs 45W BLDC fan motor',
        createdAt: '2026-10-10T14:30:00Z',
        updatedAt: '2026-10-10T14:30:00Z',
      },
    ],
    items: [
      {
        id: 'rep-item-001',
        reportId: 'rep-002',
        assetId: 'asset-102',
        itemType: 'PART_REQUIRED',
        itemName: 'Outdoor Fan Motor 45W',
        partNumber: 'DK-OFM-45',
        quantity: 1,
        reason: 'Motor winding burnt out; fan not rotating',
        diagnosis: null,
        workCompleted: null,
        recommendedAction: null,
        acCondition: 'Non-operational',
        isApprovalRequired: false,
        isSpecialistRequired: false,
        isRevisitRequired: true,
        isResolved: false,
        createdAt: '2026-10-10T14:30:00Z',
        updatedAt: '2026-10-10T14:30:00Z',
      },
    ],
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
    scheduledDate: '2026-10-10',
    startTime: '10:00',
    endTime: '12:00',
    durationMinutes: 120,
    visitNumber: null,
    status: 'ASSIGNED',
    isSystemGenerated: false,
    technicianId: 'tech-101',
    technicianName: 'Raj Patel',
    technicianCode: 'TECH-0001',
    technicianPhone: '9876543210',
    activeAssignment: null,
    notes: 'Urgent breakdown service',
    createdAt: '2026-10-09T10:00:00Z',
    updatedAt: '2026-10-09T10:00:00Z',
  };

  const renderComponent = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ToastProvider>{ui}</ToastProvider>);
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

  it('1. Renders Service Reports Register with KPI summary and search bar', async () => {
    vi.spyOn(serviceReportApi, 'getReports').mockResolvedValue({
      reports: [mockCompletedReport, mockPendingPartsReport],
      total: 2,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });

    const { container, unmount } = await renderComponent(
      <ServiceReportsManagement />
    );

    expect(container.textContent).toContain('Service Visit Reports Register');
    expect(container.textContent).toContain('Total Reports');
    expect(container.textContent).toContain('Service Completed');
    expect(container.textContent).toContain('Pending for Parts');
    expect(container.textContent).toContain('Pending for Repairs');

    // Report table items
    expect(container.textContent).toContain('SVR-2026-9001');
    expect(container.textContent).toContain('Sachin Parekh');
    expect(container.textContent).toContain('SVR-2026-9002');
    expect(container.textContent).toContain('Aarti Sharma');
    expect(container.textContent).toContain('Raj Patel');

    unmount();
  });

  it('2. Opens report detail drawer on clicking View button', async () => {
    vi.spyOn(serviceReportApi, 'getReports').mockResolvedValue({
      reports: [mockCompletedReport],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });

    vi.spyOn(serviceReportApi, 'getReportById').mockResolvedValue({
      report: mockCompletedReport,
    });

    const { container, unmount } = await renderComponent(
      <ServiceReportsManagement />
    );

    const viewButton = container.querySelector('button[title="View Details"]') as HTMLButtonElement;
    expect(viewButton).toBeDefined();

    await act(async () => {
      viewButton?.click();
    });

    expect(serviceReportApi.getReportById).toHaveBeenCalledWith('rep-001');
    expect(container.textContent).toContain('Service Visit Report #SVR-2026-9001');
    expect(container.textContent).toContain('Customer & Site');
    expect(container.textContent).toContain('AC Asset Inspection Findings');
    expect(container.textContent).toContain('Comprehensive coil cleaning and electrical terminal tightening');
    expect(container.textContent).toContain('Sachin Parekh');

    unmount();
  });

  it('3. Renders Revisit button for pending reports and opens modal', async () => {
    vi.spyOn(serviceReportApi, 'getReports').mockResolvedValue({
      reports: [mockPendingPartsReport],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });

    const { container, unmount } = await renderComponent(
      <ServiceReportsManagement />
    );

    const revisitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Revisit')
    );
    expect(revisitBtn).toBeDefined();

    await act(async () => {
      revisitBtn?.click();
    });

    expect(container.textContent).toContain('Arrange Follow-Up Revisit — Report #SVR-2026-9002');
    expect(container.textContent).toContain('SVR-2026-9002');

    unmount();
  });

  it('4. ServiceVisitReportModal validates manual report number is required', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    const { container, unmount } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        onClose={handleClose}
        schedule={sampleSchedule}
        onSuccess={handleSuccess}
      />
    );

    expect(container.textContent).toContain('Create Service Visit Report');
    expect(container.textContent).toContain('SCH-2026-00001');
    expect(container.textContent).toContain('Sachin Parekh');

    // Click submit without entering report number
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit Visit Report')
    );
    expect(submitBtn).toBeDefined();

    await act(async () => {
      submitBtn?.click();
    });

    expect(container.textContent).toContain('Manual report number is mandatory');

    unmount();
  });

  it('5. ServiceVisitReportModal switches outcomes and submits successfully', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    vi.spyOn(serviceReportApi, 'createReport').mockResolvedValue({
      report: mockCompletedReport,
    });

    const { container, unmount } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        onClose={handleClose}
        schedule={sampleSchedule}
        onSuccess={handleSuccess}
      />
    );

    // Enter manual report number
    const reportNumInput = container.querySelector('input[placeholder="e.g. REP-2026-0042"]') as HTMLInputElement;
    expect(reportNumInput).toBeDefined();

    await act(async () => {
      setInputValue(reportNumInput, 'SVR-2026-9001');
    });

    // Enter work performed on asset
    const workInput = container.querySelector('input[placeholder="e.g. Jet cleaned filters, tested compressor amp"]') as HTMLInputElement;
    expect(workInput).toBeDefined();

    await act(async () => {
      setInputValue(workInput, 'Jet cleaned condenser and evaporator coils.');
    });

    // Submit form
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit Visit Report')
    );
    expect(submitBtn).toBeDefined();

    await act(async () => {
      submitBtn?.click();
    });

    expect(serviceReportApi.createReport).toHaveBeenCalled();
    const callArg = vi.mocked(serviceReportApi.createReport).mock.calls[0][0];
    expect(callArg.reportNumber).toBe('SVR-2026-9001');
    expect(callArg.primaryOutcome).toBe('COMPLETED');
    expect(callArg.scheduleId).toBe('sched-101');
    expect(callArg.assets.length).toBeGreaterThan(0);

    unmount();
  });

  it('6. ServiceReportPrintView renders comprehensive printable layout with branding', async () => {
    const handleClose = vi.fn();

    const { container, unmount } = await renderComponent(
      <ServiceReportPrintView
        report={mockPendingPartsReport}
        onClose={handleClose}
      />
    );

    expect(container.textContent).toContain('PLACE YOUR SERVICE');
    expect(container.textContent).toContain('Technical Service Report');
    expect(container.textContent).toContain('SVR-2026-9002');
    expect(container.textContent).toContain('PENDING FOR PARTS');
    expect(container.textContent).toContain('Aarti Sharma');
    expect(container.textContent).toContain('Daikin');
    expect(container.textContent).toContain('FTKF50');
    expect(container.textContent).toContain('Pending Parts Requirement');
    expect(container.textContent).toContain('Outdoor Fan Motor 45W');
    expect(container.textContent).toContain('DK-OFM-45');
    expect(container.textContent).toContain('Technician Signature');
    expect(container.textContent).toContain('Customer / Client Sign-off');

    unmount();
  });

  it('7. ServiceVisitReportModal immediately clears stale error notice when user types report number', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    const { container, unmount } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        onClose={handleClose}
        schedule={sampleSchedule}
        onSuccess={handleSuccess}
      />
    );

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit Visit Report')
    );

    // 1. Submit empty -> triggers validation notice
    await act(async () => {
      submitBtn?.click();
    });
    expect(container.textContent).toContain('Manual report number is mandatory');

    // 2. Type valid report number -> error notice MUST be immediately cleared!
    const reportNumInput = container.querySelector(
      'input[placeholder="e.g. REP-2026-0042"]'
    ) as HTMLInputElement;

    await act(async () => {
      setInputValue(reportNumInput, 'SVR-2026-NEW');
    });

    // The stale validation notice MUST NOT be present on the screen
    expect(container.textContent).not.toContain('Manual report number is mandatory');

    unmount();
  });

  it('8. ServiceVisitReportModal validates that visit end time must be after start time', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    const { container, unmount } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        onClose={handleClose}
        schedule={sampleSchedule}
        onSuccess={handleSuccess}
      />
    );

    const reportNumInput = container.querySelector(
      'input[placeholder="e.g. REP-2026-0042"]'
    ) as HTMLInputElement;
    await act(async () => {
      setInputValue(reportNumInput, 'SVR-2026-TIME');
    });

    // Set invalid time range: end 08:00 is earlier than start 10:00
    const timeInputs = container.querySelectorAll('input[type="time"]');
    expect(timeInputs.length).toBeGreaterThanOrEqual(2);
    const startTimeInput = timeInputs[0] as HTMLInputElement;
    const endTimeInput = timeInputs[1] as HTMLInputElement;

    await act(async () => {
      setInputValue(startTimeInput, '10:00');
      setInputValue(endTimeInput, '08:00');
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit Visit Report')
    );

    await act(async () => {
      submitBtn?.click();
    });

    expect(container.textContent).toContain('End time must be after start time');

    // Fixing end time clears error
    await act(async () => {
      setInputValue(endTimeInput, '12:00');
    });
    expect(container.textContent).not.toContain('End time must be after start time');

    unmount();
  });

  it('9. ServiceVisitReportModal handles 409 duplicate report number without losing entered data', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    vi.spyOn(serviceReportApi, 'createReport').mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Report number already exists')
    );

    const { container, unmount } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        onClose={handleClose}
        schedule={sampleSchedule}
        onSuccess={handleSuccess}
      />
    );

    const reportNumInput = container.querySelector(
      'input[placeholder="e.g. REP-2026-0042"]'
    ) as HTMLInputElement;
    const workInput = container.querySelector(
      'input[placeholder="e.g. Jet cleaned filters, tested compressor amp"]'
    ) as HTMLInputElement;

    await act(async () => {
      setInputValue(reportNumInput, 'SVR-2026-DUPLICATE');
      setInputValue(workInput, 'Tested compressor amperage and jet cleaned blower.');
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit Visit Report')
    );

    await act(async () => {
      submitBtn?.click();
    });

    // Should display conflict notice
    expect(container.textContent).toContain('already exists');
    // Modal must NOT close on error
    expect(handleClose).not.toHaveBeenCalled();
    // Entered data must NOT be cleared!
    expect(reportNumInput.value).toBe('SVR-2026-DUPLICATE');
    expect(workInput.value).toBe('Tested compressor amperage and jet cleaned blower.');

    unmount();
  });

  it('10. ServiceVisitReportModal validates Pending for Parts required fields', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    const { container, unmount } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        onClose={handleClose}
        schedule={sampleSchedule}
        onSuccess={handleSuccess}
      />
    );

    // Switch to Pending for Parts
    const pendingPartsCard = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Pending for Parts')
    );
    expect(pendingPartsCard).toBeDefined();

    await act(async () => {
      pendingPartsCard?.click();
    });

    const reportNumInput = container.querySelector(
      'input[placeholder="e.g. REP-2026-0042"]'
    ) as HTMLInputElement;
    await act(async () => {
      setInputValue(reportNumInput, 'SVR-2026-PARTS');
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit Visit Report')
    );

    // Submitting without part name & reason should show validation error
    await act(async () => {
      submitBtn?.click();
    });

    expect(container.textContent).toContain('All required part items must have a Part Name and Reason');

    unmount();
  });

  it('11. ServiceVisitReportModal validates Pending for Repairs required fields', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    const { container, unmount } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        onClose={handleClose}
        schedule={sampleSchedule}
        onSuccess={handleSuccess}
      />
    );

    // Switch to Pending for Repairs
    const pendingRepairsCard = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Pending for Repairs')
    );
    expect(pendingRepairsCard).toBeDefined();

    await act(async () => {
      pendingRepairsCard?.click();
    });

    const reportNumInput = container.querySelector(
      'input[placeholder="e.g. REP-2026-0042"]'
    ) as HTMLInputElement;
    await act(async () => {
      setInputValue(reportNumInput, 'SVR-2026-REPAIRS');
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Submit Visit Report')
    );

    await act(async () => {
      submitBtn?.click();
    });

    expect(container.textContent).toContain('All repair items must have a Fault/Repair Description');

    unmount();
  });

  it('12. ServiceReportsManagement displays server summary KPI counts and resets filters', async () => {
    vi.spyOn(serviceReportApi, 'getReports').mockResolvedValue({
      reports: [mockCompletedReport, mockPendingPartsReport],
      total: 50,
      page: 1,
      pageSize: 15,
      totalPages: 4,
      summary: {
        total: 50,
        completed: 35,
        pendingParts: 10,
        pendingRepairs: 5,
      },
    });

    const { container, unmount } = await renderComponent(
      <ServiceReportsManagement />
    );

    expect(container.textContent).toContain('50');
    expect(container.textContent).toContain('35');
    expect(container.textContent).toContain('10');
    expect(container.textContent).toContain('5');

    // Filter controls exist
    const searchInput = container.querySelector('input[placeholder*="Search by Report #"]') as HTMLInputElement;
    expect(searchInput).toBeDefined();

    await act(async () => {
      setInputValue(searchInput, 'SVR-2026');
    });
    expect(searchInput.value).toBe('SVR-2026');

    // Reset button clears filter
    const resetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Reset')
    );
    expect(resetBtn).toBeDefined();

    await act(async () => {
      resetBtn?.click();
    });

    expect(searchInput.value).toBe('');

    unmount();
  });

  it('13. ServiceVisitReportModal renders structured appointment context, outcome selector cards with distinct selection classes, and organized asset inspection groups', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    const { container, unmount } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        onClose={handleClose}
        schedule={sampleSchedule}
        onSuccess={handleSuccess}
      />
    );

    // Modal dialog max-width
    const dialog = container.querySelector('.modal-dialog') as HTMLElement;
    expect(dialog).toBeDefined();
    expect(dialog?.style.maxWidth).toBe('1040px');

    // Appointment Context Panel & Responsive Grid
    const contextPanel = container.querySelector('.svr-context-panel');
    expect(contextPanel).toBeDefined();
    expect(contextPanel?.textContent).toContain('Appointment Context (Read-Only)');
    expect(contextPanel?.textContent).toContain('Customer');
    expect(contextPanel?.textContent).toContain('Sachin Parekh');
    expect(contextPanel?.textContent).toContain('Site Location');
    expect(contextPanel?.textContent).toContain('Residence');
    expect(contextPanel?.textContent).toContain('Assigned Technician');
    expect(contextPanel?.textContent).toContain('Raj Patel');

    // 3 Equal Outcome Selector Cards
    const outcomeCards = container.querySelectorAll('.svr-outcome-card');
    expect(outcomeCards.length).toBe(3);
    expect(outcomeCards[0].textContent).toContain('Service Completed');
    expect(outcomeCards[1].textContent).toContain('Pending for Parts');
    expect(outcomeCards[2].textContent).toContain('Pending for Repairs');

    // Default outcome is completed -> selected-completed class
    expect(outcomeCards[0].classList.contains('selected-completed')).toBe(true);

    // Switch to Pending for Parts
    await act(async () => {
      (outcomeCards[1] as HTMLButtonElement).click();
    });
    expect(outcomeCards[1].classList.contains('selected-parts')).toBe(true);
    expect(outcomeCards[0].classList.contains('selected-completed')).toBe(false);

    // Asset inspection cards & organized groups
    const assetCard = container.querySelector('.svr-asset-card');
    expect(assetCard).toBeDefined();
    expect(assetCard?.textContent).toContain('ESSC-0001');
    expect(assetCard?.textContent).toContain('1. Inspection & Diagnostic Findings');
    expect(assetCard?.textContent).toContain('2. Work Performed & Asset Operational Status');

    // Sticky Footer actions & required label
    expect(container.textContent).toContain('All fields with asterisk (*) are required for persistence');
    expect(container.textContent).toContain('Cancel');
    expect(container.textContent).toContain('Submit Visit Report');

    unmount();
  });

  it('14. ServiceReportsManagement renders aligned 4-card KPI grid and cohesive horizontal filter toolbar', async () => {
    vi.spyOn(serviceReportApi, 'getReports').mockResolvedValue({
      reports: [mockCompletedReport, mockPendingPartsReport],
      total: 2,
      page: 1,
      pageSize: 15,
      totalPages: 1,
      summary: {
        total: 2,
        completed: 1,
        pendingParts: 1,
        pendingRepairs: 0,
      },
    });

    const { container, unmount } = await renderComponent(
      <ServiceReportsManagement />
    );

    // 4 KPI Cards in .svr-kpi-grid
    const kpiGrid = container.querySelector('.svr-kpi-grid');
    expect(kpiGrid).toBeDefined();
    const kpiCards = container.querySelectorAll('.svr-kpi-card');
    expect(kpiCards.length).toBe(4);
    expect(kpiCards[0].classList.contains('total')).toBe(true);
    expect(kpiCards[1].classList.contains('completed')).toBe(true);
    expect(kpiCards[2].classList.contains('pending-parts')).toBe(true);
    expect(kpiCards[3].classList.contains('pending-repairs')).toBe(true);

    // Filter toolbar
    const toolbar = container.querySelector('.svr-filter-toolbar');
    expect(toolbar).toBeDefined();
    expect(toolbar?.querySelector('.svr-filter-search')).toBeDefined();
    const selects = toolbar?.querySelectorAll('.svr-filter-select');
    expect(selects?.length).toBe(3); // Visit type + Outcome + Resolution Status selects
    expect(toolbar?.querySelector('.svr-filter-dates')).toBeDefined();
    expect(toolbar?.querySelector('.svr-filter-actions')).toBeDefined();

    unmount();
  });

  it('15. ServiceReportsManagement properly renders compact loading and empty states', async () => {
    // 15A: Loading state when no initial reports
    let resolveReports: (val: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveReports = resolve;
    });
    vi.spyOn(serviceReportApi, 'getReports').mockReturnValue(pendingPromise as unknown as ReturnType<typeof serviceReportApi.getReports>);

    const { container, unmount } = await renderComponent(
      <ServiceReportsManagement />
    );

    expect(container.querySelector('.svr-loading-state')).toBeDefined();
    expect(container.textContent).toContain('Loading service reports...');

    // 15B: Resolve with empty array -> Empty state
    await act(async () => {
      resolveReports!({
        reports: [],
        total: 0,
        page: 1,
        pageSize: 15,
        totalPages: 1,
      });
    });

    expect(container.textContent).toContain('No Service Reports Found');
    expect(container.textContent).toContain('No service visit reports recorded yet');

    unmount();
  });

  it('16. ServiceVisitReportModal in edit mode pre-fills existing report data and submits updateReport', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    vi.spyOn(serviceReportApi, 'updateReport').mockResolvedValue({
      report: {
        ...mockCompletedReport,
        technicianRemarks: 'Updated technician remarks after inspection review.',
      },
    });

    const { container, unmount } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        onClose={handleClose}
        mode="edit"
        initialReport={mockCompletedReport}
        onSuccess={handleSuccess}
      />
    );

    // Verify Edit header & prefilled values
    expect(container.textContent).toContain('Edit Service Visit Report #SVR-2026-9001');
    const reportNumInput = container.querySelector(
      'input[placeholder="e.g. REP-2026-0042"]'
    ) as HTMLInputElement;
    expect(reportNumInput.value).toBe('SVR-2026-9001');

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Update Visit Report')
    );
    expect(submitBtn).toBeDefined();

    await act(async () => {
      submitBtn?.click();
    });

    expect(serviceReportApi.updateReport).toHaveBeenCalledWith('rep-001', expect.objectContaining({
      reportNumber: 'SVR-2026-9001',
      serviceDate: '2026-10-10',
    }));
    expect(handleSuccess).toHaveBeenCalled();

    unmount();
  });

  it('17. ServiceVisitReportModal in edit mode handles 409 conflict and preserves form fields', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    vi.spyOn(serviceReportApi, 'updateReport').mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Report number SVR-2026-9001 is already in use by another report')
    );

    const { container, unmount } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        onClose={handleClose}
        mode="edit"
        initialReport={mockCompletedReport}
        onSuccess={handleSuccess}
      />
    );

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Update Visit Report')
    );
    expect(submitBtn).toBeDefined();

    await act(async () => {
      submitBtn?.click();
    });

    expect(container.textContent).toContain('already in use by another report');
    expect(handleClose).not.toHaveBeenCalled();

    // Field value still preserved
    const reportNumInput = container.querySelector(
      'input[placeholder="e.g. REP-2026-0042"]'
    ) as HTMLInputElement;
    expect(reportNumInput.value).toBe('SVR-2026-9001');

    unmount();
  });

  it('18. Verifies complete absence of Recommended Next Action in modal and ServiceReportPrintView', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    // 18A: In ServiceVisitReportModal when switched to Pending for Repairs
    const { container: modalContainer, unmount: unmountModal } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        onClose={handleClose}
        schedule={sampleSchedule}
        onSuccess={handleSuccess}
      />
    );

    const pendingRepairsCard = Array.from(modalContainer.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Pending for Repairs')
    );
    await act(async () => {
      pendingRepairsCard?.click();
    });

    expect(modalContainer.textContent).not.toContain('Recommended Next Action');
    unmountModal();

    // 18B: In ServiceReportPrintView
    const reportWithRepair: ServiceVisitReport = {
      ...mockCompletedReport,
      primaryOutcome: 'PENDING_REPAIRS',
      items: [
        {
          id: 'item-repair-1',
          reportId: 'rep-001',
          assetId: 'asset-101',
          itemType: 'REPAIR_REQUIRED',
          itemName: 'Cracked suction discharge pipe joint',
          partNumber: null,
          quantity: 1,
          reason: 'Awaiting high-pressure copper piping replacement',
          diagnosis: 'Cracked suction discharge pipe joint',
          workCompleted: 'Leak detection completed',
          recommendedAction: null,
          acCondition: 'Inoperative',
          isApprovalRequired: true,
          isSpecialistRequired: true,
          isRevisitRequired: true,
          isResolved: false,
          createdAt: '2026-10-10T11:45:00Z',
          updatedAt: '2026-10-10T11:45:00Z',
        },
      ],
    };

    const { container: printContainer, unmount: unmountPrint } = await renderComponent(
      <ServiceReportPrintView
        report={reportWithRepair}
        onClose={vi.fn()}
      />
    );

    expect(printContainer.textContent).toContain('Pending Repairs & Action Items');
    expect(printContainer.textContent).toContain('Cracked suction discharge pipe joint');
    expect(printContainer.textContent).not.toContain('Recommended Next Action');

    unmountPrint();
  });

  it('19. Progressive disclosure expands and collapses Additional Details & Customer Remarks section', async () => {
    const { container, unmount } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        onClose={vi.fn()}
        schedule={sampleSchedule}
        onSuccess={vi.fn()}
      />
    );

    const toggleBtn = container.querySelector('.svr-disclosure-toggle') as HTMLButtonElement;
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

    // Section 6 content is hidden initially
    expect(container.querySelector('.svr-disclosure-content')).toBeNull();

    // Click to expand
    await act(async () => {
      toggleBtn.click();
    });

    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    const content = container.querySelector('.svr-disclosure-content');
    expect(content).toBeDefined();
    expect(content?.textContent).toContain('General Technician Remarks');
    expect(content?.textContent).toContain('Customer / Site Representative Name');

    // Click again to collapse
    await act(async () => {
      toggleBtn.click();
    });

    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.svr-disclosure-content')).toBeNull();

    unmount();
  });

  it('20. ServiceReportsManagement detail drawer provides Edit Report action opening edit modal', async () => {
    vi.spyOn(serviceReportApi, 'getReports').mockResolvedValue({
      reports: [mockCompletedReport],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });

    vi.spyOn(serviceReportApi, 'getReportById').mockResolvedValue({
      report: mockCompletedReport,
    });

    const { container, unmount } = await renderComponent(
      <ServiceReportsManagement />
    );

    // Click View to open drawer
    const viewButton = container.querySelector('button[title="View Details"]') as HTMLButtonElement;
    await act(async () => {
      viewButton?.click();
    });

    // Detail drawer header contains Edit Report button
    const editBtn = container.querySelector('button[title="Edit Report"]') as HTMLButtonElement;
    expect(editBtn).toBeDefined();
    expect(editBtn.textContent).toContain('Edit Report');

    // Clicking Edit Report opens edit modal
    await act(async () => {
      editBtn.click();
    });

    expect(container.textContent).toContain('Edit Service Visit Report #SVR-2026-9001');

    unmount();
  });

  it('21. ServiceReportPrintView displays distinct IDU & ODU serial numbers, technical specs, and handles multiple assets without mixing data', async () => {
    const handleClose = vi.fn();

    const multiAssetReport: ServiceVisitReport = {
      ...mockCompletedReport,
      reportNumber: 'SVR-2026-MULTI',
      assets: [
        {
          id: 'rep-asset-101',
          reportId: 'rep-multi',
          assetId: 'asset-101',
          assetTag: 'ESSC-0003',
          brand: 'Voltas',
          modelNumber: '185V Vectra',
          indoorSerialNumber: 'VT-IDU-78901',
          outdoorSerialNumber: 'VT-ODU-23456',
          floorLocation: '2nd Floor',
          roomLocation: 'Conference Room',
          acType: 'Split AC',
          technology: 'Inverter',
          capacityTons: 1.5,
          starRating: '5 Star',
          refrigerantType: 'R-32',
          faultReported: null,
          diagnosisFindings: 'Routine inspection passed',
          workPerformed: 'Filter cleaning and pressure check',
          assetOutcome: 'COMPLETED',
          finalCondition: 'Excellent',
          refrigerantAdded: true,
          refrigerantQtyKg: 0.25,
          notes: 'Operating at optimal delta-T',
          createdAt: '2026-10-10T12:00:00Z',
          updatedAt: '2026-10-10T12:00:00Z',
        },
        {
          id: 'rep-asset-102',
          reportId: 'rep-multi',
          assetId: 'asset-102',
          assetTag: 'ESSC-0004',
          brand: 'Mitsubishi',
          modelNumber: 'MSY-GR18V',
          indoorSerialNumber: null, // Test absent serial fallback
          outdoorSerialNumber: null,
          floorLocation: 'Ground Floor',
          roomLocation: 'Reception',
          acType: 'Split AC',
          technology: 'Inverter',
          capacityTons: 1.8,
          starRating: '3 Star',
          refrigerantType: 'R-410A',
          faultReported: 'Noise from indoor blower',
          diagnosisFindings: 'Blower bearing dry',
          workPerformed: 'Lubricated blower bearings',
          assetOutcome: 'COMPLETED',
          finalCondition: 'Good',
          refrigerantAdded: false,
          refrigerantQtyKg: null,
          notes: null,
          createdAt: '2026-10-10T12:00:00Z',
          updatedAt: '2026-10-10T12:00:00Z',
        },
      ],
    };

    const { container, unmount } = await renderComponent(
      <ServiceReportPrintView report={multiAssetReport} onClose={handleClose} />
    );

    // Asset 1 verification:
    expect(container.textContent).toContain('ESSC-0003');
    expect(container.textContent).toContain('Voltas 185V Vectra');
    expect(container.textContent).toContain('2nd Floor • Conference Room');
    expect(container.textContent).toContain('VT-IDU-78901');
    expect(container.textContent).toContain('VT-ODU-23456');
    expect(container.textContent).toContain('1.5 TR • 5 Star');
    expect(container.textContent).toContain('R-32');
    expect(container.textContent).toContain('Gas Top-up Added: 0.25 kg');

    // Asset 2 verification:
    expect(container.textContent).toContain('ESSC-0004');
    expect(container.textContent).toContain('Mitsubishi MSY-GR18V');
    expect(container.textContent).toContain('Ground Floor • Reception');
    expect(container.textContent).toContain('1.8 TR • 3 Star');
    expect(container.textContent).toContain('R-410A');
    // Absent serial numbers safely render 'Not recorded'
    expect(container.textContent).toContain('Not recorded');

    unmount();
  });

  it('22. ServiceVisitReportModal validates required deviation justification when performed service type diverges from planned', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();
    const createSpy = vi.spyOn(serviceReportApi, 'createReport').mockResolvedValue({
      report: mockCompletedReport,
    });

    const plannedDrySchedule: ServiceSchedule = {
      ...sampleSchedule,
      plannedServiceType: 'DRY_SERVICE',
    };

    const { container, unmount } = await renderComponent(
      <ServiceVisitReportModal
        isOpen={true}
        mode="create"
        schedule={plannedDrySchedule}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    // Context displays planned service type
    expect(container.textContent).toContain('Planned Service:');
    expect(container.textContent).toContain('Dry Service');

    // Initially performed service is initialized to planned DRY_SERVICE
    const performedSelect = container.querySelector('#performed-service-type-select') as HTMLSelectElement;
    expect(performedSelect).toBeDefined();
    expect(performedSelect.value).toBe('DRY_SERVICE');

    // No deviation textarea when matching
    expect(container.querySelector('#service-deviation-reason-input')).toBeNull();

    // Fill basic required report number
    const repNumInput = container.querySelector('#manual-report-number-input') as HTMLInputElement;
    setInputValue(repNumInput, 'SVR-2026-DEV01');

    // Change performed service type to JET_SERVICE
    await act(async () => {
      performedSelect.value = 'JET_SERVICE';
      performedSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Deviation justification textarea must now be rendered
    const deviationTextarea = container.querySelector('#service-deviation-reason-input') as HTMLTextAreaElement;
    expect(deviationTextarea).toBeDefined();
    expect(container.textContent).toContain('Service Type Deviation Justification Required');
    expect(container.textContent).toContain('differs from the planned visit');

    // Attempt submission without deviation note
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    // Validates deviation reason is required
    expect(createSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain('A deviation reason is mandatory when performed service type differs from planned service type');

    // Enter deviation justification note
    await act(async () => {
      setInputValue(deviationTextarea, 'Thick industrial grease and soot required high pressure water jet cleaning.');
    });

    // Enter work performed on asset to satisfy COMPLETED outcome requirement
    const workInput = container.querySelector('input[placeholder="e.g. Jet cleaned filters, tested compressor amp"]') as HTMLInputElement;
    if (workInput) {
      await act(async () => {
        setInputValue(workInput, 'High pressure jet cleaning executed thoroughly.');
      });
    }

    // Now submit
    await act(async () => {
      submitBtn.click();
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reportNumber: 'SVR-2026-DEV01',
        plannedServiceType: 'DRY_SERVICE',
        performedServiceType: 'JET_SERVICE',
        serviceTypeDeviationReason: 'Thick industrial grease and soot required high pressure water jet cleaning.',
      })
    );

    unmount();
  });

  it('23. ServiceReportsManagement renders Planned & Performed Service column, Deviation tag, and Resolution badges', async () => {
    const reportWithDeviation: ServiceVisitReport = {
      ...mockCompletedReport,
      id: 'rep-dev-1',
      reportNumber: 'SVR-2026-8801',
      plannedServiceType: 'DRY_SERVICE',
      performedServiceType: 'JET_SERVICE',
      serviceTypeDeviationReason: 'High silt levels on coils',
      primaryOutcome: 'COMPLETED',
      resolutionStatus: 'RESOLVED',
    };

    const reportResolvedByFollowUp: ServiceVisitReport = {
      ...mockPendingPartsReport,
      id: 'rep-parts-orig',
      reportNumber: 'SVR-2026-8802',
      plannedServiceType: 'DRY_SERVICE',
      performedServiceType: 'DRY_SERVICE',
      primaryOutcome: 'PENDING_PARTS',
      resolutionStatus: 'RESOLVED',
      resolvingReportId: 'rep-resolving-1',
      resolvingReportNumber: 'SVR-2026-8803',
      resolvedAt: '2026-10-11T10:00:00Z',
    };

    const followUpResolvingReport: ServiceVisitReport = {
      ...mockCompletedReport,
      id: 'rep-resolving-1',
      reportNumber: 'SVR-2026-8803',
      plannedServiceType: 'DRY_SERVICE',
      performedServiceType: 'DRY_SERVICE',
      primaryOutcome: 'COMPLETED',
      resolutionStatus: 'RESOLVED',
      originatingReportId: 'rep-parts-orig',
      originatingReportNumber: 'SVR-2026-8802',
    };

    vi.spyOn(serviceReportApi, 'getReports').mockResolvedValue({
      reports: [reportWithDeviation, reportResolvedByFollowUp, followUpResolvingReport],
      total: 3,
      page: 1,
      pageSize: 15,
      totalPages: 1,
      summary: {
        total: 3,
        completed: 2,
        pendingParts: 0, // distinct currently unresolved count
        pendingRepairs: 0,
      },
    });

    const { container, unmount } = await renderComponent(
      <ServiceReportsManagement />
    );

    // Verify table headers
    expect(container.textContent).toContain('Planned & Performed Service');
    expect(container.textContent).toContain('Resolution / Follow-up');

    // Report 1 checks
    expect(container.textContent).toContain('SVR-2026-8801');
    expect(container.textContent).toContain('Deviated');

    // Report 2 checks: resolved by follow-up button
    expect(container.textContent).toContain('SVR-2026-8802');
    expect(container.textContent).toContain('Resolved by #SVR-2026-8803');

    // Report 3 checks: follow-up for originating report button
    expect(container.textContent).toContain('SVR-2026-8803');
    expect(container.textContent).toContain('Follow-up for #SVR-2026-8802');

    // KPI sublabels convey distinct active unresolved work
    expect(container.textContent).toContain('Distinct active unresolved parts');
    expect(container.textContent).toContain('Distinct active unresolved repairs');

    unmount();
  });

  it('24. ServiceReportsManagement allows filtering by resolution status', async () => {
    const getSpy = vi.spyOn(serviceReportApi, 'getReports').mockResolvedValue({
      reports: [mockPendingPartsReport],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
      summary: {
        total: 1,
        completed: 0,
        pendingParts: 1,
        pendingRepairs: 0,
      },
    });

    const { container, unmount } = await renderComponent(
      <ServiceReportsManagement />
    );

    // Selects are: Visit Type (index 0), Outcome (index 1), Resolution Status (index 2)
    const selects = container.querySelectorAll('.svr-filter-select');
    expect(selects.length).toBe(3);
    const resolutionSelect = selects[2] as HTMLSelectElement;

    await act(async () => {
      resolutionSelect.value = 'AWAITING_PARTS';
      resolutionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(getSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        resolutionStatus: 'AWAITING_PARTS',
      })
    );

    unmount();
  });

  it('25. ServiceReportPrintView renders planned, performed service types and formal deviation justification block', async () => {
    const handleClose = vi.fn();
    const deviatedReport: ServiceVisitReport = {
      ...mockCompletedReport,
      reportNumber: 'SVR-2026-PRINT-DEV',
      plannedServiceType: 'DRY_SERVICE',
      performedServiceType: 'PUMPDOWN_SERVICE',
      serviceTypeDeviationReason: 'Refrigerant line compromised during initial check; unit required pumpdown isolation.',
      originatingReportNumber: 'SVR-2026-ORIG-01',
    };

    const { container, unmount } = await renderComponent(
      <ServiceReportPrintView report={deviatedReport} onClose={handleClose} />
    );

    // Header metadata verification
    expect(container.textContent).toContain('Planned Service: Dry Service');
    expect(container.textContent).toContain('Performed Service: Pumpdown Service');

    // Follow-up linkage banner
    expect(container.textContent).toContain('Follow-up Revisit:');
    expect(container.textContent).toContain('Addresses pending items from Report #SVR-2026-ORIG-01');

    // Formal deviation justification box
    expect(container.textContent).toContain('Service Type Deviation Justification');
    expect(container.textContent).toContain('Refrigerant line compromised during initial check; unit required pumpdown isolation.');

    unmount();
  });
});

