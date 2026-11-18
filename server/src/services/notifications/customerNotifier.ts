import { getSupabaseClient } from '../../lib/supabase.js';
import { logger } from '../../utils/logger.js';
import { outboxService, OutboundEvent, OutboxOutcome, PermanentOutboxError } from '../outbox.service.js';
import { emailOutboxService, EmailEntityType } from '../email/emailOutbox.service.js';
import { customerStatusFor, shouldEmailForStatus } from '../../domain/customerStatus.js';
import {
  buildIntakeConfirmationEmail,
  buildIntakeReceiptEmail,
  buildIntakeRejectionEmail,
  buildServiceStatusEmail,
  buildVisitDateChangedEmail,
  EmailContent,
  firstNameOnly,
} from './customerEmailTemplates.js';

/**
 * Sends customer emails for web intake events and service status changes.
 * Rules: never email about events older than 24 h (an old backlog must not spam customers),
 * skip when there is no usable email or the feature flag is off, and send each status once per
 * request (idempotency key on email_deliveries). When a visit moves to a new date/window after a
 * date was already emailed, a "new date" email is sent once per new date (sr-visit-date key).
 */

export const CUSTOMER_EVENT_TYPES = [
  'WEB_INTAKE_RECEIVED',
  'WEB_INTAKE_APPROVED',
  'WEB_INTAKE_REJECTED',
  'SERVICE_REQUEST_STATUS_CHANGED',
  'SERVICE_SCHEDULE_STATUS_CHANGED',
] as const;

export const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

type CustomerEmailEntity =
  | 'INTAKE_RECEIPT'
  | 'INTAKE_CONFIRMATION'
  | 'INTAKE_REJECTION'
  | 'SERVICE_STATUS_UPDATE';

/** Request statuses whose own email is the approval confirmation, never a status email. */
const QUIET_REQUEST_STATUSES = new Set(['REQUESTED', 'PENDING']);

const INTAKE_COLUMNS =
  'id,intake_number,tracking_code,kind,status,contact_name,contact_email,area,city,ac_type,ac_brand,ac_tonnage,preferred_date,preferred_slot,rejection_reason,service_request_id,customer_id,created_at';

interface IntakeRow {
  id: string;
  intake_number: string | null;
  tracking_code: string | null;
  kind: string;
  status: string | null;
  contact_name: string | null;
  contact_email: string | null;
  area: string | null;
  city: string | null;
  ac_type: string | null;
  ac_brand: string | null;
  ac_tonnage: string | number | null;
  preferred_date: string | null;
  preferred_slot: string | null;
  rejection_reason: string | null;
  service_request_id: string | null;
  customer_id: string | null;
}

export function customerUpdatesEnabled(): boolean {
  return process.env.EMAIL_AUTO_SEND_CUSTOMER_UPDATES !== 'false';
}

export function isEventTooOld(event: Pick<OutboundEvent, 'created_at'>, now = Date.now()): boolean {
  const created = Date.parse(event.created_at);
  if (Number.isNaN(created)) return true;
  return now - created > MAX_EVENT_AGE_MS;
}

function usableEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function payloadId(event: OutboundEvent, key: string): string {
  const value = event.payload?.[key];
  if (typeof value !== 'string' || !value) {
    throw new PermanentOutboxError(`${event.event_type} payload is missing ${key}`);
  }
  return value;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function sendCustomerEmail(input: {
  entityType: CustomerEmailEntity;
  entityId: string;
  templateKey: string;
  recipientEmail: string;
  recipientName: string | null;
  idempotencyKey: string;
  content: EmailContent;
}): Promise<OutboxOutcome> {
  await emailOutboxService.enqueueAndSend({
    // New entity types are allowed by the web-intake migration; widen the TS union there later.
    entityType: input.entityType,
    entityId: input.entityId,
    templateKey: input.templateKey,
    recipientEmail: input.recipientEmail,
    recipientName: input.recipientName,
    subject: input.content.subject,
    html: input.content.html,
    text: input.content.text,
    tags: [{ name: 'audience', value: 'customer' }],
    idempotencyKey: input.idempotencyKey,
    actorId: null,
  });
  return 'DONE';
}

async function loadIntake(intakeId: string): Promise<IntakeRow | null> {
  const { data, error } = await getSupabaseClient()
    .from('web_intakes')
    .select(INTAKE_COLUMNS)
    .eq('id', intakeId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load web intake: ${error.message}`);
  return (data as IntakeRow | null) ?? null;
}

/** Common gate: flag on and event fresh. Returns false when the event must be skipped. */
function passesGate(event: OutboundEvent): boolean {
  if (!customerUpdatesEnabled()) return false;
  if (isEventTooOld(event)) {
    logger.info('Customer notifier skipped stale event', { id: event.id, type: event.event_type });
    return false;
  }
  return true;
}

export async function handleIntakeReceived(event: OutboundEvent): Promise<OutboxOutcome> {
  if (!passesGate(event)) return 'SKIPPED';
  const intakeId = payloadId(event, 'intakeId');
  const intake = await loadIntake(intakeId);
  const email = usableEmail(intake?.contact_email);
  if (!intake || !email) return 'SKIPPED';

  return sendCustomerEmail({
    entityType: 'INTAKE_RECEIPT',
    entityId: intake.id,
    templateKey: 'intake_receipt',
    recipientEmail: email,
    recipientName: intake.contact_name,
    idempotencyKey: `intake-receipt:${intake.id}`,
    content: buildIntakeReceiptEmail({
      contactName: intake.contact_name,
      intakeNumber: intake.intake_number,
      trackingCode: intake.tracking_code,
      kind: intake.kind,
      area: intake.area,
      city: intake.city,
      acType: intake.ac_type,
      acBrand: intake.ac_brand,
      acTonnage: intake.ac_tonnage,
      preferredDate: intake.preferred_date,
      preferredSlot: intake.preferred_slot,
    }),
  });
}

export async function handleIntakeApproved(event: OutboundEvent): Promise<OutboxOutcome> {
  if (!passesGate(event)) return 'SKIPPED';
  const intakeId = payloadId(event, 'intakeId');
  const intake = await loadIntake(intakeId);
  const email = usableEmail(intake?.contact_email);
  if (!intake || !email) return 'SKIPPED';

  const serviceRequestId =
    (typeof event.payload?.serviceRequestId === 'string' && event.payload.serviceRequestId) || intake.service_request_id;
  let requestNumber: string | null = null;
  if (serviceRequestId) {
    const { data, error } = await getSupabaseClient()
      .from('service_requests')
      .select('id,request_number')
      .eq('id', serviceRequestId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load service request: ${error.message}`);
    requestNumber = (data as { request_number?: string } | null)?.request_number ?? null;
  }

  return sendCustomerEmail({
    entityType: 'INTAKE_CONFIRMATION',
    entityId: intake.id,
    templateKey: 'intake_confirmation',
    recipientEmail: email,
    recipientName: intake.contact_name,
    idempotencyKey: `intake-confirmation:${intake.id}`,
    content: buildIntakeConfirmationEmail({
      contactName: intake.contact_name,
      requestNumber,
      trackingCode: intake.tracking_code,
      preferredDate: intake.preferred_date,
      preferredSlot: intake.preferred_slot,
    }),
  });
}

export async function handleIntakeRejected(event: OutboundEvent): Promise<OutboxOutcome> {
  if (!passesGate(event)) return 'SKIPPED';
  const intakeId = payloadId(event, 'intakeId');
  const intake = await loadIntake(intakeId);
  const email = usableEmail(intake?.contact_email);
  if (!intake || !email) return 'SKIPPED';

  return sendCustomerEmail({
    entityType: 'INTAKE_REJECTION',
    entityId: intake.id,
    templateKey: 'intake_rejection',
    recipientEmail: email,
    recipientName: intake.contact_name,
    idempotencyKey: `intake-rejection:${intake.id}`,
    content: buildIntakeRejectionEmail({
      contactName: intake.contact_name,
      intakeNumber: intake.intake_number,
      trackingCode: intake.tracking_code,
      reason: intake.rejection_reason,
    }),
  });
}

interface RequestRow {
  id: string;
  request_number: string;
  status: string;
  customer_id: string;
  customers:
    | { name: string | null; email: string | null; email_bounced_at?: string | null; email_complained_at?: string | null }
    | Array<{ name: string | null; email: string | null; email_bounced_at?: string | null; email_complained_at?: string | null }>
    | null;
}

interface ScheduleRow {
  id: string;
  status: string;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  technician_id: string | null;
}

