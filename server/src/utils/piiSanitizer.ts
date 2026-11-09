/**
 * PII and Credential Sanitizer
 * Prevents sensitive personal identification, credentials, and financial details
 * from leaking into system logs, error responses, or trace telemetry.
 */

export const SENSITIVE_KEY_PATTERNS = [
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'secret',
  'service_role_key',
  'supabase_service_role_key',
  'apikey',
  'api_key',
  'cookie',
  'credit_card',
  'card_number',
  'cvv',
  'account_number',
  'accountnumber',
  'bank_account',
  'pin',
  'upi_pin',
  'resend_api_key',
];

const SENSITIVE_KEY_SET = new Set(SENSITIVE_KEY_PATTERNS);

/**
 * Recursively redacts sensitive keys from objects, arrays, and JSON payloads.
 */
export function sanitizeData(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      // Redact inline Bearer tokens
      if (obj.toLowerCase().startsWith('bearer eyj')) {
        return 'Bearer [REDACTED]';
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeData(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    const isSensitive =
      SENSITIVE_KEY_SET.has(lowerKey) ||
      SENSITIVE_KEY_PATTERNS.some((pattern) => lowerKey.includes(pattern));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value);
    } else if (typeof value === 'string' && value.toLowerCase().startsWith('bearer eyj')) {
      sanitized[key] = 'Bearer [REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Partially masks a phone number for privacy display (e.g. +91 79778 05245 -> +91 79*****245)
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8) return trimmed;

  const visibleStart = trimmed.startsWith('+91') ? 6 : 3;
  const visibleEnd = 3;
  if (trimmed.length <= visibleStart + visibleEnd) return trimmed;

  const start = trimmed.slice(0, visibleStart);
  const end = trimmed.slice(-visibleEnd);
  const middle = '*'.repeat(trimmed.length - visibleStart - visibleEnd);
  return `${start}${middle}${end}`;
}

/**
 * Partially masks an email address for privacy display (e.g. extremess0121@gmail.com -> e***1@gmail.com)
 */
export function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@')) return email || '';
  const [localPart, domain] = email.split('@');
  if (localPart.length < 2) {
    return `*@${domain}`;
  }
  if (localPart.length === 2) {
    return `${localPart[0]}*@${domain}`;
  }
  return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`;
}
