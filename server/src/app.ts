import express, { Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requestLoggerMiddleware } from './middleware/logger.js';
import { errorHandlerMiddleware, notFoundHandler } from './middleware/errorHandler.js';
import apiV1Router from './routes/index.js';
import webhookRouter from './routes/webhook.routes.js';

export function createApp(): Express {
  const app = express();

  // Trust first proxy hop (Render / Cloudflare / reverse proxy) for accurate IP resolution in express-rate-limit
  app.set('trust proxy', 1);

  // Compress JSON/text API responses while skipping already-compressed binary exports
  app.use(
    compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        const ct = String(res.getHeader('Content-Type') || '');
        if (ct.includes('spreadsheetml') || ct.includes('octet-stream')) return false;
        return compression.filter(req, res);
      },
    })
  );

  // 1. Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'deny' },
      xContentTypeOptions: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    })
  );

  // 2. CORS Configuration
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);

        // Allow configured origins
        if (allowedOrigins.includes(origin) || (env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:'))) {
          return callback(null, true);
        }

        return callback(new Error(`CORS blocked: Origin ${origin} not permitted.`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-API-Key'],
      exposedHeaders: ['X-Request-Id'],
    })
  );

  // 3. Body Parsing
  app.use('/api/v1/webhooks', webhookRouter);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 4. Request Correlation ID
  app.use(requestIdMiddleware);

  // 5. Request Logging
  app.use(requestLoggerMiddleware);

  // 6. Global Rate Limiter
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Health check and readiness endpoints must never be blocked by API rate limiting
      const cleanPath = req.originalUrl.split('?')[0].replace(/\/+$/, '');
      return cleanPath === '/api/v1/health' || cleanPath === '/api/v1/health/ready' || cleanPath === '/health';
    },
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP. Please try again later.',
      },
    },
  });
  app.use('/api/', limiter);

  // 7. Root service status handlers for platform HTTP/HEAD probes (e.g., Render startup checks)
  app.head('/', (_req, res) => {
    res.status(200).end();
  });
  app.get('/', (_req, res) => {
    res.status(200).json({
      success: true,
      service: 'place-your-service-api',
      status: 'ok',
      health: '/api/v1/health',
    });
  });

  // 8. Versioned API Routes
  app.use('/api/v1', apiV1Router);

  // 9. 404 Not Found Handler
  app.use(notFoundHandler);

  // 10. Centralized Error Handler
  app.use(errorHandlerMiddleware);

  return app;
}

export const app = createApp();
export default app;
