import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { getSupabaseClient } from '../src/lib/supabase.js';

// Mock Supabase
vi.mock('../src/lib/supabase.js', () => ({
  getSupabaseClient: vi.fn(),
}));

describe('AMC Plans CRUD & Technician PIN Management API', () => {
  const mockAdminUser = { id: 'admin-auth-id', email: 'admin@pys.internal' };
  const mockAdminProfile = { id: 'admin-profile-id', full_name: 'Admin User', role: 'ADMIN' };
  const mockAdminStaff = { id: 'admin-staff-id', role: 'ADMIN', is_active: true };

  const samplePlanId = '11111111-2222-3333-4444-555555555555';
  const samplePlan = {
    id: samplePlanId,
    plan_code: 'SAMC-1-SPLIT',
    name: 'Special Comprehensive AMC (SAMC 1) - Split',
    category: 'SPECIAL_COMPREHENSIVE',
    description: 'Special comprehensive coverage with gas',
    coverage_summary: '4 Services & Gas',
    default_frequency: 'QUARTERLY',
    default_visits_per_year: 4,
    pricing_model: 'TIERED_TONNAGE',
    rate_split_small: 4499.0,
    rate_split_large: 5499.0,
    rate_window_small: null,
    rate_window_large: null,
    rate_flat: null,
    gst_rate_percent: 28.0,
    max_equipment_age_years: 3,
    has_gas_charging: true,
    has_spare_parts: true,
    has_unlimited_complaints: true,
    rate_metadata: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      auth: {
        getUser: vi.fn(async (token: string) => {
          if (token === 'valid-admin-token') return { data: { user: mockAdminUser }, error: null };
          return { data: { user: null }, error: { message: 'Invalid token' } };
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: mockAdminProfile, error: null })),
              })),
            })),
          };
        }

        if (table === 'staff') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: mockAdminStaff, error: null })),
              })),
            })),
          };
        }

        if (table === 'amc_plans') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => ({
                order: vi.fn(async () => ({ data: [samplePlan], error: null })),
                maybeSingle: vi.fn(async () => {
                  if (col === 'plan_code' && val === 'CUSTOM-PROMO') return { data: null, error: null };
                  return { data: samplePlan, error: null };
                }),
              })),
              order: vi.fn(async () => ({ data: [samplePlan], error: null })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: samplePlan, error: null })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
            delete: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }

        if (table === 'amc_contracts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({ count: 0, error: null })),
            })),
          };
        }

        if (table === 'technicians') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: 'tech-uuid-1',
                    technician_code: 'TECH-001',
                    name: 'Deepak Tech',
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })),
        };
      }),
    };

    (getSupabaseClient as any).mockReturnValue(mockSupabase);
  });

  it('GET /api/v1/amc-contracts/plans returns rich rate card metadata', async () => {
    const res = await request(app)
      .get('/api/v1/amc-contracts/plans')
      .set('Authorization', 'Bearer valid-admin-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.plans).toHaveLength(1);
    const plan = res.body.data.plans[0];
    expect(plan.planCode).toBe('SAMC-1-SPLIT');
    expect(plan.category).toBe('SPECIAL_COMPREHENSIVE');
    expect(plan.rateSplitSmall).toBe(4499);
    expect(plan.rateSplitLarge).toBe(5499);
    expect(plan.gstRatePercent).toBe(28);
    expect(plan.hasGasCharging).toBe(true);
  });

  it('POST /api/v1/amc-contracts/plans creates a new plan for Admin', async () => {
    const res = await request(app)
      .post('/api/v1/amc-contracts/plans')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({
        planCode: 'CUSTOM-PROMO',
        name: 'Custom Promotional Plan',
        category: 'ORDINARY',
        defaultFrequency: 'QUARTERLY',
        defaultVisitsPerYear: 4,
        rateSplitSmall: 2000,
        rateSplitLarge: 2500,
        gstRatePercent: 18,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /api/v1/amc-contracts/plans/:id deletes plan when no contracts reference it', async () => {
    const res = await request(app)
      .delete(`/api/v1/amc-contracts/plans/${samplePlanId}`)
      .set('Authorization', 'Bearer valid-admin-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(true);
  });

  it('PATCH /api/v1/technicians/:id/pin resets security PIN for technician', async () => {
    const res = await request(app)
      .patch('/api/v1/technicians/11111111-2222-3333-4444-555555555555/pin')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({
        pin: '5678',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.technicianCode).toBe('TECH-001');
    expect(res.body.data.hasPortalPin).toBe(true);
  });

  it('PATCH /api/v1/technicians/:id/pin rejects non-numeric or short PIN with 422', async () => {
    const res = await request(app)
      .patch('/api/v1/technicians/11111111-2222-3333-4444-555555555555/pin')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({
        pin: 'abc',
      });

    expect(res.status).toBe(422);
  });
});
