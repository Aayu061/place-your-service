import { getSupabaseClient } from '../../lib/supabase.js';
import { logger } from '../../utils/logger.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';

function dbError(error: { code?: string; message?: string } | null, action: string): never {
  if (error?.code === '23505') throw new ConflictError(`${action} conflicts with an existing record.`);
  if (error?.code === 'P0002') throw new NotFoundError(error.message || `${action} record was not found.`);
  throw new BadRequestError(error?.message || `${action} could not be completed.`);
}
import { addDaysIstIso, getIstTodayIso } from '../../utils/date.js';
import { logActivity } from '../audit.service.js';
import {
  EmailDeliveryError,
  EmailTagInput,
  EmailTransportResult,
  getResolvedEmailConfig,
  resendTransport,
} from './emailTransport.service.js';
import {
  buildAmcExpiryReminderTemplate,
  buildDiagnosticTestEmailTemplate,
} from './emailTemplates.service.js';

export type EmailEntityType =
  | 'SERVICE_REPORT'
  | 'AMC_QUOTATION'
  | 'AMC_EXPIRY_REMINDER'
  | 'PAYMENT_INVOICE'
  | 'PAYMENT_RECEIPT'
  | 'DISPATCH_CONFIRMATION'
  | 'TEST_EMAIL';

export type EmailDeliveryStatus =
  | 'PENDING'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'DELAYED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'FAILED';

