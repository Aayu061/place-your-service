import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// @ts-expect-error React 19 act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { ApprovalInbox } from '@/pages/intakes/ApprovalInbox';
import { CatalogAmcPlansPanel } from '@/pages/integrations/CatalogAmcPlansPanel';
import { Sidebar } from '@/layouts/Sidebar';
import { ToastProvider } from '@/components/ui/Toast';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthContext, AuthContextType } from '@/context/authContextDef';
import {
  catalogService,
  intakeService,
  type IntakeDetailDto,
  type IntakeDto,
  type PublicCatalog,
} from '@/services/intakeService';
import { formatWaitingFor } from '@/pages/intakes/intakeFormat';
import { addDaysIstIso, getIstTodayIso } from '@/utils/date';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

const makeIntake = (overrides: Partial<IntakeDto> & { id: string }): IntakeDto => ({
  intakeNumber: `INT-2026-${overrides.id}`,
  trackingCode: `TRK-${overrides.id}`,
  kind: 'SERVICE_BOOKING',
  status: 'PENDING_REVIEW',
  sourceChannel: 'EXTREME_SALES_SERVICES',
  externalReferenceId: null,
  contact: { name: 'Customer', phone: '9820000000', email: null },
  address: { line: '12 Palm Road', area: 'Panvel', landmark: null, city: 'Navi Mumbai', pincode: '410206' },
  ac: { type: 'SPLIT', brand: 'Daikin', tonnage: 1.5, inverter: true, ageYears: 3, units: 1 },
  request: {
    serviceCode: 'SVC-GAS',
    serviceName: 'Gas top-up',
    amcPlanCode: null,
    message: 'Not cooling',
    preferredDate: null,
    preferredSlot: null,
  },
  consent: { privacy: true, marketing: false },
  spamScore: 0,
  matchedCustomer: null,
  review: { reviewedBy: null, reviewedAt: null, rejectionReason: null },
  serviceRequest: null,
  createdAt: minutesAgo(10),
  ...overrides,
});

const newer = makeIntake({ id: 'b', contact: { name: 'Priya Newer', phone: '9820000002', email: null }, createdAt: minutesAgo(20) });
const older = makeIntake({
  id: 'a',
  contact: { name: 'Rahul Older', phone: '9820000001', email: 'rahul@example.com' },
  createdAt: minutesAgo(135),
  matchedCustomer: { id: 'cust-1', name: 'Rahul Older', customerCode: 'CUST-0001', customerType: 'RESIDENTIAL' },
});

const catalog: PublicCatalog = {
  version: 7,
  services: [
    {
      code: 'SVC-GAS',
      name: 'Gas top-up',
      category: 'REPAIR',
      requestType: 'REPAIR',
      price: { base: 2000, gst: 360, total: 2360 },
      pricingModel: 'FIXED',
    },
  ],
  amcPlans: [
    {
      code: 'AMC-COMP',
      planCode: 'COMP',
      name: 'Comprehensive AMC',
      coverageSummary: 'Gas, spares and labour',
      rates: {
        splitSmall: { base: 3000, gstRatePercent: 18, gst: 540, total: 3540 },
        splitLarge: { base: 3500, gstRatePercent: 18, gst: 630, total: 4130 },
        windowSmall: null,
        windowLarge: null,
        flat: null,
      },
    },
  ],
};

const asDetail = (i: IntakeDto, candidates: IntakeDetailDto['candidates'] = []): IntakeDetailDto => ({ ...i, candidates });

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

let container: HTMLDivElement;
let root: Root;

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

async function renderInbox(onNavigate = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ToastProvider>
        <ApprovalInbox onNavigate={onNavigate} />
      </ToastProvider>
    );
  });
  await flush();
  await flush();
  return onNavigate;
}

const options = () => Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
const selectedOption = () => document.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
const buttonByText = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === text);

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}

async function press(key: string, target: EventTarget = document.body) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
  await flush();
}

function setFieldValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

