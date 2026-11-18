import { getSupabaseClient } from '../lib/supabase.js';
import { logger } from '../utils/logger.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { nextBusinessNumber } from '../utils/businessNumber.js';
import { sanitizePostgrestFilterTerm } from '../utils/postgrestFilter.js';
import { logActivity } from './audit.service.js';
import { scheduleService } from './schedule.service.js';
import {
  ApproveIntakeInput,
  CreateIntakeInput,
  ListIntakesQuery,
  RejectIntakeInput,
  todayIst,
} from '../validators/intake.validator.js';

/**
 * Website request intake (M5, table web_intakes, migration 20261118040000).
 * ESS posts requests here (signed); staff approve or reject them in PYS. Approval runs the
 * approve_web_intake RPC, which creates the customer / site / service request atomically.
 */

export const ESS_SOURCE_CHANNEL = 'EXTREME_SALES_SERVICES';

/** Submissions faster than this (form shown → submitted) look automated. */
const FAST_SUBMIT_MS = 3000;

const SLOT_TIMES: Record<string, { startTime: string; endTime: string; durationMinutes: number }> = {
  MORNING: { startTime: '09:00', endTime: '12:00', durationMinutes: 180 },
  AFTERNOON: { startTime: '12:00', endTime: '15:00', durationMinutes: 180 },
  EVENING: { startTime: '15:00', endTime: '18:00', durationMinutes: 180 },
};

const INTAKE_SELECT = [
  '*',
  'catalog:service_catalog_items!web_intakes_catalog_service_code_fkey(name)',
  'matched:customers!web_intakes_matched_customer_id_fkey(id, name, customer_code, customer_type)',
  'sr:service_requests!web_intakes_service_request_id_fkey(id, request_number)',
].join(', ');

export interface IntakeDto {
  id: string;
  intakeNumber: string;
  trackingCode: string;
  kind: string;
  status: string;
  sourceChannel: string;
  externalReferenceId: string | null;
  contact: { name: string; phone: string; email: string | null };
  address: { line: string | null; area: string | null; landmark: string | null; city: string | null; pincode: string | null };
  ac: {
    type: string | null;
    brand: string | null;
    tonnage: number | null;
    inverter: string | null;
    ageYears: number | null;
    units: number | null;
  };
  request: {
    serviceCode: string | null;
    serviceName: string | null;
    amcPlanCode: string | null;
    message: string | null;
    preferredDate: string | null;
    preferredSlot: string | null;
  };
  consent: { privacy: boolean; marketing: boolean };
  spamScore: number;
  matchedCustomer: { id: string; name: string; customerCode: string; customerType: string } | null;
  review: { reviewedBy: string | null; reviewedAt: string | null; rejectionReason: string | null };
  serviceRequest: { id: string; requestNumber: string } | null;
  createdAt: string;
}

export interface IntakeCandidate {
  id: string;
  name: string;
  customerCode: string;
  phone: string;
  customerType: string;
}

export interface CreateIntakeResult {
  created: boolean;
  intakeNumber: string;
  trackingCode: string;
  status: string;
}

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function mapIntake(row: any): IntakeDto {
  const catalog = one(row.catalog);
  const matched = one(row.matched);
  const sr = one(row.sr);
  return {
    id: row.id,
    intakeNumber: row.intake_number,
    trackingCode: row.tracking_code,
    kind: row.kind,
    status: row.status,
    sourceChannel: row.source_channel,
    externalReferenceId: row.external_reference_id ?? null,
    contact: { name: row.contact_name, phone: row.contact_phone, email: row.contact_email ?? null },
    address: {
      line: row.address_line ?? null,
      area: row.area ?? null,
      landmark: row.landmark ?? null,
      city: row.city ?? null,
      pincode: row.pincode ?? null,
    },
    ac: {
      type: row.ac_type ?? null,
      brand: row.ac_brand ?? null,
      tonnage: num(row.ac_tonnage),
      inverter: row.ac_inverter ?? null,
      ageYears: num(row.ac_age_years),
      units: num(row.ac_units),
    },
    request: {
      serviceCode: row.catalog_service_code ?? null,
      serviceName: catalog?.name ?? null,
      amcPlanCode: row.amc_plan_code ?? null,
      message: row.message ?? null,
      preferredDate: row.preferred_date ?? null,
      preferredSlot: row.preferred_slot ?? null,
    },
    consent: { privacy: Boolean(row.consent_privacy), marketing: Boolean(row.consent_marketing) },
    spamScore: Number(row.spam_score ?? 0),
    matchedCustomer: matched
      ? { id: matched.id, name: matched.name, customerCode: matched.customer_code, customerType: matched.customer_type }
      : null,
    review: {
      reviewedBy: row.reviewed_by ?? null,
      reviewedAt: row.reviewed_at ?? null,
      rejectionReason: row.rejection_reason ?? null,
    },
    serviceRequest: sr ? { id: sr.id, requestNumber: sr.request_number } : null,
    createdAt: row.created_at,
  };
}

