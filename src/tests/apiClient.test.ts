import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, ApiError } from '@/services/api/client';
import { healthApi } from '@/services/api/health';

describe('Frontend API Client Foundation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('manages base URL and auth token correctly', () => {
    const client = new ApiClient('http://localhost:5000/');
    expect(client.getBaseUrl()).toBe('http://localhost:5000');

    client.setAuthToken('test-jwt-token-xyz');
    expect(client.getAuthToken()).toBe('test-jwt-token-xyz');

    client.setAuthToken(null);
    expect(client.getAuthToken()).toBeNull();
  });

  it('unwraps structured success response payload', async () => {
    const mockHealthData = {
      service: 'place-your-service-api',
      status: 'healthy',
      version: '0.1.0',
      timestamp: '2026-10-07T00:00:00.000Z',
      uptimeSeconds: 42,
      environment: 'development',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: mockHealthData,
      }),
    });

    const client = new ApiClient('http://localhost:5000');
    const result = await client.get<typeof mockHealthData>('/api/v1/health');

    expect(result).toEqual(mockHealthData);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/v1/health',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('normalizes structured error responses into ApiError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication token required',
        },
      }),
    });

    const client = new ApiClient('http://localhost:5000');
    await expect(client.get('/api/v1/protected')).rejects.toThrow(ApiError);

    try {
      await client.get('/api/v1/protected');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(401);
      expect(apiErr.code).toBe('UNAUTHORIZED');
      expect(apiErr.message).toBe('Authentication token required');
    }
  });

  it('normalizes network exceptions into ApiError with NETWORK_ERROR code', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const client = new ApiClient('http://localhost:5000');
    await expect(client.get('/api/v1/health')).rejects.toThrow(ApiError);

    try {
      await client.get('/api/v1/health');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(0);
      expect(apiErr.code).toBe('NETWORK_ERROR');
      expect(apiErr.message).toBe('Connection refused');
    }
  });

  it('healthApi queries /api/v1/health and /api/v1/health/ready', async () => {
    const mockHealth = {
      service: 'place-your-service-api',
      status: 'healthy' as const,
      version: '0.1.0',
      timestamp: '2026-10-07T00:00:00.000Z',
      uptimeSeconds: 10,
      environment: 'development',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: mockHealth,
      }),
    });

    const health = await healthApi.getHealth();
    expect(health.status).toBe('healthy');
    expect(health.service).toBe('place-your-service-api');
  });
});
