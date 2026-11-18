import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../lib/supabase.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export type EssRole = 'ESS_ADMIN' | 'ESS_STAFF';

export interface EssActor {
  profileId: string;
  email: string | null;
  name: string | null;
  roles: EssRole[];
  /** PYS Admin is automatically ESS Admin. */
  isPysAdmin: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    essActor?: EssActor;
  }
}

/** The ESS website forwards the signed-in person's Supabase access token in this header. */
export const ESS_ACTOR_HEADER = 'x-pys-actor-token';

/**
 * Resolves the person behind an ESS admin request. Runs AFTER requireIntegrationClient: the
 * request must be signed by the ESS server AND carry a valid user session, so neither a stolen
 * session alone nor the server key alone can act in the admin area.
 */
export async function resolveEssActor(token: string): Promise<EssActor> {
  const supabase = getSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) throw new UnauthorizedError('Your session has expired. Please sign in again.');

  const userId = authData.user.id;
  const [{ data: profile, error: profileError }, { data: grants, error: grantError }, { data: staff, error: staffError }] =
    await Promise.all([
      supabase.from('profiles').select('id, full_name, email').eq('id', userId).maybeSingle(),
      supabase.from('app_role_grants').select('role').eq('profile_id', userId).is('revoked_at', null),
      supabase.from('staff').select('role, is_active').eq('profile_id', userId).maybeSingle(),
    ]);
  if (profileError || grantError || staffError) {
    throw new Error(`Failed to load ESS roles: ${(profileError || grantError || staffError)!.message}`);
  }
  if (!profile) throw new ForbiddenError('This account has no access to the ESS admin area.');

  const isPysAdmin = Boolean(staff && (staff as any).is_active && (staff as any).role === 'ADMIN');
  const roles = new Set<EssRole>(((grants ?? []) as Array<{ role: EssRole }>).map((g) => g.role));
  if (isPysAdmin) roles.add('ESS_ADMIN');
  if (roles.size === 0) throw new ForbiddenError('This account has no access to the ESS admin area.');

  return {
    profileId: (profile as any).id,
    email: (profile as any).email ?? authData.user.email ?? null,
    name: (profile as any).full_name ?? null,
    roles: [...roles].sort(),
    isPysAdmin,
  };
}

/** Requires an ESS Admin or ESS Staff session (any of `roles`; ESS_ADMIN always passes). */
export function requireEssRole(...roles: EssRole[]) {
  const allowed = new Set<EssRole>(roles.length ? roles : ['ESS_ADMIN', 'ESS_STAFF']);
  allowed.add('ESS_ADMIN');
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.essActor) {
        const raw = req.headers[ESS_ACTOR_HEADER];
        const token = (Array.isArray(raw) ? raw[0] : raw ?? '').trim();
        if (!token) throw new UnauthorizedError('Please sign in to the ESS admin area.');
        req.essActor = await resolveEssActor(token);
      }
      if (!req.essActor.roles.some((r) => allowed.has(r))) {
        logger.warn('ESS admin action refused', { profileId: req.essActor.profileId, path: req.originalUrl.split('?')[0] });
        throw new ForbiddenError('Only an ESS Admin can do this.');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
