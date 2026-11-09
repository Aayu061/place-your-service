import crypto from 'crypto';
import { env } from '../config/env.js';

const PIN_SALT = 'pys-tech-salt-2026';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface TechTokenPayload {
  techId: string;
  technicianCode: string;
  phone: string;
  name: string;
  exp: number;
}

/**
 * Hashes a 4-digit to 6-digit numeric PIN using SHA-256 with static salt
 */
export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(`${pin}${PIN_SALT}`).digest('hex');
}

/**
 * Verifies a PIN against stored hash or fallback default '1234'
 */
export function verifyPin(pin: string, storedHash?: string | null): boolean {
  if (!storedHash) {
    // If no pin_hash set, default PIN is "1234"
    return pin === '1234';
  }
  const computed = hashPin(pin);
  if (computed.length !== storedHash.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(computed, 'utf-8'), Buffer.from(storedHash, 'utf-8'));
}

/**
 * Generates an HMAC-signed base64 token for technician authentication
 */
export function signTechToken(tech: { id: string; technicianCode: string; phone: string; name: string }): string {
  const payload: TechTokenPayload = {
    techId: tech.id,
    technicianCode: tech.technicianCode,
    phone: tech.phone,
    name: tech.name,
    exp: Date.now() + TOKEN_TTL_MS,
  };

  const secret = env.SUPABASE_SERVICE_ROLE_KEY || 'pys-fallback-secret-2026';
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  return `pys_tech_${data}.${signature}`;
}

/**
 * Verifies an HMAC-signed technician token and returns the payload if valid and unexpired
 */
export function verifyTechToken(tokenString: string): TechTokenPayload | null {
  if (!tokenString || !tokenString.startsWith('pys_tech_')) {
    return null;
  }

  const parts = tokenString.substring('pys_tech_'.length).split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [data, signature] = parts;
  const secret = env.SUPABASE_SERVICE_ROLE_KEY || 'pys-fallback-secret-2026';
  const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  try {
    const jsonStr = Buffer.from(data, 'base64url').toString('utf-8');
    const payload = JSON.parse(jsonStr) as TechTokenPayload;

    if (!payload.techId || !payload.exp || Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
