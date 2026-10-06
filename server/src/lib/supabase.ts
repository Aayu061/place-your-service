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
    // Query a lightweight health ping (or count on profiles)
    const { error } = await client.from('profiles').select('id', { count: 'exact', head: true });
    const latencyMs = Date.now() - start;

    if (error && error.code !== 'PGRST116') {
      // In case table does not exist yet prior to migration, error will indicate connectivity to PostgREST
      // We can inspect error: if it's connection error or PostgREST error
      logger.warn('Supabase ping returned error response', { error: error.message, code: error.code });
      return {
        connected: false,
        latencyMs,
        error: error.message,
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
