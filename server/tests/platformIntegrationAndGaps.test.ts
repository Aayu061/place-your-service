import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { env } from '../src/config/env.js';
import { signTechToken, hashPin } from '../src/utils/techAuth.js';

describe('Dual-Platform Integration & Gap Closure Verification Suite', () => {
  const app = createApp();
  const m2mKey = env.M2M_API_KEY || 'test-m2m-key-placeholder';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. ESS Storefront Contact Enquiries API & Validation
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. ESS Storefront Contact Enquiries (/api/v1/contact-enquiries)', () => {
    it('accepts contact inquiry with valid name and phone number', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'contact_enquiries') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'enq-1', enquiry_number: 'ENQ-123456', name: 'Rohan Sharma' },
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
        .post('/api/v1/contact-enquiries')
        .send({
          name: 'Rohan Sharma',
          phone: '9876543210',
          serviceType: 'AC Maintenance Check',
          message: 'AC cooling is insufficient in bedroom.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.enquiryNumber).toMatch(/^ENQ-\d{6}$/);
      expect(mockSupabase.from).toHaveBeenCalledWith('contact_enquiries');
    });

    it('accepts contact inquiry with valid email when phone number is omitted', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'contact_enquiries') {
            return {
              insert: vi.fn().mockImplementation((payload) => {
                expect(payload.phone).toBe('N/A');
                expect(payload.email).toBe('rohan@example.com');
                return {
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { id: 'enq-2', enquiry_number: 'ENQ-654321', name: 'Rohan Sharma', email: 'rohan@example.com' },
                      error: null,
                    }),
                  }),
                };
              }),
            };
          }
          return {};
        }),
      } as any;
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/contact-enquiries')
        .send({
          name: 'Rohan Sharma',
          email: 'rohan@example.com',
          serviceType: 'AC Consultation',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.enquiryNumber).toMatch(/^ENQ-\d{6}$/);
    });

    it('rejects contact inquiry with 400 when both phone and email are missing', async () => {
      const res = await request(app)
        .post('/api/v1/contact-enquiries')
        .send({
          name: 'Anonymous Customer',
          message: 'Just inquiring',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('phone number or email are required');
    });

    it('rejects contact inquiry with 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/v1/contact-enquiries')
        .send({
          phone: '9876543210',
          email: 'test@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('refuses enquiry conversion with the ESS integration key (staff-only action)', async () => {
      const enquiryId = 'enq-uuid-100';
      const mockEnquiry = {
        id: enquiryId,
        enquiry_number: 'ENQ-918234',
        name: 'Sunil Verma',
        phone: '9820012345',
        email: 'sunil@example.com',
        service_type: 'AC Repair',
        subject: 'AC Repair Inquiry',
        message: 'Compressor tripping',
        status: 'RECEIVED',
      };

      const mockCustomer = {
        id: 'cust-uuid-100',
        customer_code: 'CUST-883344',
      };

      const mockSite = {
        id: 'site-uuid-100',
      };

      const mockTicket = {
        id: 'sr-uuid-100',
        request_number: 'SR-20261115-7788',
        customer_id: mockCustomer.id,
        site_id: mockSite.id,
        status: 'PENDING',
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'contact_enquiries') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockEnquiry, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockCustomer, error: null }),
                }),
              }),
            };
          }
          if (table === 'customer_sites') {
            return {
              insert: vi.fn().mockResolvedValue({ data: null, error: null }),
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: mockSite, error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'service_requests') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockTicket, error: null }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      // Converting an enquiry is a staff action: the ESS integration key must be refused.
      const res = await request(app)
        .post(`/api/v1/contact-enquiries/${enquiryId}/convert`)
        .set('X-API-Key', m2mKey);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Customer & Site Invariants (Address Validation & Site Provisioning)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. Customer Address Validation & Primary Site Auto-Provisioning', () => {
    it('rejects POST /api/v1/customers with 422 VALIDATION_ERROR when address is omitted', async () => {
      const res = await request(app)
        .post('/api/v1/customers')
        .set('X-API-Key', m2mKey)
        .send({
          name: 'Aayush Panchal',
          phone: '9082787284',
          email: 'aayu@example.com',
          customerType: 'TEMPORARY',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d: any) => d.field === 'address')).toBe(true);
    });

    it('rejects POST /api/v1/customers with 422 VALIDATION_ERROR when address is under 3 characters', async () => {
      const res = await request(app)
        .post('/api/v1/customers')
        .set('X-API-Key', m2mKey)
        .send({
          name: 'Aayush Panchal',
          phone: '9082787284',
          address: 'No',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details.some((d: any) => d.field === 'address')).toBe(true);
    });

    it('creates customer and auto-provisions primary site when address is provided', async () => {
      const customerId = 'cust-new-uuid-1';
      const siteId = 'site-new-uuid-1';

      const sampleCustomer = {
        id: customerId,
        customer_code: 'CUST-100200',
        name: 'Aayush Panchal',
        company_name: 'Aayush Panchal',
        email: 'aayu@example.com',
        phone: '9082787284',
        alternate_phone: null,
        address: 'Chembur, Mumbai, Maharashtra',
        city: 'Mumbai',
        state: 'Maharashtra',
        postal_code: '400071',
        customer_type: 'TEMPORARY',
        notes: null,
        is_active: true,
        created_by: '9141b9fc-895f-4e87-b992-2dddf61c739c',
        updated_by: '9141b9fc-895f-4e87-b992-2dddf61c739c',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        customer_sites: [
          {
            id: siteId,
            customer_id: customerId,
            site_name: 'Aayush Panchal - Main Site',
            address: 'Chembur, Mumbai, Maharashtra',
            contact_person: 'Aayush Panchal',
            contact_phone: '9082787284',
            contact_email: 'aayu@example.com',
            is_primary: true,
            is_active: true,
          },
        ],
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
                eq: vi.fn().mockImplementation((col: string) => {
                  if (col === 'id') {
                    return {
                      maybeSingle: vi.fn().mockResolvedValue({ data: sampleCustomer, error: null }),
                    };
                  }
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                  };
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: sampleCustomer,
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'customer_sites') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'activity_logs') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return {};
        }),
      } as any;
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/customers')
        .set('X-API-Key', m2mKey)
        .send({
          name: 'Aayush Panchal',
          phone: '9082787284',
          email: 'aayu@example.com',
          address: 'Chembur, Mumbai, Maharashtra',
          customerType: 'TEMPORARY',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customer.id).toBe(customerId);
      expect(res.body.data.customer.primarySite).toBeDefined();
      expect(res.body.data.customer.primarySite.id).toBe(siteId);
    });

    it('rejects POST /api/v1/service-requests with 422 when customerId or siteId are missing', async () => {
      const res = await request(app)
        .post('/api/v1/service-requests')
        .set('X-API-Key', m2mKey)
        .send({
          requestType: 'BREAKDOWN',
          priority: 'HIGH',
          description: 'AC Cooling failure',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. M2M API Key Timing-Safe Authentication
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Machine-to-Machine (M2M) Authentication Security', () => {
    it('authenticates M2M calls via Authorization: Bearer <M2M_KEY>', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${m2mKey}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects unauthenticated requests to protected endpoints with 401', async () => {
      const res = await request(app)
        .get('/api/v1/customers');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects forged or incorrect M2M keys with 401', async () => {
      const res = await request(app)
        .get('/api/v1/customers')
        .set('X-API-Key', 'forged_fake_secret_key_123');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Technician Portal Authentication Isolation & Tokens
  // ═══════════════════════════════════════════════════════════════════════════
  describe('4. Technician Portal Auth Isolation & Token Boundaries', () => {
    const techId = '77777777-7777-7777-7777-777777777777';
    const techPin = '4321';
    const mockTech = {
      id: techId,
      technician_code: 'TECH-0099',
      name: 'Ramesh Patil',
      phone: '9876500000',
      email: 'ramesh@pys.internal',
      status: 'AVAILABLE',
      is_active: true,
      pin_hash: hashPin(techPin),
      specializations: ['Inverter Split AC'],
      service_areas: ['Central Mumbai'],
      last_duty_status_at: new Date().toISOString(),
    };

    const techToken = signTechToken({
      id: mockTech.id,
      technicianCode: mockTech.technician_code,
      phone: mockTech.phone,
      name: mockTech.name,
    });

    it('logs in technician with identifier and PIN, returning custom PIN token', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'technicians') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockTech, error: null }),
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
          identifier: '9876500000',
          pin: techPin,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toContain('pys_tech_');
      expect(res.body.data.technician.name).toBe('Ramesh Patil');
    });

    it('rejects technician login with incorrect PIN with 401', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'technicians') {
            return {
              select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockTech, error: null }),
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
          identifier: '9876500000',
          pin: '9999', // Wrong PIN
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Incorrect 4-digit PIN');
    });

    it('allows access to GET /api/v1/tech/me with valid technician PIN token', async () => {
      const createScheduleQueryMock = () => {
        const query: any = {
          eq: vi.fn().mockImplementation(() => query),
          then: (resolve: any) => resolve({ count: 2, error: null }),
        };
        return query;
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'technicians') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockTech, error: null }),
                  single: vi.fn().mockResolvedValue({ data: mockTech, error: null }),
                }),
              }),
            };
          }
          if (table === 'service_schedules') {
            return {
              select: vi.fn().mockImplementation(createScheduleQueryMock),
            };
          }
          return {};
        }),
      } as any;
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/tech/me')
        .set('Authorization', `Bearer ${techToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Ramesh Patil');
    });

    it('rejects GET /api/v1/tech/me with 401 when technician token is missing', async () => {
      const res = await request(app)
        .get('/api/v1/tech/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
