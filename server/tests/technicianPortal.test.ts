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

    it('falls back to base columns when optional issue_category column is missing on schema', async () => {
      const selectSpy = vi.fn().mockImplementation((cols: string) => ({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockImplementation(async () => {
              if (cols.includes('issue_category')) {
                return { data: null, error: { code: '42703', message: 'column service_requests_1.issue_category does not exist' } };
              }
              return {
                data: [
                  {
                    id: 'sched-202',
                    schedule_number: 'SCH-2026-0002',
                    status: 'SCHEDULED',
                    scheduled_date: '2026-11-12',
                    start_time: '09:00:00',
                    end_time: '11:00:00',
                    planned_service_type: 'DRY_SERVICE',
                    customers: { id: 'cust-1', name: 'Rohan Mehta', phone: '9820011223' },
                    sites: { id: 'site-1', site_name: 'Office', address: 'Vashi' },
                    ac_assets: null,
                    service_requests: null,
                  },
                ],
                error: null,
              };
            }),
          }),
        }),
      }));

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
            return { select: selectSpy };
          }
          return {};
        }),
      } as any;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/tech/jobs?date=2026-11-12')
        .set('Authorization', `Bearer ${validTechToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].schedule_number).toBe('SCH-2026-0002');
      expect(selectSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('4. Job Detail & Field Report Submission (/api/v1/tech/jobs/:id & /service-reports)', () => {
    it('returns sequential suggestedReportNumber and siteAssets in GET /api/v1/tech/jobs/:id', async () => {
      const year = new Date().getUTCFullYear();
      const scheduleDetailRow = {
        id: '88888888-8888-8888-8888-888888888881',
        schedule_number: 'SCH-2026-0010',
        status: 'ASSIGNED',
        scheduled_date: '2026-11-12',
        start_time: '14:00:00',
        end_time: '16:00:00',
        planned_service_type: 'DRY_SERVICE',
        amc_id: null,
        service_request_id: null,
        customers: { id: 'cust-1', name: 'Apex Towers', phone: '9820011223', city: 'Navi Mumbai' },
        sites: { id: 'site-1', site_name: 'Block A', address: 'Turbhe' },
        ac_assets: null,
        service_requests: null,
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
                    maybeSingle: vi.fn().mockResolvedValue({ data: scheduleDetailRow, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'service_reports') {
            return {
              select: vi.fn().mockImplementation((cols: string, opts?: any) => {
                if (opts?.head) {
                  return Promise.resolve({ count: 4, error: null });
                }
                if (cols === 'report_number') {
                  return {
                    ilike: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue({
                          data: [{ report_number: `REP-${year}-0004` }],
                          error: null,
                        }),
                      }),
                    }),
                  };
                }
                if (cols === 'id') {
                  return {
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  };
                }
                return {
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                };
              }),
            };
          }
          if (table === 'ac_assets') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                      data: [{ id: 'asset-site-1', asset_tag: 'AC-01', brand: 'Daikin' }],
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
        .get(`/api/v1/tech/jobs/${scheduleDetailRow.id}`)
        .set('Authorization', `Bearer ${validTechToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.suggestedReportNumber).toBe(`REP-${year}-0005`);
      expect(res.body.data.siteAssets).toHaveLength(1);
    });

    it('submits field report cleanly with omitted manualReportNumber, UPI mode, and inserts dispatcher notification', async () => {
      const year = new Date().getUTCFullYear();
      const scheduleId = '88888888-8888-8888-8888-888888888882';
      const notifInsertSpy = vi.fn().mockResolvedValue({ error: null });
      const { serviceReportService } = await import('../src/services/serviceReport.service.js');

      vi.spyOn(serviceReportService, 'generateNextReportNumber').mockResolvedValue({
        nextReportNumber: `REP-${year}-0009`,
        totalReports: 8,
      });
      const createReportSpy = vi.spyOn(serviceReportService, 'createReport').mockResolvedValue({
        id: 'rep-field-1',
        reportNumber: `REP-${year}-0009`,
        customerName: 'Apex Towers',
        technicianName: sampleTech.name,
      } as any);

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
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: scheduleId,
                      technician_id: sampleTechId,
                      service_request_id: null,
                      amc_id: null,
                      status: 'ASSIGNED',
                      start_time: '10:00:00',
                      end_time: '11:30:00',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'staff') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [{ profile_id: 'admin-profile-1' }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'notifications') {
            return { insert: notifInsertSpy };
          }
          return {};
        }),
      } as any;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/tech/service-reports')
        .set('Authorization', `Bearer ${validTechToken}`)
        .send({
          scheduleId,
          reportedVisitDate: '2026-11-12',
          startTime: '10:00:00',
          endTime: '11:30:00',
          serviceExecutionType: 'DRY_SERVICE',
          primaryOutcome: 'COMPLETED',
          workDescription: 'Cleaned indoor coil and drain tray.',
          technicianRemarks: 'Cooling verified OK.',
          customerRepresentative: 'Site Manager',
          paymentCollected: true,
          paymentAmount: 1500,
          paymentMethod: 'UPI',
          paymentReference: '412345678901',
          assets: [],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(createReportSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reportNumber: `REP-${year}-0009`,
          startTime: '10:00',
          endTime: '11:30',
          paymentMethod: 'UPI',
        }),
        null
      );
      expect(notifInsertSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            recipient_profile_id: 'admin-profile-1',
            entity_type: 'service_report',
            entity_id: 'rep-field-1',
          }),
        ])
      );
    });
  });
});

