import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { sendError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import { sanitizeData } from '../utils/piiSanitizer.js';
import { env } from '../config/env.js';
import { telemetryLogService } from '../services/telemetryLog.service.js';

export function errorHandlerMiddleware(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isAppError =
    err instanceof AppError ||
    (typeof err === 'object' && err !== null && 'statusCode' in err);
  const statusCode = isAppError ? (err as AppError).statusCode : 500;
  const code = isAppError ? (err as AppError).code : 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected internal server error occurred';
  const details = isAppError ? (err as AppError).details : undefined;
  const sanitizedDetails = details ? sanitizeData(details) : undefined;

  // Log error
  logger.error(`Error processing request: ${err.message}`, {
    requestId: req.id,
    path: req.originalUrl,
    method: req.method,
    statusCode,
    code,
    stack: env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  // Automatically feed 500 errors into telemetry and bug inspector
  if (statusCode >= 500) {
    telemetryLogService.recordCrash({
      service: 'PYS',
      errorName: err.name || 'InternalServerError',
      message: err.message || 'Unhandled 500 server error',
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      statusCode,
      context: {
        code,
        requestId: req.id,
        ip: req.ip,
      },
    }).catch(() => {});
  } else {
    telemetryLogService.addLog({
      id: `err-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      timestamp: new Date().toISOString(),
      service: 'PYS',
      level: 'WARN',
      category: 'HTTP_REQUEST_ERROR',
      message: `[${req.method} ${req.originalUrl}] ${statusCode} ${code}: ${message}`,
      details: sanitizedDetails,
    });
  }

  sendError(res, statusCode, code, message, sanitizedDetails);
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(
    res,
    404,
    'NOT_FOUND',
    `Resource not found: ${req.method} ${req.originalUrl}`
  );
}
