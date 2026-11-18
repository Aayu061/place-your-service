import { escapeEmailHtml, wrapBrandedEmailLayout } from '../email/emailTemplates.service.js';
import { CUSTOMER_STATUSES, CustomerStatusCode } from '../../domain/customerStatus.js';

/**
 * Customer-facing emails for web requests and service status updates.
 * Plain, honest copy: no arrival-time promises, no technician phone numbers, no full address.
 * Every value that came from a person or the database is escaped before it goes into HTML.
 */

export const BUSINESS_NAME = 'Extreme Sales & Services';
export const BUSINESS_PHONE = '+91 7977805245';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const SLOT_LABELS: Record<string, string> = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  EVENING: 'Evening',
};

const KIND_LABELS: Record<string, string> = {
  SERVICE_BOOKING: 'Service booking',
  AMC_REQUEST: 'AMC (maintenance contract) request',
  PRODUCT_ENQUIRY: 'Product enquiry',
  CONTACT: 'Message',
  BASKET: 'Request',
  SELLER_INTEREST: 'Interest in selling on ESS',
};

/** Kinds answered like a message (no booking details, no visit). */
const MESSAGE_KINDS = new Set(['CONTACT', 'SELLER_INTEREST']);

/** "2026-11-21" -> "Sat, 21 Nov 2026". Anything unparseable is returned as given. */
export function formatCustomerDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return value;
  return `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function slotLabel(slot: string | null | undefined): string | null {
  if (!slot) return null;
  return SLOT_LABELS[slot] ?? null;
}

/** First word of a name only; customers never see a technician's full name or phone. */
export function firstNameOnly(name: string | null | undefined): string | null {
  const first = String(name ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}

function greetingName(name: string | null | undefined): string {
  const clean = String(name ?? '').trim();
  return clean || 'Customer';
}

type Row = [label: string, value: string | null | undefined];

function detailsTable(rows: Row[]): { html: string; text: string } {
  const present = rows.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  if (present.length === 0) return { html: '', text: '' };
  const html = `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0 16px;">${present
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #D6E1EA;color:#4A5B70;width:40%;">${escapeEmailHtml(label)}</td><td style="padding:6px 8px;border-bottom:1px solid #D6E1EA;color:#0F2340;font-weight:600;">${escapeEmailHtml(value)}</td></tr>`,
    )
    .join('')}</table>`;
  const text = present.map(([label, value]) => `${label}: ${value}`).join('\n');
  return { html, text };
}

function paragraph(textValue: string): string {
  return `<p style="font-size:13.5px;color:#334155;line-height:1.55;margin:0 0 12px;">${escapeEmailHtml(textValue).replace(/\n/g, '<br>')}</p>`;
}

function contactLine(): string {
  return `If anything is wrong or you need to change something, reply to this email or call us on ${BUSINESS_PHONE}.`;
}

function render(opts: {
  subject: string;
  heading: string;
  badgeText: string;
  badgeBg: string;
  badgeColor: string;
  name: string | null | undefined;
  intro: string[];
  rows: Row[];
  outro: string[];
}): EmailContent {
  const hello = `Hello ${greetingName(opts.name)},`;
  const table = detailsTable(opts.rows);
  const bodyHtml = [
    `<h2 style="font-size:18px;margin:0 0 12px;color:#0F2340;">${escapeEmailHtml(opts.heading)}</h2>`,
    paragraph(hello),
    ...opts.intro.map(paragraph),
    table.html,
    ...opts.outro.map(paragraph),
    paragraph(`Thank you,\n${BUSINESS_NAME}`),
  ].join('\n');

  const html = wrapBrandedEmailLayout({
    title: opts.subject,
    badgeText: opts.badgeText,
    badgeBg: opts.badgeBg,
    badgeColor: opts.badgeColor,
    bodyHtml,
  });

  const text = [hello, ...opts.intro, table.text, ...opts.outro, `Thank you,\n${BUSINESS_NAME}`]
    .filter(Boolean)
    .join('\n\n');

  return { subject: opts.subject, html, text };
}

// ---------------------------------------------------------------------------------------------
// Web intake emails

export interface IntakeEmailInput {
  contactName: string | null;
  intakeNumber: string | null;
  trackingCode: string | null;
  kind: string;
  area?: string | null;
  city?: string | null;
  acType?: string | null;
  acBrand?: string | null;
  acTonnage?: string | number | null;
  preferredDate?: string | null;
  preferredSlot?: string | null;
  /** Basket lines, already formatted ("Jet wash x2"). */
  items?: string[];
}

function acSummary(input: IntakeEmailInput): string | null {
  const parts = [
    input.acBrand,
    input.acType,
    input.acTonnage !== null && input.acTonnage !== undefined && input.acTonnage !== '' ? `${input.acTonnage} ton` : null,
  ].filter((p) => p !== null && p !== undefined && String(p).trim() !== '');
  return parts.length ? parts.join(' · ') : null;
}

function preferredWhen(date?: string | null, slot?: string | null): string | null {
  const parts = [formatCustomerDate(date), slotLabel(slot)].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function buildIntakeReceiptEmail(input: IntakeEmailInput): EmailContent {
  const isContact = MESSAGE_KINDS.has(input.kind);
  const ref = input.trackingCode || input.intakeNumber;
  const subject = isContact
    ? `We received your message | ${BUSINESS_NAME}`
    : `We received your request${ref ? ` (${ref})` : ''} | ${BUSINESS_NAME}`;

  if (isContact) {
    return render({
      subject,
      heading: 'We received your message',
      badgeText: 'RECEIVED',
      badgeBg: '#e0f2fe',
      badgeColor: '#0369a1',
      name: input.contactName,
      intro: ['Thank you for writing to us. Our team will read your message and get back to you.'],
      rows: [['Reference', ref]],
      outro: [`For anything urgent, please call us on ${BUSINESS_PHONE}.`],
    });
  }

  return render({
    subject,
    heading: 'We received your request',
    badgeText: 'RECEIVED',
    badgeBg: '#e0f2fe',
    badgeColor: '#0369a1',
    name: input.contactName,
    intro: [
      'Thank you for contacting us. Your request has reached our team. It is not confirmed yet: we will check the details and get back to you.',
    ],
    rows: [
      ['Tracking code', input.trackingCode],
      ['Request number', input.intakeNumber],
      ['Type', KIND_LABELS[input.kind] ?? null],
      ['Items', input.items && input.items.length ? input.items.join(', ') : null],
      ['AC', acSummary(input)],
      ['Area', [input.area, input.city].filter(Boolean).join(', ') || null],
      ['Preferred time', preferredWhen(input.preferredDate, input.preferredSlot)],
    ],
    outro: [
      'What happens next: our team reviews your request, may call you to check details, and then sends you a confirmation email.',
      'Please keep your tracking code to check the status of your request.',
      contactLine(),
    ],
  });
}

export interface IntakeConfirmationInput {
  contactName: string | null;
  requestNumber: string | null;
  trackingCode: string | null;
  preferredDate?: string | null;
  preferredSlot?: string | null;
}

export function buildIntakeConfirmationEmail(input: IntakeConfirmationInput): EmailContent {
  const ref = input.requestNumber || input.trackingCode;
  return render({
    subject: `Your request is confirmed${ref ? ` (${ref})` : ''} | ${BUSINESS_NAME}`,
    heading: 'Your request is confirmed',
    badgeText: 'CONFIRMED',
    badgeBg: '#dcfce7',
    badgeColor: '#15803d',
    name: input.contactName,
    intro: ['Good news: we have accepted your request and created a service ticket for it.'],
    rows: [
      ['Service request number', input.requestNumber],
      ['Tracking code', input.trackingCode],
      ['Your preferred time', preferredWhen(input.preferredDate, input.preferredSlot)],
    ],
    outro: [
      'Your preferred time is noted. We will email you again once the visit date is fixed.',
      contactLine(),
    ],
  });
}

export interface IntakeRejectionInput {
  contactName: string | null;
  intakeNumber: string | null;
  trackingCode: string | null;
  reason?: string | null;
}

export function buildIntakeRejectionEmail(input: IntakeRejectionInput): EmailContent {
  const ref = input.trackingCode || input.intakeNumber;
  const reason = input.reason?.trim();
  return render({
    subject: `About your request${ref ? ` (${ref})` : ''} | ${BUSINESS_NAME}`,
    heading: 'We are unable to take up this request',
    badgeText: 'NOT ACCEPTED',
    badgeBg: '#f1f5f9',
    badgeColor: '#475569',
    name: input.contactName,
    intro: [
      'Thank you for contacting us. We are sorry, but we are not able to take up this request.',
      ...(reason ? [`Reason: ${reason}`] : []),
    ],
    rows: [['Reference', ref]],
    outro: [`If you think this is a mistake or would like to talk about it, please call us on ${BUSINESS_PHONE} or reply to this email.`],
  });
}

// ---------------------------------------------------------------------------------------------
// Service status update emails

export interface ServiceStatusEmailInput {
  code: CustomerStatusCode;
  customerName: string | null;
  requestNumber: string;
  trackingCode?: string | null;
  scheduledDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  /** First name only. Never pass a full name or phone number. */
  technicianFirstName?: string | null;
}

const STATUS_COPY: Partial<Record<CustomerStatusCode, { heading: string; intro: string; badgeBg: string; badgeColor: string }>> = {
  SCHEDULED: {
    heading: 'Your service visit is scheduled',
    intro: 'We have scheduled a visit for your service request.',
    badgeBg: '#e0f2fe',
    badgeColor: '#0369a1',
  },
  TECHNICIAN_ASSIGNED: {
    heading: 'A technician has been assigned',
    intro: 'A technician has been assigned to your service request.',
    badgeBg: '#e0f2fe',
    badgeColor: '#0369a1',
  },
  ON_THE_WAY: {
    heading: 'Your technician is on the way',
    intro: 'Your technician has started travelling to you for this visit.',
    badgeBg: '#dbeafe',
    badgeColor: '#1d4ed8',
  },
  COMPLETED: {
    heading: 'Your service is complete',
    intro: 'The work on your service request has been marked as complete. Thank you for choosing us.',
    badgeBg: '#dcfce7',
    badgeColor: '#15803d',
  },
  AWAITING_PARTS: {
    heading: 'Waiting for parts',
    intro: 'Your service needs a part that we are arranging. We will schedule the next visit once the part is available.',
    badgeBg: '#fef3c7',
    badgeColor: '#b45309',
  },
  CANCELLED: {
    heading: 'Your service request is cancelled',
    intro: 'Your service request has been cancelled.',
    badgeBg: '#fee2e2',
    badgeColor: '#b91c1c',
  },
};

function timeWindow(start?: string | null, end?: string | null): string | null {
  const s = start?.trim().slice(0, 5);
  const e = end?.trim().slice(0, 5);
  if (s && e) return `${s} - ${e}`;
  return s || null;
}

export interface VisitDateChangedEmailInput {
  customerName: string | null;
  requestNumber: string;
  trackingCode?: string | null;
  /** The date we told the customer before, when known. */
  previousDate?: string | null;
  previousStartTime?: string | null;
  previousEndTime?: string | null;
  newDate: string;
  newStartTime?: string | null;
  newEndTime?: string | null;
  /** First name only. Never pass a full name or phone number. */
  technicianFirstName?: string | null;
}

function visitWhen(date?: string | null, start?: string | null, end?: string | null): string | null {
  const parts = [formatCustomerDate(date), timeWindow(start, end)].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** "Your visit has a new date": old date (when known) -> new date and window. No address, no technician phone. */
export function buildVisitDateChangedEmail(input: VisitDateChangedEmailInput): EmailContent {
  const previous = visitWhen(input.previousDate, input.previousStartTime, input.previousEndTime);
  return render({
    subject: `Your visit has a new date: ${input.requestNumber} | ${BUSINESS_NAME}`,
    heading: 'Your visit has a new date',
    badgeText: 'NEW DATE',
    badgeBg: '#fef3c7',
    badgeColor: '#b45309',
    name: input.customerName,
    intro: ['The visit for your service request has been moved. Please see the new date below.'],
    rows: [
      ['Service request number', input.requestNumber],
      ['Tracking code', input.trackingCode],
      ['Earlier date', previous],
      ['New visit date', formatCustomerDate(input.newDate)],
      ['Time window', timeWindow(input.newStartTime, input.newEndTime)],
      ['Technician', firstNameOnly(input.technicianFirstName)],
    ],
    outro: [
      'The time shown is our planned window; our team may call you before the visit.',
      `If the new date does not suit you, reply to this email or call us on ${BUSINESS_PHONE}.`,
    ],
  });
}

export function buildServiceStatusEmail(input: ServiceStatusEmailInput): EmailContent {
  const status = CUSTOMER_STATUSES[input.code];
  const copy = STATUS_COPY[input.code] ?? {
    heading: `Update on your service request: ${status.label}`,
    intro: `The status of your service request is now: ${status.label}.`,
    badgeBg: '#e0f2fe',
    badgeColor: '#0369a1',
  };
  const showVisit = input.code === 'SCHEDULED' || input.code === 'TECHNICIAN_ASSIGNED' || input.code === 'ON_THE_WAY';
  const showTechnician = input.code === 'TECHNICIAN_ASSIGNED' || input.code === 'ON_THE_WAY';

  const outro: string[] = [];
  if (input.code === 'SCHEDULED' || input.code === 'TECHNICIAN_ASSIGNED') {
    outro.push('The time shown is our planned window; our team may call you before the visit.');
  }
  if (input.code === 'CANCELLED') {
    outro.push(`If you did not expect this, or you still need help, please call us on ${BUSINESS_PHONE}.`);
  } else {
    outro.push(contactLine());
  }

  return render({
    subject: `${status.label}: ${input.requestNumber} | ${BUSINESS_NAME}`,
    heading: copy.heading,
    badgeText: status.label.toUpperCase(),
    badgeBg: copy.badgeBg,
    badgeColor: copy.badgeColor,
    name: input.customerName,
    intro: [copy.intro],
    rows: [
      ['Service request number', input.requestNumber],
      ['Tracking code', input.trackingCode],
      ['Visit date', showVisit ? formatCustomerDate(input.scheduledDate) : null],
      ['Time window', showVisit ? timeWindow(input.startTime, input.endTime) : null],
      ['Technician', showTechnician ? firstNameOnly(input.technicianFirstName) : null],
    ],
    outro,
  });
}
