import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSupabaseClient } from '../src/lib/supabase.js';
import { emailOutboxService } from '../src/services/email/emailOutbox.service.js';
import { outboxService, OutboundEvent } from '../src/services/outbox.service.js';
import {
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_CODES,
  EMAIL_STATUS_CODES,
  REQUEST_STATUSES,
  SCHEDULE_STATUSES,
  customerStatusFor,
  fromRequestStatus,
  fromScheduleStatus,
  fromIntakeStatus,
} from '../src/domain/customerStatus.js';
import {
  registerCustomerNotifier,
  handleIntakeReceived,
  handleIntakeApproved,
  handleIntakeRejected,
  handleEnquiryQuoted,
  handleServiceStatusChanged,
  isEventTooOld,
  visitDateIdempotencyKey,
} from '../src/services/notifications/customerNotifier.js';
import { buildServiceStatusEmail } from '../src/services/notifications/customerEmailTemplates.js';

vi.mock('../src/lib/supabase.js', () => ({ getSupabaseClient: vi.fn() }));
vi.mock('../src/services/email/emailOutbox.service.js', () => ({
  emailOutboxService: { enqueueAndSend: vi.fn() },
}));

type Result = { data: any; error: any };

function builder(result: Result, calls: any[]) {
  const b: any = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'neq']) {
    b[m] = vi.fn((...args: any[]) => {
      calls.push([m, ...args]);
      return b;
    });
  }
  const one = async () => ({ data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: result.error });
  b.single = vi.fn(one);
  b.maybeSingle = vi.fn(one);
  b.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return b;
}

let calls: any[];
let tables: Record<string, Result>;
const send = vi.mocked(emailOutboxService.enqueueAndSend);

function event(type: string, payload: Record<string, unknown>, ageMs = 60_000): OutboundEvent {
  return {
    id: 'evt-1',
    event_type: type,
    aggregate_type: 'X',
    aggregate_id: null,
    payload,
    attempt_count: 1,
    max_attempts: 8,
    created_at: new Date(Date.now() - ageMs).toISOString(),
  };
}

const intake = {
  id: 'intake-1',
  intake_number: 'WI-2026-000123',
  tracking_code: 'TRK7Q2',
  kind: 'SERVICE_BOOKING',
  status: 'NEW',
  contact_name: 'Ravi <b>Kumar</b>',
  contact_email: 'ravi@example.com',
  area: 'Chembur',
  city: 'Mumbai',
  ac_type: 'SPLIT',
  ac_brand: 'Voltas',
  ac_tonnage: '1.5',
  preferred_date: '2026-11-21',
  preferred_slot: 'MORNING',
  rejection_reason: null,
  service_request_id: null,
  customer_id: null,
};

const customer = { name: 'Ravi Kumar', email: 'ravi@example.com', email_bounced_at: null, email_complained_at: null };
const srBase = { id: 'sr-1', request_number: 'SR-2026-000045', status: 'SCHEDULED', customer_id: 'c-1', customers: customer };
const schedule = {
  id: 'sch-1',
  status: 'SCHEDULED',
  scheduled_date: '2026-11-22',
  start_time: '10:00',
  end_time: '12:00',
  technician_id: null as string | null,
};
const technician = { name: 'Suresh Patil', phone: '+91 9999988888' };