/** Only the technician's name column is read; customers see the first name only. */
async function loadTechnicianFirstName(technicianId: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from('technicians')
    .select('name')
    .eq('id', technicianId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load technician: ${error.message}`);
  return firstNameOnly((data as { name?: string | null } | null)?.name);
}

/** Tracking code is nice-to-have: requests that did not come from the website have none. */
async function loadTrackingCode(serviceRequestId: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from('web_intakes')
    .select('tracking_code')
    .eq('service_request_id', serviceRequestId)
    .limit(1);
  if (error) return null;
  return one(data as Array<{ tracking_code: string | null }> | null)?.tracking_code ?? null;
}

/** Status emails that showed the customer a visit date. */
const VISIT_STATUS_EMAIL_CODES = ['SCHEDULED', 'TECHNICIAN_ASSIGNED', 'ON_THE_WAY'] as const;
/** Visit statuses that still describe an upcoming visit (RESCHEDULED = moved in place, no technician yet). */
const UPCOMING_VISIT_STATUSES = new Set(['SCHEDULED', 'PLANNED', 'DUE', 'OVERDUE', 'ASSIGNED', 'RESCHEDULED']);
/** Request statuses where a visit date no longer matters to the customer. */
const FINISHED_REQUEST_STATUSES = new Set(['RESOLVED', 'COMPLETED', 'PAYMENT', 'CLOSED', 'CANCELLED']);

function hhmm(value: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  return match ? `${match[1].padStart(2, '0')}${match[2]}` : 'any';
}

/** One key per request + visit + date + window: each genuinely new date emails once. */
export function visitDateIdempotencyKey(
  serviceRequestId: string,
  scheduleId: string,
  scheduledDate: string,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  return `sr-visit-date:${serviceRequestId}:${scheduleId}:${scheduledDate.slice(0, 10)}:${hhmm(startTime)}-${hhmm(endTime)}`;
}

function payloadString(event: OutboundEvent, key: string): string | null {
  const value = event.payload?.[key];
  return typeof value === 'string' && value ? value : null;
}

/**
 * Sends "Your visit has a new date" when the live visit's date/window differs from what the
 * customer was already emailed. Returns null to fall back to the normal status email, e.g. when
 * no date was ever emailed (the first SCHEDULED email covers that, so never both).
 */
async function sendVisitDateChangedIfDue(
  event: OutboundEvent,
  request: RequestRow,
  customerName: string | null,
  email: string,
  schedule: ScheduleRow | null,
): Promise<OutboxOutcome | null> {
  if (!schedule?.scheduled_date) return null;
  if (FINISHED_REQUEST_STATUSES.has(request.status) || !UPCOMING_VISIT_STATUSES.has(schedule.status)) return null;

  const { data, error } = await getSupabaseClient()
    .from('email_deliveries')
    .select('idempotency_key,created_at')
    .eq('entity_type', 'SERVICE_STATUS_UPDATE')
    .eq('entity_id', request.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load earlier customer emails: ${error.message}`);

  const statusKeys = new Set(VISIT_STATUS_EMAIL_CODES.map((code) => `sr-status:${request.id}:${code}`));
  const datePrefix = `sr-visit-date:${request.id}:`;
  const earlierVisitEmails = ((data as Array<{ idempotency_key: string | null }> | null) ?? [])
    .map((row) => row.idempotency_key ?? '')
    .filter((key) => statusKeys.has(key) || key.startsWith(datePrefix));
  if (earlierVisitEmails.length === 0) return null;

  const dateKey = visitDateIdempotencyKey(
    request.id,
    schedule.id,
    schedule.scheduled_date,
    schedule.start_time,
    schedule.end_time,
  );
  // Rows are newest first. Compare with the LAST date the customer was told, not every date ever
  // emailed: a visit moved A -> B -> A must announce A again.
  const baseOf = (key: string) => key.split('#')[0];
  const lastDateEmail = earlierVisitEmails.find((key) => key.startsWith(datePrefix));
  if (lastDateEmail && baseOf(lastDateEmail) === dateKey) return 'SKIPPED';
  // A date announced before (then changed) gets a per-event key so the email outbox does not
  // treat it as a duplicate; retries of the same event still share one key.
  const idempotencyKey = earlierVisitEmails.some((key) => baseOf(key) === dateKey)
    ? `${dateKey}#${event.id}`
    : dateKey;

  const technicianFirstName = schedule.technician_id ? await loadTechnicianFirstName(schedule.technician_id) : null;
  const trackingCode = await loadTrackingCode(request.id);

  return sendCustomerEmail({
    entityType: 'SERVICE_STATUS_UPDATE',
    entityId: request.id,
    templateKey: 'service_visit_date_changed',
    recipientEmail: email,
    recipientName: customerName,
    idempotencyKey,
    content: buildVisitDateChangedEmail({
      customerName,
      requestNumber: request.request_number,
      trackingCode,
      previousDate: payloadString(event, 'previousScheduledDate'),
      previousStartTime: payloadString(event, 'previousStartTime'),
      previousEndTime: payloadString(event, 'previousEndTime'),
      newDate: schedule.scheduled_date,
      newStartTime: schedule.start_time,
      newEndTime: schedule.end_time,
      technicianFirstName,
    }),
  });
}

