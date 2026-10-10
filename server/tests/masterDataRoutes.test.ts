import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('AC Master Data & Asset Upgrade API (/api/v1/ac-brands, /api/v1/ac-models, /api/v1/assets)', () => {
  const adminAuthToken = 'Bearer valid-admin-token';
  const staffAuthToken = 'Bearer valid-staff-token';

  const mockAdminUser = { id: 'admin-auth-id' };
  const mockAdminProfile = { id: 'admin-auth-id', full_name: 'System Admin', email: 'dpk.panchal79@gmail.com' };
  const mockAdminStaff = { id: 'admin-staff-id', role: 'ADMIN', is_active: true };

  const mockStaffUser = { id: 'staff-auth-id' };
  const mockStaffProfile = { id: 'staff-auth-id', full_name: 'Ops Staff', email: 'staff@pys.internal' };
  const mockStaffRecord = { id: 'staff-record-id', role: 'STAFF', is_active: true };

  const sampleBrandId = '11111111-2222-3333-4444-555555555555';
  const sampleModelId = '66666666-7777-8888-9999-000000000000';
  const sampleSiteId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  const sampleBrand = {
    id: sampleBrandId,
    name: 'Daikin',
    code: 'DAIKIN',
    is_active: true,
    created_at: '2026-10-08T00:00:00Z',
    updated_at: '2026-10-08T00:00:00Z',
    ac_models: [{ count: 3 }],
  };

  const sampleModel = {
    id: sampleModelId,
    brand_id: sampleBrandId,
    model_number: 'FTKF50TV',
    ac_type: 'Split AC',
    technology: 'Inverter',
    capacity_tons: 1.5,
    rating: '5 Star',
    refrigerant: 'R32',
    is_active: true,
    created_at: '2026-10-08T00:00:00Z',
    updated_at: '2026-10-08T00:00:00Z',
    ac_brands: {
      name: 'Daikin',
      code: 'DAIKIN',
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

  describe('1. Authentication & RBAC on Master Data', () => {
    it('rejects unauthenticated request to /ac-brands with 401', async () => {
      const res = await request(app).get('/api/v1/ac-brands');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects unauthenticated request to /ac-models with 401', async () => {
      const res = await request(app).get('/api/v1/ac-models');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects STAFF creating a brand with 403 Forbidden', async () => {
      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockStaffUser }, error: null }) },
        from: vi.fn().mockImplementation(setupAuthMock('STAFF')),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post('/api/v1/ac-brands')
        .set('Authorization', staffAuthToken)
        .send({ name: 'Mitsubishi Electric' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects STAFF creating a model with 403 Forbidden', async () => {
      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockStaffUser }, error: null }) },
        from: vi.fn().mockImplementation(setupAuthMock('STAFF')),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post('/api/v1/ac-models')
        .set('Authorization', staffAuthToken)
        .send({ brandId: sampleBrandId, modelNumber: 'FTKF35TV' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. AC Brands Operations', () => {
    it('allows STAFF to list active brands', async () => {
      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockStaffUser }, error: null }) },
        from: vi.fn().mockImplementation((table: string) => {
          const auth = setupAuthMock('STAFF')(table);
          if (auth.select) return auth;
          if (table === 'ac_brands') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              range: vi.fn().mockResolvedValue({ data: [sampleBrand], error: null, count: 1 }),
            };
          }
          return {};
        }),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .get('/api/v1/ac-brands')
        .set('Authorization', staffAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.brands).toHaveLength(1);
      expect(res.body.data.brands[0].name).toBe('Daikin');
    });

    it('allows ADMIN to create a brand', async () => {
      const newBrand = {
        id: '22222222-3333-4444-5555-666666666666',
        name: 'Hitachi',
        code: 'HITACHI',
        is_active: true,
        created_at: '2026-10-08T00:00:00Z',
        updated_at: '2026-10-08T00:00:00Z',
      };

      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }) },
        from: vi.fn().mockImplementation((table: string) => {
          const auth = setupAuthMock('ADMIN')(table);
          if (auth.select) return auth;
          if (table === 'ac_brands') {
            return {
              select: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: newBrand, error: null }),
            };
          }
          if (table === 'activity_logs') {
            return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
          }
          return {};
        }),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post('/api/v1/ac-brands')
        .set('Authorization', adminAuthToken)
        .send({ name: 'Hitachi' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.brand.name).toBe('Hitachi');
    });

    it('rejects duplicate brand creation with 409 Conflict', async () => {
      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }) },
        from: vi.fn().mockImplementation((table: string) => {
          const auth = setupAuthMock('ADMIN')(table);
          if (auth.select) return auth;
          if (table === 'ac_brands') {
            return {
              select: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: sampleBrand, error: null }),
            };
          }
          return {};
        }),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post('/api/v1/ac-brands')
        .set('Authorization', adminAuthToken)
        .send({ name: 'Daikin' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('3. AC Models Operations', () => {
    it('allows STAFF to list models filtered by brandId', async () => {
      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockStaffUser }, error: null }) },
        from: vi.fn().mockImplementation((table: string) => {
          const auth = setupAuthMock('STAFF')(table);
          if (auth.select) return auth;
          if (table === 'ac_models') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              range: vi.fn().mockResolvedValue({ data: [sampleModel], error: null, count: 1 }),
            };
          }
          return {};
        }),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .get(`/api/v1/ac-models?brandId=${sampleBrandId}`)
        .set('Authorization', staffAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.models).toHaveLength(1);
      expect(res.body.data.models[0].modelNumber).toBe('FTKF50TV');
      expect(res.body.data.models[0].brandName).toBe('Daikin');
    });

    it('allows ADMIN to create a model with specifications', async () => {
      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }) },
        from: vi.fn().mockImplementation((table: string) => {
          const auth = setupAuthMock('ADMIN')(table);
          if (auth.select) return auth;
          if (table === 'ac_brands') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: sampleBrand, error: null }),
            };
          }
          if (table === 'ac_models') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: sampleModel, error: null }),
            };
          }
          if (table === 'activity_logs') {
            return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
          }
          return {};
        }),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post('/api/v1/ac-models')
        .set('Authorization', adminAuthToken)
        .send({
          brandId: sampleBrandId,
          modelNumber: 'FTKF50TV',
          acType: 'Split AC',
          technology: 'Inverter',
          capacityTons: 1.5,
          rating: '5 Star',
          refrigerant: 'R32',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.model.modelNumber).toBe('FTKF50TV');
    });
  });

  describe('4. Upgraded Asset Validations & Warranty Calculation', () => {
    it('rejects asset creation if purchaseDate is later than installationDate', async () => {
      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }) },
        from: vi.fn().mockImplementation(setupAuthMock('ADMIN')),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post(`/api/v1/sites/${sampleSiteId}/assets`)
        .set('Authorization', adminAuthToken)
        .send({
          brand: 'Daikin',
          acType: 'SPLIT',
          purchaseDate: '2026-06-01',
          installationDate: '2026-01-01',
        });

      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body)).toContain('Purchase date cannot be later than installation date');
    });

    it('rejects asset creation if warrantyEndDate is earlier than warrantyStartDate', async () => {
      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }) },
        from: vi.fn().mockImplementation(setupAuthMock('ADMIN')),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post(`/api/v1/sites/${sampleSiteId}/assets`)
        .set('Authorization', adminAuthToken)
        .send({
          brand: 'Daikin',
          acType: 'SPLIT',
          warrantyStartDate: '2026-12-01',
          warrantyEndDate: '2026-01-01',
        });

      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body)).toContain('Warranty end date cannot be earlier than warranty start date');
    });

    it('allows global asset listing via GET /api/v1/assets', async () => {
      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockStaffUser }, error: null }) },
        from: vi.fn().mockImplementation((table: string) => {
          const auth = setupAuthMock('STAFF')(table);
          if (auth.select) return auth;
          if (table === 'ac_assets') {
            return {
              select: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              range: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'asset-uuid-1',
                    asset_tag: 'ESSC-0001',
                    site_id: sampleSiteId,
                    brand: 'Daikin',
                    model_number: 'FTKF50TV',
                    serial_number: 'SN-001',
                    ac_type: 'SPLIT',
                    warranty_status: 'UNDER_WARRANTY',
                    is_active: true,
                    created_at: '2026-10-08T00:00:00Z',
                    updated_at: '2026-10-08T00:00:00Z',
                  },
                ],
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
        .get('/api/v1/assets')
        .set('Authorization', staffAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assets).toHaveLength(1);
      expect(res.body.data.assets[0].assetTag).toBe('ESSC-0001');
    });
  });

  // =========================================================================
  // 4. AC Model Variants Operations
  // =========================================================================
  describe('4. AC Model Variants Operations', () => {
    const sampleVariantId = '33333333-4444-5555-6666-777777777777';
    const sampleVariant = {
      id: sampleVariantId,
      model_id: sampleModelId,
      variant_code: 'FTKF50TV-1.5TR',
      capacity_tons: 1.5,
      capacity_display: '1.5 TR',
      star_rating: '5 Star',
      ac_type: 'Split AC',
      technology: 'Inverter',
      refrigerant: 'R32',
      series: 'FTKF Series',
      source_provenance: 'ADMIN_SPEC',
      is_active: true,
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
    };

    it('allows ADMIN to create a variant under a model', async () => {
      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }) },
        from: vi.fn().mockImplementation((table: string) => {
          const auth = setupAuthMock('ADMIN')(table);
          if (auth.select) return auth;
          if (table === 'ac_models') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: sampleModel, error: null }),
            };
          }
          if (table === 'ac_model_variants') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockReturnThis(),
            };
          }
          if (table === 'activity_logs') {
            return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
          }
          return {};
        }),
      };
      // Mock the insert chain to return sampleVariant
      (mockSupabase.from as any).mockImplementation((table: string) => {
        const auth = setupAuthMock('ADMIN')(table);
        if (auth.select) return auth;
        if (table === 'ac_models') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleModel, error: null }),
          };
        }
        if (table === 'ac_model_variants') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: sampleVariant, error: null }),
              }),
            }),
          };
        }
        if (table === 'activity_logs') {
          return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        return {};
      });

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post(`/api/v1/ac-models/${sampleModelId}/variants`)
        .set('Authorization', adminAuthToken)
        .send({
          capacityTons: 1.5,
          starRating: '5 Star',
          acType: 'Split AC',
          technology: 'Inverter',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.variant.capacityTons).toBe(1.5);
    });

    it('rejects STAFF from creating a variant with 403 Forbidden', async () => {
      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockStaffUser }, error: null }) },
        from: vi.fn().mockImplementation((table: string) => setupAuthMock('STAFF')(table)),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post(`/api/v1/ac-models/${sampleModelId}/variants`)
        .set('Authorization', staffAuthToken)
        .send({
          capacityTons: 1.5,
        });

      expect(res.status).toBe(403);
    });

    it('allows ADMIN to update a variant', async () => {
      const updatedVariant = { ...sampleVariant, star_rating: '4 Star' };
      const mockSupabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }) },
        from: vi.fn().mockImplementation((table: string) => {
          const auth = setupAuthMock('ADMIN')(table);
          if (auth.select) return auth;
          if (table === 'ac_model_variants') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              neq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockImplementation(() => {
                // Return sampleVariant for getVariantById (first call), then null for dup check
                return Promise.resolve({ data: null, error: null });
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: updatedVariant, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'activity_logs') {
            return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
          }
          return {};
        }),
      };
      // Provide custom mock to distinguish getVariantById from dup check
      (mockSupabase.from as any).mockImplementation((table: string) => {
        const auth = setupAuthMock('ADMIN')(table);
        if (auth.select) return auth;
        if (table === 'ac_model_variants') {
          let hasNeq = false;
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockImplementation(() => {
              hasNeq = true;
              return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
            }),
            maybeSingle: vi.fn().mockImplementation(() => {
              if (hasNeq) return Promise.resolve({ data: null, error: null });
              return Promise.resolve({ data: sampleVariant, error: null });
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: updatedVariant, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'activity_logs') {
          return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        return {};
      });
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .patch(`/api/v1/ac-variants/${sampleVariantId}`)
        .set('Authorization', adminAuthToken)
        .send({
          starRating: '4 Star',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.variant.starRating).toBe('4 Star');
    });
  });
});