export interface UnifiedEmailDeliveryRecord {
  id: string;
  entity_type: EmailEntityType;
  entity_id: string | null;
  template_key: string;
  recipient_email: string;
  recipient_name: string | null;
  reply_to: string | null;
  subject: string;
  status: EmailDeliveryStatus;
  retryable: boolean;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  transport: string | null;
  provider_message_id: string | null;
  requested_by: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueEmailInput {
  entityType: EmailEntityType;
  entityId?: string | null;
  templateKey: string;
  recipientEmail: string;
  recipientName?: string | null;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  tags?: EmailTagInput[];
  idempotencyKey?: string | null;
  actorId?: string | null;
}

function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

export class EmailOutboxService {
  async enqueueAndSend(input: EnqueueEmailInput): Promise<{
    delivery: UnifiedEmailDeliveryRecord;
    sandboxRedirected: boolean;
    effectiveRecipient: string;
    outboxTableMissing?: boolean;
  }> {
    const supabase = getSupabaseClient();
    const config = getResolvedEmailConfig();
    const tags: EmailTagInput[] = [
      { name: 'entity_type', value: input.entityType },
      ...(input.entityId ? [{ name: 'entity_id', value: input.entityId }] : []),
      ...(input.tags || []),
    ];

    const insertPayload = {
      entity_type: input.entityType,
      entity_id: input.entityId || null,
      template_key: input.templateKey,
      recipient_email: input.recipientEmail.trim().toLowerCase(),
      recipient_name: input.recipientName || null,
      reply_to: input.replyTo || config.replyTo,
      subject: input.subject,
      html_body: input.html,
      text_body: input.text,
      tags,
      idempotency_key: input.idempotencyKey || null,
      status: 'SENDING' as const,
      retryable: true,
      attempt_count: 1,
      max_attempts: 5,
      requested_by: input.actorId || null,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('email_deliveries')
      .insert(insertPayload)
      .select(
        'id,entity_type,entity_id,template_key,recipient_email,recipient_name,reply_to,subject,status,retryable,attempt_count,max_attempts,next_attempt_at,last_error,transport,provider_message_id,requested_by,sent_at,delivered_at,bounced_at,created_at,updated_at'
      )
      .single();

    if (insertError) {
      if (isMissingRelationError(insertError)) {
        logger.warn('email_deliveries table not present yet; sending directly via Resend transport');
        const directResult = await resendTransport.send({
          to: input.recipientEmail.trim(),
          subject: input.subject,
          html: input.html,
          text: input.text,
          replyTo: input.replyTo || config.replyTo,
          tags,
          idempotencyKey: input.idempotencyKey,
        });
        const now = new Date().toISOString();
        return {
          delivery: {
            id: `direct-${Date.now()}`,
            entity_type: input.entityType,
            entity_id: input.entityId || null,
            template_key: input.templateKey,
            recipient_email: input.recipientEmail.trim().toLowerCase(),
            recipient_name: input.recipientName || null,
            reply_to: input.replyTo || config.replyTo,
            subject: input.subject,
            status: 'SENT',
            retryable: false,
            attempt_count: 1,
            max_attempts: 5,
            next_attempt_at: now,
            last_error: null,
            transport: directResult.transport,
            provider_message_id: directResult.providerMessageId,
            requested_by: input.actorId || null,
            sent_at: now,
            delivered_at: null,
            bounced_at: null,
            created_at: now,
            updated_at: now,
          },
          sandboxRedirected: directResult.sandboxRedirected,
          effectiveRecipient: directResult.effectiveRecipient,
          outboxTableMissing: true,
        };
      }

      if (insertError.code === '23505' && input.idempotencyKey) {
        const { data: existing } = await supabase
          .from('email_deliveries')
          .select('*')
          .eq('idempotency_key', input.idempotencyKey)
          .maybeSingle();
        if (existing) {
          return {
            delivery: existing as UnifiedEmailDeliveryRecord,
            sandboxRedirected: false,
            effectiveRecipient: existing.recipient_email,
          };
        }
      }

      dbError(insertError, 'Email delivery queue');
    }

    const row = inserted as UnifiedEmailDeliveryRecord;

    let transportResult: EmailTransportResult | null = null;
    let sendError: Error | null = null;
    try {
      transportResult = await resendTransport.send({
        to: row.recipient_email,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: row.reply_to,
        tags,
        idempotencyKey: input.idempotencyKey || row.id,
      });
    } catch (err) {
      sendError = err instanceof Error ? err : new Error('Failed to dispatch email');
    }

    const succeeded = Boolean(transportResult);
    const retryable =
      sendError instanceof EmailDeliveryError ? sendError.retryable : true;

    const { data: completed, error: completeErr } = await supabase.rpc('complete_email_delivery', {
      p_delivery_id: row.id,
      p_succeeded: succeeded,
      p_transport: transportResult?.transport || 'resend',
      p_provider_message_id: transportResult?.providerMessageId || null,
      p_error: sendError?.message || null,
      p_retryable: retryable,
    });

    if (completeErr) {
      logger.error('Failed to complete email delivery record', { error: completeErr, deliveryId: row.id });
    }

    const finalRecord = (completed as UnifiedEmailDeliveryRecord) || {
      ...row,
      status: succeeded ? 'SENT' : 'FAILED',
      provider_message_id: transportResult?.providerMessageId || null,
      last_error: sendError?.message || null,
      retryable: !succeeded && retryable,
    };

    if (!succeeded && !retryable) {
      throw new BadRequestError(sendError?.message || 'Email rejected by provider.');
    }

    return {
      delivery: finalRecord,
      sandboxRedirected: transportResult?.sandboxRedirected || false,
      effectiveRecipient: transportResult?.effectiveRecipient || row.recipient_email,
    };
  }

  async listDeliveries(filters: {
    entityType?: EmailEntityType;
    entityId?: string;
    status?: string;
    limit?: number;
  }): Promise<UnifiedEmailDeliveryRecord[]> {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('email_deliveries')
      .select(
        'id,entity_type,entity_id,template_key,recipient_email,recipient_name,reply_to,subject,status,retryable,attempt_count,max_attempts,next_attempt_at,last_error,transport,provider_message_id,requested_by,sent_at,delivered_at,bounced_at,created_at,updated_at'
      )
      .order('created_at', { ascending: false })
      .limit(Math.min(filters.limit || 50, 200));

    if (filters.entityType) query = query.eq('entity_type', filters.entityType);
    if (filters.entityId) query = query.eq('entity_id', filters.entityId);
    if (filters.status) query = query.eq('status', filters.status);

    const { data, error } = await query;
    if (error) {
      if (isMissingRelationError(error)) return [];
      dbError(error, 'Email deliveries list');
    }
    return (data || []) as UnifiedEmailDeliveryRecord[];
  }

  async retryDelivery(deliveryId: string, actorId: string): Promise<{
    delivery: UnifiedEmailDeliveryRecord | null;
    processed: number;
  }> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc('retry_email_delivery', {
      p_delivery_id: deliveryId,
      p_actor_profile_id: actorId,
    });

    if (error) {
      if (error.code === 'P0002') {
        throw new NotFoundError('Email delivery record not found.');
      }
      if (isMissingRelationError(error)) {
        throw new BadRequestError('Unified email_deliveries migration has not been applied yet.');
      }
      dbError(error, 'Email retry');
    }

    const summary = await this.processPending(10);
    const { data: updated } = await supabase
      .from('email_deliveries')
      .select(
        'id,entity_type,entity_id,template_key,recipient_email,recipient_name,reply_to,subject,status,retryable,attempt_count,max_attempts,next_attempt_at,last_error,transport,provider_message_id,requested_by,sent_at,delivered_at,bounced_at,created_at,updated_at'
      )
      .eq('id', deliveryId)
      .maybeSingle();

    await logActivity({
      actorProfileId: actorId,
      action: 'EMAIL_DELIVERY_RETRIED',
      entityType: 'email_delivery',
      entityId: deliveryId,
      details: { processed: summary.processed, sent: summary.sent, failed: summary.failed },
    });

    return {
      delivery: (updated as UnifiedEmailDeliveryRecord | null) || null,
      processed: summary.processed,
    };
  }

