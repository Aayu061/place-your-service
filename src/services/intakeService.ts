/**
 * Approval Inbox (website intakes) + public service/AMC catalog client.
 *
 * Website requests (ESS bookings, AMC requests, enquiries) wait here until a
 * staff member approves them (creates a service request) or rejects them.
 * Staff API: /api/v1/intakes (Supabase JWT, same as every other PYS call).
 */
import { apiClient } from '@/services/api/client';
import type { ServicePriority, ServiceType } from '@/domain/types';

/* ------------------------------------------------------------------ */
/* Intake types                                                        */
/* ------------------------------------------------------------------ */

export type IntakeKind =
  | 'SERVICE_BOOKING'
  | 'AMC_REQUEST'
  | 'PRODUCT_ENQUIRY'
  | 'CONTACT'
  | 'BASKET'
  | 'SELLER_INTEREST'
  /** S11b: sent by a signed-in customer on the ESS website (approve = close the review). */
  | 'AMC_RENEWAL'
  | 'PROFILE_CHANGE';

/** Sent from a signed-in customer's website account: always that customer's, never a service visit. */
export const isCustomerAccountKind = (kind: IntakeKind): boolean => kind === 'AMC_RENEWAL' || kind === 'PROFILE_CHANGE';

export type IntakeItemType = 'SERVICE' | 'AMC' | 'PRODUCT';
export type IntakeLineStatus = 'PENDING' | 'APPROVED' | 'QUOTE_PENDING' | 'FULFILLED' | 'REJECTED' | 'CANCELLED';

/** One line of a basket request, with the price the customer saw (per unit, incl. GST). */
export interface IntakeItemDto {
  id: string;
  lineNo: number;
  type: IntakeItemType;
  serviceCode: string | null;
  amcPlanCode: string | null;
  productId: string | null;
  name: string;
  quantity: number;
  ac: { type: string | null; tonnage: number | null; brand: string | null };
  notes: string | null;
  price: { total: number; base?: number; gst?: number; gstRatePercent?: number; label: string } | null;
  status: IntakeLineStatus;
  seller: { code: string; name: string } | null;
}

export type IntakeStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'DUPLICATE'
  | 'SPAM'
  | 'WITHDRAWN'
  | 'IMPORTED_ARCHIVE';

export type IntakeSlot = 'MORNING' | 'AFTERNOON' | 'EVENING';

export type IntakeRejectStatus = 'REJECTED' | 'SPAM' | 'DUPLICATE';

export interface IntakeCustomerRef {
  id: string;
  name: string;
  customerCode: string;
  customerType: string;
}

export interface IntakeCandidate extends IntakeCustomerRef {
  phone: string;
}

export interface IntakeDto {
  id: string;
  intakeNumber: string;
  trackingCode: string;
  kind: IntakeKind;
  status: IntakeStatus;
  sourceChannel: string;
  externalReferenceId: string | null;
  contact: { name: string; phone: string; email: string | null };
  address: {
    line: string | null;
    area: string | null;
    landmark: string | null;
    city: string | null;
    pincode: string | null;
  };
  ac: {
    type: string | null;
    brand: string | null;
    tonnage: number | null;
    inverter: boolean | null;
    ageYears: number | null;
    units: number | null;
  };
  request: {
    serviceCode: string | null;
    serviceName: string | null;
    amcPlanCode: string | null;
    message: string | null;
    preferredDate: string | null;
    preferredSlot: IntakeSlot | null;
  };
  consent: { privacy: boolean; marketing: boolean };
  spamScore: number | null;
  matchedCustomer: IntakeCustomerRef | null;
  review: { reviewedBy: string | null; reviewedAt: string | null; rejectionReason: string | null };
  serviceRequest: { id: string; requestNumber: string } | null;
  /** Basket lines (empty or missing for single-item requests). */
  items?: IntakeItemDto[];
  /** AMC_RENEWAL only: the contract to renew (number, status and end date come with the detail read). */
  amcContract?: { id: string; contractNumber: string | null; status: string | null; endDate: string | null } | null;
  createdAt: string;
}

export interface IntakeDetailDto extends IntakeDto {
  candidates: IntakeCandidate[];
}

