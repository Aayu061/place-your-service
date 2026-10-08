import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('AC Asset Register API (/api/v1/sites/:siteId/assets & /api/v1/assets)', () => {
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
  const sampleAssetId = '55555555-5555-5555-5555-555555555555';

  const sampleSite = {
    id: sampleSiteId,
    customer_id: sampleCustomerId,
    site_name: 'Head Office - Mumbai',
    is_active: true,
  };

  const sampleAsset = {
    id: sampleAssetId,
    asset_tag: 'AC-100201',
    site_id: sampleSiteId,
    brand: 'Daikin',
    model_number: 'FTKF50TV',
    serial_number: 'DKN-984211',
    ac_type: 'SPLIT',
    capacity_tons: 1.5,
    installation_date: '2025-06-15',
    floor_location: '2nd Floor',
    room_location: 'Server Room A',
    refrigerant_type: 'R32',
    warranty_status: 'UNDER_WARRANTY',
    is_active: true,
    notes: 'Critical cooling unit',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    customer_sites: {
      site_name: 'Head Office - Mumbai',
      customer_id: sampleCustomerId,
      customers: {
        name: 'Acme Commercial Ltd',
        customer_code: 'CUST-100200',
      },
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

  it('1. Rejects unauthenticated asset listing with 401', async () => {
    const res = await request(app).get(`/api/v1/sites/${sampleSiteId}/assets`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('2. ADMIN can list assets for a site with filters', async () => {
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
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({
              data: [sampleAsset],
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
      .get(`/api/v1/sites/${sampleSiteId}/assets?acType=SPLIT&warrantyStatus=UNDER_WARRANTY`)
      .set('Authorization', adminAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assets).toHaveLength(1);
    expect(res.body.data.assets[0].assetTag).toBe('AC-100201');
    expect(res.body.data.assets[0].brand).toBe('Daikin');
    expect(res.body.data.assets[0].siteName).toBe('Head Office - Mumbai');
  });

  it('3. STAFF can create a new AC asset under site', async () => {
    const assetPayload = {
      brand: 'Voltas',
      modelNumber: 'V-SPLIT-20',
      serialNumber: 'VOLT-77881',
      acType: 'SPLIT',
      capacityTons: 2.0,
      installationDate: '2026-01-10',
      floorLocation: 'Ground Floor',
      roomLocation: 'Reception',
      refrigerantType: 'R410A',
      warrantyStatus: 'UNDER_WARRANTY',
      notes: 'Reception unit',
    };

    const createdAssetRow = {
      ...sampleAsset,
      id: '66666666-6666-6666-6666-666666666666',
      asset_tag: 'AC-309112',
      brand: 'Voltas',
      model_number: 'V-SPLIT-20',
      serial_number: 'VOLT-77881',
      capacity_tons: 2.0,
    };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockStaffUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('STAFF')(table);
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
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: createdAssetRow, error: null }),
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
      .post(`/api/v1/sites/${sampleSiteId}/assets`)
      .set('Authorization', staffAuthToken)
      .send(assetPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.asset.brand).toBe('Voltas');
    expect(res.body.data.asset.assetTag).toBe('AC-309112');
  });

  it('4. Rejects duplicate asset tag with 409 Conflict', async () => {
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
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'other-id', asset_tag: 'AC-100201' }, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post(`/api/v1/sites/${sampleSiteId}/assets`)
      .set('Authorization', adminAuthToken)
      .send({
        assetTag: 'AC-100201',
        brand: 'LG',
        acType: 'SPLIT',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toContain('already exists');
  });

  it('5. Rejects asset creation on inactive site with 400', async () => {
    const inactiveSite = { ...sampleSite, is_active: false };

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
            maybeSingle: vi.fn().mockResolvedValue({ data: inactiveSite, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post(`/api/v1/sites/${sampleSiteId}/assets`)
      .set('Authorization', adminAuthToken)
      .send({
        brand: 'Carrier',
        acType: 'CASSETTE',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('inactive site');
  });

  it('6. GET single asset by ID', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleAsset, error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .get(`/api/v1/assets/${sampleAssetId}`)
      .set('Authorization', adminAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.asset.assetTag).toBe('AC-100201');
    expect(res.body.data.asset.capacityTons).toBe(1.5);
  });

  it('7. PATCH updates asset fields and logs audit event', async () => {
    const updatedAsset = { ...sampleAsset, floor_location: '3rd Floor Executive Suite' };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleAsset, error: null }),
            update: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: updatedAsset, error: null }),
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
      .patch(`/api/v1/assets/${sampleAssetId}`)
      .set('Authorization', adminAuthToken)
      .send({ floorLocation: '3rd Floor Executive Suite' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.asset.floorLocation).toBe('3rd Floor Executive Suite');
  });

  it('8. PATCH updates asset status to INACTIVE', async () => {
    const deactivatedAsset = { ...sampleAsset, is_active: false };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('ADMIN')(table);
        if (authHandler.select) return authHandler;

        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleAsset, error: null }),
            update: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: deactivatedAsset, error: null }),
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
      .patch(`/api/v1/assets/${sampleAssetId}/status`)
      .set('Authorization', adminAuthToken)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.asset.isActive).toBe(false);
  });

  it('9. GET /api/v1/assets/:id/amc-history returns current AMC and historical contracts with visit progress', async () => {
    const historicalContract = {
      id: 'old-contract-111',
      contract_number: 'AMC-2026-0001',
      status: 'RENEWED',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      plan_name: 'Basic AMC',
      billing_frequency: 'QUARTERLY',
      total_amount: 24000,
      total_visits: 4,
      previous_contract_id: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const activeContract = {
      id: 'active-contract-222',
      contract_number: 'AMC-2027-0002',
      status: 'ACTIVE',
      start_date: '2027-01-01',
      end_date: '2027-12-31',
      plan_name: 'Basic AMC',
      billing_frequency: 'QUARTERLY',
      total_amount: 26000,
      total_visits: 4,
      previous_contract_id: 'old-contract-111',
      created_at: '2027-01-01T00:00:00Z',
    };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockStaffUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock('STAFF')(table);
        if (authHandler.select) return authHandler;

        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleAsset, error: null }),
            single: vi.fn().mockResolvedValue({ data: sampleAsset, error: null }),
          };
        }
        if (table === 'amc_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [
                { asset_id: sampleAssetId, contract_id: activeContract.id, amc_contracts: activeContract },
              ],
              error: null,
            }),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [
                { contract_id: activeContract.id, amc_contracts: activeContract },
                { contract_id: historicalContract.id, amc_contracts: historicalContract },
              ],
              error: null,
            }),
          };
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{ amc_id: activeContract.id, status: 'COMPLETED' }],
              error: null,
            }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .get(`/api/v1/assets/${sampleAssetId}/amc-history`)
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assetId).toBe(sampleAssetId);
    expect(res.body.data.assetTag).toBe(sampleAsset.asset_tag);
    expect(res.body.data.currentAmc).toBeDefined();
    expect(res.body.data.currentAmc.contractNumber).toBe('AMC-2027-0002');
    expect(res.body.data.currentAmc.status).toBe('ACTIVE');
    expect(res.body.data.history).toHaveLength(2);
  });
});
