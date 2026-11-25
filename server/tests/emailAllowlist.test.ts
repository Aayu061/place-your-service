import { describe, it, expect, vi, afterEach } from 'vitest';
import { env, assertEmailSafety } from '../src/config/env.js';
import {
  gmailTransport,
  resendTransport,
  isRecipientAllowed,
  parseAllowedRecipients,
  EmailDeliveryError,
} from '../src/services/email/emailTransport.service.js';

const mutableEnv = env as Record<string, unknown>;
const saved = {
  EMAIL_TRANSPORT: env.EMAIL_TRANSPORT,
  GMAIL_USER: env.GMAIL_USER,
  GMAIL_APP_PASSWORD: env.GMAIL_APP_PASSWORD,
  RESEND_API_KEY: env.RESEND_API_KEY,
  EMAIL_ALLOWED_RECIPIENTS: env.EMAIL_ALLOWED_RECIPIENTS,
};

const mail = (to: string) => ({ to, subject: 'Test', html: '<p>x</p>', text: 'x' });

describe('EMAIL_ALLOWED_RECIPIENTS (S04a email safety switch)', () => {
  afterEach(() => {
    Object.assign(mutableEnv, saved);
    vi.restoreAllMocks();
  });

  it('matching: exact address, plus-tags ignored, @domain entries, unset = no restriction', () => {
    const allow = parseAllowedRecipients(' Test.Inbox@Gmail.com , @example.org ');
    expect(isRecipientAllowed('test.inbox@gmail.com', allow)).toBe(true);
    expect(isRecipientAllowed('test.inbox+e2e-abc@gmail.com', allow)).toBe(true);
    expect(isRecipientAllowed('Customer <test.inbox+x@gmail.com>', allow)).toBe(true);
    expect(isRecipientAllowed('someone@example.org', allow)).toBe(true);
    expect(isRecipientAllowed('real.customer@gmail.com', allow)).toBe(false);
    expect(isRecipientAllowed('test.inbox@gmail.com.evil.com', allow)).toBe(false);
    expect(isRecipientAllowed('not-an-address', allow)).toBe(false);
    expect(isRecipientAllowed('anyone@anywhere.com', [])).toBe(true);
  });

  it('Gmail: a recipient outside the list is refused, never sent, and not retried', async () => {
    mutableEnv.EMAIL_TRANSPORT = undefined;
    mutableEnv.GMAIL_USER = 'extremess0121@gmail.com';
    mutableEnv.GMAIL_APP_PASSWORD = 'abcdefghijklmnop';
    mutableEnv.EMAIL_ALLOWED_RECIPIENTS = 'test.inbox@gmail.com';
    const sendMail = vi.fn().mockResolvedValue({ messageId: '<id@gmail.com>' });
    vi.spyOn(gmailTransport, 'createTransporter').mockReturnValue({ sendMail });
    (gmailTransport as unknown as { transporter: unknown }).transporter = null;

    const err = await resendTransport.send(mail('real.customer@gmail.com')).catch((e) => e);
    expect(err).toBeInstanceOf(EmailDeliveryError);
    expect(err.code).toBe('BLOCKED_BY_ALLOWLIST');
    expect(err.retryable).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();

    const ok = await resendTransport.send(mail('test.inbox+e2e-1@gmail.com'));
    expect(ok.transport).toBe('gmail');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('Resend: a recipient outside the list is refused before the provider is called', async () => {
    mutableEnv.EMAIL_TRANSPORT = 'resend';
    mutableEnv.RESEND_API_KEY = 're_test_key_1234567890';
    mutableEnv.EMAIL_ALLOWED_RECIPIENTS = '@example.org';
    const err = await resendTransport.send(mail('real.customer@gmail.com')).catch((e) => e);
    expect(err).toBeInstanceOf(EmailDeliveryError);
    expect(err.code).toBe('BLOCKED_BY_ALLOWLIST');
  });

  it('a development server with email credentials but no allow-list refuses to start', () => {
    const base = { NODE_ENV: 'development' as const, GMAIL_USER: undefined, GMAIL_APP_PASSWORD: undefined, RESEND_API_KEY: undefined, EMAIL_ALLOWED_RECIPIENTS: undefined };
    expect(() => assertEmailSafety({ ...base, RESEND_API_KEY: 're_x' })).toThrow(/EMAIL_ALLOWED_RECIPIENTS/);
    expect(() => assertEmailSafety({ ...base, GMAIL_USER: 'a@b.com', GMAIL_APP_PASSWORD: 'abcdefghijklmnop' })).toThrow(/EMAIL_ALLOWED_RECIPIENTS/);
    expect(() => assertEmailSafety({ ...base, RESEND_API_KEY: 're_x', EMAIL_ALLOWED_RECIPIENTS: 'me@b.com' })).not.toThrow();
    expect(() => assertEmailSafety(base)).not.toThrow(); // capture-only (no credentials) is always safe
    expect(() => assertEmailSafety({ ...base, NODE_ENV: 'production', RESEND_API_KEY: 're_x' })).not.toThrow();
  });
});