/**
 * SERVICE_REQUEST_STATUS_CHANGED and SERVICE_SCHEDULE_STATUS_CHANGED share one handler.
 * The customer status is computed from the CURRENT request + latest visit (not the payload),
 * so a late or duplicate event never emails an out-of-date status; the per-status idempotency
 * key keeps each status to one email per request.
 */
export async function handleServiceStatusChanged(event: OutboundEvent): Promise<OutboxOutcome> {
  if (!passesGate(event)) return 'SKIPPED';
  const serviceRequestId = payloadId(event, 'serviceRequestId');

  // Approval puts the request into PENDING; the confirmation email already covers that.
  if (
    event.event_type === 'SERVICE_REQUEST_STATUS_CHANGED' &&
    typeof event.payload?.toStatus === 'string' &&
    QUIET_REQUEST_STATUSES.has(event.payload.toStatus)
  ) {
    return 'SKIPPED';
  }

  const supabase = getSupabaseClient();
  const { data: requestData, error: requestError } = await supabase
    .from('service_requests')
    .select('id,request_number,status,customer_id,customers(name,email,email_bounced_at,email_complained_at)')
    .eq('id', serviceRequestId)
    .maybeSingle();
  if (requestError) throw new Error(`Failed to load service request: ${requestError.message}`);
  const request = requestData as RequestRow | null;
  if (!request) return 'SKIPPED';

  const customer = one(request.customers);
  const email = usableEmail(customer?.email);
  if (!email || customer?.email_bounced_at || customer?.email_complained_at) return 'SKIPPED';

  const { data: scheduleData, error: scheduleError } = await supabase
    .from('service_schedules')
    .select('id,status,scheduled_date,start_time,end_time,technician_id')
    .eq('service_request_id', serviceRequestId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (scheduleError) throw new Error(`Failed to load service schedule: ${scheduleError.message}`);
  const schedule = one(scheduleData as ScheduleRow[] | null);

  // The visit moved to a new date/window after the customer was already told a date.
  if (event.event_type === 'SERVICE_SCHEDULE_STATUS_CHANGED' && event.payload?.dateChanged === true) {
    const outcome = await sendVisitDateChangedIfDue(event, request, customer?.name ?? null, email, schedule);
    if (outcome) return outcome;
  }

  const status = customerStatusFor(request, schedule);
  if (!shouldEmailForStatus(status.code)) return 'SKIPPED';
  // RESOLVED = technician finished but staff have not verified; wait for COMPLETED/CLOSED.
  if (status.code === 'COMPLETED' && request.status === 'RESOLVED') return 'SKIPPED';

  let technicianFirstName: string | null = null;
  if ((status.code === 'TECHNICIAN_ASSIGNED' || status.code === 'ON_THE_WAY') && schedule?.technician_id) {
    technicianFirstName = await loadTechnicianFirstName(schedule.technician_id);
  }

  const trackingCode = await loadTrackingCode(serviceRequestId);

  const showVisit = status.code === 'SCHEDULED' || status.code === 'TECHNICIAN_ASSIGNED' || status.code === 'ON_THE_WAY';
  return sendCustomerEmail({
    entityType: 'SERVICE_STATUS_UPDATE',
    entityId: request.id,
    templateKey: `service_status_${status.code.toLowerCase()}`,
    recipientEmail: email,
    recipientName: customer?.name ?? null,
    idempotencyKey: `sr-status:${request.id}:${status.code}`,
    content: buildServiceStatusEmail({
      code: status.code,
      customerName: customer?.name ?? null,
      requestNumber: request.request_number,
      trackingCode,
      scheduledDate: showVisit ? schedule?.scheduled_date ?? null : null,
      startTime: showVisit ? schedule?.start_time ?? null : null,
      endTime: showVisit ? schedule?.end_time ?? null : null,
      technicianFirstName,
    }),
  });
}

/** Registers the customer email handlers. Call once at startup, before the outbox worker runs. */
export function registerCustomerNotifier(): void {
  outboxService.register('WEB_INTAKE_RECEIVED', handleIntakeReceived);
  outboxService.register('WEB_INTAKE_APPROVED', handleIntakeApproved);
  outboxService.register('WEB_INTAKE_REJECTED', handleIntakeRejected);
  outboxService.register('SERVICE_REQUEST_STATUS_CHANGED', handleServiceStatusChanged);
  outboxService.register('SERVICE_SCHEDULE_STATUS_CHANGED', handleServiceStatusChanged);
}
