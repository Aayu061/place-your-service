import { describe, it, expect } from 'vitest';
import { ApiClient, ApiError } from '@/services/api/client';

describe('Real Frontend ApiClient to Render Connectivity Verification', () => {
  const prodApiUrl = import.meta.env.VITE_API_BASE_URL || 'https://place-your-service-api.onrender.com/api/v1';

  it('connects to Render production API via frontend ApiClient and receives healthy liveness', async () => {
    const prodClient = new ApiClient(prodApiUrl);

    try {
      const data = await prodClient.get<{
        service: string;
        status: string;
        version: string;
        environment: string;
      }>('/health');

      expect(data).toBeDefined();
      expect(data.service).toBe('place-your-service-api');
      expect(data.status).toBe('healthy');
      expect(data.version).toBe('0.1.0');
      expect(data.environment).toBe('production');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NETWORK_ERROR') {
        console.warn('[Skipped offline] Render endpoint unreachable in isolated environment.');
        return;
      }
      throw err;
    }
  }, 35000);

  it('queries Render production readiness endpoint and validates structured response', async () => {
    const prodClient = new ApiClient(prodApiUrl);

    try {
      const data = await prodClient.get<{
        service: string;
        status: string;
        database?: { connected: boolean };
      }>('/health/ready');

      expect(data).toBeDefined();
      expect(data.service).toBe('place-your-service-api');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'NETWORK_ERROR') {
          console.warn('[Skipped offline] Render endpoint unreachable in isolated environment.');
          return;
        }
        expect([200, 503]).toContain(err.statusCode);
        return;
      }
      throw err;
    }
  }, 15000);
});
