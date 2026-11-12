import { apiClient } from '@/services/api/client';

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
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  created_at: string;
}

export interface EmailConfigStatus {
  configured: boolean;
  fromEmail: string;
  replyTo: string;
  sandboxMode: boolean;
  sandboxOverrideTo: string | null;
  webhookConfigured: boolean;
  inboundDomain: string | null;
  automation: {
    autoSendReportOnVerify: boolean;
    autoSendAmcReminders: boolean;
    autoSendReceiptOnPaid: boolean;
  };
}

export interface InboundEmailRecord {
  id: string;
  resend_email_id: string;
  from_email: string;
  to_emails: string[];
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  customer_id: string | null;
  status: 'UNREAD' | 'READ' | 'ARCHIVED';
  received_at: string;
  customers?: {
    id: string;
    name: string;
    customer_code: string;
    phone?: string | null;
    email?: string | null;
  } | null;
}

export function buildWhatsAppShareUrl(phone?: string | null, message = ''): string {
  const digits = (phone || '').replace(/\D/g, '');
  const normalizedPhone =
    digits.length === 10 ? `91${digits}` : digits.length >= 11 ? digits : '';
  const base = normalizedPhone ? `https://wa.me/${normalizedPhone}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}

export const emailApi = {
  listDeliveries: (params?: {
    entityType?: EmailEntityType;
    entityId?: string;
    status?: EmailDeliveryStatus;
    limit?: number;
  }) =>
    apiClient.get<{ deliveries: UnifiedEmailDeliveryRecord[]; config: EmailConfigStatus }>(
      '/email-deliveries',
      { params }
    ),

  retryDelivery: (deliveryId: string) =>
    apiClient.post<{ delivery: UnifiedEmailDeliveryRecord | null; processed: number }>(
      `/email-deliveries/${deliveryId}/retry`
    ),

  getAdminStatus: () =>
    apiClient.get<{ config: EmailConfigStatus; recentDeliveries: UnifiedEmailDeliveryRecord[] }>(
      '/admin/email-status'
    ),

  sendTestEmail: (recipientEmail: string) =>
    apiClient.post<{
      delivery: UnifiedEmailDeliveryRecord;
      sandboxRedirected: boolean;
      effectiveRecipient: string;
    }>('/admin/email-test', { recipientEmail }),

  listInboundEmails: (params?: { status?: 'UNREAD' | 'READ' | 'ARCHIVED'; limit?: number }) =>
    apiClient.get<{ emails: InboundEmailRecord[] }>('/inbound-emails', { params }),

  updateInboundStatus: (id: string, status: 'UNREAD' | 'READ' | 'ARCHIVED') =>
    apiClient.patch<{ email: InboundEmailRecord }>(`/inbound-emails/${id}/status`, { status }),
};

