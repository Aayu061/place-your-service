import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('Phase B: Asset Specification Persistence & Legacy Compatibility Suite', () => {
  const adminAuthToken = 'Bearer valid-admin-token';
  const mockAdminUser = { id: 'admin-auth-id' };
  const mockAdminProfile = { id: 'admin-auth-id', full_name: 'Super Admin', email: 'admin@pys.internal' };
  const mockAdminStaff = { id: 'admin-staff-id', role: 'ADMIN', is_active: true };

  const sampleCustomerId = '11111111-1111-1111-1111-111111111111';
  const sampleSiteId = '22222222-2222-2222-2222-222222222222';
  const sampleAssetId = '55555555-5555-5555-5555-555555555555';
  const sampleVariantId = '33333333-3333-3333-3333-333333333333';
  const sampleModelId = '44444444-4444-4444-4444-444444444444';

  const sampleSite = {
    id: sampleSiteId,
    customer_id: sampleCustomerId,
    site_name: 'Head Office - Mumbai',
    is_active: true,
  };

  const sampleVariant = {
    id: sampleVariantId,
    model_id: sampleModelId,
    capacity_tons: 2.0,
    star_rating: '3 Star',
    ac_type: 'Split AC',
    technology: 'Non Inverter', // Catalogue stores "Non Inverter" with space
    refrigerant: 'R410A',
    is_active: true,
    ac_models: {
      id: sampleModelId,
      brand_id: 'brand-111',
      is_active: true,
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupAuthMock = () => {
    return (table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockAdminProfile,
            error: null,
          }),
        };
      }
      if (table === 'staff') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockAdminStaff,
            error: null,
          }),
        };
      }
      return {};
    };
  };

  it('1. createAcAsset preserves operator-confirmed specifications rather than overwriting with variant defaults', async () => {
    let insertedRecord: any = null;

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock()(table);
        if (authHandler.select) return authHandler;

        if (table === 'customer_sites') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleSite, error: null }),
          };
        }
        if (table === 'ac_model_variants') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleVariant, error: null }),
          };
        }
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ asset_tag: 'ESSC-0027' }], error: null }),
            insert: vi.fn().mockImplementation((rec: any) => {
              insertedRecord = rec;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: sampleAssetId,
                    ...rec,
                    customer_sites: {
                      site_name: sampleSite.site_name,
                      customer_id: sampleCustomerId,
                      customers: { name: 'Acme Ltd', customer_code: 'CUST-001' },
                    },
                  },
                  error: null,
                }),
              };
            }),
          };
        }
        if (table === 'activity_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    // Operator provides customized 1.8 Ton, 5 Star, Inverter, R32 even while supplying variantId
    const res = await request(app)
      .post(`/api/v1/sites/${sampleSiteId}/assets`)
      .set('Authorization', adminAuthToken)
      .send({
        brand: 'Mitsubishi Heavy',
        modelNumber: 'SRK24CW-S6',
        variantId: sampleVariantId,
        serialNumber: 'MH-992112',
        acType: 'Split AC',
        technology: 'Inverter', // Operator confirms Inverter
        capacityTons: 1.8,       // Operator confirms 1.8 TR (variant was 2.0)
        starRating: '5 Star',   // Operator confirms 5 Star (variant was 3 Star)
        refrigerantType: 'R32', // Operator confirms R32 (variant was R410A)
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Verify operator specifications were preserved in database insert
    expect(insertedRecord).toBeTruthy();
    expect(insertedRecord.capacity_tons).toBe(1.8);
    expect(insertedRecord.star_rating).toBe('5 Star');
    expect(insertedRecord.technology).toBe('Inverter');
    expect(insertedRecord.refrigerant_type).toBe('R32');
    expect(insertedRecord.brand).toBe('Mitsubishi Heavy');
    expect(insertedRecord.model_number).toBe('SRK24CW-S6');
    expect(insertedRecord.variant_id).toBe(sampleVariantId);
  });

  it('2. createAcAsset with legacy client pre-fills only omitted specifications from variant', async () => {
    let insertedRecord: any = null;

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock()(table);
        if (authHandler.select) return authHandler;

        if (table === 'customer_sites') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleSite, error: null }),
          };
        }
        if (table === 'ac_model_variants') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleVariant, error: null }),
          };
        }
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ asset_tag: 'ESSC-0027' }], error: null }),
            insert: vi.fn().mockImplementation((rec: any) => {
              insertedRecord = rec;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: sampleAssetId,
                    ...rec,
                    customer_sites: {
                      site_name: sampleSite.site_name,
                      customer_id: sampleCustomerId,
                      customers: { name: 'Acme Ltd', customer_code: 'CUST-001' },
                    },
                  },
                  error: null,
                }),
              };
            }),
          };
        }
        if (table === 'activity_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    // Legacy payload omits technology, capacity, and starRating (has acType and variantId)
    const res = await request(app)
      .post(`/api/v1/sites/${sampleSiteId}/assets`)
      .set('Authorization', adminAuthToken)
      .send({
        brand: 'Mitsubishi Heavy',
        variantId: sampleVariantId,
        serialNumber: 'MH-LEGACY-001',
        acType: 'Split AC',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Omitted fields should be populated from variant, and technology normalized
    expect(insertedRecord).toBeTruthy();
    expect(insertedRecord.capacity_tons).toBe(2.0);
    expect(insertedRecord.star_rating).toBe('3 Star');
    expect(insertedRecord.technology).toBe('Non-Inverter'); // Normalized from 'Non Inverter'
    expect(insertedRecord.refrigerant_type).toBe('R410A');
  });

  it('3. updateAcAsset preserves explicitly edited specifications and normalizes technology', async () => {
    let updatedRecord: any = null;

    const existingAsset = {
      id: sampleAssetId,
      asset_tag: 'ESSC-0001',
      site_id: sampleSiteId,
      brand: 'Daikin',
      model_number: 'FTKF50TV',
      serial_number: 'SN-001',
      ac_type: 'Split AC',
      technology: 'Inverter',
      capacity_tons: 1.5,
      star_rating: '5 Star',
      refrigerant_type: 'R32',
      is_active: true,
      warranty_status: 'UNDER_WARRANTY',
      warranty_start_date: '2025-01-01',
      warranty_end_date: '2026-01-01',
      customer_sites: {
        site_name: sampleSite.site_name,
        customer_id: sampleCustomerId,
        customers: { name: 'Acme Ltd', customer_code: 'CUST-001' },
      },
    };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock()(table);
        if (authHandler.select) return authHandler;

        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: existingAsset, error: null }),
            update: vi.fn().mockImplementation((updates: any) => {
              updatedRecord = updates;
              return {
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: {
                    ...existingAsset,
                    ...updates,
                  },
                  error: null,
                }),
              };
            }),
          };
        }
        if (table === 'activity_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    // Partial update changing only technology to "Non Inverter" and capacity to 1.8
    const res = await request(app)
      .patch(`/api/v1/assets/${sampleAssetId}`)
      .set('Authorization', adminAuthToken)
      .send({
        technology: 'Non Inverter',
        capacityTons: 1.8,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify partial update:
    // 1. technology was normalized to 'Non-Inverter'
    // 2. capacity was updated to 1.8
    // 3. omitted fields (brand, star_rating, refrigerant_type) were NOT in update payload (not erased!)
    expect(updatedRecord).toBeTruthy();
    expect(updatedRecord.technology).toBe('Non-Inverter');
    expect(updatedRecord.capacity_tons).toBe(1.8);
    expect(updatedRecord.brand).toBeUndefined();
    expect(updatedRecord.star_rating).toBeUndefined();
    expect(updatedRecord.refrigerant_type).toBeUndefined();
  });
});
