import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// The real signature check is covered in integrationLink tests. Here a request counts as signed when it carries
// X-Test-Signed, and is refused like an unsigned ESS call otherwise, so the order of the checks can be tested.
vi.mock('../src/middleware/integrationAuth.js', () => ({
  requireIntegrationClient: () => (req: any, res: any, next: () => void) =>
    req.get('X-Test-Signed') === '1'
      ? next()
      : res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Signed request required' } }),
}));
const { essPortalRouter, isPortalEnabled } = await import('../src/routes/ess/portal.js');

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

/** Every portal route, S11 and S11b (ids are well-formed but never reach the data layer when off). */
const ROUTES = [
  ['post', '/portal/code'],
  ['post', '/portal/sign-in'],
  ['post', '/portal/sign-out'],
  ['get', '/portal/me'],
  ['get', '/portal/status'],
  ['get', '/portal/overview'],
  ['get', '/portal/acs'],
  ['get', '/portal/acs/00000000-0000-4000-8000-000000000001'],
  ['get', '/portal/amc'],
  ['get', '/portal/amc/00000000-0000-4000-8000-000000000001'],
  ['post', '/portal/amc/00000000-0000-4000-8000-000000000001/renew'],
  ['get', '/portal/requests'],
  ['get', '/portal/requests/SR-2026-0001'],
  ['get', '/portal/reports/SRP-2026-0001'],
  ['get', '/portal/billing'],
  ['get', '/portal/billing/PAY-2026-00000001'],
  ['post', '/portal/profile/change-request'],
  ['post', '/portal/sign-out-all'],
] as const;

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

  it.each(ROUTES)('when off, a signed %s %s answers 503 PORTAL_OFF, not cacheable', async (method, path) => {
    delete process.env.PORTAL_ENABLED;
    const res = await request(makeApp())[method](path).set('X-Test-Signed', '1').send({ email: 'a@example.com', code: '123456' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PORTAL_OFF');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it.each(ROUTES)('an unsigned %s %s gets the same refusal whether accounts are on or off', async (method, path) => {
    const answers = [];
    for (const flag of [undefined, 'true']) {
      if (flag === undefined) delete process.env.PORTAL_ENABLED;
      else process.env.PORTAL_ENABLED = flag;
      const res = await request(makeApp())[method](path).send({ email: 'a@example.com' });
      answers.push({ status: res.status, body: res.body });
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(answers[0]).toEqual(answers[1]);
    expect(answers[0].status).toBe(401);
  });
});
