import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { verifyTechToken } from '../utils/techAuth.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedTechnician } from '../types/express.js';

export async function requireTechAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header. Bearer token required.');
    }

    const token = authHeader.substring(7).trim();
    const payload = verifyTechToken(token);

    if (!payload) {
      logger.warn('Technician token verification failed', { tokenSnippet: token.slice(0, 15) });
      throw new UnauthorizedError('Invalid or expired technician session.');
    }

    const supabase = getSupabaseClient();
    const { data: tech, error: techError } = await supabase
      .from('technicians')
      .select('id, technician_code, name, phone, status, is_active')
      .eq('id', payload.techId)
      .maybeSingle();

    if (techError || !tech) {
      logger.warn('Technician not found for token', { techId: payload.techId });
      throw new UnauthorizedError('Technician profile not found.');
    }

    if (!tech.is_active) {
      logger.warn('Inactive technician attempted access', { techId: tech.id });
      throw new ForbiddenError('Technician account is inactive. Please contact administration.');
    }

    req.technician = {
      id: tech.id,
      technicianCode: tech.technician_code,
      name: tech.name,
      phone: tech.phone,
      status: tech.status,
      isActive: tech.is_active,
    };

    next();
  } catch (err) {
    next(err);
  }
}

