/**
 * Customer-facing status: one plain-English view of where a service request stands, shared by
 * customer emails, the tracking page and the ESS portal.
 *
 * Main path (step 1-6):
 *   RECEIVED -> CONFIRMED -> SCHEDULED -> TECHNICIAN_ASSIGNED / ON_THE_WAY -> IN_PROGRESS
 *   -> COMPLETED / PAYMENT_DUE
 * Side states (step = where the job paused): AWAITING_PARTS, FOLLOW_UP, ON_HOLD,
 *   NOT_ACCEPTED (web request turned down), CANCELLED.
 *
 * The DB status unions below mirror the live CHECK constraints. The mappings are Records over
 * those unions, so adding a DB status without deciding its customer meaning breaks compilation.
 */

export const REQUEST_STATUSES = [
  'REQUESTED',
  'PENDING',
  'SCHEDULED',
  'ASSIGNED',
  'IN_PROGRESS',
  'AWAITING_PARTS',
  'ON_HOLD',
  'REVISIT_REQUIRED',
  'RESOLVED',
  'COMPLETED',
  'PAYMENT',
  'CLOSED',
  'CANCELLED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const SCHEDULE_STATUSES = [
  'SCHEDULED',
  'PLANNED',
  'DUE',
  'OVERDUE',
  'ASSIGNED',
  'EN_ROUTE',
  'IN_PROGRESS',
  'RESOLVED',
  'COMPLETED',
  'SKIPPED',
  'CANCELLED',
  'RESCHEDULED',
] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export type CustomerStatusCode =
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'SCHEDULED'
  | 'TECHNICIAN_ASSIGNED'
  | 'ON_THE_WAY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PAYMENT_DUE'
  | 'AWAITING_PARTS'
  | 'FOLLOW_UP'
  | 'ON_HOLD'
  | 'NOT_ACCEPTED'
  | 'CANCELLED';

export type CustomerStatusTone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger';

export interface CustomerStatus {
  code: CustomerStatusCode;
  label: string;
  /** Position on the 1-6 progress bar. Side states keep the step where the job paused. */
  step: 1 | 2 | 3 | 4 | 5 | 6;
  tone: CustomerStatusTone;
  /** True for AWAITING_PARTS, FOLLOW_UP, ON_HOLD, NOT_ACCEPTED, CANCELLED. */
  sideState: boolean;
}

export const CUSTOMER_STATUSES: Record<CustomerStatusCode, CustomerStatus> = {
  RECEIVED: { code: 'RECEIVED', label: 'Request received', step: 1, tone: 'neutral', sideState: false },
  CONFIRMED: { code: 'CONFIRMED', label: 'Confirmed', step: 2, tone: 'info', sideState: false },
  SCHEDULED: { code: 'SCHEDULED', label: 'Visit scheduled', step: 3, tone: 'info', sideState: false },
  TECHNICIAN_ASSIGNED: { code: 'TECHNICIAN_ASSIGNED', label: 'Technician assigned', step: 4, tone: 'info', sideState: false },
  ON_THE_WAY: { code: 'ON_THE_WAY', label: 'Technician on the way', step: 4, tone: 'progress', sideState: false },
  IN_PROGRESS: { code: 'IN_PROGRESS', label: 'Work in progress', step: 5, tone: 'progress', sideState: false },
  COMPLETED: { code: 'COMPLETED', label: 'Completed', step: 6, tone: 'success', sideState: false },
  PAYMENT_DUE: { code: 'PAYMENT_DUE', label: 'Payment due', step: 6, tone: 'warning', sideState: false },
  AWAITING_PARTS: { code: 'AWAITING_PARTS', label: 'Waiting for parts', step: 5, tone: 'warning', sideState: true },
  FOLLOW_UP: { code: 'FOLLOW_UP', label: 'Follow-up visit needed', step: 5, tone: 'warning', sideState: true },
  ON_HOLD: { code: 'ON_HOLD', label: 'On hold', step: 2, tone: 'warning', sideState: true },
  NOT_ACCEPTED: { code: 'NOT_ACCEPTED', label: 'Not accepted', step: 1, tone: 'danger', sideState: true },
  CANCELLED: { code: 'CANCELLED', label: 'Cancelled', step: 1, tone: 'danger', sideState: true },
};

export const CUSTOMER_STATUS_CODES = Object.keys(CUSTOMER_STATUSES) as CustomerStatusCode[];

