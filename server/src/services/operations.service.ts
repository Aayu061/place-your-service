import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
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
    let request = supabase.from('payments').select('*, customers(id,name,customer_code,phone,email,address,city,state,postal_code), service_requests(id,request_number,request_type,priority,status,description,reported_date,created_at), amc_contracts(id,contract_number,plan_name,status,start_date,end_date,total_amount)', { count: 'exact' });
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

  async sendPaymentInvoice(paymentId: string, recipientEmail: string, actorId: string) {
    const supabase = getSupabaseClient();
    const { data: payment, error } = await supabase
      .from('payments')
      .select('*, customers(id,name,customer_code,phone,email,address,city,state,postal_code), service_requests(id,request_number,request_type,priority,status,description,reported_date,created_at), amc_contracts(id,contract_number,plan_name,status,start_date,end_date,total_amount)')
      .eq('id', paymentId)
      .maybeSingle();

    if (error) dbError(error, 'Payment lookup');
    if (!payment) throw new NotFoundError('Payment record was not found.');

    const { data: transactions } = await supabase
      .from('payment_transactions')
      .select('id, payment_method, amount, external_payment_reference, notes, created_at')
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: false });

    const totalDue = Number(payment.total_amount_due || 0);
    const totalPaid = Number(payment.total_amount_paid || 0);
    const balance = Math.max(0, totalDue - totalPaid);
    const customerName = payment.customers?.name || 'Valued Customer';
    const customerPhone = payment.customers?.phone || '-';
    const customerCode = payment.customers?.customer_code || '-';
    const customerAddress = [
      payment.customers?.address,
      payment.customers?.city,
      payment.customers?.state,
      payment.customers?.postal_code,
    ].filter(Boolean).join(', ') || 'N/A';
    const paymentNumber = payment.payment_number;

    const serviceInfo = payment.service_requests
      ? `Service Request: ${payment.service_requests.request_number} (${payment.service_requests.request_type || 'AC Repair/Service'}) — ${payment.service_requests.description || 'Diagnosis & Service'}`
      : payment.amc_contracts
      ? `AMC Contract: ${payment.amc_contracts.contract_number} (${payment.amc_contracts.plan_name || 'Annual Maintenance Contract'})`
      : 'General Air Conditioning Service & Maintenance';

    const upiPayLink = `upi://pay?pa=extremess0121@sbi&pn=Extreme%20Sales%20and%20Services&am=${balance.toFixed(2)}&cu=INR&tn=Invoice%20${paymentNumber}`;

    const txRows = (transactions || []).map((t: any) =>
      `• ${new Date(t.created_at).toLocaleDateString('en-IN')}: ₹${Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} via ${t.payment_method}${t.external_payment_reference ? ` (Ref: ${t.external_payment_reference})` : ''}`
    );

    const escapeHtml = (val: unknown) => String(val ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c] as string);

    const subject = `Tax Invoice & Payment Receipt — ${paymentNumber} | Extreme Sales & Services`;

    const text = [
      `Tax Invoice & Payment Receipt — ${paymentNumber}`,
      `Extreme Sales & Services (Place Your Service Platform)`,
      `Office: 1/1, Samrat Ashok Nagar, Chembur, Mumbai - 400043`,
      `Billing: 204 Kokan Residency, 2nd floor, Vikas Wadi, Nr J P Bar, Devad, New Panvel - 410206`,
      `Tel: +91 7977805245 / 9969423500 | Email: extremess0121@gmail.com | GSTIN: 27ANTPP9778J1ZO`,
      `---`,
      `Billed To:`,
      `Customer: ${customerName} (${customerCode})`,
      `Phone: ${customerPhone}`,
      `Address: ${customerAddress}`,
      `---`,
      `Service Information:`,
      serviceInfo,
      `---`,
      `Financial Summary:`,
      `Total Invoice Amount: INR ${totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Includes 18% GST)`,
      `Total Amount Paid:    INR ${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      `Outstanding Balance:  INR ${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      `Payment Status:       ${payment.status}`,
      txRows.length ? `\nPayment Transactions Recorded:\n${txRows.join('\n')}` : '',
      `---`,
      `Bank Settlement Details:`,
      `Bank: State Bank of India | Current A/C: 41846055894 | IFSC: SBIN0071073`,
      `Payee: Extreme Sales And Services | UPI ID: extremess0121@sbi`,
      balance > 0 ? `Instant UPI Pay Link: ${upiPayLink}` : 'Invoice fully settled. Thank you!',
      `---`,
      `Authorized Signatory: Extreme Sales & Services (Stamp & Signature Verified)`,
      `Thank you for your business!`,
      `Extreme Sales & Services · Place Your Service Platform`,
    ].filter(Boolean).join('\n\n');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Tax Invoice ${escapeHtml(paymentNumber)}</title>
</head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:32px;">
    <!-- Company Header -->
    <div style="border-bottom:2px solid #0284c7;padding-bottom:16px;margin-bottom:20px;">
      <h1 style="margin:0;font-size:22px;color:#0f172a;letter-spacing:-0.02em;">Extreme Sales &amp; Services</h1>
      <p style="margin:2px 0 0;font-size:12px;color:#0284c7;font-weight:600;">Air Conditioning Sales, Preventive Maintenance &amp; Services · Place Your Service Platform</p>
      <p style="margin:4px 0 0;font-size:11.5px;color:#64748b;line-height:1.45;">
        Office: 1/1, Samrat Ashok Nagar, Chembur, Mumbai - 400043<br>
        Billing: 204 Kokan Residency, 2nd floor, Vikas Wadi, Nr J P Bar, Devad, New Panvel - 410206<br>
        Tel: +91 7977805245 / 9969423500 | Email: extremess0121@gmail.com | <strong>GSTIN: 27ANTPP9778J1ZO</strong>
      </p>
    </div>

    <!-- Document Title & Invoice Meta -->
    <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
      <div>
        <h2 style="font-size:18px;color:#0f172a;margin:0;">Tax Invoice &amp; Payment Receipt</h2>
        <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Invoice #: <strong>${escapeHtml(paymentNumber)}</strong></p>
        <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Date: ${new Date(payment.created_at).toLocaleDateString('en-IN')}</p>
      </div>
      <div style="text-align:right;">
        <span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700;letter-spacing:0.04em;background:${payment.status === 'COMPLETED' ? '#dcfce7;color:#15803d' : payment.status === 'PARTIAL' ? '#fef3c7;color:#b45309' : '#fee2e2;color:#b91c1c'};">
          ${escapeHtml(payment.status)}
        </span>
      </div>
    </div>

    <!-- Billed To & Service Details -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin-bottom:20px;">
      <div>
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Customer / Billed To</p>
        <p style="margin:0;font-size:13.5px;font-weight:600;color:#0f172a;">${escapeHtml(customerName)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#475569;">Code: ${escapeHtml(customerCode)} | Phone: ${escapeHtml(customerPhone)}</p>
        <p style="margin:2px 0 0;font-size:11.5px;color:#64748b;">${escapeHtml(customerAddress)}</p>
      </div>
      <div>
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Linked Service Information</p>
        <p style="margin:0;font-size:12.5px;color:#1e293b;line-height:1.4;">${escapeHtml(serviceInfo)}</p>
      </div>
    </div>

    <!-- Financial Breakdown -->
    <div style="background:#f1f5f9;border-radius:6px;padding:16px;margin-bottom:20px;">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;color:#64748b;">Total Invoice Amount (Incl. 18% GST):</td>
          <td style="padding:4px 0;font-weight:600;text-align:right;">INR ${totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;">Total Amount Paid / Settled:</td>
          <td style="padding:4px 0;font-weight:600;text-align:right;color:#16a34a;">INR ${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr style="border-top:1px solid #cbd5e1;">
          <td style="padding:8px 0 0;font-size:15px;font-weight:700;color:#0f172a;">Outstanding Balance Due:</td>
          <td style="padding:8px 0 0;font-size:15px;font-weight:700;text-align:right;color:${balance > 0 ? '#dc2626' : '#16a34a'};">
            INR ${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </td>
        </tr>
      </table>
    </div>

    <!-- Transactions ledger if present -->
    ${(transactions && transactions.length > 0) ? `
      <div style="margin-bottom:20px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;">Payment Transactions Ledger</p>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;text-align:left;">
              <th style="padding:6px 8px;color:#64748b;">Date</th>
              <th style="padding:6px 8px;color:#64748b;">Method</th>
              <th style="padding:6px 8px;color:#64748b;">Reference / Notes</th>
              <th style="padding:6px 8px;color:#64748b;text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.map((t: any) => `
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:6px 8px;">${new Date(t.created_at).toLocaleDateString('en-IN')}</td>
                <td style="padding:6px 8px;">${escapeHtml(t.payment_method)}</td>
                <td style="padding:6px 8px;color:#64748b;">${escapeHtml(t.external_payment_reference || t.notes || '-')}</td>
                <td style="padding:6px 8px;text-align:right;font-weight:600;">INR ${Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    <!-- Bank Details & Payment instructions -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#0f172a;">Bank &amp; Payment Settlement Details</p>
      <p style="margin:0;font-size:12px;color:#475569;line-height:1.5;">
        Bank: <strong>State Bank of India</strong><br>
        Payee Account Name: <strong>Extreme Sales And Services</strong><br>
        Current A/C No: <strong>41846055894</strong><br>
        IFSC Code: <strong>SBIN0071073</strong><br>
        UPI ID: <strong>extremess0121@sbi</strong>
      </p>
      ${balance > 0 ? `
        <div style="margin-top:10px;">
          <a href="${upiPayLink}" style="display:inline-block;padding:8px 14px;background:#0284c7;color:#ffffff;text-decoration:none;border-radius:4px;font-size:12px;font-weight:600;">
            Pay Balance ₹${balance.toFixed(2)} via UPI
          </a>
        </div>
      ` : ''}
    </div>

    <!-- Stamp & Sign block -->
    <div style="margin-top:24px;border-top:1px dashed #cbd5e1;padding-top:16px;display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <p style="margin:0;font-size:11px;color:#94a3b8;">Computer generated commercial tax invoice.<br>Terms: Payment due within 7 days of invoice date.</p>
      </div>
      <div style="text-align:center;">
        <div style="display:inline-block;border:1.5px solid #2563eb;border-radius:8px;padding:6px 14px;background:#f0fdf4;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#1e40af;">Extreme Sales &amp; Services</p>
          <p style="margin:2px 0 0;font-size:9.5px;color:#2563eb;">Authorized Signatory &amp; Stamp</p>
          <p style="margin:2px 0 0;font-size:9px;color:#15803d;font-weight:600;">✓ DIGITALLY VERIFIED</p>
        </div>
      </div>
    </div>

    <!-- Platform Footer -->
    <div style="margin-top:24px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:12px;">
      Extreme Sales &amp; Services · Operating on Place Your Service Platform (PYS)<br>
      For questions or support, contact extremess0121@gmail.com / +91 7977805245
    </div>
  </div>
</body>
</html>`;

    let providerMessageId: string | undefined;
    let status: 'SENT' | 'FAILED' = 'SENT';
    let errorMessage: string | null = null;

    if (env.RESEND_API_KEY) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: env.RESEND_FROM_EMAIL || 'Place Your Service <support@placeyourservice.internal>',
            to: recipientEmail,
            subject,
            html,
            text,
          }),
        });

        const resData = (await response.json()) as any;
        if (!response.ok) {
          throw new Error(resData?.message || `Resend returned HTTP ${response.status}`);
        }
        providerMessageId = resData?.id;
      } catch (err: any) {
        logger.error('Failed to dispatch payment invoice email via Resend', { error: err.message, paymentId });
        status = 'FAILED';
        errorMessage = err.message;
      }
    } else {
      providerMessageId = `dev-invoice-${Date.now()}`;
      logger.info('Development transport recorded payment invoice email dispatch', {
        paymentId,
        recipientEmail,
        subject,
      });
    }

    await logActivity({
      actorProfileId: actorId,
      action: 'PAYMENT_INVOICE_EMAIL_SENT',
      entityType: 'payment',
      entityId: paymentId,
      details: {
        recipientEmail,
        status,
        providerMessageId: providerMessageId || null,
        paymentNumber,
      },
    });

    if (status === 'FAILED') {
      throw new BadRequestError(`Failed to send invoice email: ${errorMessage}`);
    }

    return { success: true, messageId: providerMessageId };
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