export interface IntakeListParams {
  status?: IntakeStatus;
  kind?: IntakeKind;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface IntakeListResponse {
  items: IntakeDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IntakeStats {
  pending: number;
  approvedToday: number;
  rejectedToday: number;
  spam: number;
  oldestPendingAt: string | null;
}

export interface ApproveIntakePayload {
  customerId?: string;
  requestType?: ServiceType;
  priority?: ServicePriority;
  notes?: string;
  schedule?: { date: string; slot: IntakeSlot; technicianId?: string };
}

export interface ApproveIntakeResponse {
  intake: IntakeDto;
  serviceRequest: { id: string; requestNumber: string } | null;
  schedule: { id: string; scheduleNumber: string } | null;
  warning?: string;
}

export interface RejectIntakePayload {
  status: IntakeRejectStatus;
  reason: string;
}

/* ------------------------------------------------------------------ */
/* Catalog types (GET /api/v1/catalog, public)                         */
/* ------------------------------------------------------------------ */

export interface CatalogPrice {
  base: number;
  gst: number;
  total: number;
  gstRatePercent?: number;
}

export interface CatalogService {
  code: string;
  name: string;
  category: string;
  requestType: string;
  price: CatalogPrice | null;
  pricingModel: 'FIXED' | 'FROM' | 'QUOTE_AFTER_DIAGNOSIS' | string;
}

export interface CatalogAmcRates {
  splitSmall: CatalogPrice | null;
  splitLarge: CatalogPrice | null;
  windowSmall: CatalogPrice | null;
  windowLarge: CatalogPrice | null;
  flat: CatalogPrice | null;
}

export interface CatalogAmcPlan {
  code: string;
  planCode: string;
  name: string;
  description?: string | null;
  coverageSummary?: string | null;
  visitsPerYear?: number;
  rates: CatalogAmcRates;
}

export interface PublicCatalog {
  version: number;
  services: CatalogService[];
  amcPlans: CatalogAmcPlan[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const BASE = '/intakes';

/** Drops empty values so the API only receives fields the user actually set. */
function cleanParams(params: IntakeListParams): Record<string, string | number | undefined> {
  return {
    status: params.status || undefined,
    kind: params.kind || undefined,
    search: params.search?.trim() || undefined,
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
}

/** Accepts both `{ items, total }` and a bare array (defensive against envelope differences). */
function normalizeList(raw: unknown, params: IntakeListParams): IntakeListResponse {
  if (Array.isArray(raw)) {
    return { items: raw as IntakeDto[], total: raw.length, page: params.page ?? 1, pageSize: params.pageSize ?? 25 };
  }
  const obj = (raw ?? {}) as Partial<IntakeListResponse>;
  const items = Array.isArray(obj.items) ? obj.items : [];
  return {
    items,
    total: typeof obj.total === 'number' ? obj.total : items.length,
    page: typeof obj.page === 'number' ? obj.page : params.page ?? 1,
    pageSize: typeof obj.pageSize === 'number' ? obj.pageSize : params.pageSize ?? 25,
  };
}

function normalizeCatalog(raw: unknown): PublicCatalog {
  // The API client unwraps `{ success, data }`; tolerate a bare `{ data }` too.
  const maybe = (raw ?? {}) as { data?: unknown };
  const body = (maybe.data && typeof maybe.data === 'object' && !Array.isArray(maybe.data)
    ? maybe.data
    : raw ?? {}) as Partial<PublicCatalog>;
  return {
    version: typeof body.version === 'number' ? body.version : 0,
    services: Array.isArray(body.services) ? body.services : [],
    amcPlans: Array.isArray(body.amcPlans) ? body.amcPlans : [],
  };
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export const intakeService = {
  async list(params: IntakeListParams = {}): Promise<IntakeListResponse> {
    const raw = await apiClient.get<unknown>(BASE, { params: cleanParams(params) });
    return normalizeList(raw, params);
  },

  stats(options?: { quiet?: boolean }): Promise<IntakeStats> {
    // Badge polling should not hammer a cold server with retries.
    return apiClient.get<IntakeStats>(`${BASE}/stats`, options?.quiet ? { retries: 0, timeoutMs: 15000 } : undefined);
  },

  async get(id: string): Promise<IntakeDetailDto> {
    const raw = await apiClient.get<IntakeDetailDto>(`${BASE}/${encodeURIComponent(id)}`);
    return { ...raw, candidates: Array.isArray(raw?.candidates) ? raw.candidates : [] };
  },

  approve(id: string, payload: ApproveIntakePayload): Promise<ApproveIntakeResponse> {
    return apiClient.post<ApproveIntakeResponse>(`${BASE}/${encodeURIComponent(id)}/approve`, payload);
  },

  reject(id: string, payload: RejectIntakePayload): Promise<{ intake: IntakeDto }> {
    return apiClient.post<{ intake: IntakeDto }>(`${BASE}/${encodeURIComponent(id)}/reject`, payload);
  },
};

export const catalogService = {
  async getPublic(): Promise<PublicCatalog> {
    const raw = await apiClient.get<unknown>('/catalog');
    return normalizeCatalog(raw);
  },
};

/** Minimal technician option for the approve dialog (uses the existing /technicians endpoint). */
export interface TechnicianOption {
  id: string;
  name: string;
  technicianCode?: string;
}

export async function listActiveTechnicians(): Promise<TechnicianOption[]> {
  const res = await apiClient.get<{ technicians?: TechnicianOption[] }>('/technicians', {
    params: { isActive: 'true', page: 1, pageSize: 100 },
  });
  return Array.isArray(res?.technicians) ? res.technicians : [];
}
