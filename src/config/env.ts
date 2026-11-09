/**
 * Place Your Service — Environment Configuration
 * Strictly ensures no private secrets are exposed to the client bundle.
 */

export interface AppConfig {
  appName: string;
  appEnv: 'development' | 'staging' | 'production' | 'test';
  appVersion: string;
  supabase: {
    url: string;
    anonKey: string;
    isConfigured: boolean;
  };
  api: {
    baseUrl: string;
  };
}

// Safe fallback placeholders for public client configuration (actual values provided via .env)
const DEFAULT_SUPABASE_URL = 'https://placeholder-project.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder_anon_key';

const isPlaceholder = (val?: string) => !val || val.includes('your-project-ref') || val.includes('placeholder');

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = !isPlaceholder(rawSupabaseUrl) ? rawSupabaseUrl! : DEFAULT_SUPABASE_URL;
const supabaseAnonKey = !isPlaceholder(rawSupabaseAnonKey) ? rawSupabaseAnonKey! : DEFAULT_SUPABASE_ANON_KEY;

const defaultApiBaseUrl = import.meta.env.PROD
  ? 'https://place-your-service-api.onrender.com'
  : 'http://localhost:5000';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl;

// Detect if real Supabase credentials have been provided (vs placeholders)
const isConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !isPlaceholder(supabaseUrl) &&
  !isPlaceholder(supabaseAnonKey)
);

export const config: AppConfig = {
  appName: import.meta.env.VITE_APP_NAME || 'Place Your Service',
  appEnv: (import.meta.env.VITE_APP_ENV as AppConfig['appEnv']) || 'development',
  appVersion: import.meta.env.VITE_APP_VERSION || '0.1.0',
  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    isConfigured,
  },
  api: {
    baseUrl: apiBaseUrl,
  },
};

