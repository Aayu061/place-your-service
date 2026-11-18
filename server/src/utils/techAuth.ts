import crypto from 'crypto';
import { env } from '../config/env.js';
import { AppError } from './errors.js';
import { logger } from './logger.js';

const LEGACY_PIN_SALT = 'pys-tech-salt-2026';
const SCRYPT_PREFIX = 'scrypt$';
const SCRYPT_KEY_BYTES = 32;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** A "set your new PIN" token only lives long enough to finish that one screen. */
const PIN_CHANGE_TOKEN_TTL_MS = 15 * 60 * 1000;

export const MIN_TECH_JWT_SECRET_LENGTH = 32;
/** Only ever used outside production. Production fails closed when TECH_JWT_SECRET is missing. */
export const DEV_ONLY_TECH_JWT_SECRET = 'dev-and-test-only-technician-token-secret-not-for-production';

/** PINs that were handed out as defaults; logging in with one always forces a PIN change. */
export const KNOWN_DEFAULT_PINS: readonly string[] = ['1234'];

export type TechTokenScope = 'full' | 'pin_change';

export interface TechTokenPayload {
  techId: string;
  technicianCode: string;
  phone: string;
  name: string;
  exp: number;
  /** technicians.token_version at signing time; a PIN change/reset bumps it so old tokens stop working. */
  tv?: number;
  /** 'pin_change' tokens may only call the PIN-change endpoint. Missing = 'full' (older tokens). */
  scope?: TechTokenScope;
}

export class TechAuthNotConfiguredError extends AppError {
  constructor() {
    super(503, 'TECH_AUTH_NOT_CONFIGURED', 'Technician login is not configured');
  }
}

/**
 * Returns the HMAC secret for technician tokens, or null when technician auth must be refused.
 * Never falls back to the Supabase service-role key.
 */
export function resolveTechTokenSecret(
  nodeEnv: string = env.NODE_ENV,
  configured: string | undefined = env.TECH_JWT_SECRET
): string | null {
  const value = configured?.trim();
  if (value && value.length >= MIN_TECH_JWT_SECRET_LENGTH) {
    return value;
  }
  if (nodeEnv === 'production') {
    return null;
  }
  return DEV_ONLY_TECH_JWT_SECRET;
}

export function isTechAuthConfigured(): boolean {
  return resolveTechTokenSecret() !== null;
}

function getTechTokenSecretOrThrow(): string {
  const secret = resolveTechTokenSecret();
  if (!secret) {
    throw new TechAuthNotConfiguredError();
  }
  return secret;
}

/** Logged once when this module loads (i.e. at server start). Does not stop the server. */
function reportTechAuthConfiguration(): void {
  if (env.NODE_ENV === 'production' && !isTechAuthConfigured()) {
    logger.error(
      `TECH_JWT_SECRET is missing or shorter than ${MIN_TECH_JWT_SECRET_LENGTH} characters. ` +
        'Technician login is disabled (503) until it is set.'
    );
  } else if (env.NODE_ENV === 'development' && !(env.TECH_JWT_SECRET && env.TECH_JWT_SECRET.length >= MIN_TECH_JWT_SECRET_LENGTH)) {
    logger.warn('TECH_JWT_SECRET not set: using the development-only technician token secret.');
  }
}
reportTechAuthConfiguration();

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

const BLOCKED_NEW_PINS = new Set(['123456', '654321', '000000', '111111', '121212', '112233', '123123', '696969', '159753', '147258']);

function isSequential(pin: string): boolean {
  let asc = true;
  let desc = true;
  for (let i = 1; i < pin.length; i++) {
    const diff = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    if (diff !== 1) asc = false;
    if (diff !== -1) desc = false;
  }
  return asc || desc;
}

/**
 * Checks a technician's NEW PIN. Returns an error message, or null when the PIN is acceptable.
 * Rules: exactly 6 digits; not all the same digit; not a straight run (123456 / 987654);
 * not a common PIN; not the same as the previous PIN.
 */
export function validateNewTechPin(newPin: string, previous?: { pin?: string; hash?: string | null }): string | null {
  if (!/^\d{6}$/.test(newPin)) {
    return 'New PIN must be exactly 6 digits.';
  }
  if (/^(\d)\1{5}$/.test(newPin)) {
    return 'New PIN cannot be the same digit repeated.';
  }
  if (isSequential(newPin)) {
    return 'New PIN cannot be a run of digits like 123456.';
  }
  if (BLOCKED_NEW_PINS.has(newPin) || /^(\d\d)\1\1$/.test(newPin) || /^(\d{3})\1$/.test(newPin)) {
    return 'New PIN is too easy to guess. Choose a less common PIN.';
  }
  if (previous?.pin !== undefined && previous.pin === newPin) {
    return 'New PIN must be different from your old PIN.';
  }
  if (previous?.hash && verifyPin(newPin, previous.hash)) {
    return 'New PIN must be different from your old PIN.';
  }
  return null;
}

/**
 * Generates an HMAC-signed base64 token for technician authentication.
 * Throws TechAuthNotConfiguredError (503) when no acceptable secret is configured.
 */
export function signTechToken(
  tech: { id: string; technicianCode: string; phone: string; name: string; tokenVersion?: number | null },
  options: { scope?: TechTokenScope } = {}
): string {
  const scope: TechTokenScope = options.scope ?? 'full';
  const payload: TechTokenPayload = {
    techId: tech.id,
    technicianCode: tech.technicianCode,
    phone: tech.phone,
    name: tech.name,
    exp: Date.now() + (scope === 'pin_change' ? PIN_CHANGE_TOKEN_TTL_MS : TOKEN_TTL_MS),
    tv: Number(tech.tokenVersion ?? 0),
    scope,
  };

  const secret = getTechTokenSecretOrThrow();
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  return `pys_tech_${data}.${signature}`;
}

/**
 * Verifies an HMAC-signed technician token and returns the payload if valid and unexpired.
 * Throws TechAuthNotConfiguredError (503) when no acceptable secret is configured.
 */
export function verifyTechToken(tokenString: string): TechTokenPayload | null {
  const secret = getTechTokenSecretOrThrow();

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
    if (payload.scope !== undefined && payload.scope !== 'full' && payload.scope !== 'pin_change') {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
