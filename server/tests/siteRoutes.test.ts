import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('Customer Sites Management API (/api/v1/customers/:customerId/sites & /api/v1/sites)', () => {
  const adminAuthToken = 'Bearer valid-admin-token';
  const staffAuthToken = 'Bearer valid-staff-token';

  const mockAdminUser = { id: 'admin-auth-id' };
  const mockAdminProfile = { id: 'admin-auth-id', full_name: 'Super Admin', email: 'admin@pys.internal' };
  const mockAdminStaff = { id: 'admin-staff-id', role: 'ADMIN', is_active: true };

  const mockStaffUser = { id: 'staff-auth-id' };
  const mockStaffProfile = { id: 'staff-auth-id', full_name: 'Operations Staff', email: 'staff@pys.internal' };
  const mockStaffRecord = { id: 'staff-record-id', role: 'STAFF', is_active: true };

  const sampleCustomerId = '11111111-1111-1111-1111-111111111111';
  const sampleSiteId = '22222222-2222-2222-2222-222222222222';
  const sampleSite2Id = '33333333-3333-3333-3333-333333333333';

  const sampleCustomer = {
    id: sampleCustomerId,
    customer_code: 'CUST-100200',
    name: 'Acme Commercial Ltd',
  };

  const sampleSite = {
    id: sampleSiteId,
    customer_id: sampleCustomerId,
    site_name: 'Head Office - Mumbai',
    address: '101 Marine Drive',
    contact_person: 'Mr. Sharma',
    contact_phone: '9876543210',
    contact_email: 'sharma@acme.example',
    is_primary: true,
    is_active: true,
    notes: 'Main administrative headquarters',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    customers: {
      name: 'Acme Commercial Ltd',
      customer_code: 'CUST-100200',
    },
  };

  const sampleSite2 = {
    id: sampleSite2Id,
    customer_id: sampleCustomerId,
    site_name: 'Warehouse 3 - Navi Mumbai',
    address: 'Plot 42 TTC Industrial Area',
    contact_person: 'Mr. Patel',
    contact_phone: '9876543220',
    contact_email: 'patel@acme.example',
    is_primary: false,
    is_active: true,
    notes: 'Secondary cold storage warehouse',
    created_at: '2026-10-02T10:00:00Z',
    updated_at: '2026-10-02T10:00:00Z',
    customers: {
      name: 'Acme Commercial Ltd',
      customer_code: 'CUST-100200',
    },
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

  it('1. Rejects unauthenticated site listing with 401', async () => {
    const res = await request(app).get(`/api/v1/customers/${sampleCustomerId}/sites`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('2. Rejects unauthorized role with 403', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'unauth-id' } }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'unauth-id' }, error: null }),
          };
        }
        if (table === 'staff') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .get(`/api/v1/customers/${sampleCustomerId}/sites`)
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('3. ADMIN can list customer sites with real asset counts', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'customers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleCustomer, error: null }),
          };
        }
        if (table === 'customer_sites') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({
              data: [sampleSite, sampleSite2],
              error: null,
              count: 2,
            }),
          };
        }
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                { site_id: sampleSiteId },
                { site_id: sampleSiteId },
                { site_id: sampleSite2Id },
              ],
              error: null,
            }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .get(`/api/v1/customers/${sampleCustomerId}/sites`)
      .set('Authorization', adminAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sites).toHaveLength(2);
    expect(res.body.data.sites[0].siteName).toBe('Head Office - Mumbai');
    expect(res.body.data.sites[0].isPrimary).toBe(true);
    expect(res.body.data.sites[0].assetCount).toBe(2);
    expect(res.body.data.sites[1].siteName).toBe('Warehouse 3 - Navi Mumbai');
    expect(res.body.data.sites[1].assetCount).toBe(1);
  });

  it('4. Returns 404 when listing sites for non-existent customer', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockStaffUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('STAFF')(table);
        if (authHandler.select) return authHandler;

        if (table === 'customers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .get(`/api/v1/customers/${sampleCustomerId}/sites`)
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('5. STAFF can create a new site under customer', async () => {
    const newSitePayload = {
      siteName: 'Panvel Depot',
      address: 'NH4 Highway Junction',
      contactPerson: 'Karan Mehra',
      contactPhone: '9876543230',
      contactEmail: 'karan@acme.example',
      isPrimary: false,
      notes: 'Logistics outpost',
    };

    const createdSiteRow = {
      id: '44444444-4444-4444-4444-444444444444',
      customer_id: sampleCustomerId,
      site_name: newSitePayload.siteName,
      address: newSitePayload.address,
      contact_person: newSitePayload.contactPerson,
      contact_phone: newSitePayload.contactPhone,
      contact_email: newSitePayload.contactEmail,
      is_primary: false,
      is_active: true,
      notes: newSitePayload.notes,
      created_at: '2026-10-07T12:00:00Z',
      updated_at: '2026-10-07T12:00:00Z',
      customers: sampleCustomer,
    };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockStaffUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('STAFF')(table);
        if (authHandler.select) return authHandler;

        if (table === 'customers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleCustomer, error: null }),
          };
        }
        if (table === 'customer_sites') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: createdSiteRow, error: null }),
          };
        }
        if (table === 'activity_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post(`/api/v1/customers/${sampleCustomerId}/sites`)
      .set('Authorization', staffAuthToken)
      .send(newSitePayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.site.siteName).toBe('Panvel Depot');
    expect(res.body.data.site.contactPerson).toBe('Karan Mehra');
  });

  it('6. GET single site by ID returns details with asset count', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'customer_sites') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleSite, error: null }),
          };
        }
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
            }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .get(`/api/v1/sites/${sampleSiteId}`)
      .set('Authorization', adminAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.site.siteName).toBe('Head Office - Mumbai');
    expect(res.body.data.site.assetCount).toBe(5);
  });

  it('7. Atomically sets site as primary and demotes previous primary', async () => {
    let previousDemoted = false;
    const promotedSite = { ...sampleSite2, is_primary: true };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'customer_sites') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((field: string, val: any) => {
              return {
                maybeSingle: vi.fn().mockResolvedValue({ data: sampleSite2, error: null }),
                eq: vi.fn().mockImplementation((subField: string, subVal: any) => {
                  if (field === 'customer_id' && subField === 'is_primary') {
                    previousDemoted = true;
                    return Promise.resolve({ data: null, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                }),
              };
            }),
            update: vi.fn().mockImplementation((updates: any) => {
              if (updates.is_primary === false) {
                previousDemoted = true;
              }
              return {
                eq: vi.fn().mockImplementation((f: string, v: any) => {
                  return {
                    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
                    select: vi.fn().mockReturnThis(),
                    single: vi.fn().mockResolvedValue({ data: promotedSite, error: null }),
                  };
                }),
              };
            }),
          };
        }
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
            }),
          };
        }
        if (table === 'activity_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post(`/api/v1/sites/${sampleSite2Id}/set-primary`)
      .set('Authorization', adminAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.site.isPrimary).toBe(true);
    expect(previousDemoted).toBe(true);
  });

  it('8. Blocks deactivation of site with active AC assets', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'customer_sites') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleSite, error: null }),
          };
        }
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
            }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .patch(`/api/v1/sites/${sampleSiteId}/status`)
      .set('Authorization', adminAuthToken)
      .send({ isActive: false });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('active AC asset(s)');
  });
});
