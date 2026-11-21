import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { redactUrl } from '../src/utils/safeUrl.js';
import { requestLoggerMiddleware } from '../src/middleware/logger.js';
import { errorHandlerMiddleware } from '../src/middleware/errorHandler.js';
import { requireIntegrationClient } from '../src/middleware/integrationAuth.js';
import { AppError } from '../src/utils/errors.js';
import { telemetryLogService } from '../src/services/telemetryLog.service.js';
import { integrationService } from '../src/services/integration.service.js';
import { signRequest } from '../src/utils/integrationSignature.js';

const PHONE = '9876543210';

describe('redactUrl', () => {
  it('returns urls without a query unchanged', () => {
    expect(redactUrl('/api/v1/customers')).toBe('/api/v1/customers');
  });

  it('hides search, q, phone and email values but keeps the names', () => {
    expect(redactUrl(`/a?search=${PHONE}`)).toBe('/a?search=[REDACTED]');
    expect(redactUrl('/a?q=ravi')).toBe('/a?q=[REDACTED]');
    expect(redactUrl(`/a?phone=${PHONE}`)).toBe('/a?phone=[REDACTED]');
    expect(redactUrl('/a?email=a%40b.com')).toBe('/a?email=[REDACTED]');
  });

  it('keeps values on the safe list', () => {
    const url =
      '/a?page=2&limit=20&pageSize=10&status=NEW&kind=x&type=y&category=z&sort=name&order=asc&from=2026-01-01&to=2026-02-01&isActive=true&isPublic=false';
    expect(redactUrl(url)).toBe(url);
  });

  it('mixes safe and unsafe params', () => {
    expect(redactUrl(`/api/v1/ess/admin/leads?search=${PHONE}&status=NEW&page=2`)).toBe(
      '/api/v1/ess/admin/leads?search=[REDACTED]&status=NEW&page=2'
    );
  });

  it('handles repeated names and encoded values', () => {
    expect(redactUrl('/a?id=1&id=2&q=%2B919876543210')).toBe('/a?id=[REDACTED]&id=[REDACTED]&q=[REDACTED]');
  });

  it('treats names case-sensitively', () => {
    expect(redactUrl('/a?Page=2')).toBe('/a?Page=[REDACTED]');
  });

  it('keeps empty values and hides bare tokens', () => {
    expect(redactUrl('/a?search=&page=1')).toBe('/a?search=&page=1');
    expect(redactUrl(`/a?${PHONE}`)).toBe('/a?[REDACTED]');
  });

  it('does not let a safe name carry a phone-like value', () => {
    expect(redactUrl(`/a?status=${PHONE}`)).toBe('/a?status=[REDACTED]');
  });

  it('redacts the whole query on bad percent-encoding and never throws', () => {
    expect(redactUrl('/a?search=%E0%A4%A&page=2')).toBe('/a?[REDACTED]');
    expect(() => redactUrl('/a?%')).not.toThrow();
    expect(redactUrl(undefined as unknown as string)).toBe('');
  });
});

describe('logs never contain query values', () => {
  let out: string;

  beforeEach(() => {
    out = '';
    for (const m of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        out += a.join(' ') + '\n';
      });
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const withId = (app: express.Express) =>
    app.use((req, _res, next) => {
      (req as any).id = 'req-1';
      next();
    });

  const miniApp = () => {
    const app = express();
    withId(app);
    app.use(requestLoggerMiddleware);
    app.get('/api/v1/health', (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/api/v1/ok', (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/api/v1/bad', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'nope')));
    app.get('/api/v1/boom', (_req, _res, next) => next(new Error('boom')));
    app.use(errorHandlerMiddleware);
    return app;
  };

  it('request logger keeps page=2 and drops the phone number', async () => {
    await request(miniApp()).get(`/api/v1/ok?search=${PHONE}&page=2`);
    expect(out).toContain('page=2');
    expect(out).toContain('search=[REDACTED]');
    expect(out).not.toContain(PHONE);
  });

  it('request logger redacts the ESS admin leads address', async () => {
    const app = express();
    withId(app);
    app.use(requestLoggerMiddleware);
    app.get('/api/v1/ess/admin/leads', (_req, res) => {
      res.json({});
    });
    await request(app).get(`/api/v1/ess/admin/leads?search=${PHONE}&page=2`);
    expect(out).toContain('page=2');
    expect(out).not.toContain(PHONE);
  });

  it('error handler (4xx): logger output and telemetry message are redacted', async () => {
    const add = vi.spyOn(telemetryLogService, 'addLog');
    const res = await request(miniApp()).get(`/api/v1/bad?search=${PHONE}&page=2`);
    expect(res.status).toBe(404);
    expect(out).not.toContain(PHONE);
    const msg = add.mock.calls[0][0].message as string;
    expect(msg).toContain('page=2');
    expect(msg).not.toContain(PHONE);
  });

  it('error handler (500): logger output and recordCrash url are redacted', async () => {
    const crash = vi.spyOn(telemetryLogService, 'recordCrash').mockResolvedValue(undefined as any);
    const res = await request(miniApp()).get(`/api/v1/boom?q=${PHONE}&page=2`);
    expect(res.status).toBe(500);
    expect(out).not.toContain(PHONE);
    expect(crash.mock.calls[0][0].url).toBe('/api/v1/boom?q=[REDACTED]&page=2');
  });

  it('health ping is still not logged, even with a query', async () => {
    await request(miniApp()).get('/api/v1/health');
    await request(miniApp()).get('/api/v1/health?x=1');
    expect(out).not.toContain('/health');
  });

  it('integrationAuth rejection log is redacted', async () => {
    const app = express();
    withId(app);
    app.get('/api/v1/ess/admin/leads', requireIntegrationClient('admin:access'), (_req, res) => {
      res.json({});
    });
    const res = await request(app).get(`/api/v1/ess/admin/leads?search=${PHONE}&page=2`);
    expect(res.status).toBe(401);
    expect(out).toContain('Integration request rejected');
    expect(out).not.toContain(PHONE);
  });

  it('a signed request over a query url is still accepted (real url is untouched)', async () => {
    const SECRET = 'test-secret-value-for-signing-0123456789';
    vi.spyOn(integrationService, 'resolveKey').mockResolvedValue({
      keyId: 'essweb_0123456789ab',
      clientId: 'c1',
      secret: SECRET,
      scopes: ['admin:access'],
    } as any);
    vi.spyOn(integrationService, 'consumeNonce').mockResolvedValue(true);
    vi.spyOn(integrationService, 'touch').mockResolvedValue(undefined as any);
    const app = express();
    withId(app);
    app.use(requestLoggerMiddleware);
    app.get('/x', requireIntegrationClient('admin:access'), (req, res) => {
      res.json({ url: req.originalUrl });
    });
    const path = `/x?search=${PHONE}&page=2`;
    const headers = signRequest({ keyId: 'essweb_0123456789ab', secret: SECRET, method: 'GET', pathWithQuery: path });
    const res = await request(app).get(path).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.url).toBe(path);
    expect(out).not.toContain(PHONE);
  });
});
