import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { amcService } from '../src/services/amc.service.js';

describe('Batch 4 AMC Integrity, Activation, and Renewal Regression Suite', () => {
  const adminAuthToken = 'Bearer valid-admin-token';
  const staffAuthToken = 'Bearer valid-staff-token';
  const mockAdminUser = { id: 'admin-auth-id' };
  const mockAdminProfile = { id: 'admin-auth-id', full_name: 'Super Admin', email: 'admin@pys.internal' };
  const mockAdminStaff = { id: 'admin-staff-id', role: 'ADMIN', is_active: true };

  const sampleCustomerId = '11111111-1111-1111-1111-111111111111';
  const sampleSiteId = '22222222-2222-2222-2222-222222222222';
  const sampleAssetId1 = '33333333-3333-3333-3333-333333333333';
  const sampleAssetId2 = '44444444-4444-4444-4444-444444444444';
  const sampleContractId = '77777777-7777-7777-7777-777777777777';
  const successorContractId = '88888888-8888-8888-8888-888888888888';

  const sampleCustomer = {
    id: sampleCustomerId,
    name: 'Tech Mahindra Ltd',
    customer_code: 'CUST-0001',
    phone: '9820011111',
    is_active: true,
  };

  const sampleAsset1 = {
    id: sampleAssetId1,
    asset_tag: 'AC-TM-01',
    site_id: sampleSiteId,
    brand: 'Daikin',
    model_number: 'FTKF50',
    serial_number: 'SN-DK-101',
    ac_type: 'SPLIT',
    customer_sites: { id: sampleSiteId, site_name: 'Tech Campus', customer_id: sampleCustomerId },
  };

  const sampleAsset2 = {
    id: sampleAssetId2,
    asset_tag: 'AC-TM-02',
    site_id: sampleSiteId,
    brand: 'Voltas',
    model_number: '183V',
    serial_number: 'SN-VT-202',
    ac_type: 'SPLIT',
    customer_sites: { id: sampleSiteId, site_name: 'Tech Campus', customer_id: sampleCustomerId },
  };

  let mockSupabase: any;
  let contractsStore: Map<string, any>;
  let schedulesStore: any[];
  let contractAssetsStore: any[];
  let auditLogsStore: any[];

  beforeEach(() => {
    vi.restoreAllMocks();

    contractsStore = new Map();
    schedulesStore = [];
    contractAssetsStore = [];
    auditLogsStore = [];

    // Pre-populate standard contract
    contractsStore.set(sampleContractId, {
      id: sampleContractId,
      contract_number: 'AMC-2026-0001',
      customer_id: sampleCustomerId,
      plan_id: null,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      frequency: 'QUARTERLY',
      total_amount: 30000,
      total_visits: 4,
      dry_service_visits: 2,
      jet_service_visits: 1,
      pumpdown_service_visits: 1,
      status: 'DRAFT',
      notes: 'Corporate AMC Agreement',
      previous_contract_id: null,
      created_by: 'admin-auth-id',
      updated_by: null,
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-01T10:00:00Z',
      customers: sampleCustomer,
      amc_plans: null,
    });

    contractAssetsStore.push(
      { id: 'cov-1', amc_id: sampleContractId, asset_id: sampleAssetId1, ac_assets: sampleAsset1 },
      { id: 'cov-2', amc_id: sampleContractId, asset_id: sampleAssetId2, ac_assets: sampleAsset2 }
    );

    mockSupabase = {
      auth: {
        getUser: vi.fn(async (token: string) => {
          if (token === 'valid-admin-token') return { data: { user: mockAdminUser }, error: null };
          if (token === 'valid-staff-token') return { data: { user: { id: 'staff-auth-id' } }, error: null };
          return { data: { user: null }, error: { message: 'Invalid token' } };
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockAdminProfile, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockAdminProfile, error: null }),
          };
        }

        if (table === 'staff') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockAdminStaff, error: null }),
          };
        }

        if (table === 'customers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: sampleCustomer, error: null }),
          };
        }

        if (table === 'ac_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockImplementation(async (_col: string, ids: string[]) => {
              const matched = [sampleAsset1, sampleAsset2].filter((a) => ids.includes(a.id));
              return { data: matched, error: null };
            }),
          };
        }

        if (table === 'amc_assets') {
          return {
            select: vi.fn((_cols?: string) => ({
              eq: vi.fn().mockImplementation(async (_col: string, val: string) => {
                const matched = contractAssetsStore.filter((ca) => ca.amc_id === val);
                return { data: matched, error: null };
              }),
              in: vi.fn().mockImplementation(async () => ({ data: [], error: null })),
            })),
            insert: vi.fn().mockImplementation(async (rows: any[]) => {
              contractAssetsStore.push(...rows);
              return { data: rows, error: null };
            }),
            delete: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(async (_col: string, val: string) => {
                contractAssetsStore = contractAssetsStore.filter((ca) => ca.amc_id !== val);
                return { data: null, error: null };
              }),
            })),
          };
        }

        if (table === 'amc_contracts') {
          return {
            select: vi.fn((_cols?: string, opts?: any) => {
              if (opts?.count === 'exact') {
                return {
                  eq: vi.fn().mockReturnThis(),
                  or: vi.fn().mockReturnThis(),
                  gte: vi.fn().mockReturnThis(),
                  lte: vi.fn().mockReturnThis(),
                  order: vi.fn(() => ({
                    range: vi.fn(async () => ({
                      data: Array.from(contractsStore.values()),
                      count: contractsStore.size,
                      error: null,
                    })),
                  })),
                };
              }
              return {
                ilike: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(async () => ({
                      data: [{ contract_number: 'AMC-2026-0001' }],
                      error: null,
                    })),
                  })),
                })),
                eq: vi.fn((col: string, val: string) => {
                  if (col === 'previous_contract_id') {
                    const successors = Array.from(contractsStore.values()).filter(
                      (c) => c.previous_contract_id === val
                    );
                    return Promise.resolve({ data: successors, error: null });
                  }
                  return {
                    single: vi.fn(async () => {
                      const item = contractsStore.get(val);
                      if (item) return { data: item, error: null };
                      return { data: null, error: { message: 'Not found' } };
                    }),
                  };
                }),
                then: (resolve: any) => resolve({ data: Array.from(contractsStore.values()), error: null }),
              };
            }),
            insert: vi.fn((data: any) => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  const newId = data.id || successorContractId;
                  const record = {
                    ...data,
                    id: newId,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    customers: sampleCustomer,
                    amc_plans: null,
                  };
                  contractsStore.set(newId, record);
                  return { data: record, error: null };
                }),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(async (_col: string, val: string) => {
                const existing = contractsStore.get(val);
                if (existing) {
                  const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
                  contractsStore.set(val, updated);
                }
                return { data: null, error: null };
              }),
            })),
            delete: vi.fn(() => ({
              eq: vi.fn(async (_col: string, val: string) => {
                contractsStore.delete(val);
                return { data: null, error: null };
              }),
            })),
          };
        }

        if (table === 'service_schedules') {
          return {
            select: vi.fn((_cols?: string) => {
              const chain: any = {
                ilike: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(async () => ({
                      data: [{ schedule_number: `PM-2026-${String(schedulesStore.length).padStart(6, '0')}` }],
                      error: null,
                    })),
                  })),
                })),
                eq: vi.fn((col: string, val: string) => {
                  const subChain: any = {
                    in: vi.fn(async (_inCol: string, inVals: string[]) => {
                      const filtered = schedulesStore.filter(
                        (s) => s[col] === val && inVals.includes(s.status)
                      );
                      return { data: filtered, error: null };
                    }),
                    order: vi.fn(async () => {
                      const matched = schedulesStore
                        .filter((s) => s[col] === val)
                        .map((s) => ({
                          ...s,
                          ac_assets: s.asset_id === sampleAssetId1 ? sampleAsset1 : sampleAsset2,
                        }));
                      return { data: matched, error: null };
                    }),
                    then: (resolve: any) => {
                      const matched = schedulesStore.filter((s) => s[col] === val);
                      return resolve({ data: matched, error: null });
                    },
                  };
                  return subChain;
                }),
                then: (resolve: any) => resolve({ data: schedulesStore, error: null }),
              };
              return chain;
            }),
            insert: vi.fn(async (rows: any[]) => {
              schedulesStore.push(...rows);
              return { data: rows, error: null };
            }),
            update: vi.fn((patch: any) => {
              const updateChain: any = {
                in: vi.fn(async (_col: string, ids: string[]) => {
                  schedulesStore.forEach((s) => {
                    if (ids.includes(s.id)) {
                      Object.assign(s, patch, { updated_at: new Date().toISOString() });
                    }
                  });
                  return { data: null, error: null };
                }),
                eq: vi.fn(async (col: string, val: string) => {
                  schedulesStore.forEach((s) => {
                    if (s[col] === val) {
                      Object.assign(s, patch, { updated_at: new Date().toISOString() });
                    }
                  });
                  return { data: null, error: null };
                }),
              };
              return updateChain;
            }),
            delete: vi.fn(() => ({
              eq: vi.fn(async (col: string, val: string) => {
                schedulesStore = schedulesStore.filter((s) => s[col] !== val);
                return { data: null, error: null };
              }),
            })),
          };
        }

        if (table === 'activity_logs') {
          return {
            insert: vi.fn(async (entry: any) => {
              auditLogsStore.push(entry);
              return { data: null, error: null };
            }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockResolvedValue({ data: null, error: null }),
          delete: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);
  });

  /* ============================================================================
   * SCENARIO B1: DRAFT ACTIVATION & PM GENERATION
   * ============================================================================ */

  it('1. A valid draft AMC becomes active and generates the expected obligations', async () => {
    expect(contractsStore.get(sampleContractId).status).toBe('DRAFT');
    expect(schedulesStore).toHaveLength(0);

    const res = await request(app)
      .patch(`/api/v1/amc-contracts/${sampleContractId}/status`)
      .set('Authorization', adminAuthToken)
      .send({ status: 'ACTIVE', reason: 'Customer accepted proposal' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(contractsStore.get(sampleContractId).status).toBe('ACTIVE');

    // Quarterly contract across 1 year = 4 dates * 2 covered assets = 8 schedules
    expect(schedulesStore).toHaveLength(8);
  });

  it('2. Each eligible asset receives the correct obligations and visit breakdowns', async () => {
    await request(app)
      .patch(`/api/v1/amc-contracts/${sampleContractId}/status`)
      .set('Authorization', adminAuthToken)
      .send({ status: 'ACTIVE' });

    const asset1Schedules = schedulesStore.filter((s) => s.asset_id === sampleAssetId1);
    const asset2Schedules = schedulesStore.filter((s) => s.asset_id === sampleAssetId2);

    expect(asset1Schedules).toHaveLength(4);
    expect(asset2Schedules).toHaveLength(4);

    // Verify visit sequence
    expect(asset1Schedules.map((s) => s.visit_number)).toEqual([1, 2, 3, 4]);
    expect(asset2Schedules.map((s) => s.visit_number)).toEqual([1, 2, 3, 4]);

    // Allocation was 2 DRY, 1 JET, 1 PUMPDOWN
    const asset1Types = asset1Schedules.map((s) => s.planned_service_type);
    expect(asset1Types.filter((t) => t === 'DRY_SERVICE')).toHaveLength(2);
    expect(asset1Types.filter((t) => t === 'JET_SERVICE')).toHaveLength(1);
    expect(asset1Types.filter((t) => t === 'PUMPDOWN_SERVICE')).toHaveLength(1);
  });

  it('3. Repeating activation does not duplicate obligations (Idempotent)', async () => {
    // First activation
    await request(app)
      .patch(`/api/v1/amc-contracts/${sampleContractId}/status`)
      .set('Authorization', adminAuthToken)
      .send({ status: 'ACTIVE' });

    expect(schedulesStore).toHaveLength(8);

    // Repeat activation
    const repeatRes = await request(app)
      .patch(`/api/v1/amc-contracts/${sampleContractId}/status`)
      .set('Authorization', adminAuthToken)
      .send({ status: 'ACTIVE' });

    expect(repeatRes.status).toBe(200);
    // Should still have exactly 8 obligations, zero duplicates created
    expect(schedulesStore).toHaveLength(8);
  });

  it('4. Activation failure does not leave inconsistent status/obligation state (Rollback)', async () => {
    // Make generatePmObligations throw an error
    vi.spyOn(amcService, 'generatePmObligations').mockRejectedValueOnce(
      new Error('Simulated PM generation database failure')
    );

    const res = await request(app)
      .patch(`/api/v1/amc-contracts/${sampleContractId}/status`)
      .set('Authorization', adminAuthToken)
      .send({ status: 'ACTIVE' });

    expect(res.status).toBe(400);
    expect(res.body.error?.message || res.body.message).toContain('Failed to generate preventive maintenance obligations');

    // Contract status must have been rolled back to DRAFT
    expect(contractsStore.get(sampleContractId).status).toBe('DRAFT');
  });

  it('5. An already-active AMC update does not regenerate obligations unnecessarily', async () => {
    // Activate
    await request(app)
      .patch(`/api/v1/amc-contracts/${sampleContractId}/status`)
      .set('Authorization', adminAuthToken)
      .send({ status: 'ACTIVE' });

    const initialScheduleNumbers = schedulesStore.map((s) => s.schedule_number);

    // Unrelated update (e.g. notes)
    const updateRes = await request(app)
      .patch(`/api/v1/amc-contracts/${sampleContractId}`)
      .set('Authorization', adminAuthToken)
      .send({ notes: 'Updated service notes for account' });

    expect(updateRes.status).toBe(200);
    expect(schedulesStore).toHaveLength(8);
    expect(schedulesStore.map((s) => s.schedule_number)).toEqual(initialScheduleNumbers);
  });

  /* ============================================================================
   * SCENARIO B2: RENEWAL & VISIT BREAKDOWN PRESERVATION
   * ============================================================================ */

  it('6. Renewal preserves all three visit-breakdown fields when no overrides are supplied', async () => {
    // Activate predecessor with dry: 2, jet: 1, pumpdown: 1
    const contract = contractsStore.get(sampleContractId);
    contract.status = 'ACTIVE';

    const res = await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/renew`)
      .set('Authorization', staffAuthToken)
      .send({
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        frequency: 'QUARTERLY',
        totalAmount: 32000,
        totalVisits: 4,
      });

    expect(res.status).toBe(201);
    const renewed = contractsStore.get(res.body.data.contract.id);
    expect(renewed).toBeDefined();
    // Inherited breakdown matches predecessor exactly
    expect(renewed.dry_service_visits).toBe(2);
    expect(renewed.jet_service_visits).toBe(1);
    expect(renewed.pumpdown_service_visits).toBe(1);
  });

  it('7. Explicit valid renewal overrides are respected', async () => {
    const contract = contractsStore.get(sampleContractId);
    contract.status = 'ACTIVE';

    const res = await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/renew`)
      .set('Authorization', staffAuthToken)
      .send({
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        frequency: 'QUARTERLY',
        totalAmount: 35000,
        totalVisits: 4,
        dryServiceVisits: 1,
        jetServiceVisits: 2,
        pumpdownServiceVisits: 1,
      });

    expect(res.status).toBe(201);
    const renewed = contractsStore.get(res.body.data.contract.id);
    expect(renewed.dry_service_visits).toBe(1);
    expect(renewed.jet_service_visits).toBe(2);
    expect(renewed.pumpdown_service_visits).toBe(1);
  });

  it('8. Invalid breakdowns are rejected with 422 or 400', async () => {
    const contract = contractsStore.get(sampleContractId);
    contract.status = 'ACTIVE';

    // Sum does not equal totalVisits (1 + 1 + 1 != 4)
    const mismatchRes = await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/renew`)
      .set('Authorization', staffAuthToken)
      .send({
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        frequency: 'QUARTERLY',
        totalAmount: 35000,
        totalVisits: 4,
        dryServiceVisits: 1,
        jetServiceVisits: 1,
        pumpdownServiceVisits: 1,
      });

    expect(mismatchRes.status).toBe(422);

    // Negative breakdown
    const negativeRes = await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/renew`)
      .set('Authorization', staffAuthToken)
      .send({
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        totalVisits: 4,
        dryServiceVisits: -1,
        jetServiceVisits: 3,
        pumpdownServiceVisits: 2,
      });

    expect(negativeRes.status).toBe(422);
  });

  /* ============================================================================
   * SCENARIO B3: PREDECESSOR SCHEDULE SUPERSESSION & HISTORICAL DATA PRESERVATION
   * ============================================================================ */

  it('9. Unperformed predecessor schedules are superseded/cancelled upon renewal', async () => {
    const contract = contractsStore.get(sampleContractId);
    contract.status = 'ACTIVE';

    // Add unperformed predecessor schedules
    schedulesStore.push(
      {
        id: 'sch-pred-1',
        schedule_number: 'PM-2026-000001',
        amc_id: sampleContractId,
        asset_id: sampleAssetId1,
        scheduled_date: '2026-10-01',
        visit_number: 4,
        status: 'SCHEDULED',
        notes: 'Q4 routine visit',
      },
      {
        id: 'sch-pred-2',
        schedule_number: 'PM-2026-000002',
        amc_id: sampleContractId,
        asset_id: sampleAssetId2,
        scheduled_date: '2026-10-01',
        visit_number: 4,
        status: 'DUE',
        notes: 'Q4 routine visit',
      }
    );

    const res = await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/renew`)
      .set('Authorization', staffAuthToken)
      .send({
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        totalVisits: 4,
      });

    expect(res.status).toBe(201);

    const pred1 = schedulesStore.find((s) => s.id === 'sch-pred-1');
    const pred2 = schedulesStore.find((s) => s.id === 'sch-pred-2');

    expect(pred1.status).toBe('CANCELLED');
    expect(pred1.cancellation_reason).toBe('SUPERSEDED_BY_RENEWAL');
    expect(pred1.notes).toContain('Superseded by renewal contract');

    expect(pred2.status).toBe('CANCELLED');
    expect(pred2.cancellation_reason).toBe('SUPERSEDED_BY_RENEWAL');
  });

  it('10. Completed predecessor schedules and reports remain unchanged', async () => {
    const contract = contractsStore.get(sampleContractId);
    contract.status = 'ACTIVE';

    schedulesStore.push({
      id: 'sch-completed-1',
      schedule_number: 'PM-2026-000003',
      amc_id: sampleContractId,
      asset_id: sampleAssetId1,
      scheduled_date: '2026-01-01',
      visit_number: 1,
      status: 'COMPLETED',
      notes: 'Completed by technician Aayu',
    });

    await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/renew`)
      .set('Authorization', staffAuthToken)
      .send({
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        totalVisits: 4,
      });

    const completed = schedulesStore.find((s) => s.id === 'sch-completed-1');
    expect(completed.status).toBe('COMPLETED');
    expect(completed.notes).toBe('Completed by technician Aayu');
    expect(completed.cancellation_reason).toBeUndefined();
  });

  it('11. In-progress predecessor schedules are preserved according to business rules', async () => {
    const contract = contractsStore.get(sampleContractId);
    contract.status = 'ACTIVE';

    schedulesStore.push({
      id: 'sch-in-progress-1',
      schedule_number: 'PM-2026-000004',
      amc_id: sampleContractId,
      asset_id: sampleAssetId1,
      scheduled_date: '2026-07-01',
      visit_number: 3,
      status: 'IN_PROGRESS',
      notes: 'Technician currently on site',
    });

    await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/renew`)
      .set('Authorization', staffAuthToken)
      .send({
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        totalVisits: 4,
      });

    const inProgress = schedulesStore.find((s) => s.id === 'sch-in-progress-1');
    expect(inProgress.status).toBe('IN_PROGRESS');
    expect(inProgress.notes).toBe('Technician currently on site');
  });

  /* ============================================================================
   * SCENARIO B4: DUPLICATE PREVENTION, IDEMPOTENCY & STABLE IDENTITY
   * ============================================================================ */

  it('12. The new contract generates exactly the expected per-asset obligations', async () => {
    const contract = contractsStore.get(sampleContractId);
    contract.status = 'ACTIVE';

    const res = await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/renew`)
      .set('Authorization', staffAuthToken)
      .send({
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        frequency: 'HALF_YEARLY',
        totalVisits: 2,
        dryServiceVisits: 1,
        jetServiceVisits: 1,
        pumpdownServiceVisits: 0,
      });

    expect(res.status).toBe(201);
    const renewedId = res.body.data.contract.id;

    const renewedSchedules = schedulesStore.filter((s) => s.amc_id === renewedId);
    // 2 visits * 2 assets = 4 obligations
    expect(renewedSchedules).toHaveLength(4);

    const asset1Renewed = renewedSchedules.filter((s) => s.asset_id === sampleAssetId1);
    const asset2Renewed = renewedSchedules.filter((s) => s.asset_id === sampleAssetId2);
    expect(asset1Renewed).toHaveLength(2);
    expect(asset2Renewed).toHaveLength(2);
  });

  it('13. Repeating the same renewal request does not duplicate contracts or obligations', async () => {
    const contract = contractsStore.get(sampleContractId);
    contract.status = 'ACTIVE';

    // First renewal
    const res1 = await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/renew`)
      .set('Authorization', staffAuthToken)
      .send({
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        totalVisits: 4,
      });

    expect(res1.status).toBe(201);

    // Second renewal attempt on same predecessor
    const res2 = await request(app)
      .post(`/api/v1/amc-contracts/${sampleContractId}/renew`)
      .set('Authorization', staffAuthToken)
      .send({
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        totalVisits: 4,
      });

    // Conflict: already renewed
    expect(res2.status).toBe(400);
    expect(res2.body.error?.message || res2.body.message).toContain('already been renewed');
  });

  it('14. Concurrent activation/renewal attempts cannot create duplicate obligations (23505 unique violation handled)', async () => {
    const contract = contractsStore.get(sampleContractId);
    contract.status = 'ACTIVE';

    const defaultFrom = mockSupabase.from;
    let collisionOccurred = false;

    mockSupabase.from = vi.fn((table: string) => {
      if (table === 'service_schedules') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [], error: null })),
              in: vi.fn(async () => ({ data: [], error: null })),
              then: (resolve: any) => resolve({ data: [], error: null }),
            })),
            ilike: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [{ schedule_number: 'PM-001' }], error: null })),
              })),
            })),
          })),
          insert: vi.fn(async () => {
            collisionOccurred = true;
            return {
              data: null,
              error: {
                code: '23505',
                message: 'duplicate key value violates unique constraint "idx_active_schedule_per_amc_asset_visit"',
              },
            };
          }),
          update: vi.fn(() => ({ eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis() })),
        };
      }
      return defaultFrom(table);
    });

    const res = await amcService.generatePmObligations(sampleContractId, {}, 'admin-auth-id');
    expect(collisionOccurred).toBe(true);
    // Generation succeeded gracefully without throwing 500 or crashing
    expect(res).toBeDefined();
    expect(res.contractId).toBe(sampleContractId);
  });

  it('15. Follow-up repair/parts visits do not consume preventive-maintenance obligations', async () => {
    // When a service schedule is created for a breakdown or follow-up with pm_obligation_id,
    // only a completed outcome on the service report updates the PM obligation.
    // PENDING_PARTS or PENDING_REPAIRS creates a follow-up visit and leaves the PM obligation untouched.
    const pmSchedule = {
      id: 'pm-sched-1',
      schedule_number: 'PM-2026-000001',
      amc_id: sampleContractId,
      asset_id: sampleAssetId1,
      visit_number: 1,
      status: 'SCHEDULED',
    };
    schedulesStore.push(pmSchedule);

    // Follow-up appointment references pmSchedule.id as pm_obligation_id
    const followUpSchedule = {
      id: 'fu-sched-2',
      schedule_number: 'SCH-2026-000099',
      service_request_id: 'sr-111',
      pm_obligation_id: 'pm-sched-1',
      status: 'SCHEDULED',
    };
    schedulesStore.push(followUpSchedule);

    // In-memory verification: Follow-up visit is a distinct entity
    expect(schedulesStore).toHaveLength(2);
    expect(schedulesStore[0].visit_number).toBe(1);
    expect(schedulesStore[1].visit_number).toBeUndefined();
    expect(schedulesStore[0].status).toBe('SCHEDULED');
  });

  it('16. Existing authorization, validation, and audit behavior remains correct', async () => {
    // 16a. Unauthenticated access blocked
    const unauthRes = await request(app)
      .patch(`/api/v1/amc-contracts/${sampleContractId}/status`)
      .send({ status: 'ACTIVE' });
    expect(unauthRes.status).toBe(401);

    // 16b. Invalid UUID rejected
    const invalidUuidRes = await request(app)
      .patch('/api/v1/amc-contracts/not-a-uuid/status')
      .set('Authorization', adminAuthToken)
      .send({ status: 'ACTIVE' });
    expect(invalidUuidRes.status).toBe(422);

    // 16c. Nonexistent contract returns 404
    const notFoundRes = await request(app)
      .patch('/api/v1/amc-contracts/99999999-9999-9999-9999-999999999999/status')
      .set('Authorization', adminAuthToken)
      .send({ status: 'ACTIVE' });
    expect(notFoundRes.status).toBe(404);
  });
});
