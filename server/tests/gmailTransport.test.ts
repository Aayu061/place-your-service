import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from '../src/config/env.js';
import {
  getActiveEmailTransport,
  getResolvedEmailConfig,
  gmailTransport,
  isRetryableSmtpError,
  resendTransport,
  EmailDeliveryError,
} from '../src/services/email/emailTransport.service.js';

const mutableEnv = env as Record<string, unknown>;
const saved = {
  EMAIL_TRANSPORT: env.EMAIL_TRANSPORT,
  GMAIL_USER: env.GMAIL_USER,
  GMAIL_APP_PASSWORD: env.GMAIL_APP_PASSWORD,
  EMAIL_FROM_NAME: env.EMAIL_FROM_NAME,
  RESEND_REPLY_TO: env.RESEND_REPLY_TO,
};

function useGmail() {
  mutableEnv.EMAIL_TRANSPORT = undefined;
  mutableEnv.GMAIL_USER = 'extremess0121@gmail.com';
  mutableEnv.GMAIL_APP_PASSWORD = 'abcdefghijklmnop';
  mutableEnv.EMAIL_FROM_NAME = undefined;
  mutableEnv.RESEND_REPLY_TO = undefined;
}

describe('Gmail SMTP email transport', () => {
  afterEach(() => {
    Object.assign(mutableEnv, saved);
    vi.restoreAllMocks();
  });

  it('is selected automatically when Gmail credentials exist and EMAIL_TRANSPORT is unset', () => {
    useGmail();
    expect(getActiveEmailTransport()).toBe('gmail');
    const cfg = getResolvedEmailConfig();
    expect(cfg.transport).toBe('gmail');
    expect(cfg.configured).toBe(true);
    expect(cfg.sandboxMode).toBe(false);
    expect(cfg.fromEmail).toBe('Extreme Sales & Services <extremess0121@gmail.com>');
    expect(cfg.replyTo).toBe('extremess0121@gmail.com');
  });

  it('EMAIL_TRANSPORT=resend overrides Gmail credentials', () => {
    useGmail();
    mutableEnv.EMAIL_TRANSPORT = 'resend';
    expect(getActiveEmailTransport()).toBe('resend');
  });

  it('routes the shared send() entry point through Gmail and returns the SMTP message id', async () => {
    useGmail();
    const sendMail = vi.fn().mockResolvedValue({ messageId: '<abc@gmail.com>' });
    vi.spyOn(gmailTransport, 'createTransporter').mockReturnValue({ sendMail });
    // force a fresh transporter for these credentials
    (gmailTransport as unknown as { transporter: unknown }).transporter = null;

    const result = await resendTransport.send({
      to: 'customer@example.com',
      subject: 'Your booking is confirmed',
      html: '<p>Hi</p>',
      text: 'Hi',
      idempotencyKey: 'intake-1',
    });

    expect(result).toEqual({
      transport: 'gmail',
      providerMessageId: '<abc@gmail.com>',
      effectiveRecipient: 'customer@example.com',
      sandboxRedirected: false,
    });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.from).toBe('Extreme Sales & Services <extremess0121@gmail.com>');
    expect(mail.to).toBe('customer@example.com');
    expect(mail.replyTo).toBe('extremess0121@gmail.com');
    expect(mail.disableFileAccess).toBe(true);
    expect(mail.disableUrlAccess).toBe(true);
  });

  it('reports a wrong app password as a non-retryable, clearly worded error', async () => {
    useGmail();
    const sendMail = vi.fn().mockRejectedValue(Object.assign(new Error('Invalid login: 535'), { code: 'EAUTH', responseCode: 535 }));
    vi.spyOn(gmailTransport, 'createTransporter').mockReturnValue({ sendMail });
    (gmailTransport as unknown as { transporter: unknown }).transporter = null;

    await expect(
      resendTransport.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' })
    ).rejects.toMatchObject({ retryable: false, code: 'GMAIL_AUTH_FAILED' });
  });

  it('treats network and temporary SMTP failures as retryable, permanent 5xx as not', () => {
    expect(isRetryableSmtpError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryableSmtpError({ code: 'ECONNECTION' })).toBe(true);
    expect(isRetryableSmtpError({ responseCode: 421 })).toBe(true);
    expect(isRetryableSmtpError({ responseCode: 451 })).toBe(true);
    expect(isRetryableSmtpError({ responseCode: 550 })).toBe(false);
    expect(isRetryableSmtpError({ code: 'EAUTH', responseCode: 535 })).toBe(false);
  });

  it('refuses to fake-send in production when Gmail is selected but not configured', async () => {
    mutableEnv.EMAIL_TRANSPORT = 'gmail';
    mutableEnv.GMAIL_USER = undefined;
    mutableEnv.GMAIL_APP_PASSWORD = undefined;
    const savedNodeEnv = env.NODE_ENV;
    mutableEnv.NODE_ENV = 'production';
    (gmailTransport as unknown as { transporter: unknown }).transporter = null;
    try {
      await expect(
        resendTransport.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' })
      ).rejects.toBeInstanceOf(EmailDeliveryError);
    } finally {
      mutableEnv.NODE_ENV = savedNodeEnv;
    }
  });
});
