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

  it('4. createAcAsset refrigerant cascade: variant refrigerant takes precedence over model refrigerant', async () => {
    let insertedRecord: any = null;

    const variantWithR32 = {
      ...sampleVariant,
      refrigerant: 'R32',
      ac_models: {
        id: sampleModelId,
        brand_id: 'brand-111',
        model_number: 'SRK24CW-S6',
        refrigerant: 'R410A', // Model has R410A, but variant has R32
        is_active: true,
      },
    };

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
            maybeSingle: vi.fn().mockResolvedValue({ data: variantWithR32, error: null }),
          };
        }
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ asset_tag: 'ESSC-0028' }], error: null }),
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
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    // Operator does not supply refrigerantType
    const res = await request(app)
      .post(`/api/v1/sites/${sampleSiteId}/assets`)
      .set('Authorization', adminAuthToken)
      .send({
        brand: 'Mitsubishi Heavy',
        modelNumber: 'SRK24CW-S6',
        variantId: sampleVariantId,
        serialNumber: 'MH-CASCADE-01',
        acType: 'Split AC',
      });

    expect(res.status).toBe(201);
    expect(insertedRecord).toBeTruthy();
    // Variant refrigerant 'R32' must take precedence over model 'R410A'
    expect(insertedRecord.refrigerant_type).toBe('R32');
  });

  it('5. createAcAsset refrigerant cascade: model refrigerant is used when variant refrigerant is absent', async () => {
    let insertedRecord: any = null;

    const variantWithoutRef = {
      ...sampleVariant,
      refrigerant: null, // Variant has no refrigerant
      ac_models: {
        id: sampleModelId,
        brand_id: 'brand-111',
        model_number: 'SRK24CW-S6',
        refrigerant: 'R410A', // Model has R410A
        is_active: true,
      },
    };

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
            maybeSingle: vi.fn().mockResolvedValue({ data: variantWithoutRef, error: null }),
          };
        }
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ asset_tag: 'ESSC-0029' }], error: null }),
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
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post(`/api/v1/sites/${sampleSiteId}/assets`)
      .set('Authorization', adminAuthToken)
      .send({
        brand: 'Mitsubishi Heavy',
        modelNumber: 'SRK24CW-S6',
        variantId: sampleVariantId,
        serialNumber: 'MH-CASCADE-02',
        acType: 'Split AC',
      });

    expect(res.status).toBe(201);
    expect(insertedRecord).toBeTruthy();
    // Model refrigerant 'R410A' is used when variant has none
    expect(insertedRecord.refrigerant_type).toBe('R410A');
  });

  it('6. createAcAsset refrigerant cascade: manual entry overrides both variant and model refrigerant', async () => {
    let insertedRecord: any = null;

    const variantWithR32 = {
      ...sampleVariant,
      refrigerant: 'R32',
      ac_models: {
        id: sampleModelId,
        brand_id: 'brand-111',
        model_number: 'SRK24CW-S6',
        refrigerant: 'R410A',
        is_active: true,
      },
    };

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
            maybeSingle: vi.fn().mockResolvedValue({ data: variantWithR32, error: null }),
          };
        }
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ asset_tag: 'ESSC-0030' }], error: null }),
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
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    // Operator enters manual override 'R290'
    const res = await request(app)
      .post(`/api/v1/sites/${sampleSiteId}/assets`)
      .set('Authorization', adminAuthToken)
      .send({
        brand: 'Mitsubishi Heavy',
        modelNumber: 'SRK24CW-S6',
        variantId: sampleVariantId,
        serialNumber: 'MH-MANUAL-01',
        acType: 'Split AC',
        refrigerantType: 'R290',
      });

    expect(res.status).toBe(201);
    expect(insertedRecord).toBeTruthy();
    // Deliberate manual override 'R290' is preserved
    expect(insertedRecord.refrigerant_type).toBe('R290');
  });

  it('7. createAcAsset refrigerant cascade: neither supplies refrigerant -> null (no hardcoded R32)', async () => {
    let insertedRecord: any = null;

    const variantWithoutRef = {
      ...sampleVariant,
      refrigerant: null,
      ac_models: {
        id: sampleModelId,
        brand_id: 'brand-111',
        model_number: 'SRK24CW-S6',
        refrigerant: null, // Model also has null
        is_active: true,
      },
    };

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
            maybeSingle: vi.fn().mockResolvedValue({ data: variantWithoutRef, error: null }),
          };
        }
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ asset_tag: 'ESSC-0031' }], error: null }),
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
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post(`/api/v1/sites/${sampleSiteId}/assets`)
      .set('Authorization', adminAuthToken)
      .send({
        brand: 'Generic Brand',
        modelNumber: 'GEN-01',
        variantId: sampleVariantId,
        serialNumber: 'GEN-NULL-01',
        acType: 'Split AC',
      });

    expect(res.status).toBe(201);
    expect(insertedRecord).toBeTruthy();
    // Must be null, NOT hardcoded 'R32'
    expect(insertedRecord.refrigerant_type).toBeNull();
  });

  it('8. createAcAsset persists warranty service counts to database columns', async () => {
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
        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ asset_tag: 'ESSC-0032' }], error: null }),
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
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post(`/api/v1/sites/${sampleSiteId}/assets`)
      .set('Authorization', adminAuthToken)
      .send({
        brand: 'Daikin',
        modelNumber: 'FTKF50',
        serialNumber: 'DK-WARR-01',
        acType: 'Split AC',
        warrantyStartDate: '2026-10-15',
        warrantyEndDate: '2027-10-14',
        totalWarrantyServices: 4,
        dryWarrantyVisits: 2,
        jetWarrantyVisits: 1,
        pumpdownWarrantyVisits: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Verify database columns populated
    expect(insertedRecord).toBeTruthy();
    expect(insertedRecord.total_warranty_services).toBe(4);
    expect(insertedRecord.dry_warranty_visits).toBe(2);
    expect(insertedRecord.jet_warranty_visits).toBe(1);
    expect(insertedRecord.pumpdown_warranty_visits).toBe(1);

    // Verify response mapped correctly
    expect(res.body.data.asset.totalWarrantyServices).toBe(4);
    expect(res.body.data.asset.dryWarrantyVisits).toBe(2);
    expect(res.body.data.asset.jetWarrantyVisits).toBe(1);
    expect(res.body.data.asset.pumpdownWarrantyVisits).toBe(1);
  });

  it('9. createAcAsset rejects mismatched allocation and negative service counts', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        const authHandler = setupAuthMock()(table);
        if (authHandler.select) return authHandler;
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    // Mismatched total (dry: 2 + jet: 2 + pumpdown: 1 = 5, but total: 4)
    const resMismatched = await request(app)
      .post(`/api/v1/sites/${sampleSiteId}/assets`)
      .set('Authorization', adminAuthToken)
      .send({
        brand: 'Daikin',
        modelNumber: 'FTKF50',
        serialNumber: 'DK-BAD-01',
        acType: 'Split AC',
        totalWarrantyServices: 4,
        dryWarrantyVisits: 2,
        jetWarrantyVisits: 2,
        pumpdownWarrantyVisits: 1,
      });

    expect(resMismatched.status).toBe(422);
    expect(resMismatched.body.success).toBe(false);
    expect(resMismatched.body.error.code).toBe('VALIDATION_ERROR');
    const mismatchedIssue = resMismatched.body.error.details.find((d: any) =>
      d.message.includes('Allocation mismatch')
    );
    expect(mismatchedIssue).toBeTruthy();

    // Negative counts
    const resNegative = await request(app)
      .post(`/api/v1/sites/${sampleSiteId}/assets`)
      .set('Authorization', adminAuthToken)
      .send({
        brand: 'Daikin',
        modelNumber: 'FTKF50',
        serialNumber: 'DK-NEG-01',
        acType: 'Split AC',
        totalWarrantyServices: -1,
      });

    expect(resNegative.status).toBe(422);
    expect(resNegative.body.success).toBe(false);
    expect(resNegative.body.error.code).toBe('VALIDATION_ERROR');
    const negativeIssue = resNegative.body.error.details.find((d: any) =>
      d.message.includes('cannot be negative')
    );
    expect(negativeIssue).toBeTruthy();
  });

  it('10. updateAcAsset persists updated warranty visit counts and rejects invalid allocations', async () => {
    let updatedRecord: any = null;

    const existingAsset = {
      id: sampleAssetId,
      asset_tag: 'ESSC-0001',
      site_id: sampleSiteId,
      brand: 'Daikin',
      model_number: 'FTKF50TV',
      serial_number: 'SN-001',
      ac_type: 'Split AC',
      is_active: true,
      warranty_status: 'UNDER_WARRANTY',
      total_warranty_services: 4,
      dry_warranty_visits: 2,
      jet_warranty_visits: 1,
      pumpdown_warranty_visits: 1,
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
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      }),
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    // Valid update: reallocate to 3 total: 2 Dry, 1 Jet, 0 Pumpdown
    const resValid = await request(app)
      .patch(`/api/v1/assets/${sampleAssetId}`)
      .set('Authorization', adminAuthToken)
      .send({
        totalWarrantyServices: 3,
        dryWarrantyVisits: 2,
        jetWarrantyVisits: 1,
        pumpdownWarrantyVisits: 0,
      });

    expect(resValid.status).toBe(200);
    expect(resValid.body.success).toBe(true);
    expect(updatedRecord).toBeTruthy();
    expect(updatedRecord.total_warranty_services).toBe(3);
    expect(updatedRecord.dry_warranty_visits).toBe(2);
    expect(updatedRecord.jet_warranty_visits).toBe(1);
    expect(updatedRecord.pumpdown_warranty_visits).toBe(0);

    // Invalid update: mismatched allocation
    const resInvalid = await request(app)
      .patch(`/api/v1/assets/${sampleAssetId}`)
      .set('Authorization', adminAuthToken)
      .send({
        totalWarrantyServices: 5,
        dryWarrantyVisits: 2,
        jetWarrantyVisits: 1,
        pumpdownWarrantyVisits: 0, // 3 != 5
      });

    expect(resInvalid.status).toBe(422);
    expect(resInvalid.body.success).toBe(false);
    expect(resInvalid.body.error.code).toBe('VALIDATION_ERROR');
    const invalidIssue = resInvalid.body.error.details.find((d: any) =>
      d.message.includes('Allocation mismatch')
    );
    expect(invalidIssue).toBeTruthy();
  });
});
