import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { createApp } from '../src/app.js';
import { createAuthLimiter } from '../src/middleware/rateLimiters.js';
import { sanitizeData, maskPhone, maskEmail } from '../src/utils/piiSanitizer.js';

describe('API Security, Privacy & PII Hardening Suite', () => {
  describe('1. PII and Secret Sanitization Engine', () => {
    it('redacts sensitive credentials and banking details from nested objects', () => {
      const sensitivePayload = {
        username: 'admin_user',
        password: 'SuperSecretPassword123!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
        apiKey: 'resend_live_1234567890',
        payment: {
          account_number: '123456789012',
          bank_account: 'HDFC0001234',
          card_number: '4111111111111234',
          cvv: '123',
          upi_pin: '9876',
        },
        metadata: {
          publicInfo: 'Safe to expose',
          service_role_key: 'secret-service-role-key',
        },
      };

      const sanitized = sanitizeData(sensitivePayload) as Record<string, any>;

      expect(sanitized.username).toBe('admin_user');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.payment.account_number).toBe('[REDACTED]');
      expect(sanitized.payment.bank_account).toBe('[REDACTED]');
      expect(sanitized.payment.card_number).toBe('[REDACTED]');
      expect(sanitized.payment.cvv).toBe('[REDACTED]');
      expect(sanitized.payment.upi_pin).toBe('[REDACTED]');
      expect(sanitized.metadata.publicInfo).toBe('Safe to expose');
      expect(sanitized.metadata.service_role_key).toBe('[REDACTED]');
    });

    it('redacts inline Bearer JWT strings', () => {
      const headerObj = {
        authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123',
        normalHeader: 'Basic dXNlcjpwYXNz',
      };

      const sanitized = sanitizeData(headerObj) as Record<string, any>;
      expect(sanitized.authHeader).toBe('Bearer [REDACTED]');
      expect(sanitized.normalHeader).toBe('Basic dXNlcjpwYXNz');
    });

    it('masks phone numbers to protect personal privacy', () => {
      expect(maskPhone('+91 79778 05245')).toMatch(/\+91\s*79\*{2,}.*245/);
      expect(maskPhone('9969423500')).toBe('996****500');
      expect(maskPhone('')).toBe('');
      expect(maskPhone(null)).toBe('');
    });

    it('masks emails to protect user identification', () => {
      expect(maskEmail('extremess0121@gmail.com')).toBe('e***1@gmail.com');
      expect(maskEmail('support@placeyourservice.com')).toBe('s***t@placeyourservice.com');
      expect(maskEmail('admin@test.com')).toBe('a***n@test.com');
      expect(maskEmail('ab@test.com')).toBe('a*@test.com');
      expect(maskEmail('')).toBe('');
      expect(maskEmail(null)).toBe('');
    });
  });

  describe('2. Authentication Rate Limiter (Brute-Force Protection)', () => {
    it('blocks repeated authentication attempts after threshold with 429 TOO_MANY_REQUESTS', async () => {
      const testApp = express();
      // Configure strict 3-attempt limiter for verification
      const strictLimiter = createAuthLimiter({
        windowMs: 60 * 1000,
        max: 3,
        message: 'Strict test rate limit exceeded',
      });

      testApp.post('/api/test-login', strictLimiter, (_req, res) => {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
      });

      // 1st attempt: 401
      const res1 = await request(testApp).post('/api/test-login');
      expect(res1.status).toBe(401);

      // 2nd attempt: 401
      const res2 = await request(testApp).post('/api/test-login');
      expect(res2.status).toBe(401);

      // 3rd attempt: 401
      const res3 = await request(testApp).post('/api/test-login');
      expect(res3.status).toBe(401);

      // 4th attempt: 429 Blocked
      const res4 = await request(testApp).post('/api/test-login');
      expect(res4.status).toBe(429);
      expect(res4.body.success).toBe(false);
      expect(res4.body.error.code).toBe('AUTH_RATE_LIMIT_EXCEEDED');
      expect(res4.body.error.message).toContain('Strict test rate limit exceeded');
    });
  });

  describe('3. HTTP Security Headers (Helmet Compliance)', () => {
    let app: Express;

    beforeEach(() => {
      app = createApp();
    });

    it('enforces strict anti-clickjacking frameguard (X-Frame-Options: DENY)', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('enforces MIME type sniffing defense (X-Content-Type-Options: nosniff)', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('enforces strict Referrer-Policy', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });
  });
});
