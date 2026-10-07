import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('Customer Management API (/api/v1/customers)', () => {
  const adminAuthToken = 'Bearer valid-admin-token';
  const staffAuthToken = 'Bearer valid-staff-token';

  const mockAdminUser = { id: 'admin-auth-id' };
  const mockAdminProfile = { id: 'admin-auth-id', full_name: 'Super Admin', email: 'admin@pys.internal' };
  const mockAdminStaff = { id: 'admin-staff-id', role: 'ADMIN', is_active: true };

  const mockStaffUser = { id: 'staff-auth-id' };
  const mockStaffProfile = { id: 'staff-auth-id', full_name: 'Operations Staff', email: 'staff@pys.internal' };
  const mockStaffRecord = { id: 'staff-record-id', role: 'STAFF', is_active: true };

  const sampleCustomerId = '11111111-1111-1111-1111-111111111111';
  const sampleCustomer = {
    id: sampleCustomerId,
    customer_code: 'CUST-100200',
    name: 'Acme Commercial Ltd',
    company_name: 'Acme Enterprises',
    email: 'acme@example.com',
    phone: '9876543210',
    alternate_phone: '9876543211',
    address: '101 Industrial Park',
    city: 'Mumbai',
    state: 'Maharashtra',
    postal_code: '400001',
    customer_type: 'TEMPORARY',
    notes: 'Initial emergency breakdown customer',
    is_active: true,
    created_by: 'admin-auth-id',
    updated_by: 'admin-auth-id',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    customer_sites: [
      {
        id: '22222222-2222-2222-2222-222222222222',
        customer_id: sampleCustomerId,
        site_name: 'Acme Commercial Ltd - Main Site',
        address: '101 Industrial Park',
        contact_person: 'John Doe',
        contact_phone: '9876543210',
        contact_email: 'acme@example.com',
        is_primary: true,
        is_active: true,
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupAuthMock = (role: 'ADMIN' | 'STAFF' = 'ADMIN') => {
    return (table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: role === 'ADMIN' ? mockAdminProfile : mockStaffProfile,
            error: null,
          }),
        };
      }
      if (table === 'staff') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: role === 'ADMIN' ? mockAdminStaff : mockStaffRecord,
            error: null,
          }),
        };
      }
      return {};
    };
  };

  describe('1. Authentication & Role Authorization', () => {
    it('rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/customers');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows ADMIN to access customer directory', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles' || table === 'staff') {
            return setupAuthMock('ADMIN')(table);
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnThis(),
                or: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                range: vi.fn().mockResolvedValue({
                  data: [sampleCustomer],
                  count: 1,
                  error: null,
                }),
              }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/customers')
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customers).toHaveLength(1);
      expect(res.body.data.customers[0].name).toBe('Acme Commercial Ltd');
    });

    it('allows STAFF to access customer directory', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockStaffUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles' || table === 'staff') {
            return setupAuthMock('STAFF')(table);
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnThis(),
                or: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                range: vi.fn().mockResolvedValue({
                  data: [sampleCustomer],
                  count: 1,
                  error: null,
                }),
              }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/customers')
        .set('Authorization', staffAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customers).toHaveLength(1);
    });
  });

  describe('2. Customer Creation & Validation (POST /api/v1/customers)', () => {
    it('creates a new customer with auto-generated code and primary site', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles' || table === 'staff') {
            return setupAuthMock('ADMIN')(table);
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockImplementation((fields?: string) => {
                return {
                  eq: vi.fn().mockImplementation((col: string, val: unknown) => {
                    if (col === 'phone') {
                      return {
                        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                        neq: vi.fn().mockResolvedValue({ data: [], error: null }),
                      };
                    }
                    if (col === 'customer_code') {
                      return {
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                      };
                    }
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
                };
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
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const payload = {
        name: 'New Test Customer',
        phone: '9876543210',
        address: '202 Marine Drive',
        companyName: 'Marine Services',
        email: 'marine@example.com',
        city: 'Mumbai',
        customerType: 'TEMPORARY',
      };

      const res = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', adminAuthToken)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customer).toBeDefined();
      expect(res.body.data.customer.customerCode).toBe('CUST-100200');
    });

    it('validates required fields and rejects invalid payload with 422 VALIDATION_ERROR', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation(setupAuthMock('ADMIN')),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      // Missing phone and address
      const res = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', adminAuthToken)
        .send({
          name: 'Incomplete Customer',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error.details)).toContain('phone');
      expect(JSON.stringify(res.body.error.details)).toContain('address');
    });

    it('rejects duplicate customer with 409 CONFLICT when phone and name match existing record', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles' || table === 'staff') {
            return setupAuthMock('ADMIN')(table);
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'existing-cust-id',
                        customer_code: 'CUST-100200',
                        name: 'Acme Commercial Ltd',
                        email: 'acme@example.com',
                        phone: '9876543210',
                        is_active: true,
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', adminAuthToken)
        .send({
          name: 'Acme Commercial Ltd',
          phone: '9876543210',
          address: '101 Industrial Park',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('already exists');
      expect(res.body.error.details).toBeDefined();
    });
  });

  describe('3. Customer Retrieval & Search (GET /api/v1/customers & /:id)', () => {
    it('retrieves single customer by UUID with primary site details', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles' || table === 'staff') {
            return setupAuthMock('ADMIN')(table);
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: sampleCustomer,
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get(`/api/v1/customers/${sampleCustomerId}`)
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customer.id).toBe(sampleCustomerId);
      expect(res.body.data.customer.primarySite).toBeDefined();
      expect(res.body.data.customer.primarySite.contactPerson).toBe('John Doe');
    });

    it('returns 404 NOT_FOUND when customer UUID does not exist', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles' || table === 'staff') {
            return setupAuthMock('ADMIN')(table);
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
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
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/customers/00000000-0000-0000-0000-000000000000')
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects malformed UUID parameter with 422 VALIDATION_ERROR', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation(setupAuthMock('ADMIN')),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/customers/invalid-non-uuid-id')
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('filters customer listing by search, customerType and status', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles' || table === 'staff') {
            return setupAuthMock('ADMIN')(table);
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnThis(),
                or: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                range: vi.fn().mockResolvedValue({
                  data: [sampleCustomer],
                  count: 1,
                  error: null,
                }),
              }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/customers?search=Acme&type=TEMPORARY&status=ACTIVE&page=1&pageSize=10')
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBe(1);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.pageSize).toBe(10);
    });
  });

  describe('4. Customer Updates & Status Management (PATCH)', () => {
    it('updates customer details via PATCH /api/v1/customers/:id', async () => {
      const updatedCustomer = {
        ...sampleCustomer,
        company_name: 'Acme Global Ltd',
        notes: 'Updated contact person details',
      };

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles' || table === 'staff') {
            return setupAuthMock('ADMIN')(table);
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: sampleCustomer,
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === 'activity_logs') {
            return { insert: vi.fn().mockResolvedValue({ error: null }) };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .patch(`/api/v1/customers/${sampleCustomerId}`)
        .set('Authorization', adminAuthToken)
        .send({
          companyName: 'Acme Global Ltd',
          notes: 'Updated contact person details',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customer).toBeDefined();
    });

    it('toggles customer active status via PATCH /api/v1/customers/:id/status', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles' || table === 'staff') {
            return setupAuthMock('ADMIN')(table);
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: sampleCustomer,
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === 'activity_logs') {
            return { insert: vi.fn().mockResolvedValue({ error: null }) };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .patch(`/api/v1/customers/${sampleCustomerId}/status`)
        .set('Authorization', adminAuthToken)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customer).toBeDefined();
    });
  });

  describe('5. Temporary -> Permanent Conversion (POST /api/v1/customers/:id/convert-to-permanent)', () => {
    it('successfully converts TEMPORARY customer to PERMANENT preserving ID and customerCode', async () => {
      const convertedCustomer = {
        ...sampleCustomer,
        customer_type: 'PERMANENT',
      };

      let callCount = 0;
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles' || table === 'staff') {
            return setupAuthMock('ADMIN')(table);
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockImplementation(() => {
                    callCount++;
                    return Promise.resolve({
                      data: callCount === 1 ? sampleCustomer : convertedCustomer,
                      error: null,
                    });
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === 'activity_logs') {
            return { insert: vi.fn().mockResolvedValue({ error: null }) };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post(`/api/v1/customers/${sampleCustomerId}/convert-to-permanent`)
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Customer successfully converted to PERMANENT');
      expect(res.body.data.customer.customerType).toBe('PERMANENT');
      // ID and customerCode must remain completely unchanged
      expect(res.body.data.customer.id).toBe(sampleCustomerId);
      expect(res.body.data.customer.customerCode).toBe('CUST-100200');
    });

    it('safely handles idempotent conversion when customer is already PERMANENT', async () => {
      const permanentCustomer = {
        ...sampleCustomer,
        customer_type: 'PERMANENT',
      };

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles' || table === 'staff') {
            return setupAuthMock('ADMIN')(table);
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: permanentCustomer,
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post(`/api/v1/customers/${sampleCustomerId}/convert-to-permanent`)
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alreadyPermanent).toBe(true);
      expect(res.body.data.message).toContain('already classified as PERMANENT');
      expect(res.body.data.customer.customerType).toBe('PERMANENT');
    });
  });
});
