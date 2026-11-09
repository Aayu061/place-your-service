import rateLimit, { Options } from 'express-rate-limit';
import { Request, Response } from 'express';

export interface RateLimiterCustomOptions {
  windowMs?: number;
  max?: number;
  message?: string;
}

/**
 * Creates an authentication rate limiter designed to prevent credential stuffing
 * and brute-force password guessing on login endpoints.
 */
export function createAuthLimiter(options?: RateLimiterCustomOptions) {
  const windowMs = options?.windowMs ?? 15 * 60 * 1000; // 15 minutes
  // In tests, allow higher default so unrelated test suites sharing 127.0.0.1 aren't throttled
  const max = options?.max ?? (process.env.NODE_ENV === 'test' ? 50 : 10);

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'AUTH_RATE_LIMIT_EXCEEDED',
          message:
            options?.message ||
            'Too many authentication attempts from this IP address. Please try again after 15 minutes.',
        },
      });
    },
  });
}

/**
 * Default singleton authLimiter applied to POST /api/v1/auth/login
 */
export const authLimiter = createAuthLimiter();

