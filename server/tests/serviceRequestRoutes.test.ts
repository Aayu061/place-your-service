import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('Service Request Management API (/api/v1/service-requests)', () => {
  const adminAuthToken = 'Bearer valid-admin-token';
  const staffAuthToken = 'Bearer valid-staff-token';
  const inactiveStaffToken = 'Bearer inactive-staff-token';

  const mockAdminUser = { id: 'admin-auth-id' };
  const mockAdminProfile = { id: 'admin-auth-id', full_name: 'Super Admin', email: 'admin@pys.internal' };
  const mockAdminStaff = { id: 'admin-staff-id', role: 'ADMIN', is_active: true };

  const mockStaffUser = { id: 'staff-auth-id' };
  const mockStaffProfile = { id: 'staff-auth-id', full_name: 'Operations Staff', email: 'staff@pys.internal' };
  const mockStaffRecord = { id: 'staff-record-id', role: 'STAFF', is_active: true };

  const mockInactiveStaffUser = { id: 'inactive-staff-id' };
  const mockInactiveStaffProfile = { id: 'inactive-staff-id', full_name: 'Inactive Staff', email: 'inactive@pys.internal' };
  const mockInactiveStaffRecord = { id: 'inactive-record-id', role: 'STAFF', is_active: false };

  const sampleCustomerId = '11111111-1111-1111-1111-111111111111';
  const sampleSiteId = '22222222-2222-2222-2222-222222222222';
  const foreignSiteId = '33333333-3333-3333-3333-333333333333';
  const sampleAssetId = '55555555-5555-5555-5555-555555555555';
  const foreignAssetId = '66666666-6666-6666-6666-666666666666';
  const sampleRequestId = '77777777-7777-7777-7777-777777777777';

  const sampleCustomer = {
    id: sampleCustomerId,
    customer_code: 'CUST-100200',
    name: 'Acme Commercial Ltd',
    phone: '9876543210',
    is_active: true,
  };

  const sampleSite = {
    id: sampleSiteId,
    customer_id: sampleCustomerId,
    site_name: 'Head Office - Mumbai',
    address: '101 Marine Drive',
    is_active: true,
  };

  const foreignSite = {
    id: foreignSiteId,
    customer_id: '99999999-9999-9999-9999-999999999999',
    site_name: 'Delhi Branch (Other Customer)',
    address: 'Connaught Place',
    is_active: true,
  };

  const sampleAsset = {
    id: sampleAssetId,
    site_id: sampleSiteId,
    asset_tag: 'AC-HQ-01',
    brand: 'Daikin',
    model_number: 'FTKF50',
    is_active: true,
  };

  const foreignAsset = {
    id: foreignAssetId,
    site_id: foreignSiteId,
    asset_tag: 'AC-DEL-01',
    brand: 'Voltas',
    model_number: 'V100',
    is_active: true,
  };

  const sampleRequestRecord = {
    id: sampleRequestId,
    request_number: 'SR-2026-000001',
    customer_id: sampleCustomerId,
    site_id: sampleSiteId,
    asset_id: sampleAssetId,
    request_type: 'BREAKDOWN',
    priority: 'HIGH',
    description: 'AC unit not cooling in conference room',
    reported_date: '2026-10-07T10:00:00Z',
    preferred_date: '2026-10-08',
    status: 'REQUESTED',
    notes: 'Urgent cooling required for board meeting',
    cancellation_reason: null,
    cancelled_at: null,
    cancelled_by: null,
    created_by: 'admin-auth-id',
    updated_by: null,
    created_at: '2026-10-07T10:00:00Z',
    updated_at: '2026-10-07T10:00:00Z',
    customers: {
      name: 'Acme Commercial Ltd',
      customer_code: 'CUST-100200',
      phone: '9876543210',
    },
    customer_sites: {
      site_name: 'Head Office - Mumbai',
      address: '101 Marine Drive',
    },
    ac_assets: {
      asset_tag: 'AC-HQ-01',
      brand: 'Daikin',
      model_number: 'FTKF50',
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupAuthMock = (role: 'ADMIN' | 'STAFF' | 'INACTIVE' = 'ADMIN') => {
    return (table: string) => {
      if (table === 'profiles') {
        const userProfile =
          role === 'ADMIN'
            ? mockAdminProfile
            : role === 'STAFF'
            ? mockStaffProfile
            : mockInactiveStaffProfile;
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: userProfile,
            error: null,
          }),
        };
      }
      if (table === 'staff') {
        const staffRec =
          role === 'ADMIN'
            ? mockAdminStaff
            : role === 'STAFF'
            ? mockStaffRecord
            : mockInactiveStaffRecord;
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: staffRec,
            error: null,
          }),
        };
      }
      return {};
    };
  };

  // 1. Authorization tests
  it('1. Rejects unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/v1/service-requests');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('2. Rejects unauthorized role with 403', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'unknown-id' } }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'unknown-id' }, error: null }),
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
      .get('/api/v1/service-requests')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('3. Rejects inactive staff user with 403', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockInactiveStaffUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        return setupAuthMock('INACTIVE')(table);
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .get('/api/v1/service-requests')
      .set('Authorization', inactiveStaffToken);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // 2. Validation & Creation tests
  it('4. Rejects request creation with validation errors (missing fields, short description) with 422', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        return setupAuthMock('ADMIN')(table);
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post('/api/v1/service-requests')
      .set('Authorization', adminAuthToken)
      .send({
        customerId: sampleCustomerId,
        siteId: sampleSiteId,
        requestType: 'BREAKDOWN',
        description: 'No', // Too short (< 5 chars)
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('5. Rejects request creation with unknown customer with 400', async () => {
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
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post('/api/v1/service-requests')
      .set('Authorization', adminAuthToken)
      .send({
        customerId: sampleCustomerId,
        siteId: sampleSiteId,
        requestType: 'BREAKDOWN',
        description: 'AC unit is leaking water',
      });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('Customer with ID');
  });

  it('6. Rejects request creation when site does NOT belong to customer (Relational integrity)', async () => {
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
            // Returns site belonging to a DIFFERENT customer
            maybeSingle: vi.fn().mockResolvedValue({ data: foreignSite, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post('/api/v1/service-requests')
      .set('Authorization', adminAuthToken)
      .send({
        customerId: sampleCustomerId,
        siteId: foreignSiteId,
        requestType: 'BREAKDOWN',
        description: 'AC unit is leaking water',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Relational Mismatch: Site');
  });

  it('7. Rejects request creation when asset does NOT belong to site (Relational integrity)', async () => {
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
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleSite, error: null }),
          };
        }
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            // Returns asset belonging to foreign site
            maybeSingle: vi.fn().mockResolvedValue({ data: foreignAsset, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post('/api/v1/service-requests')
      .set('Authorization', adminAuthToken)
      .send({
        customerId: sampleCustomerId,
        siteId: sampleSiteId,
        assetId: foreignAssetId,
        requestType: 'BREAKDOWN',
        description: 'AC unit is leaking water',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Relational Mismatch: AC Asset');
  });

  it('8. ADMIN can create asset-level service request (201)', async () => {
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
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleSite, error: null }),
          };
        }
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleAsset, error: null }),
          };
        }
        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // For request number generation
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: sampleRequestRecord, error: null }),
              }),
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
      .post('/api/v1/service-requests')
      .set('Authorization', adminAuthToken)
      .send({
        customerId: sampleCustomerId,
        siteId: sampleSiteId,
        assetId: sampleAssetId,
        requestType: 'BREAKDOWN',
        priority: 'HIGH',
        description: 'AC unit not cooling in conference room',
        preferredDate: '2026-10-08',
        notes: 'Urgent cooling required for board meeting',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.request.requestNumber).toBe('SR-2026-000001');
    expect(res.body.data.request.status).toBe('REQUESTED');
    expect(res.body.data.request.priority).toBe('HIGH');
    expect(res.body.data.request.assetId).toBe(sampleAssetId);
    expect(res.body.data.request.assetTag).toBe('AC-HQ-01');
  });

  it('9. STAFF can create site-level service request without asset (201)', async () => {
    const siteLevelRecord = {
      ...sampleRequestRecord,
      asset_id: null,
      ac_assets: null,
      request_type: 'GENERAL_SERVICE',
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
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleSite, error: null }),
          };
        }
        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: siteLevelRecord, error: null }),
              }),
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
      .post('/api/v1/service-requests')
      .set('Authorization', staffAuthToken)
      .send({
        customerId: sampleCustomerId,
        siteId: sampleSiteId,
        requestType: 'GENERAL_SERVICE',
        priority: 'MEDIUM',
        description: 'Comprehensive annual maintenance inspection across premises',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.request.assetId).toBeNull();
    expect(res.body.data.request.requestType).toBe('GENERAL_SERVICE');
  });

  // 3. Read Operations
  it('10. Lists service requests with search, filter, and pagination', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({
              data: [sampleRequestRecord],
              error: null,
              count: 1,
            }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .get('/api/v1/service-requests?search=cooling&status=REQUESTED&priority=HIGH&page=1&pageSize=10')
      .set('Authorization', adminAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.requests).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(10);
  });

  it('11. Retrieves single service request by ID', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleRequestRecord, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .get(`/api/v1/service-requests/${sampleRequestId}`)
      .set('Authorization', adminAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.request.id).toBe(sampleRequestId);
    expect(res.body.data.request.requestNumber).toBe('SR-2026-000001');
  });

  it('12. Returns 404 when service request ID is not found', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'service_requests') {
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
      .get(`/api/v1/service-requests/${sampleRequestId}`)
      .set('Authorization', adminAuthToken);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // 4. Update Operations
  it('13. Updates service request priority, description, and notes', async () => {
    const updatedRecord = {
      ...sampleRequestRecord,
      priority: 'URGENT',
      description: 'Severe refrigerant leak detected in conference room',
      notes: 'Customer escalated issue',
    };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleRequestRecord, error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: updatedRecord, error: null }),
                }),
              }),
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
      .patch(`/api/v1/service-requests/${sampleRequestId}`)
      .set('Authorization', adminAuthToken)
      .send({
        priority: 'URGENT',
        description: 'Severe refrigerant leak detected in conference room',
        notes: 'Customer escalated issue',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.request.priority).toBe('URGENT');
    expect(res.body.data.request.description).toBe('Severe refrigerant leak detected in conference room');
  });

  // 5. State Machine & Transition Operations
  it('14. Valid state transition: REQUESTED -> PENDING (200)', async () => {
    const pendingRecord = {
      ...sampleRequestRecord,
      status: 'PENDING',
    };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleRequestRecord, error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: pendingRecord, error: null }),
                }),
              }),
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
      .post(`/api/v1/service-requests/${sampleRequestId}/status`)
      .set('Authorization', adminAuthToken)
      .send({
        status: 'PENDING',
        reason: 'Office staff reviewing customer requirement',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.request.status).toBe('PENDING');
  });

  it('15. Rejects invalid state transition: REQUESTED -> COMPLETED with 409 Conflict', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleRequestRecord, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post(`/api/v1/service-requests/${sampleRequestId}/status`)
      .set('Authorization', adminAuthToken)
      .send({
        status: 'COMPLETED',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain("Invalid status transition from 'REQUESTED' to 'COMPLETED'");
  });

  // 6. Cancellation & Idempotency
  it('16. Cancels service request with reason and audit log (200)', async () => {
    const cancelledRecord = {
      ...sampleRequestRecord,
      status: 'CANCELLED',
      cancellation_reason: 'Duplicate request logged by client',
      cancelled_at: '2026-10-07T12:00:00Z',
      cancelled_by: 'admin-auth-id',
    };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleRequestRecord, error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: cancelledRecord, error: null }),
                }),
              }),
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
      .post(`/api/v1/service-requests/${sampleRequestId}/cancel`)
      .set('Authorization', adminAuthToken)
      .send({
        reason: 'Duplicate request logged by client',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.request.status).toBe('CANCELLED');
    expect(res.body.data.request.cancellationReason).toBe('Duplicate request logged by client');
  });

  it('17. Repeated cancellation is idempotent: returns 200 without duplicate update', async () => {
    const alreadyCancelledRecord = {
      ...sampleRequestRecord,
      status: 'CANCELLED',
      cancellation_reason: 'Already cancelled earlier',
    };

    const updateSpy = vi.fn();

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: alreadyCancelledRecord, error: null }),
            update: updateSpy,
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post(`/api/v1/service-requests/${sampleRequestId}/cancel`)
      .set('Authorization', adminAuthToken)
      .send({
        reason: 'Attempting cancellation again',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.request.status).toBe('CANCELLED');
    // Ensure update was not called again (idempotent no-op)
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('18. Rejects cancellation of an already COMPLETED request with 400', async () => {
    const completedRecord = {
      ...sampleRequestRecord,
      status: 'COMPLETED',
    };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: completedRecord, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post(`/api/v1/service-requests/${sampleRequestId}/cancel`)
      .set('Authorization', adminAuthToken)
      .send({
        reason: 'Too late to cancel',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Cannot cancel a service request that is already completed');
  });

  it('19. Blocks modification of service request in terminal CANCELLED state with 400', async () => {
    const cancelledRecord = {
      ...sampleRequestRecord,
      status: 'CANCELLED',
    };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: cancelledRecord, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .patch(`/api/v1/service-requests/${sampleRequestId}`)
      .set('Authorization', adminAuthToken)
      .send({
        priority: 'LOW',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Cannot modify a service request that is already in 'CANCELLED' status");
  });
});
