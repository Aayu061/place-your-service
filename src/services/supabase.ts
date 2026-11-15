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

  // Pre-flight check: If stored Supabase session in localStorage has expired or is malformed,
  // purge it gracefully to prevent redundant 400 Bad Request refresh_token network failures.
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.expires_at) {
            const expiryMs = parsed.expires_at * 1000;
            // If the token is already expired, purge it to prevent redundant 400 Bad Request refresh_token network failures
            if (expiryMs < Date.now()) {
              window.localStorage.removeItem(storageKey);
            }
          }
        } catch {
          window.localStorage.removeItem(storageKey);
        }
      }
    }
  } catch {
    // Ignore storage access errors (e.g. sandboxed iframes or private mode)
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
