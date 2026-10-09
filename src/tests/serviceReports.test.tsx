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
});