  async processPending(limit = 20): Promise<{ processed: number; sent: number; failed: number }> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('claim_email_deliveries', { p_limit: limit });
    if (error) {
      if (!isMissingRelationError(error)) {
        logger.error('Failed to claim pending unified email deliveries', { error });
      }
      return { processed: 0, sent: 0, failed: 0 };
    }

    const claimed = (data || []) as Array<
      UnifiedEmailDeliveryRecord & { html_body: string; text_body: string; idempotency_key: string | null; tags: EmailTagInput[] }
    >;

    let sent = 0;
    let failed = 0;

    for (const item of claimed) {
      try {
        const result = await resendTransport.send({
          to: item.recipient_email,
          subject: item.subject,
          html: item.html_body,
          text: item.text_body,
          replyTo: item.reply_to,
          tags: Array.isArray(item.tags) ? item.tags : undefined,
          idempotencyKey: item.idempotency_key || `${item.id}-attempt-${item.attempt_count}`,
        });
        await supabase.rpc('complete_email_delivery', {
          p_delivery_id: item.id,
          p_succeeded: true,
          p_transport: result.transport,
          p_provider_message_id: result.providerMessageId,
          p_error: null,
          p_retryable: false,
        });
        sent += 1;
      } catch (err) {
        const retryable = err instanceof EmailDeliveryError ? err.retryable : true;
        await supabase.rpc('complete_email_delivery', {
          p_delivery_id: item.id,
          p_succeeded: false,
          p_transport: 'resend',
          p_provider_message_id: null,
          p_error: err instanceof Error ? err.message : 'Email delivery error',
          p_retryable: retryable,
        });
        failed += 1;
      }
    }

    return { processed: claimed.length, sent, failed };
  }

  async handleResendWebhook(
    rawPayload: string,
    headers: { id?: string; timestamp?: string; signature?: string }
  ): Promise<{ handled: boolean; eventType: string }> {
    const event = resendTransport.verifyWebhook(rawPayload, headers);
    const eventType = String(event.type || '');
    const data = (event.data || {}) as Record<string, unknown>;
    const providerMessageId = String(data.email_id || data.id || '');
    const createdAt = typeof event.created_at === 'string' ? event.created_at : new Date().toISOString();

    const supabase = getSupabaseClient();

    if (eventType === 'email.received') {
      const resendEmailId = providerMessageId || `inbound-${Date.now()}`;
      const fromEmail = String(data.from || '');
      const toEmails = Array.isArray(data.to) ? data.to : data.to ? [String(data.to)] : [];
      const subject = String(data.subject || '(No Subject)');

      const fullEmail = providerMessageId
        ? await resendTransport.getReceivedEmailContent(providerMessageId)
        : null;

      const textBody = String(fullEmail?.text || data.text || '');
      const htmlBody = String(fullEmail?.html || data.html || '');

      let customerId: string | null = null;
      const cleanFromMatch = fromEmail.match(/<([^>]+)>/);
      const normalizedFrom = (cleanFromMatch ? cleanFromMatch[1] : fromEmail).trim().toLowerCase();
      if (normalizedFrom) {
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .ilike('email', normalizedFrom)
          .maybeSingle();
        customerId = customer?.id || null;
      }

      const { error: inboundErr } = await supabase.from('inbound_emails').upsert(
        {
          resend_email_id: resendEmailId,
          from_email: fromEmail,
          to_emails: toEmails,
          subject,
          text_body: textBody || null,
          html_body: htmlBody || null,
          reply_to: typeof data.reply_to === 'string' ? data.reply_to : null,
          headers: (fullEmail?.headers as Record<string, unknown>) || {},
          attachments: Array.isArray(fullEmail?.attachments) ? fullEmail?.attachments : [],
          customer_id: customerId,
          status: 'UNREAD',
          received_at: createdAt,
        },
        { onConflict: 'resend_email_id', ignoreDuplicates: true }
      );

      if (inboundErr && !isMissingRelationError(inboundErr)) {
        logger.error('Failed to store inbound email', { error: inboundErr, resendEmailId });
      }

      return { handled: true, eventType };
    }

    const reasonObj = (data.bounce || data.failed || {}) as Record<string, unknown>;
    const reason =
      typeof reasonObj.message === 'string'
        ? reasonObj.message
        : typeof data.reason === 'string'
        ? data.reason
        : null;

    const { error } = await supabase.rpc('apply_resend_webhook_event', {
      p_event_type: eventType,
      p_provider_message_id: providerMessageId,
      p_reason: reason,
      p_occurred_at: createdAt,
    });

    if (error && !isMissingRelationError(error)) {
      logger.error('Failed to apply Resend webhook event', { error, eventType, providerMessageId });
    }

    return { handled: true, eventType };
  }

