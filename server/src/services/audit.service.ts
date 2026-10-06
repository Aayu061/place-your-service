import { getSupabaseClient } from '../lib/supabase.js';
import { logger } from '../utils/logger.js';

export interface LogActivityParams {
  actorProfileId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Sanitizes details payload so that credentials or secrets are never logged.
 */
function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> {
  if (!details) return {};
  const sanitized = { ...details };
  const sensitiveKeys = ['password', 'token', 'accessToken', 'refreshToken', 'secret'];
  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      delete sanitized[key];
    }
  }
  return sanitized;
}

/**
 * Audit Logging Service:
 * Persists auditable operational events into `activity_logs`.
 * Non-blocking: logs warnings on failure rather than failing user operations.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const cleanDetails = sanitizeDetails(params.details);

    const { error } = await supabase.from('activity_logs').insert({
      actor_profile_id: params.actorProfileId || null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      details: cleanDetails,
      ip_address: params.ipAddress || null,
    });

    if (error) {
      logger.warn('Failed to insert activity log into database', {
        action: params.action,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn('Exception during activity log write', {
      action: params.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
