import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { redactUrl, redactQuery } from '../src/utils/safeUrl.js';
import { requireRole } from '../src/middleware/role.js';
import { telemetryLogService } from '../src/services/telemetryLog.service.js';

vi.mock('../src/middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: 'u1', role: 'ADMIN', email: 'a@b.c' };
    next();
  },
}));

const dbError = { message: 'db down' };
const failingChain: any = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'then') return (res: any) => res({ data: null, error: dbError, count: null });
      return () => failingChain;
    },
  }
);
vi.mock('../src/lib/supabase.js', () => ({
  getSupabaseClient: () => ({ from: () => failingChain }),
}));

import { adminTelemetryRouter } from '../src/routes/adminTelemetry.routes.js';
import { technicianService } from '../src/services/technician.service.js';
import { serviceReportService } from '../src/services/serviceReport.service.js';
import { CustomerPortalService } from '../src/services/customerPortal.service.js';

const PHONE = '9876543210';

describe('remaining log paths hide phone numbers and search text', () => {
  let out: string;
  beforeEach(() => {
    out = '';
    for (const m of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        out += a.join(' ') + '\n';
      });
    }
  });
  afterEach(() => vi.restoreAllMocks());

  it('redactUrl hides digits hidden inside a query name', () => {
    expect(redactUrl(`/a?a${PHONE}=1&page=2`)).toBe('/a?[REDACTED]&page=2');
  });

  it('redactQuery keeps only safe values', () => {
    expect(redactQuery({ search: PHONE, page: 2, status: 'NEW', q: 'ravi', limit: '20' })).toEqual({
      search: '[REDACTED]',
      page: 2,
      status: 'NEW',
      q: '[REDACTED]',
      limit: '20',
    });
  });

  it('role denial log is redacted', async () => {
    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { userId: 'u1', role: 'TECHNICIAN' };
      next();
    });
    app.get('/api/v1/customers', requireRole('ADMIN'), (_req, res) => {
      res.json({});
    });
    const res = await request(app).get(`/api/v1/customers?search=${PHONE}&page=2`);
    expect(res.status).toBe(403);
    expect(out).toContain('Role access denied');
    expect(out).toContain('page=2');
    expect(out).not.toContain(PHONE);
  });

  it('crash-report stores a redacted url', async () => {
    const crash = vi.spyOn(telemetryLogService, 'recordCrash').mockResolvedValue({} as any);
    const app = express();
    app.use(express.json());
    app.use('/api/v1/admin/telemetry', adminTelemetryRouter);
    const res = await request(app)
      .post('/api/v1/admin/telemetry/crash-report')
      .send({ message: 'x', url: `/admin/requests?search=${PHONE}&page=2` });
    expect(res.status).toBe(201);
    expect(crash.mock.calls[0][0].url).toBe('/admin/requests?search=[REDACTED]&page=2');
  });

  it('technician list failure does not log the search text', async () => {
    await expect(technicianService.listTechnicians({ search: PHONE, page: 2 } as any)).rejects.toThrow();
    expect(out).toContain('Failed to list technicians');
    expect(out).not.toContain(PHONE);
  });

  it('service report list failure does not log the search text', async () => {
    await expect(serviceReportService.listReports({ search: PHONE, page: 2 } as any)).rejects.toThrow();
    expect(out).toContain('Failed to list service reports');
    expect(out).not.toContain(PHONE);
  });

  it('portal login lookup failure does not log the phone number', async () => {
    await expect(new CustomerPortalService().loginByPhone(PHONE)).rejects.toThrow();
    expect(out).toContain('Failed to query customer by phone');
    expect(out).not.toContain(PHONE);
  });
});
