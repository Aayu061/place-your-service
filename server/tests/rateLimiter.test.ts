import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('API Rate Limiter & Health Check Exemption', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows repeated requests to /api/v1/health beyond rate limit without receiving 429', async () => {
    // Perform 110 requests (exceeding standard 100 max limit)
    const requests = Array.from({ length: 110 }, () => request(app).get('/api/v1/health'));
    const responses = await Promise.all(requests);

    // Every single health check request should succeed with 200, none with 429
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
    }
  });

  it('allows repeated requests to /api/v1/health/ready beyond rate limit without receiving 429', async () => {
    vi.spyOn(supabaseLib, 'checkSupabaseConnection').mockResolvedValue({
      connected: true,
      latencyMs: 10,
    });

    // Perform 110 requests to readiness probe
    const requests = Array.from({ length: 110 }, () => request(app).get('/api/v1/health/ready'));
    const responses = await Promise.all(requests);

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
    }
  });

  it('enforces rate limiting on normal non-health API routes when limit is exceeded', async () => {
    // Normal non-health route (which returns 404 since it does not exist, but is routed through /api/)
    // In order to test without waiting for a fresh IP or window, make 105 requests
    let got429 = false;
    for (let i = 0; i < 115; i++) {
      const res = await request(app).get('/api/v1/non-health-endpoint');
      if (res.status === 429) {
        got429 = true;
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(res.body.error.message).toContain('Too many requests');
        break;
      }
    }

    expect(got429).toBe(true);
  });
});
