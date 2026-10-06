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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Detect if real Supabase credentials have been provided (vs placeholders)
const isConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project-ref') &&
  !supabaseAnonKey.includes('placeholder')
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

