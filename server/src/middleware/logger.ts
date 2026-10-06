import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = req.startTime || Date.now();
  const { method, originalUrl, id } = req;

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
