import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Security Middleware & Headers', () => {
  it('attaches Helmet security headers', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  });

  it('generates a new UUID for X-Request-Id if not provided', async () => {
    const res = await request(app).get('/api/v1/health');

    const reqId = res.headers['x-request-id'];
    expect(reqId).toBeDefined();
    // Verify UUID format (8-4-4-4-12)
    expect(reqId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('preserves client-provided X-Request-Id header', async () => {
    const customId = 'frontend-client-req-001';
    const res = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', customId);

    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('handles CORS preflight OPTIONS requests gracefully', async () => {
    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
