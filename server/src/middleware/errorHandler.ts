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
  const isAppError =
    err instanceof AppError ||
    (typeof err === 'object' && err !== null && 'statusCode' in err);
  const statusCode = isAppError ? (err as AppError).statusCode : 500;
  const code = isAppError ? (err as AppError).code : 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected internal server error occurred';
  const details = isAppError ? (err as AppError).details : undefined;


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
