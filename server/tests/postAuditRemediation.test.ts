import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { amcService } from '../src/services/amc.service.js';
import { assetService } from '../src/services/asset.service.js';

describe('PYS Post-Audit Remediation: PYS-004, PYS-005, PYS-008 Suite', () => {
  const adminAuthToken = 'Bearer valid-admin-token';
  const staffAuthToken = 'Bearer valid-staff-token';

  const mockAdminProfile = { id: 'admin-auth-id', full_name: 'Super Admin', email: 'admin@pys.internal' };
  const mockAdminStaff = { id: 'admin-staff-id', role: 'ADMIN', is_active: true };

  const mockStaffProfile = { id: 'staff-auth-id', full_name: 'Operations Staff', email: 'staff@pys.internal' };
  const mockStaffRecord = { id: 'staff-record-id', role: 'STAFF', is_active: true };

  const sampleCustomerId = '11111111-1111-1111-1111-111111111111';
  const otherCustomerId = '11111111-1111-1111-1111-999999999999';
  const sampleSiteId = '22222222-2222-2222-2222-222222222222';
  const otherSiteId = '22222222-2222-2222-2222-999999999999';
  const sampleAssetId = '33333333-3333-3333-3333-333333333333';
  const sampleScheduleId = '55555555-5555-5555-5555-555555555555';
  const sampleFollowUpScheduleId = '55555555-5555-5555-5555-666666666666';
  const sampleTechId = '66666666-6666-6666-6666-666666666666';
  const sampleAmcId = '88888888-8888-8888-8888-888888888888';
  const sampleReportId = '99999999-9999-9999-9999-999999999999';

  const sampleCustomer = {
    id: sampleCustomerId,
    name: 'Sachin Parekh',
    customer_code: 'CUST-1001',
    phone: '9820112233',
    email: 'sachin.parekh@example.com',
  };

  const sampleScheduleRecord = {
    id: sampleScheduleId,
    schedule_number: 'PM-2026-00001',
    amc_id: sampleAmcId,
    pm_obligation_id: sampleScheduleId,
    asset_id: sampleAssetId,
    service_request_id: null,
    customer_id: sampleCustomerId,
    site_id: sampleSiteId,
    technician_id: sampleTechId,
    scheduled_date: '2026-10-15',
    start_time: '10:00',
    end_time: '12:00',
    duration_minutes: 120,
    status: 'ASSIGNED',
    planned_service_type: 'DRY_SERVICE',
    rescheduled_from_id: null,
  };

  const sampleAssetRecord = {
    id: sampleAssetId,
    site_id: sampleSiteId,
    customer_id: sampleCustomerId,
    asset_tag: 'ESSC-0001',
    brand: 'Daikin',
    model_number: 'FTKF50',
    indoor_serial_number: 'IDU-1001',
    outdoor_serial_number: 'ODU-1001',
    serial_number: 'IDU-1001',
    ac_type: 'Split AC',
    technology: 'INVERTER',
    capacity_tons: 1.5,
    star_rating: 5,
    refrigerant_type: 'R32',
    floor_location: '1st Floor',
    room_location: 'Living Room',
  };

  const setupAuth = (role: 'ADMIN' | 'STAFF' = 'ADMIN') => {
    const authUser = role === 'ADMIN' ? { id: 'admin-auth-id' } : { id: 'staff-auth-id' };
    const profile = role === 'ADMIN' ? mockAdminProfile : mockStaffProfile;
    const staffRecord = role === 'ADMIN' ? mockAdminStaff : mockStaffRecord;

    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: authUser }, error: null }),
      },
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: profile, error: null }),
          };
        }
        if (table === 'staff') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: staffRecord, error: null }),
          };
        }
        return {};
      },
    };
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // PYS-004: Multi-Asset / Multi-Issue Revisit Resolution & AMC Progress
  // =========================================================================
  describe('PYS-004: AMC PM Visit Obligation Counting & Resolution', () => {
    it('1. Unresolved PENDING_PARTS report prevents PM obligation from counting as completed', async () => {
      const mockSchedulesData = [
        {
          id: sampleScheduleId,
          amc_id: sampleAmcId,
          asset_id: sampleAssetId,
          scheduled_date: '2026-10-10',
          status: 'COMPLETED',
          rescheduled_from_id: null,
          service_reports: [
            {
              id: 'rep-orig-1',
              primary_outcome: 'PENDING_PARTS',
              resolution_status: 'AWAITING_PARTS', // Not resolved!
            },
          ],
        },
      ];

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'service_schedules') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockSchedulesData, error: null }),
                }),
                eq: vi.fn().mockResolvedValue({ data: mockSchedulesData, error: null }),
              }),
            };
          }
          if (table === 'amc_contracts') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: sampleAmcId,
                      contract_number: 'AMC-2026-0001',
                      customer_id: sampleCustomerId,
                      plan_id: null,
                      start_date: '2026-01-01',
                      end_date: '2026-12-31',
                      frequency: 'QUARTERLY',
                      total_amount: 12000,
                      total_visits: 4,
                      status: 'ACTIVE',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'amc_assets') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }
          return {};
        },
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const contract = await amcService.getContractById(sampleAmcId);
      // Because report has unresolved PENDING_PARTS, completedVisitsCount must remain 0
      expect(contract.completedVisitsCount).toBe(0);
      expect(contract.remainingVisitsCount).toBe(4);
    });

    it('2. Resolved revisit report allows originating PM obligation to count as completed (1 visit)', async () => {
      const mockSchedulesData = [
        {
          id: sampleScheduleId,
          amc_id: sampleAmcId,
          asset_id: sampleAssetId,
          scheduled_date: '2026-10-10',
          status: 'COMPLETED',
          rescheduled_from_id: null,
          service_reports: [
            {
              id: 'rep-orig-1',
              primary_outcome: 'PENDING_PARTS',
              resolution_status: 'RESOLVED', // Resolved by follow-up!
            },
          ],
        },
        // Follow-up revisit schedule:
        {
          id: sampleFollowUpScheduleId,
          amc_id: sampleAmcId,
          asset_id: sampleAssetId,
          scheduled_date: '2026-10-14',
          status: 'COMPLETED',
          rescheduled_from_id: sampleScheduleId, // Follow-up!
          service_reports: [
            {
              id: 'rep-followup-1',
              primary_outcome: 'COMPLETED',
              resolution_status: 'RESOLVED',
            },
          ],
        },
      ];

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'service_schedules') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockSchedulesData, error: null }),
                }),
                eq: vi.fn().mockResolvedValue({ data: mockSchedulesData, error: null }),
              }),
            };
          }
          if (table === 'amc_contracts') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: sampleAmcId,
                      contract_number: 'AMC-2026-0001',
                      customer_id: sampleCustomerId,
                      plan_id: null,
                      start_date: '2026-01-01',
                      end_date: '2026-12-31',
                      frequency: 'QUARTERLY',
                      total_amount: 12000,
                      total_visits: 4,
                      status: 'ACTIVE',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'amc_assets') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }
          return {};
        },
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const contract = await amcService.getContractById(sampleAmcId);
      // Originating obligation is completed (1 visit). Follow-up does NOT consume a second visit!
      expect(contract.completedVisitsCount).toBe(1);
      expect(contract.remainingVisitsCount).toBe(3);
    });

    it('3. assetService.getAssetAmcHistory accurately reflects completed PM obligations and ignores follow-ups', async () => {
      const mockSchedulesData = [
        {
          id: sampleScheduleId,
          amc_id: sampleAmcId,
          asset_id: sampleAssetId,
          status: 'COMPLETED',
          rescheduled_from_id: null,
          service_reports: [
            {
              id: 'rep-orig-1',
              primary_outcome: 'PENDING_REPAIRS',
              resolution_status: 'RESOLVED',
            },
          ],
        },
        {
          id: sampleFollowUpScheduleId,
          amc_id: sampleAmcId,
          asset_id: sampleAssetId,
          status: 'COMPLETED',
          rescheduled_from_id: sampleScheduleId,
          service_reports: [
            {
              id: 'rep-followup-1',
              primary_outcome: 'COMPLETED',
              resolution_status: 'RESOLVED',
            },
          ],
        },
      ];

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'ac_assets') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: sampleAssetId,
                      asset_tag: 'ESSC-0001',
                      site_id: sampleSiteId,
                      customer_sites: { site_name: 'Residence', customer_id: sampleCustomerId },
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'amc_assets') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        amc_id: sampleAmcId,
                        amc_contracts: {
                          id: sampleAmcId,
                          contract_number: 'AMC-2026-0001',
                          status: 'ACTIVE',
                          start_date: '2026-01-01',
                          end_date: '2026-12-31',
                          total_visits: 4,
                          total_amount: 12000,
                          frequency: 'QUARTERLY',
                          customers: { name: 'Sachin Parekh' },
                        },
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'service_schedules') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: mockSchedulesData, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const historyResult = await assetService.getAssetAmcHistory(sampleAssetId);
      expect(historyResult.history).toHaveLength(1);
      expect(historyResult.history[0].completedVisits).toBe(1);
      expect(historyResult.history[0].remainingVisits).toBe(3);
    });
  });

  // =========================================================================
  // PYS-005: Cross-Entity Asset/Site Validation
  // =========================================================================
  describe('PYS-005: Cross-Entity Asset / Site / Customer Validation', () => {
    it('1. Rejects report creation with 400 when asset belongs to a different site', async () => {
      const authMock = setupAuth('ADMIN');
      const mismatchedSiteAsset = {
        ...sampleAssetRecord,
        site_id: otherSiteId, // Mismatched site!
      };

      const mockSupabase = {
        ...authMock,
        from: (table: string) => {
          if (table === 'profiles' || table === 'staff') return authMock.from(table);
          if (table === 'service_reports') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          if (table === 'service_schedules') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: sampleScheduleRecord, error: null }),
              }),
            };
          }
          if (table === 'ac_assets') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({ data: [mismatchedSiteAsset], error: null }),
            };
          }
          return {};
        },
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post('/api/v1/service-reports')
        .set('Authorization', adminAuthToken)
        .send({
          reportNumber: 'REP-CROSS-SITE-01',
          scheduleId: sampleScheduleId,
          visitType: 'PREVENTIVE',
          serviceDate: '2026-10-15',
          primaryOutcome: 'COMPLETED',
          workDescription: 'Routine PM check',
          assets: [
            {
              assetId: sampleAssetId,
              assetOutcome: 'COMPLETED',
              workPerformed: 'Filter cleaned',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('does not belong to the scheduled site');
    });

    it('2. Rejects report creation with 400 when asset belongs to a different customer', async () => {
      const authMock = setupAuth('ADMIN');
      const mismatchedCustomerAsset = {
        ...sampleAssetRecord,
        customer_id: otherCustomerId, // Mismatched customer!
      };

      const mockSupabase = {
        ...authMock,
        from: (table: string) => {
          if (table === 'profiles' || table === 'staff') return authMock.from(table);
          if (table === 'service_reports') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          if (table === 'service_schedules') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: sampleScheduleRecord, error: null }),
              }),
            };
          }
          if (table === 'ac_assets') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({ data: [mismatchedCustomerAsset], error: null }),
            };
          }
          return {};
        },
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post('/api/v1/service-reports')
        .set('Authorization', adminAuthToken)
        .send({
          reportNumber: 'REP-CROSS-CUST-01',
          scheduleId: sampleScheduleId,
          visitType: 'PREVENTIVE',
          serviceDate: '2026-10-15',
          primaryOutcome: 'COMPLETED',
          workDescription: 'Routine PM check',
          assets: [
            {
              assetId: sampleAssetId,
              assetOutcome: 'COMPLETED',
              workPerformed: 'Filter cleaned',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('does not belong to the scheduled customer');
    });

    it('3. Rejects report creation with 400 when referenced asset does not exist', async () => {
      const authMock = setupAuth('ADMIN');

      const mockSupabase = {
        ...authMock,
        from: (table: string) => {
          if (table === 'profiles' || table === 'staff') return authMock.from(table);
          if (table === 'service_reports') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          if (table === 'service_schedules') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: sampleScheduleRecord, error: null }),
              }),
            };
          }
          if (table === 'ac_assets') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({ data: [], error: null }), // Not found!
            };
          }
          return {};
        },
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post('/api/v1/service-reports')
        .set('Authorization', adminAuthToken)
        .send({
          reportNumber: 'REP-NONEXISTENT-ASSET-01',
          scheduleId: sampleScheduleId,
          visitType: 'PREVENTIVE',
          serviceDate: '2026-10-15',
          primaryOutcome: 'COMPLETED',
          workDescription: 'Routine PM check',
          assets: [
            {
              assetId: '99999999-9999-9999-9999-888888888888',
              assetOutcome: 'COMPLETED',
              workPerformed: 'Filter cleaned',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('One or more referenced AC assets could not be found');
    });

    it('4. Successfully accepts report when asset matches customer and site', async () => {
      const authMock = setupAuth('ADMIN');
      let insertedReport: any = null;

      const mockSupabase = {
        ...authMock,
        from: (table: string) => {
          if (table === 'profiles' || table === 'staff') return authMock.from(table);
          if (table === 'service_reports') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                return {
                  maybeSingle: vi.fn().mockImplementation(() => {
                    if (col === 'id') {
                      return Promise.resolve({
                        data: {
                          id: sampleReportId,
                          report_number: 'REP-VALID-MATCH-01',
                          visit_type: 'PREVENTIVE',
                          service_schedule_id: sampleScheduleId,
                          customer_id: sampleCustomerId,
                          site_id: sampleSiteId,
                          technician_id: sampleTechId,
                          service_date: '2026-10-15',
                          primary_outcome: 'COMPLETED',
                          customers: sampleCustomer,
                          customer_sites: { id: sampleSiteId, site_name: 'HQ' },
                          technicians: { id: sampleTechId, name: 'Raj Patel' },
                          service_schedules: { id: sampleScheduleId, schedule_number: 'PM-2026-00001' },
                          amc_contracts: null,
                          profiles: mockAdminProfile,
                        },
                        error: null,
                      });
                    }
                    return Promise.resolve({ data: null, error: null });
                  }),
                };
              }),
              insert: vi.fn().mockImplementation((rec: any) => {
                insertedReport = rec;
                return {
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { id: sampleReportId, report_number: rec.report_number },
                      error: null,
                    }),
                  }),
                };
              }),
            };
          }
          if (table === 'service_report_assets') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
          if (table === 'service_report_items') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
          if (table === 'service_schedules') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: sampleScheduleRecord, error: null }),
              update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            };
          }
          if (table === 'ac_assets') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({ data: [sampleAssetRecord], error: null }),
            };
          }
          if (table === 'activity_logs') {
            return { insert: vi.fn().mockResolvedValue({ error: null }) };
          }
          return {};
        },
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post('/api/v1/service-reports')
        .set('Authorization', adminAuthToken)
        .send({
          reportNumber: 'REP-VALID-MATCH-01',
          scheduleId: sampleScheduleId,
          visitType: 'PREVENTIVE',
          serviceDate: '2026-10-15',
          primaryOutcome: 'COMPLETED',
          workDescription: 'Verified match',
          assets: [
            {
              assetId: sampleAssetId,
              assetOutcome: 'COMPLETED',
              workPerformed: 'Validated correctly',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(insertedReport).toBeTruthy();
      expect(insertedReport.site_id).toBe(sampleSiteId);
      expect(insertedReport.customer_id).toBe(sampleCustomerId);
    });
  });

  // =========================================================================
  // PYS-008: Customer Email in Report Detail & List
  // =========================================================================
  describe('PYS-008: Customer Email in Report Detail & List', () => {
    it('1. GET /api/v1/service-reports/:id returns customerEmail when present on customer', async () => {
      const authMock = setupAuth('ADMIN');
      const mockSupabase = {
        ...authMock,
        from: (table: string) => {
          if (table === 'profiles' || table === 'staff') return authMock.from(table);
          if (table === 'service_reports') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: sampleReportId,
                    report_number: 'REP-EMAIL-01',
                    visit_type: 'SERVICE_REQUEST',
                    service_schedule_id: sampleScheduleId,
                    customer_id: sampleCustomerId,
                    site_id: sampleSiteId,
                    technician_id: sampleTechId,
                    service_date: '2026-10-15',
                    primary_outcome: 'COMPLETED',
                    resolution_status: 'RESOLVED',
                    customers: sampleCustomer, // Contains email: 'sachin.parekh@example.com'
                    customer_sites: { id: sampleSiteId, site_name: 'Residence', address: 'Plot 45' },
                    technicians: { id: sampleTechId, name: 'Raj Patel', technician_code: 'TECH-01' },
                    service_schedules: { id: sampleScheduleId, schedule_number: 'SCH-01' },
                    service_requests: null,
                    amc_contracts: null,
                    profiles: mockAdminProfile,
                  },
                  error: null,
                }),
              }),
            };
          }
          if (table === 'service_report_assets') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
          if (table === 'service_report_items') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
          return {};
        },
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .get(`/api/v1/service-reports/${sampleReportId}`)
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.report.customerEmail).toBe('sachin.parekh@example.com');
      expect(res.body.data.report.customerName).toBe('Sachin Parekh');
      expect(res.body.data.report.customerPhone).toBe('9820112233');
    });

    it('2. GET /api/v1/service-reports/:id returns null customerEmail when customer email is not configured', async () => {
      const authMock = setupAuth('ADMIN');
      const customerWithoutEmail = {
        ...sampleCustomer,
        email: null,
      };

      const mockSupabase = {
        ...authMock,
        from: (table: string) => {
          if (table === 'profiles' || table === 'staff') return authMock.from(table);
          if (table === 'service_reports') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: sampleReportId,
                    report_number: 'REP-EMAIL-02',
                    visit_type: 'SERVICE_REQUEST',
                    service_schedule_id: sampleScheduleId,
                    customer_id: sampleCustomerId,
                    site_id: sampleSiteId,
                    technician_id: sampleTechId,
                    service_date: '2026-10-15',
                    primary_outcome: 'COMPLETED',
                    resolution_status: 'RESOLVED',
                    customers: customerWithoutEmail,
                    customer_sites: { id: sampleSiteId, site_name: 'Residence', address: 'Plot 45' },
                    technicians: { id: sampleTechId, name: 'Raj Patel', technician_code: 'TECH-01' },
                    service_schedules: { id: sampleScheduleId, schedule_number: 'SCH-01' },
                    service_requests: null,
                    amc_contracts: null,
                    profiles: mockAdminProfile,
                  },
                  error: null,
                }),
              }),
            };
          }
          if (table === 'service_report_assets') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
          if (table === 'service_report_items') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
          return {};
        },
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .get(`/api/v1/service-reports/${sampleReportId}`)
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.report.customerEmail).toBeNull();
    });

    it('3. GET /api/v1/service-reports includes customerEmail in list response items', async () => {
      const authMock = setupAuth('ADMIN');
      const listRows = [
        {
          id: sampleReportId,
          report_number: 'REP-LIST-01',
          visit_type: 'SERVICE_REQUEST',
          service_schedule_id: sampleScheduleId,
          customer_id: sampleCustomerId,
          site_id: sampleSiteId,
          technician_id: sampleTechId,
          service_date: '2026-10-15',
          primary_outcome: 'COMPLETED',
          resolution_status: 'RESOLVED',
          customers: sampleCustomer,
          customer_sites: { id: sampleSiteId, site_name: 'Residence' },
          technicians: { id: sampleTechId, name: 'Raj Patel' },
          service_schedules: { id: sampleScheduleId, schedule_number: 'SCH-01' },
          service_requests: null,
          amc_contracts: null,
          profiles: mockAdminProfile,
        },
      ];

      const createQueryMock = () => {
        const queryObj: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(),
          then: (resolve: any) => resolve({ data: listRows, count: 1, error: null }),
        };
        return queryObj;
      };

      const mockSupabase = {
        ...authMock,
        from: (table: string) => {
          if (table === 'profiles' || table === 'staff') return authMock.from(table);
          if (table === 'service_reports') {
            return createQueryMock();
          }
          return {};
        },
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .get('/api/v1/service-reports')
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reports).toHaveLength(1);
      expect(res.body.data.reports[0].customerEmail).toBe('sachin.parekh@example.com');
    });
  });
});
