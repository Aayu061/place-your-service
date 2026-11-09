/**
 * Structured Logger
 * Safe logging with secret redaction and correlation ID support
 */

import { sanitizeData } from './piiSanitizer.js';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

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
