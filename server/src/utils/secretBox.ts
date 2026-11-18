import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * AES-256-GCM encryption for secrets stored in the database (integration signing keys).
 * Format: v1.<iv b64url>.<auth tag b64url>.<ciphertext b64url>
 */
function masterKey(): Buffer {
  const raw = env.INTEGRATION_SECRET_KEY;
  if (!raw) throw new Error('INTEGRATION_SECRET_KEY is not configured');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('INTEGRATION_SECRET_KEY must be 32 bytes');
  return key;
}

export function isSecretBoxConfigured(): boolean {
  return Boolean(env.INTEGRATION_SECRET_KEY);
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, ct] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !ct) throw new Error('Unsupported sealed secret format');
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
