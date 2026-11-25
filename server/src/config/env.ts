import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file if present
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(5000),
  CORS_ORIGIN: z
    .string()
    .default(
      'https://place-your-service.vercel.app,https://extreme-sales-services.vercel.app,http://localhost:5000,http://localhost:3000'
    ),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10, 'SUPABASE_SERVICE_ROLE_KEY must be provided'),
  RESEND_API_KEY: z.string().min(10).optional(),
  RESEND_FROM_EMAIL: z
    .string()
    .regex(/^([^<>]+<\s*[^\s@<>]+@[^\s@<>]+\s*>|[^\s@<>]+@[^\s@<>]+)$/)
    .optional(),
  RESEND_REPLY_TO: z.string().email().optional(),
  RESEND_SANDBOX_OVERRIDE_TO: z.string().email().optional(),
  RESEND_WEBHOOK_SECRET: z.string().min(8).optional(),
  RESEND_INBOUND_DOMAIN: z.string().min(3).optional(),
  // Email transport: 'gmail' (SMTP with an app password, no domain needed) or 'resend' (verified domain).
  // When unset, Gmail is used if GMAIL_USER + GMAIL_APP_PASSWORD are present, otherwise Resend.
  EMAIL_TRANSPORT: z.enum(['gmail', 'resend']).optional(),
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().regex(/^[a-zA-Z]{16}$/, 'GMAIL_APP_PASSWORD must be the 16-letter Google app password').optional(),
  EMAIL_FROM_NAME: z.string().min(2).max(80).optional(),
  EMAIL_AUTO_SEND_REPORT_ON_VERIFY: z.enum(['true', 'false']).optional(),
  EMAIL_AUTO_SEND_AMC_REMINDERS: z.enum(['true', 'false']).optional(),
  EMAIL_AUTO_SEND_RECEIPT_ON_PAID: z.enum(['true', 'false']).optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  ESS_WEBHOOK_URL: z
    .string()
    .url('ESS_WEBHOOK_URL must be a valid URL')
    .optional(),
  ESS_WEBHOOK_SECRET: z.string().min(8).optional(),
  M2M_API_KEY: z.string().min(16).optional(),
  // Signs technician portal tokens. Must be at least 32 characters in production. It is not
  // validated here on purpose: a missing/short value must not crash the whole server; instead
  // technician login answers 503 (see utils/techAuth.ts). Outside production a dev-only secret is used.
  TECH_JWT_SECRET: z.string().optional(),
  // 32-byte key (base64) that encrypts integration signing secrets at rest. Required to create or
  // verify ESS keys; without it the signed /api/v1/ess routes answer 503.
  INTEGRATION_SECRET_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'INTEGRATION_SECRET_KEY must be 32 bytes, base64-encoded').optional(),
  // New ESS website endpoint that refreshes cached pages (POST, signed with the ESS_WEB key).
  // Unset until the new site is live: refresh events are then skipped.
  ESS_REVALIDATE_URL: z.string().url('ESS_REVALIDATE_URL must be a valid URL').optional(),
  // Non-production safety switch: comma list of addresses / @domains that may receive real email (see emailTransport).
  EMAIL_ALLOWED_RECIPIENTS: z.string().optional(),
});

export type ServerEnv = z.infer<typeof envSchema>;

function loadEnv(): ServerEnv {
  const isTest = process.env.NODE_ENV === 'test';

  const rawEnv = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || '5000',
    CORS_ORIGIN:
      process.env.CORS_ORIGIN ||
      'https://place-your-service.vercel.app,https://extreme-sales-services.vercel.app,http://localhost:5000,http://localhost:3000',
    SUPABASE_URL: process.env.SUPABASE_URL || (isTest ? 'https://test-placeholder.supabase.co' : undefined),
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY || (isTest ? 'mock-test-service-role-key-12345' : undefined),
    RESEND_API_KEY: process.env.RESEND_API_KEY?.trim() || undefined,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL?.trim() || undefined,
    RESEND_REPLY_TO: process.env.RESEND_REPLY_TO?.trim() || undefined,
    RESEND_SANDBOX_OVERRIDE_TO: process.env.RESEND_SANDBOX_OVERRIDE_TO?.trim() || undefined,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET?.trim() || undefined,
    RESEND_INBOUND_DOMAIN: process.env.RESEND_INBOUND_DOMAIN?.trim() || undefined,
    EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || undefined,
    GMAIL_USER: process.env.GMAIL_USER?.trim() || undefined,
    // Google shows app passwords in groups of 4 ("abcd efgh ijkl mnop"); accept them with spaces.
    GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '') || undefined,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME?.trim() || undefined,
    EMAIL_AUTO_SEND_REPORT_ON_VERIFY: process.env.EMAIL_AUTO_SEND_REPORT_ON_VERIFY?.trim() || undefined,
    EMAIL_AUTO_SEND_AMC_REMINDERS: process.env.EMAIL_AUTO_SEND_AMC_REMINDERS?.trim() || undefined,
    EMAIL_AUTO_SEND_RECEIPT_ON_PAID: process.env.EMAIL_AUTO_SEND_RECEIPT_ON_PAID?.trim() || undefined,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || '900000',
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || '100',
    ESS_WEBHOOK_URL:
      process.env.ESS_WEBHOOK_URL?.trim() ||
      (isTest ? 'https://extreme-sales-services-gh7s.onrender.com/api/webhooks/pys' : undefined),
    ESS_WEBHOOK_SECRET:
      process.env.ESS_WEBHOOK_SECRET?.trim() || (isTest ? 'test-only-ess-webhook-secret' : undefined),
    M2M_API_KEY:
      process.env.M2M_API_KEY?.trim() || (isTest ? 'test-only-m2m-api-key-12345' : undefined),
    TECH_JWT_SECRET: process.env.TECH_JWT_SECRET?.trim() || undefined,
    INTEGRATION_SECRET_KEY:
      process.env.INTEGRATION_SECRET_KEY?.trim() || (isTest ? Buffer.alloc(32, 7).toString('base64') : undefined),
    ESS_REVALIDATE_URL: process.env.ESS_REVALIDATE_URL?.trim() || undefined,
    EMAIL_ALLOWED_RECIPIENTS: process.env.EMAIL_ALLOWED_RECIPIENTS?.trim() || undefined,
  };

  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`[CRITICAL] Server environment validation failure: ${errorDetails}`);
  }

  assertEmailSafety(parsed.data);
  return parsed.data;
}

/**
 * A non-production server that holds real email credentials must name who may receive mail
 * (EMAIL_ALLOWED_RECIPIENTS), so a test or staging server can never email real customers.
 */
export function assertEmailSafety(e: Pick<ServerEnv, 'NODE_ENV' | 'GMAIL_USER' | 'GMAIL_APP_PASSWORD' | 'RESEND_API_KEY' | 'EMAIL_ALLOWED_RECIPIENTS'>): void {
  if (e.NODE_ENV !== 'development') return; // production sends normally; tests never send
  const hasCredentials = Boolean((e.GMAIL_USER && e.GMAIL_APP_PASSWORD) || e.RESEND_API_KEY);
  if (hasCredentials && !e.EMAIL_ALLOWED_RECIPIENTS) {
    throw new Error(
      '[CRITICAL] Email credentials are set outside production without EMAIL_ALLOWED_RECIPIENTS. Set it to the test inbox (or remove the credentials) so no real customer can be emailed.'
    );
  }
}

export const env = loadEnv();
