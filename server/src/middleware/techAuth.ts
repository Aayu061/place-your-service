import { Request, Response, NextFunction } from 'express';
import { AppError, UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { verifyTechToken, TechTokenScope } from '../utils/techAuth.js';
import { logger } from '../utils/logger.js';

export const PIN_CHANGE_REQUIRED_CODE = 'PIN_CHANGE_REQUIRED';

export class PinChangeRequiredError extends AppError {
  constructor() {
    super(403, PIN_CHANGE_REQUIRED_CODE, 'You must set a new PIN before continuing.');
  }
}

/**
 * Verifies the technician Bearer token against the database on every request:
 * signature + expiry, account exists and is active, token_version still current
 * (a PIN change/reset invalidates older tokens), and the token's scope.
 *
 * allowPinChangeScope: true only for the PIN-change endpoint. Everywhere else a
 * 'pin_change' token, or an account flagged pin_reset_required, gets 403 PIN_CHANGE_REQUIRED.
 */
function buildTechAuth(allowPinChangeScope: boolean) {
  return async function techAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or malformed Authorization header. Bearer token required.');
      }

      const token = authHeader.substring(7).trim();
      const payload = verifyTechToken(token); // throws 503 when technician auth is not configured

      if (!payload) {
        logger.warn('Technician token verification failed');
        throw new UnauthorizedError('Invalid or expired technician session.');
      }

      const supabase = getSupabaseClient();
      const { data: tech, error: techError } = await supabase
        .from('technicians')
        .select('id, technician_code, name, phone, status, is_active, token_version, pin_reset_required')
        .eq('id', payload.techId)
        .maybeSingle();

      if (techError || !tech) {
        logger.warn('Technician not found for token', { techId: payload.techId });
        throw new UnauthorizedError('Invalid or expired technician session.');
      }

      if (!tech.is_active) {
        logger.warn('Inactive technician attempted access', { techId: tech.id });
        throw new ForbiddenError('Technician account is inactive. Please contact administration.');
      }

      const currentVersion = Number(tech.token_version ?? 0);
      const tokenVersion = Number(payload.tv ?? 0);
      if (currentVersion !== tokenVersion) {
        logger.warn('Technician token revoked by token_version change', { techId: tech.id });
        throw new UnauthorizedError('Invalid or expired technician session.');
      }

      const scope: TechTokenScope = payload.scope ?? 'full';
      if (!allowPinChangeScope && (scope === 'pin_change' || tech.pin_reset_required === true)) {
        throw new PinChangeRequiredError();
      }

      req.technician = {
        id: tech.id,
        technicianCode: tech.technician_code,
        name: tech.name,
        phone: tech.phone,
        status: tech.status,
        isActive: tech.is_active,
      };
      res.locals.techTokenScope = scope;

      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireTechAuth = buildTechAuth(false);
/** Same checks, but also accepts the short-lived "set a new PIN" token. Use only on PATCH /tech/pin. */
export const requireTechAuthAllowPinChange = buildTechAuth(true);
