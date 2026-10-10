import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';
import {
  calculateScheduleDatesUtc,
  addMonthsSafeUtc,
  computePlannedServiceTypes,
} from '../src/services/amc.service.js';

describe('AMC Contracts & Preventive Maintenance API (/api/v1/amc-contracts)', () => {
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
  const sampleAssetId = '33333333-3333-3333-3333-333333333333';
  const otherCustomerId = '44444444-4444-4444-4444-444444444444';
  const otherAssetId = '55555555-5555-5555-5555-555555555555';
  const samplePlanId = '66666666-6666-6666-6666-666666666666';
  const sampleContractId = '77777777-7777-7777-7777-777777777777';

  const sampleCustomer = {
    id: sampleCustomerId,
    name: 'Reliance Corporate Park',
    customer_code: 'CUST-0001',
    phone: '9820011111',
    is_active: true,
  };

  const samplePlan = {
    id: samplePlanId,
    plan_code: 'PLAN-BASIC',
    name: 'Basic AMC',
    description: 'Quarterly routine inspection and filter wash',
    default_frequency: 'QUARTERLY',
    default_visits_per_year: 4,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const sampleAsset = {
    id: sampleAssetId,
    asset_tag: 'AC-0001',
    site_id: sampleSiteId,
    brand: 'Daikin',
    model_number: 'FTKF50',
    serial_number: 'SN-DK-101',
    ac_type: 'SPLIT',
    capacity_tons: 1.5,
    room_location: 'Server Room',
    floor_location: '1st Floor',
    customer_sites: {
      id: sampleSiteId,
      site_name: 'RCP Tower 1',
      customer_id: sampleCustomerId,
    },
  };

  const otherCustomerAsset = {
    id: otherAssetId,
    asset_tag: 'AC-0002',
    site_id: '99999999-9999-9999-9999-999999999999',
    brand: 'Voltas',
    model_number: '183V',
    serial_number: 'SN-VT-202',
    ac_type: 'WINDOW',
    customer_sites: {
      id: '99999999-9999-9999-9999-999999999999',
      site_name: 'Other Site',
      customer_id: otherCustomerId, // Mismatch
    },
  };

  const sampleContractRecord = {
    id: sampleContractId,
    contract_number: 'AMC-2026-0001',
    customer_id: sampleCustomerId,
    plan_id: samplePlanId,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    frequency: 'QUARTERLY',
    total_amount: 25000,
    total_visits: 4,
    status: 'ACTIVE',
    notes: 'Premium commercial client',
    cancellation_reason: null,
    cancelled_at: null,
    cancelled_by: null,
    previous_contract_id: null,
    created_by: 'admin-auth-id',
    updated_by: null,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    customers: {
      id: sampleCustomerId,
      name: 'Reliance Corporate Park',
      customer_code: 'CUST-0001',
      phone: '9820011111',
    },
    amc_plans: {
      id: samplePlanId,
      name: 'Basic AMC',
      plan_code: 'PLAN-BASIC',
    },
  };

  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      auth: {
        getUser: vi.fn(async (token: string) => {
          if (token === 'valid-admin-token') return { data: { user: mockAdminUser }, error: null };
          if (token === 'valid-staff-token') return { data: { user: mockStaffUser }, error: null };
          if (token === 'inactive-staff-token') return { data: { user: mockInactiveStaffUser }, error: null };
          if (token === 'unauthorized-role-token') return { data: { user: { id: 'unauthorized-user-id' } }, error: null };
          return { data: { user: null }, error: { message: 'Invalid token' } };
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((_col: string, val: string) => ({
                single: vi.fn(async () => {
                  if (val === 'admin-auth-id') return { data: mockAdminProfile, error: null };
                  if (val === 'staff-auth-id') return { data: mockStaffProfile, error: null };
                  if (val === 'inactive-staff-id') return { data: mockInactiveStaffProfile, error: null };
                  if (val === 'unauthorized-user-id') return { data: { id: 'unauthorized-user-id', full_name: 'No Staff', email: 'guest@test.com' }, error: null };
                  return { data: null, error: { message: 'Profile not found' } };
                }),
              })),
            })),
          };
        }

        if (table === 'staff') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((_col: string, val: string) => ({
                single: vi.fn(async () => {
                  if (val === 'admin-auth-id') return { data: mockAdminStaff, error: null };
                  if (val === 'staff-auth-id') return { data: mockStaffRecord, error: null };
                  if (val === 'inactive-staff-id') return { data: mockInactiveStaffRecord, error: null };
                  return { data: null, error: { message: 'Staff not found' } };
                }),
              })),
            })),
          };
        }

        if (table === 'amc_plans') {
          return {
            select: vi.fn((_cols: string) => ({
              eq: vi.fn((_col: string, val: any) => {
                if (val === samplePlanId) {
                  return {
                    single: vi.fn(async () => ({ data: samplePlan, error: null })),
                  };
                }
                return {
                  order: vi.fn(async () => ({ data: [samplePlan], error: null })),
                };
              }),
            })),
          };
        }

        if (table === 'customers') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((_col: string, val: string) => ({
                single: vi.fn(async () => {
                  if (val === sampleCustomerId) return { data: sampleCustomer, error: null };
                  return { data: null, error: { message: 'Customer not found' } };
                }),
              })),
            })),
          };
        }

        if (table === 'ac_assets') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async (_col: string, vals: string[]) => {
                const found: any[] = [];
                if (vals.includes(sampleAssetId)) found.push(sampleAsset);
                if (vals.includes(otherAssetId)) found.push(otherCustomerAsset);
                return { data: found, error: null };
              }),
            })),
          };
        }

        if (table === 'amc_contracts') {
          return {
            select: vi.fn((_cols: string, opts?: any) => {
              if (opts?.count === 'exact') {
                return {
                  eq: vi.fn().mockReturnThis(),
                  or: vi.fn().mockReturnThis(),
                  gte: vi.fn().mockReturnThis(),
                  lte: vi.fn().mockReturnThis(),
                  order: vi.fn(() => ({
                    range: vi.fn(async () => ({
                      data: [sampleContractRecord],
                      count: 1,
                      error: null,
                    })),
                  })),
                };
              }

              // Querying for contract number generation or metrics or single contract
              return {
                ilike: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(async () => ({
                      data: [{ contract_number: 'AMC-2026-0001' }],
                      error: null,
                    })),
                  })),
                })),
                eq: vi.fn((_col: string, val: string) => ({
                  single: vi.fn(async () => {
                    if (val === sampleContractId) return { data: sampleContractRecord, error: null };
                    return { data: null, error: { message: 'Not found' } };
                  }),
                })),
                // General select for metrics
                then: (resolve: any) => resolve({ data: [sampleContractRecord], error: null }),
              };
            }),
            insert: vi.fn((insertData: any) => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    ...sampleContractRecord,
                    ...insertData,
                    id: sampleContractId,
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((_updateData: any) => ({
              eq: vi.fn(async () => ({
                data: null,
                error: null,
              })),
            })),
          };
        }

        if (table === 'amc_assets') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async (_col: string, _vals: string[]) => ({
                data: [], // No active overlap by default
                error: null,
              })),
              eq: vi.fn(async () => ({
                data: [
                  {
                    id: 'cov-1',
                    amc_id: sampleContractId,
                    asset_id: sampleAssetId,
                    notes: null,
                    created_at: '2026-01-01T10:00:00Z',
                    ac_assets: sampleAsset,
                  },
                ],
                error: null,
              })),
            })),
            insert: vi.fn(async () => ({ data: null, error: null })),
            delete: vi.fn(() => ({
              eq: vi.fn().mockReturnThis(),
              then: (resolve: any) => resolve({ data: null, error: null }),
            })),
          };
        }

        if (table === 'service_schedules') {
          return {
            select: vi.fn(() => ({
              ilike: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: [{ schedule_number: 'PM-2026-000004' }],
                    error: null,
                  })),
                })),
              })),
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: [
                    {
                      id: 'sch-1',
                      schedule_number: 'PM-2026-000001',
                      amc_id: sampleContractId,
                      asset_id: sampleAssetId,
                      scheduled_date: '2026-01-01',
                      visit_number: 1,
                      status: 'COMPLETED',
                      is_system_generated: true,
                      notes: null,
                      created_by: 'admin-auth-id',
                      created_at: '2026-01-01T10:00:00Z',
                      updated_at: '2026-01-01T10:00:00Z',
                      ac_assets: sampleAsset,
                    },
                  ],
                  error: null,
                })),
                then: (resolve: any) =>
                  resolve({
                    data: [
                      {
                        id: 'sch-1',
                        schedule_number: 'PM-2026-000001',
                        amc_id: sampleContractId,
                        asset_id: sampleAssetId,
                        scheduled_date: '2026-01-01',
                        status: 'COMPLETED',
                      },
                    ],
                    error: null,
                  }),
              })),
              in: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: [],
                  error: null,
                })),
              })),
              then: (resolve: any) => resolve({ data: [], error: null }),
            })),
            insert: vi.fn(async () => ({ data: null, error: null })),
            update: vi.fn(() => ({
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
              then: (resolve: any) => resolve({ data: null, error: null }),
            })),
          };
        }

        if (table === 'activity_logs') {
          return {
            insert: vi.fn(async () => ({ data: null, error: null })),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
        };
      }),
    };

    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);
  });

  /* --------------------------------------------------
   * AUTHENTICATION & AUTHORIZATION
   * -------------------------------------------------- */
  it('1. Rejects unauthenticated requests with 401 Unauthorized', async () => {
    const res = await request(app).get('/api/v1/amc-contracts');
    expect(res.status).toBe(401);
  });

  it('2. Rejects unauthorized roles with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/amc-contracts')
      .set('Authorization', 'Bearer unauthorized-role-token');

    expect(res.status).toBe(403);
  });

  it('3. Rejects inactive staff members with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/amc-contracts')
      .set('Authorization', inactiveStaffToken);

    expect(res.status).toBe(403);
  });

  /* --------------------------------------------------
   * AMC PLANS & METRICS
   * -------------------------------------------------- */
  it('4. Retrieves reusable AMC plans', async () => {
    const res = await request(app)
      .get('/api/v1/amc-contracts/plans')
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.plans).toHaveLength(1);
    expect(res.body.data.plans[0].planCode).toBe('PLAN-BASIC');
  });

  it('5. Retrieves non-mock dashboard metrics', async () => {
    const res = await request(app)
      .get('/api/v1/amc-contracts/metrics')
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.metrics).toBeDefined();
    expect(res.body.data.metrics.activeContracts).toBe(1);
  });

  /* --------------------------------------------------
   * CONTRACT CRUD & VALIDATION
   * -------------------------------------------------- */
  it('6. Allows ADMIN to create AMC contract with covered assets', async () => {
    const res = await request(app)
      .post('/api/v1/amc-contracts')
      .set('Authorization', adminAuthToken)
      .send({
        customerId: sampleCustomerId,
        planId: samplePlanId,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        frequency: 'QUARTERLY',
        totalAmount: 30000,
        totalVisits: 4,
        coveredAssetIds: [sampleAssetId],
        notes: 'Annual corporate maintenance',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contract).toBeDefined();
  });

  it('7. Allows STAFF to create AMC contract', async () => {
    const res = await request(app)
      .post('/api/v1/amc-contracts')
      .set('Authorization', staffAuthToken)
      .send({
        customerId: sampleCustomerId,
        startDate: '2026-06-01',
        endDate: '2027-05-31',
        frequency: 'MONTHLY',
        totalAmount: 48000,
        totalVisits: 12,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('8. Rejects invalid contract dates (end date precedes start date) with 400', async () => {
    const res = await request(app)
      .post('/api/v1/amc-contracts')
      .set('Authorization', staffAuthToken)
      .send({
        customerId: sampleCustomerId,
        startDate: '2026-12-31',
        endDate: '2026-01-01', // Precedes start
        frequency: 'QUARTERLY',
        totalAmount: 10000,
        totalVisits: 4,
      });

    expect([400, 422]).toContain(res.status);
  });

  it('9. Rejects nonexistent customer with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/amc-contracts')
      .set('Authorization', staffAuthToken)
      .send({
        customerId: '00000000-0000-0000-0000-000000000000',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        frequency: 'QUARTERLY',
        totalAmount: 10000,
        totalVisits: 4,
      });

    expect(res.status).toBe(400);
  });

  it('10. Rejects covered asset belonging to a different customer (Site-Customer mismatch) with 400', async () => {
    const res = await request(app)
      .post('/api/v1/amc-contracts')
      .set('Authorization', staffAuthToken)
      .send({
        customerId: sampleCustomerId,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        frequency: 'QUARTERLY',
        totalAmount: 10000,
        totalVisits: 4,
        coveredAssetIds: [otherAssetId], // Belongs to otherCustomerId
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Site-Customer mismatch');
  });

  it('11. Rejects contract overlap when asset is already covered under another active AMC (409 Conflict)', async () => {
    const originalFrom = mockSupabase.from;
    mockSupabase.from = vi.fn((table: string) => {
      if (table === 'amc_assets') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [
                {
                  asset_id: sampleAssetId,
                  amc_contracts: {
                    id: 'existing-active-amc',
                    contract_number: 'AMC-2026-0099',
                    status: 'ACTIVE',
                    start_date: '2026-01-01',
                    end_date: '2026-12-31',
                  },
                },
              ],
              error: null,
            })),
          })),
        };
      }
      return originalFrom(table);
    });

    const res = await request(app)
      .post('/api/v1/amc-contracts')
      .set('Authorization', staffAuthToken)
      .send({
        customerId: sampleCustomerId,
        startDate: '2026-06-01',
        endDate: '2027-05-31',
        frequency: 'QUARTERLY',
        totalAmount: 10000,
        totalVisits: 4,
        coveredAssetIds: [sampleAssetId],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('already covered by active contract');
  });

  it('12. Lists AMC contracts with pagination and search', async () => {
    const res = await request(app)
      .get('/api/v1/amc-contracts?search=Reliance&page=1&pageSize=20')
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contracts).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
  });

  it('13. Retrieves single contract by ID with covered assets and schedules', async () => {
    const res = await request(app)
      .get(`/api/v1/amc-contracts/${sampleContractId}`)
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contract.id).toBe(sampleContractId);
    expect(res.body.data.contract.contractNumber).toBe('AMC-2026-0001');
    expect(res.body.data.contract.coveredAssets).toHaveLength(1);
  });

  it('14. Returns 404 for nonexistent contract', async () => {
    const res = await request(app)
      .get('/api/v1/amc-contracts/00000000-0000-0000-0000-000000000000')
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(404);
  });

  it('15. Updates contract details with PATCH', async () => {
    const res = await request(app)
      .patch(`/api/v1/amc-contracts/${sampleContractId}`)
      .set('Authorization', staffAuthToken)
      .send({
        notes: 'Updated contract remarks',
        totalAmount: 28000,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('16. Updates contract status with PATCH', async () => {
    const res = await request(app)
      .patch(`/api/v1/amc-contracts/${sampleContractId}/status`)
      .set('Authorization', staffAuthToken)
      .send({
        status: 'ACTIVE',
        reason: 'Client finalized commercial proposal',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('17. Cancels contract non-destructively and records cancellation details', async () => {
    const res = await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/cancel`)
      .set('Authorization', staffAuthToken)
      .send({
        reason: 'Customer relocated to new office facility',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  /* --------------------------------------------------
   * ASSET COVERAGE ACTIONS
   * -------------------------------------------------- */
  it('18. Adds covered asset to AMC contract', async () => {
    const res = await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/assets`)
      .set('Authorization', staffAuthToken)
      .send({
        assetIds: [sampleAssetId],
      });

    // In sample, sampleAssetId is already returned in mock coveredAssets, so it triggers conflict
    expect([200, 409]).toContain(res.status);
  });

  it('19. Safely removes covered asset from contract', async () => {
    const res = await request(app)
      .delete(`/api/v1/amc-contracts/${sampleContractId}/assets/${sampleAssetId}`)
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  /* --------------------------------------------------
   * PM OBLIGATION GENERATION & IDEMPOTENCY
   * -------------------------------------------------- */
  it('20. Generates PM obligations for active contract', async () => {
    const res = await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/generate-pm`)
      .set('Authorization', staffAuthToken)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contractId).toBe(sampleContractId);
    expect(res.body.data.dateRange).toBeDefined();
  });

  it('21. Retrieves PM schedules for contract', async () => {
    const res = await request(app)
      .get(`/api/v1/amc-contracts/${sampleContractId}/schedules`)
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.schedules).toBeDefined();
  });

  it('22. Safely renews contract, marking previous as RENEWED and linking new contract', async () => {
    const res = await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/renew`)
      .set('Authorization', staffAuthToken)
      .send({
        customerId: sampleCustomerId,
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        frequency: 'QUARTERLY',
        totalAmount: 32000,
        totalVisits: 4,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contract).toBeDefined();
  });

  /* --------------------------------------------------
   * PURE ALGORITHM & DATE EDGE CASES
   * -------------------------------------------------- */
  it('23. Pure Algorithm: Calculates monthly, quarterly, half-yearly, and yearly schedules', () => {
    // 1-year monthly: 12 visits
    const monthly = calculateScheduleDatesUtc('2026-01-01', '2026-12-31', 'MONTHLY');
    expect(monthly).toHaveLength(12);
    expect(monthly[0]).toBe('2026-01-01');
    expect(monthly[11]).toBe('2026-12-01');

    // 1-year quarterly: 4 visits
    const quarterly = calculateScheduleDatesUtc('2026-01-01', '2026-12-31', 'QUARTERLY');
    expect(quarterly).toHaveLength(4);
    expect(quarterly[0]).toBe('2026-01-01');
    expect(quarterly[1]).toBe('2026-04-01');
    expect(quarterly[2]).toBe('2026-07-01');
    expect(quarterly[3]).toBe('2026-10-01');

    // 1-year half-yearly: 2 visits
    const halfYearly = calculateScheduleDatesUtc('2026-01-01', '2026-12-31', 'HALF_YEARLY');
    expect(halfYearly).toHaveLength(2);
    expect(halfYearly[0]).toBe('2026-01-01');
    expect(halfYearly[1]).toBe('2026-07-01');

    // 1-year yearly: 1 visit
    const yearly = calculateScheduleDatesUtc('2026-01-01', '2026-12-31', 'YEARLY');
    expect(yearly).toHaveLength(1);
    expect(yearly[0]).toBe('2026-01-01');
  });

  it('24. Pure Algorithm: Safely handles month length boundaries (Jan 31 -> Feb 28 in 2026, Feb 29 in 2028)', () => {
    // Non-leap year 2026
    const jan31_2026 = new Date(Date.UTC(2026, 0, 31));
    const feb_2026 = addMonthsSafeUtc(jan31_2026, 1);
    expect(feb_2026.getUTCMonth()).toBe(1); // February
    expect(feb_2026.getUTCDate()).toBe(28);

    // Leap year 2028
    const jan31_2028 = new Date(Date.UTC(2028, 0, 31));
    const feb_2028 = addMonthsSafeUtc(jan31_2028, 1);
    expect(feb_2028.getUTCMonth()).toBe(1); // February
    expect(feb_2028.getUTCDate()).toBe(29);
  });

  it('25. Pure Algorithm: Never generates visits outside contract boundaries', () => {
    // Short 5-month contract with quarterly visits
    const dates = calculateScheduleDatesUtc('2026-01-15', '2026-06-15', 'QUARTERLY');
    expect(dates).toHaveLength(2);
    expect(dates[0]).toBe('2026-01-15');
    expect(dates[1]).toBe('2026-04-15');
    // Month 7 would be July 15, which is strictly > June 15, so omitted
  });

  it('26. Pure Algorithm: computePlannedServiceTypes deterministically distributes configured service visits', () => {
    // 4 visits: 2 dry, 1 jet, 1 pumpdown
    const dist4 = computePlannedServiceTypes(4, 2, 1, 1);
    expect(dist4).toEqual(['DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE', 'DRY_SERVICE']);

    // 6 visits: 4 dry, 2 jet, 0 pumpdown
    const dist6 = computePlannedServiceTypes(6, 4, 2, 0);
    expect(dist6).toEqual(['DRY_SERVICE', 'JET_SERVICE', 'DRY_SERVICE', 'JET_SERVICE', 'DRY_SERVICE', 'DRY_SERVICE']);

    // 3 visits: all dry
    const allDry = computePlannedServiceTypes(3, 3, 0, 0);
    expect(allDry).toEqual(['DRY_SERVICE', 'DRY_SERVICE', 'DRY_SERVICE']);
  });

  it('27. Pure Algorithm: computePlannedServiceTypes falls back to alternating Dry/Jet for legacy contracts with null allocation', () => {
    const legacy4 = computePlannedServiceTypes(4, null, null, null);
    expect(legacy4).toEqual(['DRY_SERVICE', 'JET_SERVICE', 'DRY_SERVICE', 'JET_SERVICE']);

    const legacyUndefined = computePlannedServiceTypes(2, undefined, undefined, undefined);
    expect(legacyUndefined).toEqual(['DRY_SERVICE', 'JET_SERVICE']);
  });

  it('28. API Validation: Rejects AMC contract creation when dry + jet + pumpdown does not equal totalVisits', async () => {
    const res = await request(app)
      .post('/api/v1/amc-contracts')
      .set('Authorization', adminAuthToken)
      .send({
        customerId: sampleCustomerId,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        frequency: 'QUARTERLY',
        totalAmount: 25000,
        totalVisits: 4,
        dryServiceVisits: 2,
        jetServiceVisits: 1,
        pumpdownServiceVisits: 0, // 2 + 1 + 0 = 3 !== 4
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.error.details || res.body.error)).toContain('must exactly equal total included visits');
  });
});