/** Maps errors raised by approve_web_intake / reject_web_intake to API errors. */
function rpcError(error: { code?: string; message?: string }): Error {
  const message = error.message || 'Request failed';
  switch (error.code) {
    case '55000':
      return new ConflictError('This request has already been reviewed');
    case 'P0002':
      return new NotFoundError(message);
    case '22023':
    case '23514':
      return new ValidationError(message);
    case '23505':
      return new ConflictError('A service request already exists for this booking');
    default:
      return new Error(`Intake review failed: ${message}`);
  }
}

/** Start of today in India time, as an ISO timestamp. */
function startOfTodayIstIso(): string {
  return new Date(`${todayIst()}T00:00:00+05:30`).toISOString();
}

class IntakeService {
  /** Store a website request from ESS. Same externalReferenceId → returns the existing intake. */
  async createFromEss(input: CreateIntakeInput): Promise<CreateIntakeResult> {
    const supabase = getSupabaseClient();
    const extRef = input.externalReferenceId ?? null;

    if (extRef) {
      const existing = await this.findByExternalRef(extRef);
      if (existing) return { created: false, ...existing };
    }

    const serviceCode = input.request?.serviceCode ?? null;
    if (serviceCode) {
      const { data: item, error } = await supabase
        .from('service_catalog_items')
        .select('code, is_active')
        .eq('code', serviceCode)
        .maybeSingle();
      if (error) throw new Error(`Catalog lookup failed: ${error.message}`);
      if (!item || item.is_active === false) {
        throw new ValidationError('Request validation failed', [
          { field: 'request.serviceCode', message: 'Unknown service code', code: 'custom' },
        ]);
      }
    }

    const honeypotFilled = Boolean(input.meta?.honeypot && input.meta.honeypot.trim() !== '');
    let spamScore = 0;
    if (honeypotFilled) spamScore += 100;
    if (input.meta?.elapsedMs !== undefined && input.meta.elapsedMs < FAST_SUBMIT_MS) spamScore += 50;

    const row = {
      intake_number: await nextBusinessNumber('WEB_INTAKE', () => `WEB-${Date.now().toString(36).toUpperCase()}`),
      kind: input.kind,
      status: honeypotFilled ? 'SPAM' : 'PENDING_REVIEW',
      source_channel: ESS_SOURCE_CHANNEL,
      external_reference_id: extRef,
      contact_name: input.contact.name,
      contact_phone: input.contact.phone,
      contact_email: input.contact.email ?? null,
      address_line: input.address?.line ?? null,
      area: input.address?.area ?? null,
      landmark: input.address?.landmark ?? null,
      city: input.address?.city ?? null,
      pincode: input.address?.pincode ?? null,
      ac_type: input.ac?.type ?? null,
      ac_brand: input.ac?.brand ?? null,
      ac_tonnage: input.ac?.tonnage ?? null,
      ac_inverter: input.ac?.inverter ?? null,
      ac_age_years: input.ac?.ageYears ?? null,
      ac_units: input.ac?.units ?? 1,
      catalog_service_code: serviceCode,
      amc_plan_code: input.request?.amcPlanCode ?? null,
      message: input.request?.message ?? null,
      preferred_date: input.request?.preferredDate ?? null,
      preferred_slot: input.request?.preferredSlot ?? null,
      consent_privacy: input.consent.privacy,
      consent_marketing: input.consent.marketing ?? false,
      privacy_notice_version: input.consent.noticeVersion ?? null,
      spam_score: spamScore,
      client_ip_hash: input.meta?.clientIpHash ?? null,
    };

    const { data, error } = await supabase
      .from('web_intakes')
      .insert(row)
      .select('intake_number, tracking_code, status')
      .single();

    if (error) {
      // Lost a race with the same booking: hand back the one that won.
      if ((error as any).code === '23505' && extRef) {
        const existing = await this.findByExternalRef(extRef);
        if (existing) return { created: false, ...existing };
      }
      throw new Error(`Failed to store website request: ${error.message}`);
    }

    logger.info('Website request received', {
      intakeNumber: data.intake_number,
      kind: input.kind,
      status: data.status,
      spamScore,
    });
    return { created: true, intakeNumber: data.intake_number, trackingCode: data.tracking_code, status: data.status };
  }

