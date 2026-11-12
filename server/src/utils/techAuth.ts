import crypto from 'crypto';
import { env } from '../config/env.js';

const LEGACY_PIN_SALT = 'pys-tech-salt-2026';
const SCRYPT_PREFIX = 'scrypt$';
const SCRYPT_KEY_BYTES = 32;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface TechTokenPayload {
  techId: string;
  technicianCode: string;
  phone: string;
  name: string;
  exp: number;
}

function getTechTokenSecret(): string {
  return env.TECH_JWT_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Hashes a 4-digit to 6-digit numeric PIN using scrypt with a unique random per-record salt.
 */
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, SCRYPT_KEY_BYTES).toString('hex');
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}

/**
 * Verifies a PIN against a stored scrypt (or legacy SHA-256) hash.
 * Fails closed when storedHash is missing or malformed.
 */
export function verifyPin(pin: string, storedHash?: string | null): boolean {
  if (!storedHash) {
    return false;
  }

  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) {
      return false;
    }
    const [, salt, expectedHex] = parts;
    if (!salt || !/^[a-f0-9]+$/i.test(expectedHex) || expectedHex.length !== SCRYPT_KEY_BYTES * 2) {
      return false;
    }
    const derived = crypto.scryptSync(pin, salt, SCRYPT_KEY_BYTES);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(derived, expected);
  }

  // Legacy 64-char SHA-256 hex compatibility for existing technician records
  if (!/^[a-f0-9]{64}$/i.test(storedHash)) {
    return false;
  }
  const legacyComputed = crypto.createHash('sha256').update(`${pin}${LEGACY_PIN_SALT}`).digest('hex');
  const legacyBuf = Buffer.from(legacyComputed, 'utf-8');
  const storedBuf = Buffer.from(storedHash.toLowerCase(), 'utf-8');
  return legacyBuf.length === storedBuf.length && crypto.timingSafeEqual(legacyBuf, storedBuf);
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

  const secret = getTechTokenSecret();
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
  if (!data || !signature) {
    return null;
  }

  const secret = getTechTokenSecret();
  const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
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
