import { env } from '../config/env.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { logActivity } from './audit.service.js';
import { EmailDeliveryError, resendTransport } from './email/emailTransport.service.js';

interface EmailDelivery {
  id: string;
  service_report_id: string;
  recipient_email: string;
  subject: string;
  html_body: string;
  text_body: string;
  attempt_count: number;
}

export interface TransportResult {
  success: boolean;
  transport: string;
  providerMessageId?: string;
  error?: string;
  retryable: boolean;
}

export interface EmailTransport {
  send(delivery: EmailDelivery): Promise<TransportResult>;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] as string);
}

function formatServiceReportEmail(report: Record<string, any>, customerName: string, assets: Array<Record<string, any>>, items: Array<Record<string, any>>) {
  const assetRows = assets.map((asset) => `${asset.asset_tag || asset.asset_id} — ${asset.brand || ''} ${asset.model_number || ''} (${asset.asset_outcome})`);
  const itemRows = items.map((item) => `${item.item_type === 'PART_REQUIRED' ? 'Parts' : 'Repair'}: ${item.item_name} — ${item.reason}`);
  const lines = [
    `Service report ${report.report_number}`,
    `Dear ${customerName},`,
    `Service date: ${report.service_date}`,
    `Visit result: ${report.primary_outcome}`,
    report.work_description ? `Work completed: ${report.work_description}` : '',
    assetRows.length ? `Equipment:\n${assetRows.map((x) => `• ${x}`).join('\n')}` : '',
    itemRows.length ? `Follow-up items:\n${itemRows.map((x) => `• ${x}`).join('\n')}` : '',
    report.technician_remarks ? `Technician remarks: ${report.technician_remarks}` : '',
    'Thank you,\nPlace Your Service',
  ].filter(Boolean).join('\n\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Service report ${escapeHtml(report.report_number)}</title></head><body style="margin:0;background:#f4f6f8;color:#1f2937;font-family:Arial,sans-serif;line-height:1.5"><main style="max-width:600px;margin:24px auto;padding:24px;background:#fff;border:1px solid #dce2e8;border-radius:8px"><h1 style="font-size:22px">Service report ${escapeHtml(report.report_number)}</h1><p>Dear ${escapeHtml(customerName)},</p><p><strong>Service date:</strong> ${escapeHtml(report.service_date)}<br><strong>Visit result:</strong> ${escapeHtml(report.primary_outcome)}</p>${report.work_description ? `<h2 style="font-size:17px">Work completed</h2><p>${escapeHtml(report.work_description)}</p>` : ''}${assetRows.length ? `<h2 style="font-size:17px">Equipment</h2><ul>${assets.map((asset) => `<li>${escapeHtml(asset.asset_tag || asset.asset_id)} — ${escapeHtml(asset.brand || '')} ${escapeHtml(asset.model_number || '')} (${escapeHtml(asset.asset_outcome)})</li>`).join('')}</ul>` : ''}${itemRows.length ? `<h2 style="font-size:17px">Follow-up items</h2><ul>${items.map((item) => `<li>${escapeHtml(item.item_type === 'PART_REQUIRED' ? 'Parts' : 'Repair')}: ${escapeHtml(item.item_name)} — ${escapeHtml(item.reason)}</li>`).join('')}</ul>` : ''}${report.technician_remarks ? `<h2 style="font-size:17px">Technician remarks</h2><p>${escapeHtml(report.technician_remarks)}</p>` : ''}<p>Thank you,<br>Place Your Service</p></main></body></html>`;
  return { subject: `Service report ${report.report_number} | Place Your Service`, html, text: lines };
}

class DevelopmentLogTransport implements EmailTransport {
  async send(delivery: EmailDelivery): Promise<TransportResult> {
    logger.info('Development email transport recorded service report delivery', {
      deliveryId: delivery.id, reportId: delivery.service_report_id, attempt: delivery.attempt_count,
    });
    return { success: true, transport: 'development-log', providerMessageId: `dev-${delivery.id}`, retryable: false };
  }
}

class ResendEmailTransport implements EmailTransport {
  async send(delivery: EmailDelivery): Promise<TransportResult> {
    try {
      const result = await resendTransport.send({
        to: delivery.recipient_email,
        subject: delivery.subject,
        html: delivery.html_body,
        text: delivery.text_body,
        tags: [
          { name: 'entity_type', value: 'SERVICE_REPORT' },
          { name: 'entity_id', value: delivery.service_report_id },
        ],
        idempotencyKey: `pys-service-report-${delivery.id}`,
      });
      return {
        success: true,
        transport: result.transport,
        providerMessageId: result.providerMessageId,
        retryable: false,
      };
    } catch (error) {
      const retryable = error instanceof EmailDeliveryError ? error.retryable : true;
      return {
        success: false,
        transport: 'resend',
        retryable,
        error: error instanceof Error ? error.message : 'Resend request failed',
      };
    }
  }
}

function getEmailTransport(): EmailTransport {
  if (env.NODE_ENV !== 'production' && !env.RESEND_API_KEY) return new DevelopmentLogTransport();
  return new ResendEmailTransport();
}

export class ReportEmailService {
  constructor(private readonly transportProvider: () => EmailTransport = getEmailTransport) {}

  async queueAndSend(reportId: string, actorId: string) {
    const supabase = getSupabaseClient();
    const { data: report, error: reportError } = await supabase.from('service_reports')
      .select('id,report_number,service_date,status,primary_outcome,work_description,technician_remarks,customer_id')
      .eq('id', reportId).maybeSingle();
    if (reportError) throw new BadRequestError('Unable to load the service report for email delivery.');
    if (!report) throw new NotFoundError('Service report was not found.');
    if (!['SUBMITTED', 'VERIFIED'].includes(report.status)) throw new BadRequestError('Only an issued service report can be emailed.');

    const { data: customer, error: customerError } = await supabase.from('customers').select('name,email')
      .eq('id', report.customer_id).maybeSingle();
    if (customerError) throw new BadRequestError('Unable to load the customer email address.');
    if (!customer?.email) throw new BadRequestError('The customer record has no email address.');

    const [assetResult, itemResult] = await Promise.all([
      supabase.from('service_report_assets').select('asset_id,asset_tag,brand,model_number,asset_outcome').eq('report_id', reportId),
      supabase.from('service_report_items').select('item_type,item_name,reason,is_resolved').eq('report_id', reportId),
    ]);
    if (assetResult.error || itemResult.error) throw new BadRequestError('Unable to load the report snapshots for email delivery.');
    const formatted = formatServiceReportEmail(report, customer.name, assetResult.data || [], (itemResult.data || []).filter((item: any) => !item.is_resolved));

    let { data: delivery, error: deliveryError } = await supabase.from('service_report_email_deliveries').insert({
      service_report_id: reportId,
      recipient_email: customer.email,
      recipient_name: customer.name,
      subject: formatted.subject,
      html_body: formatted.html,
      text_body: formatted.text,
      requested_by: actorId,
    }).select('id,status').single();
    if (deliveryError?.code === '23505') {
      const existing = await supabase.from('service_report_email_deliveries').select('id,status')
        .eq('service_report_id', reportId).eq('recipient_email', customer.email).single();
      delivery = existing.data;
      deliveryError = existing.error;
    }
    if (deliveryError || !delivery) throw new BadRequestError('Could not queue the service report email.');

    const results = await this.processPending(20);
    const current = await supabase.from('service_report_email_deliveries')
      .select('id,status,attempt_count,max_attempts,next_attempt_at,last_error,transport,sent_at,created_at')
      .eq('id', delivery.id).single();
    if (current.error || !current.data) throw new BadRequestError('Email was queued, but delivery status could not be refreshed.');
    await logActivity({ actorProfileId: actorId, action: 'SERVICE_REPORT_EMAIL_QUEUED', entityType: 'service_report', entityId: reportId, details: { deliveryId: delivery.id, transport: current.data.transport } });
    return { delivery: current.data, processed: results.processed };
  }

  async listDeliveries(reportId: string) {
    const supabase = getSupabaseClient();
    const { data: report, error: reportError } = await supabase.from('service_reports').select('id').eq('id', reportId).maybeSingle();
    if (reportError) throw new BadRequestError('Unable to load the service report.');
    if (!report) throw new NotFoundError('Service report was not found.');
    const { data, error } = await supabase.from('service_report_email_deliveries')
      .select('id,recipient_email,status,attempt_count,max_attempts,next_attempt_at,last_error,transport,provider_message_id,created_at,sent_at')
      .eq('service_report_id', reportId).order('created_at', { ascending: false });
    if (error) throw new BadRequestError('Unable to load email delivery history.');
    return data || [];
  }

  async retryDelivery(reportId: string, deliveryId: string, actorId: string) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc('retry_service_report_email_delivery', {
      p_delivery_id: deliveryId,
      p_report_id: reportId,
      p_actor_profile_id: actorId,
    });
    if (error) {
      if (error.code === 'P0002') throw new NotFoundError('Email delivery was not found for this report.');
      throw new BadRequestError(error.message || 'Email delivery could not be retried.');
    }
    await logActivity({ actorProfileId: actorId, action: 'SERVICE_REPORT_EMAIL_RETRY_REQUESTED', entityType: 'service_report_email_delivery', entityId: deliveryId, details: { reportId } });
    await this.processPending(20, actorId);
    const { data, error: readError } = await supabase.from('service_report_email_deliveries')
      .select('id,recipient_email,status,attempt_count,max_attempts,next_attempt_at,last_error,transport,provider_message_id,created_at,sent_at')
      .eq('id', deliveryId).eq('service_report_id', reportId).single();
    if (readError || !data) throw new BadRequestError('Retry was accepted, but the delivery state could not be refreshed.');
    return { delivery: data, processed: 1 };
  }

  async processPending(limit = 20, actorId?: string) {
    const supabase = getSupabaseClient();
    const { data: deliveries, error } = await supabase.rpc('claim_service_report_email_deliveries', { p_limit: limit });
    if (error) throw new BadRequestError('Could not claim pending service report emails.');
    let sent = 0;
    let failed = 0;
    for (const delivery of (deliveries || []) as EmailDelivery[]) {
      const outcome = await this.transportProvider().send(delivery);
      const { error: completeError } = await supabase.rpc('complete_service_report_email_delivery', {
        p_delivery_id: delivery.id,
        p_succeeded: outcome.success,
        p_transport: outcome.transport,
        p_provider_message_id: outcome.providerMessageId || null,
        p_error: outcome.error || null,
        p_retryable: outcome.retryable,
      });
      if (completeError) {
        logger.error('Could not persist service report email result', { deliveryId: delivery.id, code: completeError.code });
        failed += 1;
      } else if (outcome.success) sent += 1;
      else failed += 1;
    }
    const summary = { processed: (deliveries || []).length, sent, failed };
    if (actorId && summary.processed > 0) await logActivity({
      actorProfileId: actorId, action: 'SERVICE_REPORT_EMAIL_RETRY_RUN', entityType: 'service_report_email_delivery',
      details: summary,
    });
    return summary;
  }
}

export const reportEmailService = new ReportEmailService();

export function startReportEmailDeliveryWorker(intervalMs = 30000): NodeJS.Timeout {
  const timer = setInterval(() => {
    void reportEmailService.processPending(20).then((summary) => {
      if (summary.failed) logger.warn('Some service report emails remain queued for retry', summary);
    }).catch((error) => logger.error('Service report email worker could not process the queue', {
      error: error instanceof Error ? error.message : 'Unknown worker error',
    }));
  }, intervalMs);
  timer.unref();
  return timer;
}