  private async findByExternalRef(extRef: string): Promise<Omit<CreateIntakeResult, 'created'> | null> {
    const { data, error } = await getSupabaseClient()
      .from('web_intakes')
      .select('intake_number, tracking_code, status')
      .eq('source_channel', ESS_SOURCE_CHANNEL)
      .eq('external_reference_id', extRef)
      .maybeSingle();
    if (error) throw new Error(`Intake lookup failed: ${error.message}`);
    return data ? { intakeNumber: data.intake_number, trackingCode: data.tracking_code, status: data.status } : null;
  }

  async list(query: ListIntakesQuery): Promise<{ items: IntakeDto[]; total: number; page: number; pageSize: number }> {
    const { page, pageSize } = query;
    let q: any = getSupabaseClient().from('web_intakes').select(INTAKE_SELECT, { count: 'exact' });
    if (query.status) q = q.eq('status', query.status);
    if (query.kind) q = q.eq('kind', query.kind);
    if (query.search) {
      const term = sanitizePostgrestFilterTerm(query.search);
      if (term) {
        const digits = term.replace(/\D/g, '');
        const parts = [
          `contact_name.ilike.*${term}*`,
          `contact_email.ilike.*${term}*`,
          `intake_number.ilike.*${term}*`,
          `tracking_code.ilike.*${term}*`,
        ];
        if (digits.length >= 4 && digits.length === term.replace(/[\s+-]/g, '').length) {
          parts.push(`phone_normalized.ilike.*${digits.slice(-10)}*`);
        }
        q = q.or(parts.join(','));
      }
    }
    const from = (page - 1) * pageSize;
    const { data, error, count } = await q.order('created_at', { ascending: query.status === 'PENDING_REVIEW' }).range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to list website requests: ${error.message}`);
    return { items: (data ?? []).map(mapIntake), total: count ?? 0, page, pageSize };
  }

  async stats(): Promise<{
    pending: number;
    approvedToday: number;
    rejectedToday: number;
    spam: number;
    oldestPendingAt: string | null;
  }> {
    const supabase = getSupabaseClient();
    const since = startOfTodayIstIso();
    const count = async (build: (q: any) => any): Promise<number> => {
      const { count: n, error } = await build(supabase.from('web_intakes').select('id', { count: 'exact', head: true }));
      if (error) throw new Error(`Failed to count website requests: ${error.message}`);
      return n ?? 0;
    };
    const [pending, approvedToday, rejectedToday, spam, oldest] = await Promise.all([
      count((q) => q.eq('status', 'PENDING_REVIEW')),
      count((q) => q.eq('status', 'APPROVED').gte('reviewed_at', since)),
      count((q) => q.eq('status', 'REJECTED').gte('reviewed_at', since)),
      count((q) => q.eq('status', 'SPAM')),
      supabase
        .from('web_intakes')
        .select('created_at')
        .eq('status', 'PENDING_REVIEW')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    if ((oldest as any).error) throw new Error(`Failed to read website requests: ${(oldest as any).error.message}`);
    return { pending, approvedToday, rejectedToday, spam, oldestPendingAt: (oldest as any).data?.created_at ?? null };
  }

  private async getRow(id: string): Promise<any> {
    const { data, error } = await getSupabaseClient().from('web_intakes').select(INTAKE_SELECT).eq('id', id).maybeSingle();
    if (error) throw new Error(`Failed to read website request: ${error.message}`);
    if (!data) throw new NotFoundError('Website request not found');
    return data;
  }

  async getById(id: string): Promise<IntakeDto & { candidates: IntakeCandidate[] }> {
    const row = await this.getRow(id);
    let candidates: IntakeCandidate[] = [];
    if (row.phone_normalized) {
      const { data, error } = await getSupabaseClient()
        .from('customers')
        .select('id, name, customer_code, phone, customer_type')
        .eq('phone_normalized', row.phone_normalized)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(10);
      if (error) throw new Error(`Failed to look up matching customers: ${error.message}`);
      candidates = (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        customerCode: c.customer_code,
        phone: c.phone,
        customerType: c.customer_type,
      }));
    }
    return { ...mapIntake(row), candidates };
  }

  async approve(
    id: string,
    input: ApproveIntakeInput,
    actorProfileId: string | undefined,
    ipAddress?: string
  ): Promise<{
    intake: IntakeDto;
    serviceRequest: { id: string; requestNumber: string } | null;
    schedule: { id: string; scheduleNumber: string } | null;
    warning?: string;
  }> {
    const { data, error } = await getSupabaseClient().rpc('approve_web_intake', {
      p_intake_id: id,
      p_actor: actorProfileId ?? null,
      p_customer_id: input.customerId ?? null,
      p_request_type: input.requestType ?? null,
      p_priority: input.priority ?? 'MEDIUM',
      p_notes: input.notes ?? null,
    });
    if (error) throw rpcError(error);

    const result = (data ?? {}) as {
      serviceRequestId?: string | null;
      requestNumber?: string | null;
      customerId?: string | null;
      createdCustomer?: boolean;
    };
    const serviceRequest =
      result.serviceRequestId && result.requestNumber
        ? { id: result.serviceRequestId, requestNumber: result.requestNumber }
        : null;

    let schedule: { id: string; scheduleNumber: string } | null = null;
    let warning: string | undefined;
    if (input.schedule) {
      if (!serviceRequest) {
        warning = 'Approved. This request type has no service visit to schedule.';
      } else {
        try {
          const created = await scheduleService.createSchedule(
            {
              serviceRequestId: serviceRequest.id,
              scheduledDate: input.schedule.date,
              ...SLOT_TIMES[input.schedule.slot],
              technicianId: input.schedule.technicianId,
            },
            actorProfileId ?? '',
            ipAddress
          );
          schedule = { id: created.id, scheduleNumber: created.scheduleNumber };
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          logger.warn('Intake approved but scheduling failed', { intakeId: id, serviceRequestId: serviceRequest.id, reason });
          warning = `Approved, but the visit could not be scheduled: ${reason}`;
        }
      }
    }

    const intake = mapIntake(await this.getRow(id));
    await logActivity({
      actorProfileId: actorProfileId ?? null,
      action: 'WEB_INTAKE_APPROVED',
      entityType: 'WEB_INTAKE',
      entityId: id,
      details: {
        intakeNumber: intake.intakeNumber,
        kind: intake.kind,
        serviceRequestId: serviceRequest?.id ?? null,
        requestNumber: serviceRequest?.requestNumber ?? null,
        customerId: result.customerId ?? null,
        createdCustomer: Boolean(result.createdCustomer),
        scheduleId: schedule?.id ?? null,
      },
      ipAddress: ipAddress ?? null,
    });

    return { intake, serviceRequest, schedule, ...(warning ? { warning } : {}) };
  }

  async reject(
    id: string,
    input: RejectIntakeInput,
    actorProfileId: string | undefined,
    ipAddress?: string
  ): Promise<{ intake: IntakeDto }> {
    const { error } = await getSupabaseClient().rpc('reject_web_intake', {
      p_intake_id: id,
      p_actor: actorProfileId ?? null,
      p_status: input.status,
      p_reason: input.reason ?? null,
    });
    if (error) throw rpcError(error);

    const intake = mapIntake(await this.getRow(id));
    await logActivity({
      actorProfileId: actorProfileId ?? null,
      action: `WEB_INTAKE_${input.status}`,
      entityType: 'WEB_INTAKE',
      entityId: id,
      details: { intakeNumber: intake.intakeNumber, kind: intake.kind, status: input.status },
      ipAddress: ipAddress ?? null,
    });
    return { intake };
  }
}

export const intakeService = new IntakeService();
