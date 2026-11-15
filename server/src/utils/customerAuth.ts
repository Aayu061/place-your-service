// server/src/utils/customerAuth.ts
// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER PORTAL AUTHENTICATION & HMAC TOKEN UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { env } from '../config/env.js';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days session for customers

export interface CustomerTokenPayload {
  customerId: string;
  customerCode: string;
  phone: string;
  name: string;
  exp: number;
}

function getCustomerTokenSecret(): string {
  return env.SUPABASE_SERVICE_ROLE_KEY || 'pys-customer-secret-key-2026';
}

/**
 * Normalizes an Indian phone number (removes +91, 0 prefix, spaces, dashes)
 * Returns the standard 10-digit number
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.substring(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.substring(1);
  }
  return digits;
}

/**
 * Signs a customer session token with HMAC-SHA256
 */
export function generateCustomerToken(customer: {
  id: string;
  customerCode: string;
  phone: string;
  name: string;
}): string {
  const payload: CustomerTokenPayload = {
    customerId: customer.id,
    customerCode: customer.customerCode,
    phone: normalizePhone(customer.phone),
    name: customer.name,
    exp: Date.now() + TOKEN_TTL_MS,
  };

  const secret = getCustomerTokenSecret();
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  return `pys_cust_${data}.${signature}`;
}

/**
 * Verifies an HMAC-signed customer token and returns payload if valid and unexpired
 */
export function verifyCustomerToken(tokenString: string): CustomerTokenPayload | null {
  if (!tokenString || !tokenString.startsWith('pys_cust_')) {
    return null;
  }

  const parts = tokenString.substring('pys_cust_'.length).split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [data, signature] = parts;
  if (!data || !signature) {
    return null;
  }

  const secret = getCustomerTokenSecret();
  const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const jsonStr = Buffer.from(data, 'base64url').toString('utf-8');
    const payload = JSON.parse(jsonStr) as CustomerTokenPayload;

    if (!payload.customerId || !payload.exp || Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
