import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { signTechToken, hashPin } from '../src/utils/techAuth.js';

describe('Technician Mobile Field Portal API (/api/v1/tech)', () => {
  const sampleTechId = '77777777-7777-7777-7777-777777777777';
  const sampleTech = {
    id: sampleTechId,
    technician_code: 'TECH-0001',
    name: 'Suresh Patil',
    phone: '9876543210',
    email: 'suresh@placeyourservice.internal',
    status: 'AVAILABLE',
    is_active: true,
    pin_hash: hashPin('1234'),
  };

  const validTechToken = signTechToken({
    id: sampleTech.id,
    technicianCode: sampleTech.technician_code,
    phone: sampleTech.phone,
    name: sampleTech.name,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Dedicated Mobile Authentication (POST /api/v1/tech/login)', () => {
    it('authenticates technician with phone number and valid PIN', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'technicians') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: sampleTech,
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/tech/login')
        .send({
          identifier: '9876543210',
          pin: '1234',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toContain('pys_tech_');
      expect(res.body.data.technician.technicianCode).toBe('TECH-0001');
      expect(res.body.data.technician.name).toBe('Suresh Patil');
    });

    it('authenticates technician with technician code (e.g. TECH-0001) and PIN', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'technicians') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: sampleTech,
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/tech/login')
        .send({
          identifier: 'TECH-0001',
          pin: '1234',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });

    it('rejects login with incorrect 4-digit PIN with 401 UNAUTHORIZED', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'technicians') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: sampleTech,
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/tech/login')
        .send({
          identifier: 'TECH-0001',
          pin: '9999', // Wrong PIN
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Incorrect 4-digit PIN');
    });

    it('rejects unknown technician with 401 UNAUTHORIZED', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'technicians') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/tech/login')
        .send({
          identifier: 'UNKNOWN-TECH',
          pin: '1234',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid technician code or mobile number');
    });
  });

  describe('2. Technician Duty Profile & Status (GET /me, PATCH /status)', () => {
    it('returns 401 UNAUTHORIZED when technician token is missing', async () => {
      const res = await request(app).get('/api/v1/tech/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns technician profile and today metrics when authenticated', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'technicians') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: sampleTech, error: null }),
                  single: vi.fn().mockResolvedValue({ data: sampleTech, error: null }),
                }),
              }),
            };
          }
          if (table === 'service_schedules') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockImplementation((col: string, val: string) => {
                    if (col === 'status') {
                      return Promise.resolve({ count: 1 });
                    }
                    return {
                      eq: vi.fn().mockResolvedValue({ count: 3 }),
                    };
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/tech/me')
        .set('Authorization', `Bearer ${validTechToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.technician_code).toBe('TECH-0001');
      expect(res.body.data.metrics).toBeDefined();
    });

    it('updates live duty status (AVAILABLE / BUSY / OFF_DUTY)', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'technicians') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: sampleTech, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { ...sampleTech, status: 'BUSY' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .patch('/api/v1/tech/status')
        .set('Authorization', `Bearer ${validTechToken}`)
        .send({ status: 'BUSY' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('BUSY');
    });
  });

  describe('3. Today’s Assigned Jobs (GET /api/v1/tech/jobs)', () => {
    it('returns assigned dispatch queue for logged-in technician', async () => {
      const mockJob = {
        id: 'sched-101',
        schedule_number: 'SCH-2026-0001',
        status: 'SCHEDULED',
        scheduled_date: '2026-11-10',
        start_time: '10:00',
        end_time: '11:30',
        planned_service_type: 'Dry Service',
        notes: 'Customer reported mild noise',
        customers: { id: 'cust-1', name: 'Alok Nath', phone: '9820011223' },
        sites: { id: 'site-1', site_name: 'Home', address: 'Plot 12, Panvel' },
        ac_assets: { id: 'asset-1', brand: 'Daikin', model_number: 'FTKF50', room_location: 'Hall' },
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'technicians') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: sampleTech, error: null }),
                }),
              }),
            };
          }
          if (table === 'service_schedules') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                      data: [mockJob],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/tech/jobs')
        .set('Authorization', `Bearer ${validTechToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].schedule_number).toBe('SCH-2026-0001');
      expect(res.body.data[0].customers.name).toBe('Alok Nath');
    });
  });
});

