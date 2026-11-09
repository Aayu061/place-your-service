import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';

type PageQuery = { page?: number; pageSize?: number };

function pageResult<T>(data: T[] | null, count: number | null, query: PageQuery) {
  const page = query.page || 1;
  const pageSize = query.pageSize || 25;
  const total = count ?? 0;
  return { items: data ?? [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

function dbError(error: { code?: string; message?: string } | null, action: string): never {
  if (error?.code === '23505') throw new ConflictError(`${action} conflicts with an existing record.`);
  if (error?.code === 'P0002') throw new NotFoundError(error.message || `${action} record was not found.`);
  throw new BadRequestError(error?.message || `${action} could not be completed.`);
}

async function loadAllPages<T>(loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) dbError(error, 'Notification source data');
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

export class OperationsService {
  async listParts(query: PageQuery & { search?: string }) {
    const supabase = getSupabaseClient();
    let request = supabase.from('parts').select('*', { count: 'exact' });
    if (query.search) request = request.ilike('name', `%${query.search}%`);
    const from = ((query.page || 1) - 1) * (query.pageSize || 25);
    const { data, count, error } = await request.order('name', { ascending: true }).range(from, from + (query.pageSize || 25) - 1);
    if (error) dbError(error, 'Part list');
    return pageResult(data, count, query);
  }

  async createPart(payload: Record<string, unknown>, actorId: string, ipAddress?: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('parts').insert({
      part_code: payload.partCode,
      name: payload.name,
      category: payload.category || null,
      unit_of_measure: payload.unitOfMeasure,
      unit_cost: payload.unitCost,
      unit_price: payload.unitPrice,
      low_stock_threshold: payload.lowStockThreshold,
      current_stock: 0,
      is_active: true,
    }).select('*').single();
    if (error || !data) dbError(error, 'Create part');
    await logActivity({ actorProfileId: actorId, action: 'PART_CREATED', entityType: 'part', entityId: data.id, details: { partCode: data.part_code }, ipAddress });
    return data;
  }

  async updatePart(id: string, payload: Record<string, unknown>, actorId: string, ipAddress?: string) {
    const supabase = getSupabaseClient();
    const updates: Record<string, unknown> = {};
    const mapping: Record<string, string> = {
      name: 'name', category: 'category', unitOfMeasure: 'unit_of_measure', unitCost: 'unit_cost',
      unitPrice: 'unit_price', lowStockThreshold: 'low_stock_threshold', isActive: 'is_active',
    };
    for (const [key, value] of Object.entries(payload)) if (mapping[key]) updates[mapping[key]] = value;
    const { data, error } = await supabase.from('parts').update(updates).eq('id', id).select('*').maybeSingle();
    if (error) dbError(error, 'Update part');
    if (!data) throw new NotFoundError('Part was not found.');
    await logActivity({ actorProfileId: actorId, action: 'PART_UPDATED', entityType: 'part', entityId: id, details: { updatedFields: Object.keys(updates) }, ipAddress });
    return data;
  }

  async listInventoryTransactions(query: PageQuery & { partId?: string; type?: string }) {
    const supabase = getSupabaseClient();
    let request = supabase.from('inventory_transactions').select('*, parts(part_code,name)', { count: 'exact' });
    if (query.partId) request = request.eq('part_id', query.partId);
    if (query.type) request = request.eq('transaction_type', query.type);
    const from = ((query.page || 1) - 1) * (query.pageSize || 25);
    const { data, count, error } = await request.order('created_at', { ascending: false }).range(from, from + (query.pageSize || 25) - 1);
    if (error) dbError(error, 'Inventory history');
    return pageResult(data, count, query);
  }

  async recordInventoryTransaction(payload: Record<string, unknown>, actorId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('record_inventory_transaction', {
      p_part_id: payload.partId,
      p_transaction_type: payload.transactionType,
      p_quantity: payload.quantity,
      p_reason: payload.reason,
      p_actor_profile_id: actorId,
      p_service_report_id: payload.serviceReportId || null,
      p_unit_price: payload.unitPrice ?? null,
    });
    if (error) dbError(error, 'Inventory transaction');
    return data;
  }

  async listPayments(query: PageQuery & { status?: string; customerId?: string; search?: string }) {
    const supabase = getSupabaseClient();
    let request = supabase.from('payments').select('*, customers(name,customer_code), service_requests(request_number), amc_contracts(contract_number)', { count: 'exact' });
    if (query.status) request = request.eq('status', query.status);
    if (query.customerId) request = request.eq('customer_id', query.customerId);
    if (query.search) request = request.ilike('payment_number', `%${query.search}%`);
    const from = ((query.page || 1) - 1) * (query.pageSize || 25);
    const { data, count, error } = await request.order('created_at', { ascending: false }).range(from, from + (query.pageSize || 25) - 1);
    if (error) dbError(error, 'Payment list');
    return pageResult(data, count, query);
  }

  async getPaymentTransactions(paymentId: string, query: PageQuery = {}) {
    const supabase = getSupabaseClient();
    const { data: payment, error: paymentError } = await supabase.from('payments').select('id').eq('id', paymentId).maybeSingle();
    if (paymentError) dbError(paymentError, 'Payment record');
    if (!payment) throw new NotFoundError('Payment record was not found.');
    let request = supabase.from('payment_transactions')
      .select('*, profiles!payment_transactions_recorded_by_fkey(full_name,email)', { count: 'exact' })
      .eq('payment_id', paymentId);
    const from = ((query.page || 1) - 1) * (query.pageSize || 25);
    const { data, count, error } = await request.order('created_at', { ascending: false }).range(from, from + (query.pageSize || 25) - 1);
    if (error) dbError(error, 'Payment transaction history');
    return pageResult(data, count, query);
  }

  async createPayment(payload: Record<string, unknown>, actorId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('create_payment_record', {
      p_payment_number: `PAY-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      p_customer_id: payload.customerId,
      p_service_request_id: payload.serviceRequestId || null,
      p_amc_id: payload.amcId || null,
      p_total_amount_due: payload.totalAmountDue,
      p_actor_profile_id: actorId,
    });
    if (error) dbError(error, 'Payment record');
    return data;
  }

  async recordPaymentTransaction(paymentId: string, payload: Record<string, unknown>, actorId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('record_payment_transaction', {
      p_payment_id: paymentId,
      p_payment_method: payload.paymentMethod,
      p_amount: payload.amount,
      p_external_payment_reference: payload.externalPaymentReference || null,
      p_notes: payload.notes || null,
      p_actor_profile_id: actorId,
    });
    if (error) dbError(error, 'Payment transaction');
    return data;
  }

  async recordPaymentReversal(transactionId: string, payload: Record<string, unknown>, actorId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('record_payment_reversal', {
      p_original_transaction_id: transactionId,
      p_amount: payload.amount,
      p_reason: payload.reason,
      p_actor_profile_id: actorId,
    });
    if (error) dbError(error, 'Payment reversal');
    return data;
  }

  async listNotifications(profileId: string, query: PageQuery & { unreadOnly?: string }) {
    const supabase = getSupabaseClient();
    let request = supabase.from('notifications').select('*', { count: 'exact' }).eq('recipient_profile_id', profileId);
    if (query.unreadOnly === 'true') request = request.eq('is_read', false);
    const from = ((query.page || 1) - 1) * (query.pageSize || 25);
    const { data, count, error } = await request.order('created_at', { ascending: false }).range(from, from + (query.pageSize || 25) - 1);
    if (error) dbError(error, 'Notification list');
    return pageResult(data, count, query);
  }

  async markNotificationRead(id: string, profileId: string, isRead: boolean) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('notifications').update({ is_read: isRead, read_at: isRead ? new Date().toISOString() : null })
      .eq('id', id).eq('recipient_profile_id', profileId).select('*').maybeSingle();
    if (error) dbError(error, 'Notification update');
    if (!data) throw new NotFoundError('Notification was not found for this user.');
    return data;
  }

  async generateNotifications(actorId?: string) {
    const supabase = getSupabaseClient();
    const staffResult = await supabase.from('staff').select('profile_id').eq('is_active', true).in('role', ['ADMIN', 'STAFF']);
    if (staffResult.error) dbError(staffResult.error, 'Notification recipients');
    const activeStaff = staffResult.data || [];
    const recipientIds: string[] = activeStaff.map((staff: { profile_id: string }) => staff.profile_id);
    if (!recipientIds.length) return { created: 0 };

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() + 30);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const [amcs, schedules, parts, failedPayments] = await Promise.all([
      loadAllPages((from, to) => supabase.from('amc_contracts').select('id,contract_number,end_date')
        .eq('status', 'ACTIVE').gte('end_date', today).lte('end_date', cutoffDate).order('id', { ascending: true }).range(from, to)),
      loadAllPages((from, to) => supabase.from('service_schedules').select('id,schedule_number,scheduled_date,status')
        .lt('scheduled_date', today).order('id', { ascending: true }).range(from, to)),
      loadAllPages((from, to) => supabase.from('parts').select('id,part_code,name,current_stock,low_stock_threshold')
        .eq('is_active', true).order('id', { ascending: true }).range(from, to)),
      loadAllPages((from, to) => supabase.from('payments').select('id,payment_number')
        .eq('status', 'FAILED').order('id', { ascending: true }).range(from, to)),
    ]);

    const events: Array<{ title: string; message: string; type: string; category: string; entityType: string; entityId: string; dedupe: string }> = [];
    for (const row of amcs) events.push({
      title: 'AMC expiry approaching', message: `Contract ${row.contract_number} expires on ${row.end_date}.`,
      type: 'WARNING', category: 'AMC_EXPIRY', entityType: 'amc_contract', entityId: row.id,
      dedupe: `AMC_EXPIRY:${row.id}:${row.end_date}`,
    });
    for (const row of schedules) if (!['COMPLETED', 'CANCELLED', 'RESCHEDULED', 'SKIPPED'].includes(row.status)) events.push({
      title: 'Service work is overdue', message: `Schedule ${row.schedule_number} was due on ${row.scheduled_date}.`,
      type: 'ALERT', category: 'SERVICE_OVERDUE', entityType: 'service_schedule', entityId: row.id,
      dedupe: `SERVICE_OVERDUE:${row.id}:${row.scheduled_date}`,
    });
    for (const row of parts) if (row.current_stock <= row.low_stock_threshold) events.push({
      title: 'Part stock is low', message: `${row.part_code} ${row.name}: ${row.current_stock} ${row.current_stock === 1 ? 'unit' : 'units'} remaining.`,
      type: row.current_stock === 0 ? 'ALERT' : 'WARNING', category: 'LOW_STOCK', entityType: 'part', entityId: row.id,
      dedupe: `LOW_STOCK:${row.id}:${row.current_stock}`,
    });
    for (const row of failedPayments) events.push({
      title: 'Payment needs review', message: `Payment ${row.payment_number} has failed.`,
      type: 'WARNING', category: 'PAYMENT_FAILED', entityType: 'payment', entityId: row.id,
      dedupe: `PAYMENT_FAILED:${row.id}`,
    });

    const rows = events.flatMap((event) => recipientIds.map((recipientId) => ({
      recipient_profile_id: recipientId,
      title: event.title,
      message: event.message,
      type: event.type,
      category: event.category,
      entity_type: event.entityType,
      entity_id: event.entityId,
      dedupe_key: `${event.dedupe}:${recipientId}`,
      is_read: false,
    })));
    if (!rows.length) return { created: 0 };
    const { data, error } = await supabase.from('notifications').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
    if (error) dbError(error, 'Notification generation');
    if ((data?.length ?? 0) > 0) await logActivity({ actorProfileId: actorId || null, action: 'NOTIFICATIONS_GENERATED', entityType: 'notification', details: { sourceEvents: events.length, created: data?.length ?? 0 } });
    return { created: data?.length ?? 0 };
  }

  async listActivityLogs(query: PageQuery & { entityType?: string; actorId?: string; from?: string; to?: string }) {
    const supabase = getSupabaseClient();
    let request = supabase.from('activity_logs').select('*, profiles(full_name,email)', { count: 'exact' });
    if (query.entityType) request = request.eq('entity_type', query.entityType);
    if (query.actorId) request = request.eq('actor_profile_id', query.actorId);
    if (query.from) request = request.gte('created_at', `${query.from}T00:00:00.000Z`);
    if (query.to) request = request.lte('created_at', `${query.to}T23:59:59.999Z`);
    const from = ((query.page || 1) - 1) * (query.pageSize || 25);
    const { data, count, error } = await request.order('created_at', { ascending: false }).range(from, from + (query.pageSize || 25) - 1);
    if (error) dbError(error, 'Activity log');
    return pageResult(data, count, query);
  }

  async globalSearch(query: string, limit: number) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('search_business_records', { p_query: query, p_limit: limit });
    if (error) dbError(error, 'Global search');
    return data ?? [];
  }
}

export const operationsService = new OperationsService();
