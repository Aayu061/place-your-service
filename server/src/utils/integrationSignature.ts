import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Signing scheme for server-to-server calls (ESS website → PYS API).
 *
 * Headers:
 *   X-PYS-Key-Id     key identifier (not secret)
 *   X-PYS-Timestamp  unix seconds; must be within ±5 minutes of the PYS clock
 *   X-PYS-Nonce      16–128 random characters, never reused (replay protection)
 *   X-PYS-Signature  hex HMAC-SHA256(secret, canonical string)
 *
 * Canonical string (lines joined with "\n"):
 *   timestamp, nonce, HTTP method (upper case), path + query exactly as sent,
 *   hex SHA-256 of the raw request body ("" for no body)
 */
export const SIGNATURE_HEADERS = {
  keyId: 'x-pys-key-id',
  timestamp: 'x-pys-timestamp',
  nonce: 'x-pys-nonce',
  signature: 'x-pys-signature',
} as const;

export const MAX_CLOCK_SKEW_SECONDS = 300;

export function sha256Hex(body: Buffer | string | undefined | null): string {
  return createHash('sha256').update(body ?? '').digest('hex');
}

export function canonicalString(parts: {
  timestamp: string;
  nonce: string;
  method: string;
  pathWithQuery: string;
  body?: Buffer | string | null;
}): string {
  return [parts.timestamp, parts.nonce, parts.method.toUpperCase(), parts.pathWithQuery, sha256Hex(parts.body)].join('\n');
}

export function computeSignature(secret: string, canonical: string): string {
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

export function signaturesMatch(expectedHex: string, receivedHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(receivedHex)) return false;
  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(receivedHex.toLowerCase(), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Builds the headers a client sends. Used by tests and as the reference for the ESS client. */
export function signRequest(input: {
  keyId: string;
  secret: string;
  method: string;
  pathWithQuery: string;
  body?: string | Buffer | null;
  timestamp?: number;
  nonce?: string;
}): Record<string, string> {
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const nonce = input.nonce ?? randomBytes(16).toString('hex');
  const signature = computeSignature(
    input.secret,
    canonicalString({ timestamp, nonce, method: input.method, pathWithQuery: input.pathWithQuery, body: input.body })
  );
  return {
    'X-PYS-Key-Id': input.keyId,
    'X-PYS-Timestamp': timestamp,
    'X-PYS-Nonce': nonce,
    'X-PYS-Signature': signature,
  };
}
