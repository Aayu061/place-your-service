import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Error Handling Middleware & 404 Handler', () => {
  it('returns structured 404 NOT_FOUND for unknown routes', async () => {
    const res = await request(app).get('/api/v1/unknown-route-12345');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('Resource not found');
  });

  it('includes X-Request-Id header on all error responses', async () => {
    const res = await request(app)
      .get('/api/v1/non-existent')
      .set('X-Request-Id', 'custom-trace-id-999');

    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBe('custom-trace-id-999');
  });
});