function install() {
  vi.mocked(getSupabaseClient).mockReturnValue({
    from: vi.fn((table: string) => {
      calls.push(['from', table]);
      return builder(tables[table] ?? { data: null, error: null }, calls);
    }),
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EMAIL_AUTO_SEND_CUSTOMER_UPDATES;
  calls = [];
  tables = {
    web_intakes: { data: intake, error: null },
    service_requests: { data: srBase, error: null },
    service_schedules: { data: [schedule], error: null },
    technicians: { data: technician, error: null },
  };
  send.mockResolvedValue({ delivery: { status: 'SENT' } } as any);
  install();
});

afterEach(() => {
  delete process.env.EMAIL_AUTO_SEND_CUSTOMER_UPDATES;
});

describe('customer status mapping', () => {
  it('maps every request status and every schedule status', () => {
    for (const s of REQUEST_STATUSES) {
      expect(CUSTOMER_STATUS_CODES).toContain(fromRequestStatus(s).code);
    }
    for (const s of SCHEDULE_STATUSES) {
      const r = fromScheduleStatus(s, { technicianAssigned: false });
      if (r) expect(CUSTOMER_STATUS_CODES).toContain(r.code);
    }
    for (const code of CUSTOMER_STATUS_CODES) expect(CUSTOMER_STATUSES[code].code).toBe(code);
  });

  it('follows the planned steps', () => {
    expect(fromRequestStatus('REQUESTED')).toMatchObject({ code: 'RECEIVED', step: 1 });
    expect(fromRequestStatus('PENDING')).toMatchObject({ code: 'CONFIRMED', step: 2 });
    expect(fromRequestStatus('SCHEDULED')).toMatchObject({ code: 'SCHEDULED', step: 3 });
    expect(fromRequestStatus('ASSIGNED')).toMatchObject({ code: 'TECHNICIAN_ASSIGNED', step: 4 });
    expect(fromRequestStatus('IN_PROGRESS')).toMatchObject({ code: 'IN_PROGRESS', step: 5 });
    expect(fromRequestStatus('COMPLETED')).toMatchObject({ code: 'COMPLETED', step: 6 });
    expect(fromRequestStatus('CLOSED').code).toBe('COMPLETED');
    expect(fromRequestStatus('PAYMENT')).toMatchObject({ code: 'PAYMENT_DUE', step: 6 });
    expect(fromRequestStatus('AWAITING_PARTS')).toMatchObject({ code: 'AWAITING_PARTS', sideState: true });
    expect(fromRequestStatus('REVISIT_REQUIRED').code).toBe('FOLLOW_UP');
    expect(fromRequestStatus('ON_HOLD').code).toBe('ON_HOLD');
    expect(fromRequestStatus('CANCELLED')).toMatchObject({ code: 'CANCELLED', tone: 'danger' });
    expect(fromIntakeStatus('REJECTED').code).toBe('NOT_ACCEPTED');
  });

  it('maps visit statuses, using the technician flag for planned visits', () => {
    expect(fromScheduleStatus('SCHEDULED', { technicianAssigned: false })?.code).toBe('SCHEDULED');
    expect(fromScheduleStatus('OVERDUE', { technicianAssigned: true })?.code).toBe('TECHNICIAN_ASSIGNED');
    expect(fromScheduleStatus('EN_ROUTE', { technicianAssigned: true })).toMatchObject({ code: 'ON_THE_WAY', step: 4 });
    expect(fromScheduleStatus('CANCELLED', { technicianAssigned: true })).toBeNull();
    expect(fromScheduleStatus('RESCHEDULED', { technicianAssigned: true })).toBeNull();
  });

  it('combines request and latest visit', () => {
    expect(customerStatusFor({ status: 'ASSIGNED' }, { status: 'EN_ROUTE', technician_id: 't' }).code).toBe('ON_THE_WAY');
    expect(customerStatusFor({ status: 'PENDING' }, { status: 'SCHEDULED', technician_id: 't' }).code).toBe('TECHNICIAN_ASSIGNED');
    expect(customerStatusFor({ status: 'CANCELLED' }, { status: 'EN_ROUTE' }).code).toBe('CANCELLED');
    expect(customerStatusFor({ status: 'AWAITING_PARTS' }, { status: 'IN_PROGRESS' }).code).toBe('AWAITING_PARTS');
    expect(customerStatusFor({ status: 'SCHEDULED' }, { status: 'CANCELLED' }).code).toBe('SCHEDULED');
    expect(customerStatusFor({ status: 'IN_PROGRESS' }, { status: 'SCHEDULED' }).code).toBe('IN_PROGRESS');
    expect(customerStatusFor({ status: 'SCHEDULED' }).code).toBe('SCHEDULED');
    expect(customerStatusFor({ status: 'WHATEVER' }).code).toBe('RECEIVED');
  });

  it('keeps the email list quiet', () => {
    expect([...EMAIL_STATUS_CODES].sort()).toEqual(
      ['AWAITING_PARTS', 'CANCELLED', 'COMPLETED', 'ON_THE_WAY', 'SCHEDULED', 'TECHNICIAN_ASSIGNED'].sort(),
    );
    for (const quiet of ['RECEIVED', 'CONFIRMED', 'IN_PROGRESS', 'ON_HOLD', 'FOLLOW_UP', 'PAYMENT_DUE']) {
      expect(EMAIL_STATUS_CODES).not.toContain(quiet);
    }
  });
});

describe('customer notifier', () => {
  it('registers all six event types', () => {
    outboxService.unregisterAll();
    registerCustomerNotifier();
    expect(outboxService.registeredTypes().sort()).toEqual(
      [
        'SERVICE_REQUEST_STATUS_CHANGED',
        'SERVICE_SCHEDULE_STATUS_CHANGED',
        'WEB_ENQUIRY_QUOTED',
        'WEB_INTAKE_APPROVED',
        'WEB_INTAKE_RECEIVED',
        'WEB_INTAKE_REJECTED',
      ].sort(),
    );
    outboxService.unregisterAll();
  });

  it('sends the intake receipt once per intake, escaping user data', async () => {
    await expect(handleIntakeReceived(event('WEB_INTAKE_RECEIVED', { intakeId: 'intake-1' }))).resolves.toBe('DONE');
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg).toMatchObject({
      entityType: 'INTAKE_RECEIPT',
      entityId: 'intake-1',
      idempotencyKey: 'intake-receipt:intake-1',
      recipientEmail: 'ravi@example.com',
    });
    expect(arg.subject).toContain('TRK7Q2');
    expect(arg.html).toContain('TRK7Q2');
    expect(arg.html).toContain('Ravi &lt;b&gt;Kumar&lt;/b&gt;');
    expect(arg.html).not.toContain('<b>Kumar</b>');
    expect(arg.text).toContain('What happens next');
    expect(arg.html).toContain('Extreme Sales &amp; Services');
  });

  it('sends a short acknowledgment for CONTACT messages', async () => {
    tables.web_intakes = { data: { ...intake, kind: 'CONTACT' }, error: null };
    await handleIntakeReceived(event('WEB_INTAKE_RECEIVED', { intakeId: 'intake-1' }));
    expect(send.mock.calls[0][0].subject).toContain('We received your message');
  });

  it('sends the confirmation with request number', async () => {
    tables.service_requests = { data: { id: 'sr-1', request_number: 'SR-2026-000045' }, error: null };
    const outcome = await handleIntakeApproved(event('WEB_INTAKE_APPROVED', { intakeId: 'intake-1', serviceRequestId: 'sr-1' }));
    expect(outcome).toBe('DONE');
    const arg = send.mock.calls[0][0];
    expect(arg).toMatchObject({ entityType: 'INTAKE_CONFIRMATION', idempotencyKey: 'intake-confirmation:intake-1' });
    expect(arg.subject).toContain('Your request is confirmed');
    expect(arg.text).toContain('SR-2026-000045');
    expect(arg.text).toContain('TRK7Q2');
    expect(arg.text).toContain('Morning');
  });

  it.each([
    ['AMC_RENEWAL', 'Your AMC renewal request is done'],
    ['PROFILE_CHANGE', 'Your details have been updated'],
  ])('closing a %s from the customer account says it was handled, not that a visit is coming', async (kind, subject) => {
    tables.web_intakes = { data: { ...intake, kind, preferred_date: null, preferred_slot: null }, error: null };
    await expect(handleIntakeApproved(event('WEB_INTAKE_APPROVED', { intakeId: 'intake-1' }))).resolves.toBe('DONE');
    const arg = send.mock.calls[0][0];
    expect(arg.subject).toContain(subject);
    expect(arg.text).toContain('TRK7Q2');
    expect(arg.text).not.toMatch(/service ticket|visit date/i);
  });

  it('emails the seller price for one AC enquiry line, once per price, escaping names', async () => {
    tables.web_intake_items = {
      data: { id: 'line-a', item_name: 'LG 1.5T <i>Split</i>', quantity: 2, quote_total: 40500, quote_note: 'Includes installation', web_intakes: { ...intake, kind: 'PRODUCT_ENQUIRY' } },
      error: null,
    };
    const outcome = await handleEnquiryQuoted(event('WEB_ENQUIRY_QUOTED', { lineId: 'line-a', intakeId: 'intake-1' }));
    expect(outcome).toBe('DONE');
    const arg = send.mock.calls[0][0];
    expect(arg).toMatchObject({ entityType: 'ENQUIRY_QUOTE', entityId: 'line-a', idempotencyKey: 'enquiry-quote:line-a:40500', recipientEmail: 'ravi@example.com' });
    expect(arg.subject).toContain('Price for your AC enquiry');
    expect(arg.text).toContain('₹40,500');
    expect(arg.text).toContain('Includes installation');
    expect(arg.text).toContain('TRK7Q2');
    expect(arg.html).not.toContain('<i>Split</i>');
  });

  it('S08: an updated price says so, and each price version has its own email key', async () => {
    tables.web_intake_items = {
      data: { id: 'line-a', item_name: 'LG 1.5T Split', quantity: 1, quote_total: 39000, quote_note: null, web_intakes: { ...intake, kind: 'PRODUCT_ENQUIRY' } },
      error: null,
    };
    await handleEnquiryQuoted(event('WEB_ENQUIRY_QUOTED', { lineId: 'line-a', intakeId: 'intake-1', updated: true, version: '2026-11-25T10:00:00.000Z' }));
    const arg = send.mock.calls[0][0];
    expect(arg.idempotencyKey).toBe('enquiry-quote:line-a:2026-11-25T10:00:00.000Z');
    expect(arg.subject).toContain('Updated price for your AC enquiry');
    expect(arg.text).toContain('replaces the one we sent before');
    expect(arg.text).toContain('₹39,000');
  });

  it('sends a polite rejection with the reason', async () => {
    tables.web_intakes = { data: { ...intake, rejection_reason: 'Outside our service area' }, error: null };
    await handleIntakeRejected(event('WEB_INTAKE_REJECTED', { intakeId: 'intake-1' }));
    const arg = send.mock.calls[0][0];
    expect(arg).toMatchObject({ entityType: 'INTAKE_REJECTION', idempotencyKey: 'intake-rejection:intake-1' });
    expect(arg.text).toContain('Outside our service area');
    expect(arg.text).toContain('+91 7977805245');
  });

  it('skips events older than 24 hours', async () => {
    const old = event('WEB_INTAKE_RECEIVED', { intakeId: 'intake-1' }, 25 * 60 * 60 * 1000);
    expect(isEventTooOld(old)).toBe(true);
    await expect(handleIntakeReceived(old)).resolves.toBe('SKIPPED');
    await expect(
      handleServiceStatusChanged(event('SERVICE_REQUEST_STATUS_CHANGED', { serviceRequestId: 'sr-1', toStatus: 'SCHEDULED' }, 25 * 3600_000)),
    ).resolves.toBe('SKIPPED');
    expect(send).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('skips when there is no recipient email', async () => {
    tables.web_intakes = { data: { ...intake, contact_email: null }, error: null };
    await expect(handleIntakeReceived(event('WEB_INTAKE_RECEIVED', { intakeId: 'intake-1' }))).resolves.toBe('SKIPPED');
    tables.service_requests = { data: { ...srBase, customers: { ...customer, email: '' } }, error: null };
    await expect(
      handleServiceStatusChanged(event('SERVICE_REQUEST_STATUS_CHANGED', { serviceRequestId: 'sr-1', toStatus: 'SCHEDULED' })),
    ).resolves.toBe('SKIPPED');
    tables.service_requests = { data: { ...srBase, customers: { ...customer, email_bounced_at: '2026-11-01T00:00:00Z' } }, error: null };
    await expect(
      handleServiceStatusChanged(event('SERVICE_REQUEST_STATUS_CHANGED', { serviceRequestId: 'sr-1', toStatus: 'SCHEDULED' })),
    ).resolves.toBe('SKIPPED');
    expect(send).not.toHaveBeenCalled();
  });

  it('skips everything when EMAIL_AUTO_SEND_CUSTOMER_UPDATES is false', async () => {
    process.env.EMAIL_AUTO_SEND_CUSTOMER_UPDATES = 'false';
    await expect(handleIntakeReceived(event('WEB_INTAKE_RECEIVED', { intakeId: 'intake-1' }))).resolves.toBe('SKIPPED');
    await expect(handleIntakeApproved(event('WEB_INTAKE_APPROVED', { intakeId: 'intake-1' }))).resolves.toBe('SKIPPED');
    await expect(handleIntakeRejected(event('WEB_INTAKE_REJECTED', { intakeId: 'intake-1' }))).resolves.toBe('SKIPPED');
    await expect(
      handleServiceStatusChanged(event('SERVICE_SCHEDULE_STATUS_CHANGED', { serviceRequestId: 'sr-1', toStatus: 'EN_ROUTE' })),
    ).resolves.toBe('SKIPPED');
    expect(send).not.toHaveBeenCalled();
  });

  it('does not email the PENDING status that approval creates', async () => {
    const outcome = await handleServiceStatusChanged(
      event('SERVICE_REQUEST_STATUS_CHANGED', { serviceRequestId: 'sr-1', fromStatus: null, toStatus: 'PENDING' }),
    );
    expect(outcome).toBe('SKIPPED');
    expect(send).not.toHaveBeenCalled();
  });

  it('emails SCHEDULED with a per-status idempotency key', async () => {
    const outcome = await handleServiceStatusChanged(
      event('SERVICE_REQUEST_STATUS_CHANGED', { serviceRequestId: 'sr-1', fromStatus: 'PENDING', toStatus: 'SCHEDULED' }),
    );
    expect(outcome).toBe('DONE');
    const arg = send.mock.calls[0][0];
    expect(arg).toMatchObject({
      entityType: 'SERVICE_STATUS_UPDATE',
      entityId: 'sr-1',
      idempotencyKey: 'sr-status:sr-1:SCHEDULED',
      recipientEmail: 'ravi@example.com',
    });
    expect(arg.text).toContain('SR-2026-000045');
    expect(arg.text).toContain('22 Nov 2026');
    expect(arg.text).toContain('10:00 - 12:00');
  });

  it('emails ON_THE_WAY with technician first name only, never phone or surname', async () => {
    tables.service_requests = { data: { ...srBase, status: 'ASSIGNED' }, error: null };
    tables.service_schedules = { data: [{ ...schedule, status: 'EN_ROUTE', technician_id: 'tech-1' }], error: null };
    await handleServiceStatusChanged(
      event('SERVICE_SCHEDULE_STATUS_CHANGED', { serviceRequestId: 'sr-1', scheduleId: 'sch-1', toStatus: 'EN_ROUTE' }),
    );
    const arg = send.mock.calls[0][0];
    expect(arg.idempotencyKey).toBe('sr-status:sr-1:ON_THE_WAY');
    expect(arg.text).toContain('Suresh');
    for (const body of [arg.html, arg.text, arg.subject]) {
      expect(body).not.toContain('Patil');
      expect(body).not.toContain('9999988888');
    }
    // Only the technician's name column is requested.
    expect(calls).toContainEqual(['select', 'name']);
  });

  it('skips statuses outside the email list (e.g. IN_PROGRESS) and unverified RESOLVED', async () => {
    tables.service_requests = { data: { ...srBase, status: 'IN_PROGRESS' }, error: null };
    await expect(
      handleServiceStatusChanged(event('SERVICE_REQUEST_STATUS_CHANGED', { serviceRequestId: 'sr-1', toStatus: 'IN_PROGRESS' })),
    ).resolves.toBe('SKIPPED');
    tables.service_requests = { data: { ...srBase, status: 'RESOLVED' }, error: null };
    await expect(
      handleServiceStatusChanged(event('SERVICE_REQUEST_STATUS_CHANGED', { serviceRequestId: 'sr-1', toStatus: 'RESOLVED' })),
    ).resolves.toBe('SKIPPED');
    expect(send).not.toHaveBeenCalled();
  });

  it('emails COMPLETED and CANCELLED', async () => {
    tables.service_requests = { data: { ...srBase, status: 'COMPLETED' }, error: null };
    await handleServiceStatusChanged(event('SERVICE_REQUEST_STATUS_CHANGED', { serviceRequestId: 'sr-1', toStatus: 'COMPLETED' }));
    tables.service_requests = { data: { ...srBase, status: 'CANCELLED' }, error: null };
    await handleServiceStatusChanged(event('SERVICE_REQUEST_STATUS_CHANGED', { serviceRequestId: 'sr-1', toStatus: 'CANCELLED' }));
    expect(send.mock.calls.map((c) => c[0].idempotencyKey)).toEqual(['sr-status:sr-1:COMPLETED', 'sr-status:sr-1:CANCELLED']);
  });

  it('retries (throws) on database errors and rejects payloads without ids', async () => {
    tables.service_requests = { data: null, error: { message: 'timeout' } };
    await expect(
      handleServiceStatusChanged(event('SERVICE_REQUEST_STATUS_CHANGED', { serviceRequestId: 'sr-1', toStatus: 'SCHEDULED' })),
    ).rejects.toThrow('timeout');
    await expect(handleIntakeReceived(event('WEB_INTAKE_RECEIVED', {}))).rejects.toThrow('missing intakeId');
  });

  describe('visit moved to a new date', () => {
    const moved = { ...schedule, scheduled_date: '2026-11-25', start_time: '14:00:00', end_time: '16:00' };
    const movedEvent = (extra: Record<string, unknown> = {}) =>
      event('SERVICE_SCHEDULE_STATUS_CHANGED', {
        serviceRequestId: 'sr-1',
        scheduleId: 'sch-1',
        fromStatus: 'SCHEDULED',
        toStatus: 'SCHEDULED',
        dateChanged: true,
        scheduledDate: '2026-11-25',
        startTime: '14:00',
        endTime: '16:00',
        previousScheduledDate: '2026-11-22',
        previousStartTime: '10:00',
        previousEndTime: '12:00',
        ...extra,
      });

    beforeEach(() => {
      tables.service_schedules = { data: [moved], error: null };
      tables.email_deliveries = { data: [{ idempotency_key: 'sr-status:sr-1:SCHEDULED' }], error: null };
    });

    it('sends the new-date email with a per-date idempotency key', async () => {
      await expect(handleServiceStatusChanged(movedEvent())).resolves.toBe('DONE');
      expect(send).toHaveBeenCalledTimes(1);
      const arg = send.mock.calls[0][0];
      expect(arg).toMatchObject({
        entityType: 'SERVICE_STATUS_UPDATE',
        entityId: 'sr-1',
        templateKey: 'service_visit_date_changed',
        idempotencyKey: 'sr-visit-date:sr-1:sch-1:2026-11-25:1400-1600',
        recipientEmail: 'ravi@example.com',
      });
      expect(visitDateIdempotencyKey('sr-1', 'sch-1', '2026-11-25', '14:00', '16:00')).toBe(arg.idempotencyKey);
      expect(arg.subject).toContain('Your visit has a new date');
      expect(arg.text).toContain('Earlier date: Sun, 22 Nov 2026, 10:00 - 12:00');
      expect(arg.text).toContain('New visit date: Wed, 25 Nov 2026');
      expect(arg.text).toContain('14:00 - 16:00');
      expect(arg.text).toContain('TRK7Q2');
      expect(arg.text).toContain('+91 7977805245');
      // Earlier customer emails are looked up for this request only.
      expect(calls).toContainEqual(['eq', 'entity_id', 'sr-1']);
    });

    it('does not email the same new date twice', async () => {
      tables.email_deliveries = {
        data: [
          { idempotency_key: 'sr-visit-date:sr-1:sch-1:2026-11-25:1400-1600' },
          { idempotency_key: 'sr-status:sr-1:SCHEDULED' },
        ],
        error: null,
      };
      await expect(handleServiceStatusChanged(movedEvent())).resolves.toBe('SKIPPED');
      expect(send).not.toHaveBeenCalled();
    });

    it('emails again when the date moves a second time', async () => {
      tables.email_deliveries = {
        data: [{ idempotency_key: 'sr-visit-date:sr-1:sch-1:2026-11-25:1400-1600' }],
        error: null,
      };
      tables.service_schedules = { data: [{ ...moved, scheduled_date: '2026-11-27' }], error: null };
      await handleServiceStatusChanged(movedEvent({ previousScheduledDate: '2026-11-25' }));
      expect(send.mock.calls[0][0].idempotencyKey).toBe('sr-visit-date:sr-1:sch-1:2026-11-27:1400-1600');
    });

    it('emails again when the visit moves back to an earlier date (A -> B -> A)', async () => {
      // Newest first: customer was last told 27 Nov, earlier told 25 Nov; now it is back on 25 Nov.
      tables.email_deliveries = {
        data: [
          { idempotency_key: 'sr-visit-date:sr-1:sch-1:2026-11-27:1400-1600' },
          { idempotency_key: 'sr-visit-date:sr-1:sch-1:2026-11-25:1400-1600' },
          { idempotency_key: 'sr-status:sr-1:SCHEDULED' },
        ],
        error: null,
      };
      const ev = movedEvent({ previousScheduledDate: '2026-11-27' });
      await expect(handleServiceStatusChanged(ev)).resolves.toBe('DONE');
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].idempotencyKey).toBe(`sr-visit-date:sr-1:sch-1:2026-11-25:1400-1600#${ev.id}`);
    });

    it('does not repeat a re-announced date (A -> B -> A, then another A event)', async () => {
      tables.email_deliveries = {
        data: [
          { idempotency_key: 'sr-visit-date:sr-1:sch-1:2026-11-25:1400-1600#evt-9' },
          { idempotency_key: 'sr-visit-date:sr-1:sch-1:2026-11-27:1400-1600' },
          { idempotency_key: 'sr-visit-date:sr-1:sch-1:2026-11-25:1400-1600' },
        ],
        error: null,
      };
      await expect(handleServiceStatusChanged(movedEvent())).resolves.toBe('SKIPPED');
      expect(send).not.toHaveBeenCalled();
    });

    it('first scheduling still sends only the SCHEDULED email', async () => {
      tables.service_schedules = { data: [schedule], error: null };
      tables.email_deliveries = { data: [], error: null };
      await handleServiceStatusChanged(
        event('SERVICE_SCHEDULE_STATUS_CHANGED', { serviceRequestId: 'sr-1', scheduleId: 'sch-1', toStatus: 'SCHEDULED', dateChanged: false }),
      );
      // Even a date-change event, when no date was ever emailed, falls back to the status email.
      await handleServiceStatusChanged(movedEvent());
      expect(send.mock.calls.map((c) => c[0].idempotencyKey)).toEqual(['sr-status:sr-1:SCHEDULED', 'sr-status:sr-1:SCHEDULED']);
      expect(send.mock.calls.every((c) => c[0].templateKey === 'service_status_scheduled')).toBe(true);
    });

    it('shows the technician first name only, never the phone', async () => {
      tables.service_schedules = { data: [{ ...moved, status: 'ASSIGNED', technician_id: 'tech-1' }], error: null };
      await handleServiceStatusChanged(movedEvent());
      const arg = send.mock.calls[0][0];
      expect(arg.text).toContain('Technician: Suresh');
      for (const body of [arg.html, arg.text, arg.subject]) {
        expect(body).not.toContain('Patil');
        expect(body).not.toContain('9999988888');
      }
      // No customer address (the HTML footer carries the business's own office address).
      expect(arg.text).not.toContain('Chembur');
      expect(calls).toContainEqual(['select', 'name']);
    });

    it('keeps the 24 h skip, the opt-out flag and finished requests quiet', async () => {
      await expect(handleServiceStatusChanged({ ...movedEvent(), created_at: new Date(Date.now() - 25 * 3600_000).toISOString() })).resolves.toBe('SKIPPED');
      process.env.EMAIL_AUTO_SEND_CUSTOMER_UPDATES = 'false';
      await expect(handleServiceStatusChanged(movedEvent())).resolves.toBe('SKIPPED');
      delete process.env.EMAIL_AUTO_SEND_CUSTOMER_UPDATES;
      tables.service_requests = { data: { ...srBase, status: 'CANCELLED' }, error: null };
      await handleServiceStatusChanged(movedEvent());
      expect(send.mock.calls.map((c) => c[0].idempotencyKey)).toEqual(['sr-status:sr-1:CANCELLED']);
    });
  });

  it('status template never prints a full technician name', () => {
    const out = buildServiceStatusEmail({
      code: 'TECHNICIAN_ASSIGNED',
      customerName: 'A',
      requestNumber: 'SR-1',
      technicianFirstName: 'Suresh Patil',
    });
    expect(out.text).toContain('Suresh');
    expect(out.text).not.toContain('Patil');
  });
});
