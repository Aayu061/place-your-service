/**
 * Structured Logger
 * Safe logging with secret redaction and correlation ID support
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'secret',
  'service_role_key',
  'supabase_service_role_key',
  'apikey',
  'cookie',
  'credit_card',
  'cvv',
]);

function sanitizeData(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeData);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function formatLogMessage(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): string {
  const timestamp = new Date().toISOString();
  const sanitizedMeta = meta ? sanitizeData(meta) : undefined;
  const payload = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...(sanitizedMeta && typeof sanitizedMeta === 'object' ? sanitizedMeta : {}),
  };

  return JSON.stringify(payload);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(formatLogMessage('info', message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(formatLogMessage('warn', message, meta));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(formatLogMessage('error', message, meta));
  },
  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLogMessage('debug', message, meta));
    }
  },
};
