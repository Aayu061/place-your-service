import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { sendError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export function errorHandlerMiddleware(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'INTERNAL_SERVER_ERROR';
  const message =
    isAppError || env.NODE_ENV !== 'production'
      ? err.message
      : 'An unexpected internal server error occurred';
  const details = isAppError ? err.details : undefined;

  // Log error
  logger.error(`Error processing request: ${err.message}`, {
    requestId: req.id,
    path: req.originalUrl,
    method: req.method,
    statusCode,
    code,
    stack: env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  sendError(res, statusCode, code, message, details);
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(
    res,
    404,
    'NOT_FOUND',
    `Resource not found: ${req.method} ${req.originalUrl}`
  );
}