const REQUEST_TO_CUSTOMER: Record<RequestStatus, CustomerStatusCode> = {
  REQUESTED: 'RECEIVED',
  PENDING: 'CONFIRMED',
  SCHEDULED: 'SCHEDULED',
  ASSIGNED: 'TECHNICIAN_ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_PARTS: 'AWAITING_PARTS',
  ON_HOLD: 'ON_HOLD',
  REVISIT_REQUIRED: 'FOLLOW_UP',
  RESOLVED: 'COMPLETED',
  COMPLETED: 'COMPLETED',
  PAYMENT: 'PAYMENT_DUE',
  CLOSED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

/**
 * null = this visit is no longer the live one (cancelled, skipped, moved to a new date);
 * the request status decides what the customer sees.
 * PLANNED/DUE/OVERDUE are internal planning words: to the customer the visit is just scheduled.
 */
const SCHEDULE_TO_CUSTOMER: Record<ScheduleStatus, CustomerStatusCode | 'SCHEDULED_OR_ASSIGNED' | null> = {
  SCHEDULED: 'SCHEDULED_OR_ASSIGNED',
  PLANNED: 'SCHEDULED_OR_ASSIGNED',
  DUE: 'SCHEDULED_OR_ASSIGNED',
  OVERDUE: 'SCHEDULED_OR_ASSIGNED',
  ASSIGNED: 'TECHNICIAN_ASSIGNED',
  EN_ROUTE: 'ON_THE_WAY',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'COMPLETED',
  COMPLETED: 'COMPLETED',
  SKIPPED: null,
  CANCELLED: null,
  RESCHEDULED: null,
};

/** Request statuses that always win over whatever the latest visit says. */
const REQUEST_STATUS_WINS: ReadonlySet<RequestStatus> = new Set<RequestStatus>([
  'AWAITING_PARTS',
  'ON_HOLD',
  'REVISIT_REQUIRED',
  'RESOLVED',
  'COMPLETED',
  'PAYMENT',
  'CLOSED',
  'CANCELLED',
]);

/**
 * Customer statuses that send an email. CONFIRMED is covered by the approval email.
 * Deliberately quiet: no email for RECEIVED (receipt email covers it), IN_PROGRESS (the customer
 * is with the technician), ON_HOLD/FOLLOW_UP (staff call the customer), or PAYMENT_DUE (the
 * invoice email with real amounts is sent separately by staff).
 */
export const EMAIL_STATUS_CODES: readonly CustomerStatusCode[] = [
  'SCHEDULED',
  'TECHNICIAN_ASSIGNED',
  'ON_THE_WAY',
  'COMPLETED',
  'AWAITING_PARTS',
  'CANCELLED',
];

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && (REQUEST_STATUSES as readonly string[]).includes(value);
}

export function isScheduleStatus(value: unknown): value is ScheduleStatus {
  return typeof value === 'string' && (SCHEDULE_STATUSES as readonly string[]).includes(value);
}

export function shouldEmailForStatus(code: CustomerStatusCode): boolean {
  return EMAIL_STATUS_CODES.includes(code);
}

export function fromRequestStatus(status: RequestStatus): CustomerStatus {
  return CUSTOMER_STATUSES[REQUEST_TO_CUSTOMER[status]];
}

/** Returns null when the visit is cancelled/skipped/rescheduled (it no longer describes the job). */
export function fromScheduleStatus(
  status: ScheduleStatus,
  opts: { technicianAssigned: boolean } = { technicianAssigned: false },
): CustomerStatus | null {
  const mapped = SCHEDULE_TO_CUSTOMER[status];
  if (mapped === null) return null;
  if (mapped === 'SCHEDULED_OR_ASSIGNED') {
    return CUSTOMER_STATUSES[opts.technicianAssigned ? 'TECHNICIAN_ASSIGNED' : 'SCHEDULED'];
  }
  return CUSTOMER_STATUSES[mapped];
}

export interface CustomerStatusRequestInput {
  status: string;
}

export interface CustomerStatusScheduleInput {
  status: string;
  technician_id?: string | null;
}

/**
 * The customer-facing status for a request plus its latest visit.
 * Request side/terminal statuses win; otherwise the visit wins when it is at least as far along
 * (the visit carries the finer detail, e.g. ON_THE_WAY). Unknown statuses fall back to RECEIVED
 * for the request and are ignored for the visit.
 */
export function customerStatusFor(
  request: CustomerStatusRequestInput,
  latestSchedule?: CustomerStatusScheduleInput | null,
): CustomerStatus {
  const requestStatus = isRequestStatus(request.status) ? request.status : null;
  const fromRequest = requestStatus ? fromRequestStatus(requestStatus) : CUSTOMER_STATUSES.RECEIVED;
  if (requestStatus && REQUEST_STATUS_WINS.has(requestStatus)) return fromRequest;
  if (!latestSchedule || !isScheduleStatus(latestSchedule.status)) return fromRequest;

  const fromSchedule = fromScheduleStatus(latestSchedule.status, {
    technicianAssigned: Boolean(latestSchedule.technician_id),
  });
  if (!fromSchedule) return fromRequest;
  return fromSchedule.step >= fromRequest.step ? fromSchedule : fromRequest;
}

/** Web intake status -> customer status (intake statuses are owned by the web_intakes table). */
export function fromIntakeStatus(status: string): CustomerStatus {
  switch (status) {
    case 'APPROVED':
    case 'CONVERTED':
      return CUSTOMER_STATUSES.CONFIRMED;
    case 'REJECTED':
    case 'SPAM':
      return CUSTOMER_STATUSES.NOT_ACCEPTED;
    case 'CANCELLED':
      return CUSTOMER_STATUSES.CANCELLED;
    default:
      return CUSTOMER_STATUSES.RECEIVED;
  }
}
