import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requestLoggerMiddleware } from './middleware/logger.js';
import { errorHandlerMiddleware, notFoundHandler } from './middleware/errorHandler.js';
import apiV1Router from './routes/index.js';

export function createApp(): Express {
  const app = express();

  // 1. Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
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
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    })
  );

  // 3. Body Parsing
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

  // 7. Versioned API Routes
  app.use('/api/v1', apiV1Router);

  // 8. 404 Not Found Handler
  app.use(notFoundHandler);

  // 9. Centralized Error Handler
  app.use(errorHandlerMiddleware);

  return app;
}

export const app = createApp();
export default app;
