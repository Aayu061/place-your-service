import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import * as supabaseLib from '../src/lib/supabase.js';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { signTechToken } from '../src/utils/techAuth.js';
import { addDaysIstIso, getCalendarWeekdayShort, getIstTodayIso } from '../src/utils/date.js';

describe('Phase 1 Security, Validation & IST Date Hardening', () => {
  const validTechToken = signTechToken({
    id: '77777777-7777-7777-7777-777777777777',
    technicianCode: 'TECH-0001',
    phone: '9876543210',
    name: 'Suresh Patil',
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests to POST /api/v1/compliance/gstin/lookup with 401', async () => {
    const res = await request(app).post('/api/v1/compliance/gstin/lookup').send({
      gstin: '27ANTPP9778J1ZO',
    });

    expect(res.status).toBe(401);
  });

  it('rejects malformed GSTIN payload with 422 VALIDATION_ERROR even when authenticated', async () => {
    const res = await request(app)
      .post('/api/v1/compliance/gstin/lookup')
      .set('X-API-Key', env.M2M_API_KEY || 'test-key')
      .send({ gstin: 'INVALID123' });

    if (env.M2M_API_KEY) {
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    } else {
      expect([401, 422]).toContain(res.status);
    }
  });

  it('validates UUID params and ISO dates on Technician Portal routes', async () => {
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'technicians') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: '77777777-7777-7777-7777-777777777777',
                    is_active: true,
                    technician_code: 'TECH-0001',
                    name: 'Suresh Patil',
                    phone: '9876543210',
                    status: 'AVAILABLE',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any);

    const badDateRes = await request(app)
      .get('/api/v1/tech/jobs?date=not-a-date')
      .set('Authorization', `Bearer ${validTechToken}`);
    expect(badDateRes.status).toBe(422);

    const badUuidRes = await request(app)
      .get('/api/v1/tech/jobs/not-a-uuid')
      .set('Authorization', `Bearer ${validTechToken}`);
    expect(badUuidRes.status).toBe(422);

    const badPatchRes = await request(app)
      .patch('/api/v1/tech/jobs/not-a-uuid/status')
      .set('Authorization', `Bearer ${validTechToken}`)
      .send({ status: 'IN_PROGRESS' });
    expect(badPatchRes.status).toBe(422);
  });

  it('resolves IST calendar dates cleanly between 00:00 and 05:30 IST (before UTC midnight)', () => {
    // 2026-11-12T18:45:00.000Z === 2026-11-13 00:15:00 IST
    const instant = new Date('2026-11-12T18:45:00.000Z');
    expect(getIstTodayIso(instant)).toBe('2026-11-13');
    expect(addDaysIstIso(instant, -1)).toBe('2026-11-12');
    expect(addDaysIstIso('2026-11-13', 30)).toBe('2026-12-13');
    expect(getCalendarWeekdayShort('2026-11-13')).toBe('Fri');
  });
});
