import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { AuthenticatedUser, UserRole } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Authentication Middleware:
 * Verifies Supabase JWT token, loads profile and staff identity,
 * and attaches verified user context to req.user.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header. Bearer token required.');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedError('Authentication token cannot be empty.');
    }

    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      logger.warn('Token verification failed', { error: authError?.message });
      throw new UnauthorizedError('Invalid or expired authentication session.');
    }

    const authUser = authData.user;

    // Fetch associated profile and staff record
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', authUser.id)
      .single();

    if (profileError || !profile) {
      logger.warn('User profile not found for authenticated token', { userId: authUser.id });
      throw new UnauthorizedError('User profile not found.');
    }

    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, role, is_active')
      .eq('profile_id', profile.id)
      .single();

    if (staffError || !staff) {
      logger.warn('Staff authorization record not found', { profileId: profile.id });
      throw new ForbiddenError('No authorized staff or admin role assigned to this account.');
    }

    if (!staff.is_active) {
      logger.warn('Inactive account attempted access', { staffId: staff.id });
      throw new ForbiddenError('Account is inactive. Contact system administrator.');
    }

    const userContext: AuthenticatedUser = {
      userId: authUser.id,
      email: profile.email,
      role: staff.role as UserRole,
      profileId: profile.id,
      staffId: staff.id,
      isActive: staff.is_active,
    };

    req.user = userContext;
    next();
  } catch (err) {
    next(err);
  }
}
