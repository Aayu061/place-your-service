import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { redactUrl } from '../utils/safeUrl.js';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = req.startTime || Date.now();
  const { method, id } = req;
  // Logs get a redacted copy only; the real req.originalUrl is never changed.
  const originalUrl = redactUrl(req.originalUrl);

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;

    const logMeta = {
      requestId: id,
      method,
      path: originalUrl,
      statusCode,
      durationMs,
      userAgent: req.headers['user-agent'] || 'unknown',
    };

    // Suppress successful liveness health checks to prevent log flooding in production
    const pathOnly = originalUrl.split('?')[0];
    const isLivenessPing = pathOnly === '/api/v1/health' || pathOnly === '/health';
    if (isLivenessPing && statusCode < 400) {
      return;
    }

    if (statusCode >= 500) {
      logger.error(`HTTP ${method} ${originalUrl} failed with status ${statusCode}`, logMeta);
    } else if (statusCode >= 400) {
      logger.warn(`HTTP ${method} ${originalUrl} client error ${statusCode}`, logMeta);
    } else {
      logger.info(`HTTP ${method} ${originalUrl} ${statusCode} [${durationMs}ms]`, logMeta);
    }
  });

  next();
}