  async listInboundEmails(status?: string, limit = 50) {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('inbound_emails')
      .select('*, customers(id,name,customer_code,phone,email)')
      .order('received_at', { ascending: false })
      .limit(Math.min(limit, 200));

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      if (isMissingRelationError(error)) return [];
      dbError(error, 'Inbound emails list');
    }
    return data || [];
  }

  async updateInboundEmailStatus(id: string, status: 'UNREAD' | 'READ' | 'ARCHIVED') {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('inbound_emails')
      .update({ status })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) dbError(error, 'Inbound email status');
    if (!data) throw new NotFoundError('Inbound email was not found.');
    return data;
  }

  async sendDiagnosticTestEmail(recipientEmail: string, actorId: string, actorEmail?: string | null) {
    const config = getResolvedEmailConfig();
    const template = buildDiagnosticTestEmailTemplate({
      recipientEmail,
      sentByEmail: actorEmail,
      fromEmail: config.fromEmail,
      replyTo: config.replyTo,
      sandboxMode: config.sandboxMode,
    });

    const result = await this.enqueueAndSend({
      entityType: 'TEST_EMAIL',
      entityId: null,
      templateKey: 'diagnostic_test',
      recipientEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [{ name: 'diagnostic', value: 'true' }],
      actorId,
    });

    await logActivity({
      actorProfileId: actorId,
      action: 'EMAIL_DIAGNOSTIC_TEST_SENT',
      entityType: 'email_delivery',
      entityId: result.delivery.id.startsWith('direct-') ? null : result.delivery.id,
      details: {
        recipientEmail,
        effectiveRecipient: result.effectiveRecipient,
        status: result.delivery.status,
        sandboxRedirected: result.sandboxRedirected,
      },
    });

    return result;
  }

  async runAmcExpiryReminders(): Promise<{ sent: number }> {
    const config = getResolvedEmailConfig();
    if (!config.automation.autoSendAmcReminders) {
      return { sent: 0 };
    }

    const supabase = getSupabaseClient();
    const today = getIstTodayIso();
    const milestones = [
      { days: 30, targetDate: addDaysIstIso(today, 30) },
      { days: 7, targetDate: addDaysIstIso(today, 7) },
    ];

    let sent = 0;

    for (const milestone of milestones) {
      const { data: contracts, error } = await supabase
        .from('amc_contracts')
        .select('id,contract_number,end_date,total_amount,amc_plans(name),customers(id,name,email)')
        .eq('status', 'ACTIVE')
        .eq('end_date', milestone.targetDate);

      if (error) {
        logger.error('Failed querying AMC expiry reminder candidates', { error, milestone });
        continue;
      }

      for (const row of contracts || []) {
        const customer = (Array.isArray(row.customers) ? row.customers[0] : row.customers) as {
          id?: string;
          name?: string;
          email?: string | null;
        } | null;
        const plan = (Array.isArray(row.amc_plans) ? row.amc_plans[0] : row.amc_plans) as {
          name?: string | null;
        } | null;
        const email = customer?.email?.trim();
        if (!email) continue;

        const idempotencyKey = `amc-expiry:${row.id}:${milestone.days}d:${row.end_date}`;
        const template = buildAmcExpiryReminderTemplate({
          contractNumber: row.contract_number,
          customerName: customer?.name || 'Valued Customer',
          endDate: row.end_date,
          daysRemaining: milestone.days,
          planName: plan?.name || null,
          totalAmount: row.total_amount,
        });

        try {
          const result = await this.enqueueAndSend({
            entityType: 'AMC_EXPIRY_REMINDER',
            entityId: row.id,
            templateKey: `amc_expiry_${milestone.days}d`,
            recipientEmail: email,
            recipientName: customer?.name || null,
            subject: template.subject,
            html: template.html,
            text: template.text,
            tags: [
              { name: 'milestone_days', value: String(milestone.days) },
              { name: 'contract_number', value: row.contract_number },
            ],
            idempotencyKey,
            actorId: null,
          });
          if (result.delivery.status === 'SENT' || result.delivery.status === 'DELIVERED') {
            sent += 1;
          }
        } catch (err) {
          logger.warn('AMC expiry reminder send failed', {
            contractId: row.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return { sent };
  }
}

export const emailOutboxService = new EmailOutboxService();
