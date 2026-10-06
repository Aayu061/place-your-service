import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/index.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Role Authorization Middleware:
 * Enforces server-side role validation against the verified req.user context.
 * Never trusts client-submitted roles or body properties.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required before role authorization.'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Role access denied', {
        userId: req.user.userId,
        currentRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.originalUrl,
      });
      return next(
        new ForbiddenError(
          `Access denied: requires one of the following roles [${allowedRoles.join(', ')}].`
        )
      );
    }

    next();
  };
}
