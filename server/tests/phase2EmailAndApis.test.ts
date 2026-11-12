import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { env } from '../src/config/env.js';
import {
  extractEmailAddress,
  isSandboxSender,
  isRetryableResendError,
  getResolvedEmailConfig,
  resendTransport,
} from '../src/services/email/emailTransport.service.js';
import {
  buildPaymentInvoiceTemplate,
  buildAmcExpiryReminderTemplate,
  buildDiagnosticTestEmailTemplate,
} from '../src/services/email/emailTemplates.service.js';
import { gstLookupService } from '../src/services/gstLookup.service.js';
import { mediaStorageService } from '../src/services/mediaStorage.service.js';
import { technicianPortalService } from '../src/services/technicianPortal.service.js';
import { hashPin, verifyPin } from '../src/utils/techAuth.js';

describe('Phase 2: Unified Resend Email, Webhooks, Media Storage & API Gaps', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Email Transport & Sandbox Configuration', () => {
    it('correctly parses formatted sender addresses and identifies @resend.dev sandbox mode', () => {
      expect(extractEmailAddress('Extreme Sales <onboarding@resend.dev>')).toBe('onboarding@resend.dev');
      expect(isSandboxSender('Extreme Sales <onboarding@resend.dev>')).toBe(true);
      expect(isSandboxSender('service@extremesales.in')).toBe(false);
    });

    it('classifies HTTP 429/5xx as retryable and 4xx validation/sandbox errors as non-retryable', () => {
      expect(isRetryableResendError(429, 'rate limit')).toBe(true);
      expect(isRetryableResendError(502, 'bad gateway')).toBe(true);
      expect(isRetryableResendError(403, 'You can only send testing emails to your own email address')).toBe(false);
      expect(isRetryableResendError(422, 'invalid from domain')).toBe(false);
    });

    it('returns non-secret diagnostic status snapshot', () => {
      const config = getResolvedEmailConfig();
      expect(config).toHaveProperty('fromEmail');
      expect(config).toHaveProperty('replyTo');
      expect(config).toHaveProperty('sandboxMode');
      expect(config).toHaveProperty('automation');
      expect((config as Record<string, unknown>).apiKey).toBeUndefined();
    });

    it('throws EmailDeliveryError in production when RESEND_API_KEY is absent instead of faking dev ID', async () => {
      const origEnv = env.NODE_ENV;
      const origKey = env.RESEND_API_KEY;
      (env as any).NODE_ENV = 'production';
      (env as any).RESEND_API_KEY = undefined;
      try {
        await expect(
          resendTransport.send({
            to: 'customer@example.com',
            subject: 'Test',
            html: '<p>Hi</p>',
            text: 'Hi',
          })
        ).rejects.toThrow(/RESEND_API_KEY/i);
      } finally {
        (env as any).NODE_ENV = origEnv;
        (env as any).RESEND_API_KEY = origKey;
      }
    });
  });

  describe('Branded Email Templates', () => {
    it('escapes HTML and includes UPI link when invoice balance > 0', () => {
      const tpl = buildPaymentInvoiceTemplate({
        paymentNumber: 'PAY-2026-001',
        status: 'PARTIAL',
        createdAt: '2026-11-12T10:00:00Z',
        totalDue: 2360,
        totalPaid: 1000,
        balance: 1360,
        customerName: 'Acme <Corp>',
        customerCode: 'CUST-1',
        customerPhone: '9876543210',
        customerAddress: 'Chembur, Mumbai',
        serviceInfo: 'Jet Service',
        transactions: [],
      });

      expect(tpl.subject).toContain('PAY-2026-001');
      expect(tpl.html).toContain('Acme &lt;Corp&gt;');
      expect(tpl.html).toContain('upi://pay?pa=7977805245-1@okbizaxis');
      expect(tpl.html).toContain('27ANTPP9778J1ZO');
    });

    it('builds AMC expiry reminder and diagnostic test templates cleanly', () => {
      const amc = buildAmcExpiryReminderTemplate({
        contractNumber: 'AMC-2026-77',
        customerName: 'Blue Star Client',
        endDate: '2026-12-12',
        daysRemaining: 7,
      });
      expect(amc.subject).toContain('[7d Left]');
      expect(amc.html).toContain('FINAL RENEWAL NOTICE');

      const diag = buildDiagnosticTestEmailTemplate({
        recipientEmail: 'admin@example.com',
        fromEmail: 'onboarding@resend.dev',
        replyTo: 'extremess0121@gmail.com',
        sandboxMode: true,
      });
      expect(diag.subject).toContain('Diagnostic Test');
      expect(diag.html).toContain('Resend Sandbox');
    });
  });

  describe('Webhook Signature Verification Endpoint', () => {
    it('rejects POST /api/v1/webhooks/resend with 400 when signature/secret is missing', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/resend')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ type: 'email.delivered', data: { email_id: 'msg_1' } }));

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GSTIN Honest Decode, Media Storage & Tech PIN Update', () => {
    it('marks offline GSTIN lookup as LOCAL_DECODE without placeholder company strings', async () => {
      const result = await gstLookupService.lookupGstin('27ANTPP9778J1ZO');
      expect(result.isValid).toBe(true);
      expect(result.verificationSource).toBe('LOCAL_DECODE');
      expect(result.legalName).toBe('');
      expect(result.tradeName).toBe('');
    });

    it('creates signed upload URL for valid image MIME type and rejects invalid types', async () => {
      const createSignedUploadUrl = vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.example/signed-upload', token: 'tok-123' },
        error: null,
      });
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({
        storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
      } as any);

      const res = await mediaStorageService.createSignedUploadUrl({
        scope: 'before-photo',
        mimeType: 'image/jpeg',
        entityRef: 'sched-1',
      });
      expect(res.bucket).toBe('service-report-media');
      expect(res.signedUrl).toBe('https://storage.example/signed-upload');
      expect(res.path).toMatch(/^before-photo\/\d{4}-\d{2}-\d{2}\/sched-1\/.+\.jpg$/);

      await expect(
        mediaStorageService.createSignedUploadUrl({
          scope: 'before-photo',
          mimeType: 'application/pdf',
        })
      ).rejects.toThrow(/Unsupported image format/i);
    });

    it('updates technician PIN only after verifying current PIN', async () => {
      const updateEq = vi.fn().mockResolvedValue({ error: null });
      const updateFn = vi.fn(() => ({ eq: updateEq }));
      const currentHash = hashPin('1234');

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'tech-1', pin_hash: currentHash },
            error: null,
          }),
          update: updateFn,
        })),
      } as any);

      await expect(
        technicianPortalService.updatePin('tech-1', '9999', '5678')
      ).rejects.toThrow(/incorrect/i);

      const res = await technicianPortalService.updatePin('tech-1', '1234', '5678');
      expect(res.updated).toBe(true);
      expect(updateFn).toHaveBeenCalledTimes(1);
      const updatedPayload = updateFn.mock.calls[0][0] as { pin_hash: string };
      expect(updatedPayload.pin_hash.startsWith('scrypt$')).toBe(true);
      expect(verifyPin('5678', updatedPayload.pin_hash)).toBe(true);
    });
  });
});

