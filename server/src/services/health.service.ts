import { env } from '../config/env.js';
import { checkSupabaseConnection } from '../lib/supabase.js';
import { HealthCheckData } from '../types/index.js';

export class HealthService {
  /**
   * Fast Liveness Check:
   * Confirms the Express process is running and accepting HTTP requests.
   */
  public getLiveness(): HealthCheckData {
    return {
      service: 'place-your-service-api',
      status: 'healthy',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: env.NODE_ENV,
    };
  }

  /**
   * Readiness Check:
   * Verifies required backing dependencies (Supabase PostgreSQL connectivity).
   */
  public async getReadiness(): Promise<HealthCheckData> {
    const dbStatus = await checkSupabaseConnection();

    return {
      service: 'place-your-service-api',
      status: dbStatus.connected ? 'healthy' : 'unhealthy',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: env.NODE_ENV,
      database: {
        connected: dbStatus.connected,
        latencyMs: dbStatus.latencyMs,
        ...(dbStatus.connected ? {} : { error: 'Database connection check failed' }),
      },
    };
  }
}

export const healthService = new HealthService();
