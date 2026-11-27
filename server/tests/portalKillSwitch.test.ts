import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { essPortalRouter, isPortalEnabled } from '../src/routes/ess/portal.js';

/** S11 global kill switch: customer accounts answer only when PORTAL_ENABLED=true. */
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/portal', essPortalRouter);
  return app;
}

const original = process.env.PORTAL_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.PORTAL_ENABLED;
  else process.env.PORTAL_ENABLED = original;
});

describe('customer accounts kill switch (PORTAL_ENABLED)', () => {
  it('is off unless set to exactly "true" (any case, trimmed)', () => {
    delete process.env.PORTAL_ENABLED;
    expect(isPortalEnabled()).toBe(false);
    for (const v of ['', 'false', '0', '1', 'yes', 'on', 'truee']) {
      process.env.PORTAL_ENABLED = v;
      expect(isPortalEnabled()).toBe(false);
    }
    for (const v of ['true', 'TRUE', ' True ']) {
      process.env.PORTAL_ENABLED = v;
      expect(isPortalEnabled()).toBe(true);
    }
  });

  it.each([
    ['post', '/portal/code'],
    ['post', '/portal/sign-in'],
    ['post', '/portal/sign-out'],
    ['get', '/portal/me'],
    ['get', '/portal/status'],
  ] as const)('when off, %s %s answers 503 PORTAL_OFF, not cacheable', async (method, path) => {
    delete process.env.PORTAL_ENABLED;
    const res = await request(makeApp())[method](path).send({ email: 'a@example.com', code: '123456' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PORTAL_OFF');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('when on, requests reach the signature check (an unsigned request is refused, not 503)', async () => {
    process.env.PORTAL_ENABLED = 'true';
    const res = await request(makeApp()).post('/portal/code').send({ email: 'a@example.com' });
    expect(res.status).not.toBe(503);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body?.error?.code).not.toBe('PORTAL_OFF');
  });
});
