/**
 * Place Your Service — Supabase Client Foundation
 * Strictly uses public client configuration and anonymous key.
 * Service-role keys must NEVER be exposed here.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '@/config/env';

let supabaseClientInstance: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase client instance.
 * In Phase 0, if credentials are placeholders, it logs diagnostic status without crashing.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClientInstance) {
    return supabaseClientInstance;
  }

  const { url, anonKey } = config.supabase;

  if (!url || !anonKey || !config.supabase.isConfigured) {
    return null;
  }

  try {
    supabaseClientInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return supabaseClientInstance;
  } catch (error) {
    console.warn('[Supabase] Failed to initialize client:', error);
    return null;
  }
}

/**
 * Diagnostic helper to check connection readiness in local/dev environments.
 */
export async function checkSupabaseReadiness(): Promise<{
  configured: boolean;
  message: string;
}> {
  if (!config.supabase.isConfigured) {
    return {
      configured: false,
      message: 'Supabase credentials are placeholders in .env. Real backend connection will be configured in subsequent phase.',
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      configured: false,
      message: 'Failed to create Supabase client instance.',
    };
  }

  return {
    configured: true,
    message: 'Supabase client initialized successfully with anon public key.',
  };
}
