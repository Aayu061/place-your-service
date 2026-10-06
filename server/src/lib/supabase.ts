import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let supabaseClientInstance: SupabaseClient | null = null;

/**
 * Returns the singleton server-side Supabase client initialized with the SERVICE_ROLE_KEY.
 * This client bypasses RLS when needed and must NEVER be exposed to the client or browser.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClientInstance) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      const msg = 'Missing Supabase server credentials. Backend database operations cannot proceed.';
      logger.error(msg);
      throw new Error(msg);
    }

    supabaseClientInstance = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    logger.info('Supabase server-side client initialized successfully');
  }

  return supabaseClientInstance;
}

/**
 * Health check helper to verify database connectivity.
 * Returns true if connection succeeds, false otherwise.
 */
export async function checkSupabaseConnection(): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const client = getSupabaseClient();
    // Query a lightweight health ping (or count on profiles) with limit 1
    const { error } = await client.from('profiles').select('id').limit(1);
    const latencyMs = Date.now() - start;

    if (error && error.code !== 'PGRST116') {
      // Log sanitized error message and code to assist operational diagnostics
      logger.warn('Supabase ping returned error response', { error: error.message || error.code, code: error.code });
      return {
        connected: false,
        latencyMs,
        error: error.message || error.code || 'Database ping error',
      };
    }

    return {
      connected: true,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : 'Unknown database connection error';
    logger.error('Supabase connection check failed with exception', { error: errorMsg });
    return {
      connected: false,
      latencyMs,
      error: errorMsg,
    };
  }
}
