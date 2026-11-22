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
  /** Plain public address of the ESS website admin. Never carries tokens or sessions. */
  essAdminUrl: string;
}

// Authoritative Supabase project credentials (public anon client for Vercel deployment)
const DEFAULT_SUPABASE_URL = 'https://jvccvdxfilzlncbgiplk.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2Y2N2ZHhmaWx6bG5jYmdpcGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMTE1MTEsImV4cCI6MjEwNjg4NzUxMX0.IpFhOd0aFWJmR5bDFoZzwerQh2UGk1PCbC06SIDzW6g';

const isPlaceholder = (val?: string) => !val || val.includes('your-project-ref') || val.includes('placeholder');

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const rawCleanUrl = !isPlaceholder(rawSupabaseUrl) ? rawSupabaseUrl! : DEFAULT_SUPABASE_URL;
const supabaseUrl = rawCleanUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseAnonKey = !isPlaceholder(rawSupabaseAnonKey) ? rawSupabaseAnonKey! : DEFAULT_SUPABASE_ANON_KEY;

const defaultApiBaseUrl = import.meta.env.PROD
  ? 'https://place-your-service-api.onrender.com'
  : 'http://localhost:5000';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl;

const DEFAULT_ESS_ADMIN_URL = 'https://extreme-sales-services.vercel.app/admin';
const essAdminUrl = import.meta.env.VITE_ESS_ADMIN_URL || DEFAULT_ESS_ADMIN_URL;

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
  essAdminUrl,
};

