import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Phase 4: Response Compression Middleware', () => {
  it('compresses JSON responses over 1 KB with gzip when Accept-Encoding allows it', async () => {
    const longPath = `/api/v1/nonexistent-${'segment-'.repeat(160)}`;
    const res = await request(app)
      .get(longPath)
      .set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(404);
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('skips compression when x-no-compression header is present', async () => {
    const longPath = `/api/v1/nonexistent-${'segment-'.repeat(160)}`;
    const res = await request(app)
      .get(longPath)
      .set('Accept-Encoding', 'gzip')
      .set('x-no-compression', '1');

    expect(res.status).toBe(404);
    expect(res.headers['content-encoding']).toBeUndefined();
  });
});

