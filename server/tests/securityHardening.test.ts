import crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { hashPin, verifyPin, signTechToken, verifyTechToken } from '../src/utils/techAuth.js';
import { sanitizePostgrestFilterTerm } from '../src/utils/postgrestFilter.js';

describe('Security Hardening Regressions', () => {
  describe('Technician PIN Hashing & Verification (techAuth)', () => {
    it('hashes PINs with unique random scrypt salts and verifies correctly', () => {
      const hashA = hashPin('4829');
      const hashB = hashPin('4829');

      expect(hashA.startsWith('scrypt$')).toBe(true);
      expect(hashB.startsWith('scrypt$')).toBe(true);
      expect(hashA).not.toBe(hashB);

      expect(verifyPin('4829', hashA)).toBe(true);
      expect(verifyPin('4829', hashB)).toBe(true);
      expect(verifyPin('0000', hashA)).toBe(false);
    });

    it('fails closed when storedHash is null, undefined, or malformed (no default 1234 backdoor)', () => {
      expect(verifyPin('1234', null)).toBe(false);
      expect(verifyPin('1234', undefined)).toBe(false);
      expect(verifyPin('1234', '')).toBe(false);
      expect(verifyPin('1234', 'scrypt$bad$nothex')).toBe(false);
    });

    it('verifies legacy SHA-256 salted PIN hashes for seamless migration', () => {
      const legacyHash = crypto.createHash('sha256').update('5678pys-tech-salt-2026').digest('hex');
      expect(verifyPin('5678', legacyHash)).toBe(true);
      expect(verifyPin('1234', legacyHash)).toBe(false);
    });

    it('signs and verifies technician tokens and rejects tampered payloads', () => {
      const token = signTechToken({
        id: '11111111-1111-1111-1111-111111111111',
        technicianCode: 'TECH-0001',
        phone: '9876543210',
        name: 'Test Tech',
      });

      const decoded = verifyTechToken(token);
      expect(decoded?.technicianCode).toBe('TECH-0001');

      const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
      expect(verifyTechToken(tampered)).toBeNull();
    });
  });

  describe('PostgREST Filter Sanitization', () => {
    it('strips PostgREST filter delimiters and wildcards while keeping normal search tokens', () => {
      expect(sanitizePostgrestFilterTerm('  john.doe@example.com  ')).toBe('john.doe@example.com');
      expect(sanitizePostgrestFilterTerm('+91 98765-43210')).toBe('+91 98765-43210');
      expect(sanitizePostgrestFilterTerm('abc,id.eq.123,(or)%_*;"\'\\')).toBe('abcid.eq.123or');
    });

    it('rejects PostgREST delimiter characters on POST /api/v1/tech/login identifier', async () => {
      const res = await request(app)
        .post('/api/v1/tech/login')
        .send({
          identifier: 'TECH-001,is_active.eq.true',
          pin: '1234',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