async function change(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null, value: string) {
  expect(el).toBeTruthy();
  await act(async () => {
    setFieldValue(el!, value);
  });
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('Approval Inbox', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Returned newest-first on purpose: the page must show pending oldest-first.
    vi.spyOn(intakeService, 'list').mockResolvedValue({ items: [newer, older], total: 2, page: 1, pageSize: 25 });
    vi.spyOn(intakeService, 'stats').mockResolvedValue({
      pending: 2,
      approvedToday: 5,
      rejectedToday: 1,
      spam: 3,
      oldestPendingAt: older.createdAt,
    });
    vi.spyOn(intakeService, 'get').mockImplementation(async (id: string) =>
      id === 'a'
        ? asDetail(older, [{ id: 'cust-2', name: 'R. Older (office)', customerCode: 'CUST-0002', phone: '9820000001', customerType: 'COMMERCIAL' }])
        : asDetail(newer)
    );
    vi.spyOn(catalogService, 'getPublic').mockResolvedValue(catalog);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    document.body.innerHTML = '';
  });

  it('renders the pending list oldest-first with waiting time, tab counts and catalog price', async () => {
    await renderInbox();

    expect(intakeService.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING_REVIEW', page: 1, pageSize: 25 }));
    const rows = options();
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Rahul Older');
    expect(rows[1].textContent).toContain('Priya Newer');
    expect(rows[0].textContent).toContain('waiting for 2 h 15 m');
    expect(selectedOption()?.textContent).toContain('Rahul Older');

    const tabs = Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
    expect(tabs).toEqual(['Pending (2)', 'Approved (5 today)', 'Rejected (1 today)', 'Spam (3)', 'All']);

    // Detail: requested service price incl. GST from the catalog + matched-customer banner.
    expect(document.body.textContent).toContain('₹2,360');
    expect(document.body.textContent).toContain('Existing customer found');
    expect(document.body.textContent).toContain('R. Older (office)');
  });

  it('shows the error state with retry when the list fails', async () => {
    vi.spyOn(intakeService, 'list').mockRejectedValueOnce(new Error('Server down'));
    await renderInbox();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Server down');
    await click(buttonByText('Try again'));
    expect(options()).toHaveLength(2);
  });

  it('approve posts the chosen customer, catalog request type, priority, notes and schedule', async () => {
    const approve = vi.spyOn(intakeService, 'approve').mockResolvedValue({
      intake: { ...older, status: 'APPROVED', serviceRequest: { id: 'sr-9', requestNumber: 'SR-2026-0009' } },
      serviceRequest: { id: 'sr-9', requestNumber: 'SR-2026-0009' },
      schedule: { id: 'sch-1', scheduleNumber: 'SCH-2026-00001' },
    });
    const onNavigate = await renderInbox();

    await click(buttonByText('Approve'));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Rahul Older (CUST-0001)');

    const requestType = document.getElementById('approve-request-type') as HTMLSelectElement;
    expect(requestType.value).toBe('REPAIR'); // prefilled from catalog service
    await change(document.getElementById('approve-priority') as HTMLSelectElement, 'HIGH');
    await change(document.getElementById('approve-notes') as HTMLTextAreaElement, '  Bring gas cylinder  ');

    const scheduleToggle = dialog!.querySelector<HTMLInputElement>('input[type="checkbox"]');
    await click(scheduleToggle);
    const dateInput = document.getElementById('approve-schedule-date') as HTMLInputElement;
    expect(dateInput.min).toBe(getIstTodayIso());

    // Past date is refused.
    await change(dateInput, addDaysIstIso(getIstTodayIso(), -1));
    await change(document.getElementById('approve-schedule-slot') as HTMLSelectElement, 'MORNING');
    await click(buttonByText('Approve & create service request'));
    expect(approve).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('cannot be in the past');

    const visitDate = addDaysIstIso(getIstTodayIso(), 2);
    await change(dateInput, visitDate);
    // After approval the server no longer lists it as pending.
    vi.mocked(intakeService.list).mockResolvedValue({ items: [newer], total: 1, page: 1, pageSize: 25 });
    await click(buttonByText('Approve & create service request'));

    expect(approve).toHaveBeenCalledWith('a', {
      customerId: 'cust-1',
      requestType: 'REPAIR',
      priority: 'HIGH',
      notes: 'Bring gas cylinder',
      schedule: { date: visitDate, slot: 'MORNING' },
    });

    // Toast + link to the new service request.
    expect(document.body.textContent).toContain('Service request SR-2026-0009 created and visit SCH-2026-00001 booked.');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click(buttonByText('Open SR-2026-0009'));
    expect(onNavigate).toHaveBeenCalledWith('service-requests', { recordType: 'service_request', recordId: 'sr-9' });

    // Approved item leaves the Pending view; the next one is selected.
    expect(options()).toHaveLength(1);
    expect(selectedOption()?.textContent).toContain('Priya Newer');
  });

  it('approve without an existing customer sends no customerId', async () => {
    const approve = vi.spyOn(intakeService, 'approve').mockResolvedValue({
      intake: { ...older, status: 'APPROVED' },
      serviceRequest: { id: 'sr-1', requestNumber: 'SR-1' },
      schedule: null,
      warning: 'Customer created as temporary',
    });
    await renderInbox();

    const newCustomer = document.querySelector<HTMLInputElement>('input[name="intake-customer"][value="new"]');
    await click(newCustomer);
    await click(buttonByText('Approve'));
    await click(buttonByText('Approve & create service request'));

    expect(approve).toHaveBeenCalledWith('a', { requestType: 'REPAIR', priority: 'MEDIUM' });
    expect(document.body.textContent).toContain('Customer created as temporary');
  });

  it('reject requires a reason, while spam/duplicate do not', async () => {
    const reject = vi.spyOn(intakeService, 'reject').mockResolvedValue({ intake: { ...older, status: 'SPAM' } });
    await renderInbox();

    await click(buttonByText('Reject'));
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    await click(buttonByText('Reject request'));
    expect(reject).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Please write a short reason');

    await click(document.querySelector('input[name="reject-outcome"][value="SPAM"]'));
    vi.mocked(intakeService.list).mockResolvedValue({ items: [newer], total: 1, page: 1, pageSize: 25 });
    await click(buttonByText('Mark as spam'));
    expect(reject).toHaveBeenCalledWith('a', { status: 'SPAM', reason: '' });
    expect(options()).toHaveLength(1);
  });

  it('reject sends the typed reason', async () => {
    const reject = vi.spyOn(intakeService, 'reject').mockResolvedValue({ intake: { ...older, status: 'REJECTED' } });
    await renderInbox();
    await click(buttonByText('Reject'));
    await change(document.getElementById('reject-reason') as HTMLTextAreaElement, ' Outside service area ');
    await click(buttonByText('Reject request'));
    expect(reject).toHaveBeenCalledWith('a', { status: 'REJECTED', reason: 'Outside service area' });
  });

  it('keyboard: J/K move, A opens approve, R opens reject, ignored while typing', async () => {
    await renderInbox();
    expect(selectedOption()?.textContent).toContain('Rahul Older');

    await press('j');
    expect(selectedOption()?.textContent).toContain('Priya Newer');
    await press('j'); // stays on last
    expect(selectedOption()?.textContent).toContain('Priya Newer');
    await press('k');
    expect(selectedOption()?.textContent).toContain('Rahul Older');

    // Typing in the search box must not move the selection.
    const search = document.getElementById('intake-search') as HTMLInputElement;
    await press('j', search);
    expect(selectedOption()?.textContent).toContain('Rahul Older');

    await press('a');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Approve request');
    await press('Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await press('r');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Reject request');
    // J inside the open dialog does nothing to the list.
    await press('j');
    expect(selectedOption()?.textContent).toContain('Rahul Older');
  });

  it('switching tabs and kind filter re-queries the API', async () => {
    await renderInbox();
    await click(Array.from(document.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('Spam')));
    expect(intakeService.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'SPAM' }));

    await change(document.getElementById('intake-kind') as HTMLSelectElement, 'AMC_REQUEST');
    await flush();
    expect(intakeService.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'SPAM', kind: 'AMC_REQUEST' }));
  });

  it('formats waiting time', () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    expect(formatWaitingFor('2026-11-18T09:45:00Z', now)).toBe('2 h 15 m');
    expect(formatWaitingFor('2026-11-18T11:56:00Z', now)).toBe('4 m');
    expect(formatWaitingFor('2026-11-16T10:00:00Z', now)).toBe('2 d 2 h');
  });
});

