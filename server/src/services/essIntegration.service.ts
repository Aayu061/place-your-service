import { getSupabaseClient } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface EssStatusWebhookPayload {
  event: 'service_request.status_updated';
  pysRequestId: string;
  pysRequestNumber: string;
  externalReferenceId: string;
  status: string;
  technician: {
    id: string;
    name: string;
    phone: string;
  } | null;
  scheduledDate: string | null;
  timestamp: string;
}

export class EssIntegrationService {
  /**
   * Asynchronously dispatches a status update webhook to Extreme Sales & Services (ESS)
   * whenever a ticket originating from ESS transitions status or has a technician assigned.
   */
  public async notifyServiceRequestStatusUpdate(
    serviceRequestId: string,
    overrideStatus?: string
  ): Promise<void> {
    try {
      const supabase = getSupabaseClient();

      // 1. Fetch Service Request source channel & external reference
      const { data: sr, error: srErr } = await supabase
        .from('service_requests')
        .select('id, request_number, status, source_channel, external_reference_id')
        .eq('id', serviceRequestId)
        .maybeSingle();

      if (srErr || !sr) {
        return;
      }

      // Check if ticket originated from Extreme Sales & Services with an external reference ID
      if (sr.source_channel !== 'EXTREME_SALES_SERVICES' || !sr.external_reference_id) {
        return;
      }

      // 2. Fetch latest active schedule & technician assigned to this service request (if any)
      const { data: activeSchedule } = await supabase
        .from('service_schedules')
        .select(`
          id, scheduled_date, status, technician_id,
          technicians ( id, name, phone )
        `)
        .eq('service_request_id', serviceRequestId)
        .not('status', 'eq', 'CANCELLED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const techRecord = (activeSchedule?.technicians as any) || null;
      const technicianPayload = techRecord
        ? {
            id: techRecord.id,
            name: techRecord.name,
            phone: techRecord.phone,
          }
        : null;

      const effectiveStatus = overrideStatus || sr.status;
      const scheduledDate = activeSchedule?.scheduled_date || null;

      // 3. Construct standard ESS webhook payload
      const payload: EssStatusWebhookPayload = {
        event: 'service_request.status_updated',
        pysRequestId: sr.id,
        pysRequestNumber: sr.request_number,
        externalReferenceId: sr.external_reference_id,
        status: effectiveStatus,
        technician: technicianPayload,
        scheduledDate,
        timestamp: new Date().toISOString(),
      };

      const webhookUrl = env.ESS_WEBHOOK_URL;
      const webhookSecret = env.ESS_WEBHOOK_SECRET;

      logger.info('Dispatching outbound webhook to ESS', {
        webhookUrl,
        pysRequestId: sr.id,
        externalReferenceId: sr.external_reference_id,
        status: effectiveStatus,
      });

      // 4. Asynchronous HTTP POST with timeout abort controller
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': webhookSecret,
            'User-Agent': 'PlaceYourService-Webhook/1.0',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          logger.warn('ESS webhook endpoint responded with non-2xx status', {
            statusCode: response.status,
            statusText: response.statusText,
            externalReferenceId: sr.external_reference_id,
          });
          await this.recordDeliveryFailure(serviceRequestId, sr.external_reference_id, `HTTP ${response.status} ${response.statusText}`, payload);
        } else {
          logger.info('ESS webhook delivered successfully', {
            statusCode: response.status,
            externalReferenceId: sr.external_reference_id,
          });
        }
      } catch (postErr: any) {
        clearTimeout(timeoutId);
        logger.warn('Failed to deliver webhook to ESS endpoint (non-fatal)', {
          error: postErr.message,
          webhookUrl,
          externalReferenceId: sr.external_reference_id,
        });
        await this.recordDeliveryFailure(serviceRequestId, sr.external_reference_id, postErr.message || 'Network failure', payload);
      }
    } catch (err: any) {
      logger.error('Unexpected error in ESS webhook dispatcher (non-fatal)', {
        serviceRequestId,
        error: err.message,
      });
    }
  }

  private async recordDeliveryFailure(
    serviceRequestId: string,
    externalReferenceId: string | null,
    reason: string,
    payload: EssStatusWebhookPayload | Record<string, unknown>
  ): Promise<void> {
    try {
      const { logActivity } = await import('./audit.service.js');
      await logActivity({
        actorProfileId: null,
        action: 'ESS_WEBHOOK_DELIVERY_FAILED',
        entityType: 'service_request',
        entityId: serviceRequestId,
        details: {
          externalReferenceId,
          reason,
          payload,
          retryable: true,
        },
      });
    } catch {
      // Non-fatal in unit tests where mock supabase has no activity_logs mock
    }
  }
}

export const essIntegrationService = new EssIntegrationService();
