import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('GET /api/v1/health (Health & Readiness Endpoints)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/v1/health returns 200 with structured liveness data', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.service).toBe('place-your-service-api');
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.version).toBe('0.1.0');
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/v1/health/ready returns 200 when database is reachable', async () => {
    vi.spyOn(supabaseLib, 'checkSupabaseConnection').mockResolvedValueOnce({
      connected: true,
      latencyMs: 15,
    });

    const res = await request(app).get('/api/v1/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.database.connected).toBe(true);
    expect(res.body.data.database.latencyMs).toBe(15);
  });

  it('GET /api/v1/health/ready returns 503 when database is unreachable without leaking credentials', async () => {
    vi.spyOn(supabaseLib, 'checkSupabaseConnection').mockResolvedValueOnce({
      connected: false,
      latencyMs: 50,
      error: 'Connection timed out',
    });

    const res = await request(app).get('/api/v1/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(true); // Structured response payload
    expect(res.body.data.status).toBe('unhealthy');
    expect(res.body.data.database.connected).toBe(false);
    expect(res.body.data.database.error).toBe('Database connection check failed');
    // Ensure no secrets or connection strings leaked
    expect(JSON.stringify(res.body)).not.toContain('postgres://');
    expect(JSON.stringify(res.body)).not.toContain('password');
    expect(JSON.stringify(res.body)).not.toContain('service_role');
  });
});
