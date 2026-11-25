import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export interface EmailAttachmentInput {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailTagInput {
  name: string;
  value: string;
}

export interface EmailSendPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  tags?: EmailTagInput[];
  idempotencyKey?: string | null;
  attachments?: EmailAttachmentInput[];
}

export interface EmailTransportResult {
  transport: 'resend' | 'gmail' | 'dev-log' | 'memory';
  providerMessageId: string;
  effectiveRecipient: string;
  sandboxRedirected: boolean;
}

export class EmailDeliveryError extends Error {
  readonly retryable: boolean;
  readonly code: string;

  constructor(message: string, retryable = true, code = 'EMAIL_SEND_FAILED') {
    super(message);
    this.name = 'EmailDeliveryError';
    this.retryable = retryable;
    this.code = code;
  }
}

export const DEFAULT_RESEND_FROM = 'Extreme Sales & Services <onboarding@resend.dev>';
export const DEFAULT_REPLY_TO = 'extremess0121@gmail.com';

export function extractEmailAddress(formatted: string): string {
  const match = formatted.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  return (match ? match[1] : formatted).trim().toLowerCase();
}

export function isSandboxSender(fromEmail?: string | null): boolean {
  const raw = extractEmailAddress(fromEmail || DEFAULT_RESEND_FROM);
  return raw.endsWith('@resend.dev');
}

export const DEFAULT_FROM_NAME = 'Extreme Sales & Services';

/**
 * EMAIL_ALLOWED_RECIPIENTS (non-production safety switch): comma list of addresses ("a@b.com") and/or domains ("@b.com").
 * When set, only matching recipients are ever sent to, on BOTH transports; "+tags" are ignored when matching
 * ("me+e2e-1@b.com" matches "me@b.com"). Empty/unset = no restriction (production).
 */
