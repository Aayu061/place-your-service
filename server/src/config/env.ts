import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file if present
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(5000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10, 'SUPABASE_SERVICE_ROLE_KEY must be provided'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX: z.coerce.number().default(100),
});

export type ServerEnv = z.infer<typeof envSchema>;

function loadEnv(): ServerEnv {
  const isTest = process.env.NODE_ENV === 'test';

  const rawEnv = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || '5000',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
    SUPABASE_URL: process.env.SUPABASE_URL || (isTest ? 'https://test-placeholder.supabase.co' : undefined),
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY || (isTest ? 'mock-test-service-role-key-12345' : undefined),
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || '900000',
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || '100',
  };

  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`[CRITICAL] Server environment validation failure: ${errorDetails}`);
  }

  return parsed.data;
}

export const env = loadEnv();
