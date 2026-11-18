import type {
  CatalogAmcPlan,
  CatalogPrice,
  CatalogService,
  IntakeDto,
  IntakeItemType,
  IntakeKind,
  IntakeLineStatus,
  IntakeSlot,
  IntakeStatus,
  PublicCatalog,
} from '@/services/intakeService';
import type { ServiceType } from '@/domain/types';
import { formatCurrency } from '@/utils/formatters';

/** Customer-choice value meaning "create a new temporary customer". */
export const NEW_CUSTOMER = 'new';

export const KIND_LABELS: Record<IntakeKind, string> = {
  SERVICE_BOOKING: 'Service booking',
  AMC_REQUEST: 'AMC request',
  PRODUCT_ENQUIRY: 'Product enquiry',
  CONTACT: 'Contact message',
  BASKET: 'Basket (several items)',
  SELLER_INTEREST: 'Dealer wants to sell on ESS',
};

export const ITEM_TYPE_LABELS: Record<IntakeItemType, string> = {
  SERVICE: 'Service',
  AMC: 'AMC plan',
  PRODUCT: 'AC (product)',
};

export const LINE_STATUS_LABELS: Record<IntakeLineStatus, string> = {
  PENDING: 'Waiting',
  APPROVED: 'Approved',
  QUOTE_PENDING: 'Seller to quote',
  FULFILLED: 'Done',
  REJECTED: 'Not accepted',
  CANCELLED: 'Cancelled',
};

export const STATUS_LABELS: Record<IntakeStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  DUPLICATE: 'Duplicate',
  SPAM: 'Spam',
  WITHDRAWN: 'Withdrawn',
  IMPORTED_ARCHIVE: 'Imported (archive)',
};

export const STATUS_BADGE: Record<IntakeStatus, 'warning' | 'success' | 'error' | 'neutral' | 'info'> = {
  PENDING_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  DUPLICATE: 'neutral',
  SPAM: 'error',
  WITHDRAWN: 'neutral',
  IMPORTED_ARCHIVE: 'info',
};

export const SLOT_LABELS: Record<IntakeSlot, string> = {
  MORNING: 'Morning (9 am – 12 pm)',
  AFTERNOON: 'Afternoon (12 – 4 pm)',
  EVENING: 'Evening (4 – 8 pm)',
};

export const REQUEST_TYPE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: 'GENERAL_SERVICE', label: 'General service' },
  { value: 'BREAKDOWN', label: 'Breakdown' },
  { value: 'REPAIR', label: 'Repair' },
  { value: 'INSTALLATION', label: 'Installation' },
  { value: 'INSPECTION', label: 'Inspection / survey' },
  { value: 'PREVENTIVE_MAINTENANCE', label: 'Preventive maintenance' },
  { value: 'COMPLAINT', label: 'Complaint' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'UNPLANNED_OTHER', label: 'Unplanned (other)' },
  { value: 'OTHER', label: 'Other' },
];

const REQUEST_TYPE_VALUES = new Set<string>(REQUEST_TYPE_OPTIONS.map((o) => o.value));

/** "2 h 15 m", "4 m", "3 d 2 h" — how long an item has been waiting. */
export function formatWaitingFor(createdAt: string, now: number = Date.now()): string {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return '—';
  const totalMinutes = Math.max(0, Math.floor((now - created) / 60000));
  if (totalMinutes < 1) return 'less than a minute';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return `${hours} h ${minutes} m`;
  return `${minutes} m`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatPrice(price: CatalogPrice | null | undefined): string | null {
  if (!price || typeof price.total !== 'number') return null;
  return formatCurrency(price.total);
}

export function findCatalogService(catalog: PublicCatalog | null, code: string | null): CatalogService | null {
  if (!catalog || !code) return null;
  return catalog.services.find((s) => s.code === code) ?? null;
}

export function findAmcPlan(catalog: PublicCatalog | null, code: string | null): CatalogAmcPlan | null {
  if (!catalog || !code) return null;
  return catalog.amcPlans.find((p) => p.code === code || p.planCode === code) ?? null;
}

/** Picks the AMC rate matching the customer's AC (split/window, small ≤ 1 ton / large). */
export function pickAmcRate(plan: CatalogAmcPlan, ac: IntakeDto['ac']): { label: string; price: CatalogPrice } | null {
  const type = (ac.type || '').toUpperCase();
  const small = ac.tonnage !== null && ac.tonnage !== undefined && ac.tonnage <= 1.0;
  const { rates } = plan;
  const candidates: [string, CatalogPrice | null][] = type.includes('WINDOW')
    ? [[small ? 'Window, up to 1 ton' : 'Window, 1.5 ton and above', small ? rates.windowSmall : rates.windowLarge]]
    : type.includes('SPLIT')
      ? [[small ? 'Split, up to 1 ton' : 'Split, 1.5 ton and above', small ? rates.splitSmall : rates.splitLarge]]
      : [];
  candidates.push(['Flat rate', rates.flat]);
  const hit = candidates.find(([, p]) => p !== null);
  return hit && hit[1] ? { label: hit[0], price: hit[1] } : null;
}

/** Default request type for the approve dialog: catalog first, then a kind-based guess. */
export function defaultRequestType(intake: IntakeDto, catalog: PublicCatalog | null): ServiceType {
  if (intake.kind === 'BASKET') {
    const items = intake.items ?? [];
    const firstService = items.find((i) => i.type === 'SERVICE');
    const basketType = findCatalogService(catalog, firstService?.serviceCode ?? null)?.requestType;
    if (basketType && REQUEST_TYPE_VALUES.has(basketType)) return basketType as ServiceType;
    if (items.some((i) => i.type === 'AMC')) return 'INSPECTION';
    return 'OTHER';
  }
  const fromCatalog = findCatalogService(catalog, intake.request.serviceCode)?.requestType;
  if (fromCatalog && REQUEST_TYPE_VALUES.has(fromCatalog)) return fromCatalog as ServiceType;
  if (intake.kind === 'AMC_REQUEST') return 'INSPECTION';
  if (intake.kind === 'SERVICE_BOOKING') return 'GENERAL_SERVICE';
  return 'OTHER';
}

/** True when keyboard shortcuts should be ignored (user is typing or a modifier is held). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