export function parseAllowedRecipients(raw: string | undefined | null): string[] {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** "me+tag@b.com" -> "me@b.com"; null when it is not an address. */
function baseAddress(raw: string): string | null {
  const addr = extractEmailAddress(raw);
  const at = addr.lastIndexOf('@');
  if (at < 1 || at === addr.length - 1) return null;
  return `${addr.slice(0, at).split('+')[0]}@${addr.slice(at + 1)}`;
}

export function isRecipientAllowed(recipient: string, allowList: string[]): boolean {
  if (allowList.length === 0) return true;
  const base = baseAddress(recipient);
  if (!base) return false;
  const domain = base.slice(base.lastIndexOf('@') + 1);
  return allowList.some((entry) => (entry.startsWith('@') ? domain === entry.slice(1) : base === baseAddress(entry)));
}

/** Throws (never retried) when the allow-list is set and the recipient is not on it. */
export function assertRecipientAllowed(recipient: string): void {
  const allow = parseAllowedRecipients(env.EMAIL_ALLOWED_RECIPIENTS);
  if (!isRecipientAllowed(recipient, allow)) {
    logger.warn('Email blocked by EMAIL_ALLOWED_RECIPIENTS', { outcome: 'blocked_by_allowlist' });
    throw new EmailDeliveryError('Recipient is not on EMAIL_ALLOWED_RECIPIENTS (blocked_by_allowlist).', false, 'BLOCKED_BY_ALLOWLIST');
  }
}

/** Which provider sends email: explicit EMAIL_TRANSPORT, else Gmail when its credentials exist, else Resend. */
export function getActiveEmailTransport(): 'gmail' | 'resend' {
  if (env.EMAIL_TRANSPORT) return env.EMAIL_TRANSPORT;
  return env.GMAIL_USER && env.GMAIL_APP_PASSWORD ? 'gmail' : 'resend';
}

export function getResolvedEmailConfig() {
  const transport = getActiveEmailTransport();
  if (transport === 'gmail') {
    const fromName = (env.EMAIL_FROM_NAME || DEFAULT_FROM_NAME).replace(/[<>"\r\n]/g, '');
    return {
      transport,
      configured: Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD),
      fromEmail: env.GMAIL_USER ? `${fromName} <${env.GMAIL_USER}>` : `${fromName} <not-configured>`,
      replyTo: env.RESEND_REPLY_TO || env.GMAIL_USER || DEFAULT_REPLY_TO,
      sandboxMode: false,
      sandboxOverrideTo: null,
      webhookConfigured: false,
      inboundDomain: null,
      automation: {
        autoSendReportOnVerify: env.EMAIL_AUTO_SEND_REPORT_ON_VERIFY === 'true',
        autoSendAmcReminders: env.EMAIL_AUTO_SEND_AMC_REMINDERS === 'true',
        autoSendReceiptOnPaid: env.EMAIL_AUTO_SEND_RECEIPT_ON_PAID === 'true',
      },
    };
  }
  const fromEmail = env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM;
  const replyTo = env.RESEND_REPLY_TO || DEFAULT_REPLY_TO;
  const sandboxMode = isSandboxSender(fromEmail);
  return {
    transport,
    configured: Boolean(env.RESEND_API_KEY),
    fromEmail,
    replyTo,
    sandboxMode,
    sandboxOverrideTo: env.RESEND_SANDBOX_OVERRIDE_TO || null,
    webhookConfigured: Boolean(env.RESEND_WEBHOOK_SECRET),
    inboundDomain: env.RESEND_INBOUND_DOMAIN || null,
    automation: {
      autoSendReportOnVerify: env.EMAIL_AUTO_SEND_REPORT_ON_VERIFY === 'true',
      autoSendAmcReminders: env.EMAIL_AUTO_SEND_AMC_REMINDERS === 'true',
      autoSendReceiptOnPaid: env.EMAIL_AUTO_SEND_RECEIPT_ON_PAID === 'true',
    },
  };
}

function sanitizeTagValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'na';
}

export function isRetryableResendError(statusCode?: number | null, message?: string | null): boolean {
  if (typeof statusCode === 'number') {
    if (statusCode === 429 || statusCode >= 500) return true;
    if (statusCode >= 400 && statusCode < 500) return false;
  }
  const msg = (message || '').toLowerCase();
  if (
    msg.includes('only send testing emails to your own email') ||
    msg.includes('verify a domain') ||
    msg.includes('validation_error') ||
    msg.includes('invalid') ||
    msg.includes('api key')
  ) {
    return false;
  }
  return true;
}

/** SMTP errors: auth/permanent (5xx) failures are not retried; network and 4xx are. */
export function isRetryableSmtpError(err: { code?: string; responseCode?: number } | null | undefined): boolean {
  if (!err) return true;
  if (err.code === 'EAUTH' || err.code === 'EENVELOPE' || err.code === 'EMESSAGE') return false;
  if (typeof err.responseCode === 'number') {
    if (err.responseCode === 421 || err.responseCode === 450 || err.responseCode === 451 || err.responseCode === 452) return true;
    if (err.responseCode >= 500) return false;
    if (err.responseCode >= 400) return true;
  }
  return true;
}

type SmtpTransporter = { sendMail: (mail: Record<string, unknown>) => Promise<{ messageId?: string }> };

class GmailTransportService {
  private transporter: SmtpTransporter | null = null;
  private cachedFor: string | null = null;

  /** Overridable in tests. */
  createTransporter(user: string, pass: string): SmtpTransporter {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    }) as unknown as SmtpTransporter;
  }

  private getTransporter(): SmtpTransporter | null {
    if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) return null;
    const key = `${env.GMAIL_USER}:${env.GMAIL_APP_PASSWORD.length}`;
    if (!this.transporter || this.cachedFor !== key) {
      this.transporter = this.createTransporter(env.GMAIL_USER, env.GMAIL_APP_PASSWORD);
      this.cachedFor = key;
    }
    return this.transporter;
  }

  async send(payload: EmailSendPayload): Promise<EmailTransportResult> {
    const config = getResolvedEmailConfig();
    const transporter = this.getTransporter();
    if (!transporter) {
      if (env.NODE_ENV === 'production') {
        throw new EmailDeliveryError(
          'GMAIL_USER / GMAIL_APP_PASSWORD are not configured in production environment.',
          false,
          'GMAIL_NOT_CONFIGURED'
        );
      }
      const devId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      logger.info('Gmail dev-log transport captured email dispatch', {
        to: payload.to,
        subject: payload.subject,
        providerMessageId: devId,
      });
      return { transport: 'dev-log', providerMessageId: devId, effectiveRecipient: payload.to, sandboxRedirected: false };
    }

    assertRecipientAllowed(payload.to);
    try {
      const info = await transporter.sendMail({
        from: config.fromEmail,
        to: payload.to,
        replyTo: payload.replyTo || config.replyTo,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        headers: payload.idempotencyKey ? { 'X-Entity-Ref-ID': payload.idempotencyKey } : undefined,
        attachments: payload.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      const id = info?.messageId;
      if (!id) {
        throw new EmailDeliveryError('Gmail SMTP returned no message id.', true, 'GMAIL_EMPTY_ID');
      }
      return { transport: 'gmail', providerMessageId: id, effectiveRecipient: payload.to, sandboxRedirected: false };
    } catch (err) {
      if (err instanceof EmailDeliveryError) throw err;
      const e = err as { message?: string; code?: string; responseCode?: number };
      const code = e.code === 'EAUTH' ? 'GMAIL_AUTH_FAILED' : `GMAIL_${e.code || 'SEND_FAILED'}`;
      const message =
        e.code === 'EAUTH'
          ? 'Gmail rejected the login. Check GMAIL_USER and that GMAIL_APP_PASSWORD is a current 16-letter app password.'
          : e.message || 'Gmail SMTP send failed';
      throw new EmailDeliveryError(message, isRetryableSmtpError(e), code);
    }
  }
}

export const gmailTransport = new GmailTransportService();

class ResendTransportService {
  private client: Resend | null = null;
  private cachedKey: string | null = null;

  private getClient(): Resend | null {
    if (!env.RESEND_API_KEY) return null;
    if (!this.client || this.cachedKey !== env.RESEND_API_KEY) {
      this.client = new Resend(env.RESEND_API_KEY);
      this.cachedKey = env.RESEND_API_KEY;
    }
    return this.client;
  }

  async send(payload: EmailSendPayload): Promise<EmailTransportResult> {
    // Single entry point used across the app: route to Gmail when it is the active transport.
    if (getActiveEmailTransport() === 'gmail') {
      return gmailTransport.send(payload);
    }
    const config = getResolvedEmailConfig();
    const effectiveRecipient =
      config.sandboxMode && config.sandboxOverrideTo
        ? config.sandboxOverrideTo
        : payload.to;
    const sandboxRedirected = effectiveRecipient.toLowerCase() !== payload.to.toLowerCase();

    const client = this.getClient();
    if (!client) {
      if (env.NODE_ENV === 'production') {
        throw new EmailDeliveryError(
          'RESEND_API_KEY is not configured in production environment.',
          false,
          'RESEND_NOT_CONFIGURED'
        );
      }

      const devId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      logger.info('Resend dev-log transport captured email dispatch', {
        to: effectiveRecipient,
        intendedTo: payload.to,
        subject: payload.subject,
        providerMessageId: devId,
      });
      return {
        transport: 'dev-log',
        providerMessageId: devId,
        effectiveRecipient,
        sandboxRedirected,
      };
    }

    assertRecipientAllowed(effectiveRecipient);
    const tags = (payload.tags || []).map((tag) => ({
      name: sanitizeTagValue(tag.name),
      value: sanitizeTagValue(tag.value),
    }));

    const subject = sandboxRedirected
      ? `[SANDBOX -> ${payload.to}] ${payload.subject}`
      : payload.subject;

    try {
      const response = await client.emails.send(
        {
          from: config.fromEmail,
          to: [effectiveRecipient],
          replyTo: payload.replyTo || config.replyTo,
          subject,
          html: payload.html,
          text: payload.text,
          tags: tags.length ? tags : undefined,
          attachments: payload.attachments?.map((att) => ({
            filename: att.filename,
            content: att.content,
            contentType: att.contentType,
          })),
        },
        payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : undefined
      );

      if (response.error) {
        const statusCode = (response.error as { statusCode?: number }).statusCode;
        const rawMessage = response.error.message || 'Resend rejected email send request';
        const message =
          config.sandboxMode && rawMessage.toLowerCase().includes('only send testing emails')
            ? `${rawMessage} (Sandbox mode active with ${config.fromEmail}; verify a domain in Resend or set RESEND_SANDBOX_OVERRIDE_TO for testing.)`
            : rawMessage;
        throw new EmailDeliveryError(
          message,
          isRetryableResendError(statusCode, rawMessage),
          response.error.name || 'RESEND_API_ERROR'
        );
      }

      const id = response.data?.id;
      if (!id) {
        throw new EmailDeliveryError('Resend returned empty message id.', true, 'RESEND_EMPTY_ID');
      }

      return {
        transport: 'resend',
        providerMessageId: id,
        effectiveRecipient,
        sandboxRedirected,
      };
    } catch (err) {
      if (err instanceof EmailDeliveryError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Unexpected Resend transport failure';
      throw new EmailDeliveryError(message, true, 'RESEND_NETWORK_ERROR');
    }
  }

  verifyWebhook(
    rawPayload: string,
    headers: { id?: string; timestamp?: string; signature?: string }
  ): Record<string, unknown> {
    if (!env.RESEND_WEBHOOK_SECRET) {
      throw new EmailDeliveryError(
        'RESEND_WEBHOOK_SECRET is not configured.',
        false,
        'WEBHOOK_SECRET_MISSING'
      );
    }
    const client = this.getClient() || new Resend('re_webhook_verify_only');
    if (!headers.id || !headers.timestamp || !headers.signature) {
      throw new EmailDeliveryError('Missing Svix webhook signature headers.', false, 'WEBHOOK_HEADERS_MISSING');
    }

    const verified = client.webhooks.verify({
      payload: rawPayload,
      headers: {
        id: headers.id,
        timestamp: headers.timestamp,
        signature: headers.signature,
      },
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
    });
    return verified as unknown as Record<string, unknown>;
  }

  async getReceivedEmailContent(emailId: string): Promise<Record<string, unknown> | null> {
    const client = this.getClient();
    if (!client) return null;
    try {
      const receiver = (client.emails as unknown as {
        receiving?: { get?: (id: string) => Promise<{ data?: Record<string, unknown> | null }> };
      }).receiving;
      if (!receiver?.get) return null;
      const result = await receiver.get(emailId);
      return result?.data ?? null;
    } catch (err) {
      logger.warn('Failed to fetch inbound email details from Resend', {
        emailId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}

export const resendTransport = new ResendTransportService();