describe('Sidebar approval badge', () => {
  const user = { id: 'u1', email: 'staff@pys.internal', fullName: 'Staff', role: 'STAFF' as const, isActive: true };
  const auth: AuthContextType = {
    user,
    session: null,
    isLoading: false,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
    refreshUser: vi.fn(),
  };

  const renderSidebar = async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <ThemeProvider>
          <AuthContext.Provider value={auth}>
            <Sidebar
              currentRole="STAFF"
              activeItem="dashboard"
              onItemSelect={vi.fn()}
              isCollapsed={false}
              onToggleCollapse={vi.fn()}
              isMobileOpen={false}
              onCloseMobile={vi.fn()}
            />
          </AuthContext.Provider>
        </ThemeProvider>
      );
    });
    await flush();
  };

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    document.body.innerHTML = '';
  });

  it('shows the Approval Inbox entry for STAFF with the pending count', async () => {
    const stats = vi.spyOn(intakeService, 'stats').mockResolvedValue({
      pending: 7,
      approvedToday: 0,
      rejectedToday: 0,
      spam: 0,
      oldestPendingAt: null,
    });
    await renderSidebar();
    expect(document.body.textContent).toContain('Approval Inbox');
    expect(stats).toHaveBeenCalledWith({ quiet: true });
    expect(document.querySelector('[data-testid="approval-inbox-badge"]')?.textContent).toBe('7');
  });

  it('fails silently when stats cannot load', async () => {
    vi.spyOn(intakeService, 'stats').mockRejectedValue(new Error('offline'));
    await renderSidebar();
    expect(document.body.textContent).toContain('Approval Inbox');
    expect(document.querySelector('[data-testid="approval-inbox-badge"]')).toBeNull();
  });
});

describe('ESS hub AMC plan prices', () => {
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    document.body.innerHTML = '';
  });

  it('renders live catalog prices and no fake sync claims', async () => {
    vi.restoreAllMocks();
    vi.spyOn(catalogService, 'getPublic').mockResolvedValue(catalog);
    const onOpenInbox = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<CatalogAmcPlansPanel onOpenInbox={onOpenInbox} />);
    });
    await flush();

    expect(document.querySelectorAll('[data-testid="catalog-amc-plan"]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Comprehensive AMC');
    expect(document.body.textContent).toContain('₹3,540');
    expect(document.body.textContent).toContain('₹4,130');
    expect(document.body.textContent).not.toContain('In Sync');
    expect(document.body.textContent).not.toContain('4,200');
    await click(buttonByText('Open Approval Inbox'));
    expect(onOpenInbox).toHaveBeenCalled();
  });
});

