import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('Service Visit Report & Completion Management API (/api/v1/service-reports)', () => {
  const adminAuthToken = 'Bearer valid-admin-token';
  const staffAuthToken = 'Bearer valid-staff-token';

  const mockAdminProfile = { id: 'admin-auth-id', full_name: 'Super Admin', email: 'admin@pys.internal' };
  const mockAdminStaff = { id: 'admin-staff-id', role: 'ADMIN', is_active: true };

  const mockStaffProfile = { id: 'staff-auth-id', full_name: 'Operations Staff', email: 'staff@pys.internal' };
  const mockStaffRecord = { id: 'staff-record-id', role: 'STAFF', is_active: true };

  const sampleCustomerId = '11111111-1111-1111-1111-111111111111';
  const sampleSiteId = '22222222-2222-2222-2222-222222222222';
  const sampleAssetId = '33333333-3333-3333-3333-333333333333';
  const sampleSecondAssetId = '33333333-3333-3333-3333-444444444444';
  const sampleRequestId = '44444444-4444-4444-4444-444444444444';
  const sampleScheduleId = '55555555-5555-5555-5555-555555555555';
  const sampleTechId = '66666666-6666-6666-6666-666666666666';
  const sampleAmcId = '88888888-8888-8888-8888-888888888888';
  const sampleReportId = '99999999-9999-9999-9999-999999999999';

  const sampleScheduleSrRecord = {
    id: sampleScheduleId,
    schedule_number: 'SCH-2026-00001',
    amc_id: null,
    pm_obligation_id: null,
    asset_id: sampleAssetId,
    service_request_id: sampleRequestId,
    customer_id: sampleCustomerId,
    site_id: sampleSiteId,
    technician_id: sampleTechId,
    scheduled_date: '2026-10-15',
    start_time: '10:00',
    end_time: '12:00',
    duration_minutes: 120,
    status: 'ASSIGNED',
  };

  const sampleSchedulePmRecord = {
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
  };

  const sampleFullReportRow = {
    id: sampleReportId,
    report_number: 'REP-2026-001',
    visit_type: 'SERVICE_REQUEST',
    service_schedule_id: sampleScheduleId,
    service_request_id: sampleRequestId,
    amc_id: null,
    pm_obligation_id: null,
    customer_id: sampleCustomerId,
    site_id: sampleSiteId,
    technician_id: sampleTechId,
    service_date: '2026-10-15',
    start_time: '10:00',
    end_time: '11:45',
    primary_outcome: 'COMPLETED',
    work_description: 'Coil cleaning and capacitor testing completed.',
    technician_remarks: 'Operating smoothly.',
    customer_representative: 'John Doe',
    customer_acknowledgement: 'Confirmed working',
    customer_signature_url: null,
    status: 'SUBMITTED',
    follow_up_schedule_id: null,
    created_by: 'admin-auth-id',
    updated_by: 'admin-auth-id',
    created_at: '2026-10-15T12:00:00Z',
    updated_at: '2026-10-15T12:00:00Z',
    customers: { id: sampleCustomerId, name: 'Sachin Parekh', customer_code: 'CUST-1001', phone: '9820112233' },
    customer_sites: { id: sampleSiteId, site_name: 'Residence', address: 'Plot 45, Panvel' },
    technicians: { id: sampleTechId, name: 'Raj Patel', technician_code: 'TECH-0001', phone: '9892001122' },
    service_schedules: { id: sampleScheduleId, schedule_number: 'SCH-2026-00001' },
    service_requests: { id: sampleRequestId, request_number: 'SR-2026-0001' },
    amc_contracts: null,
    profiles: { id: 'admin-auth-id', full_name: 'Super Admin' },
  };

  const sampleAssetRow = {
    id: 'asset-rep-id-1',
    report_id: sampleReportId,
    asset_id: sampleAssetId,
    fault_reported: 'Not cooling',
    diagnosis_findings: 'Dirty filter and dusty condenser coil',
    work_performed: 'Cleaned coil, inspected blower, checked gas pressure',
    asset_outcome: 'COMPLETED',
    final_condition: 'Good',
    refrigerant_added: false,
    refrigerant_qty_kg: null,
    notes: 'No abnormal noise',
    created_at: '2026-10-15T12:00:00Z',
    updated_at: '2026-10-15T12:00:00Z',
    ac_assets: { id: sampleAssetId, asset_tag: 'AC-001', brand: 'Daikin', model_number: 'FTKF50', room_location: 'Hall' },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupAuth = (role: 'ADMIN' | 'STAFF' | 'INACTIVE' = 'ADMIN') => {
    const authUser =
      role === 'ADMIN'
        ? { id: 'admin-auth-id' }
        : role === 'STAFF'
        ? { id: 'staff-auth-id' }
        : { id: 'inactive-staff-id' };

    const profile =
      role === 'ADMIN'
        ? mockAdminProfile
        : role === 'STAFF'
        ? mockStaffProfile
        : { id: 'inactive-staff-id', full_name: 'Inactive', email: 'inactive@pys.internal' };

    const staffRecord =
      role === 'ADMIN'
        ? mockAdminStaff
        : role === 'STAFF'
        ? mockStaffRecord
        : { id: 'inactive-staff-id', role: 'STAFF', is_active: false };

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

  // =========================================================================
  // 1. Authorization
  // =========================================================================
  it('1. Rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/service-reports');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('2. Rejects inactive staff with 403', async () => {
    const authMock = setupAuth('INACTIVE');
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(authMock as any);

    const res = await request(app)
      .get('/api/v1/service-reports')
      .set('Authorization', 'Bearer inactive-token');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // =========================================================================
  // 2. Validation & Duplicate Report Number Enforcement
  // =========================================================================
  it('3. Rejects report creation with missing manual report number with 422', async () => {
    const authMock = setupAuth('ADMIN');
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(authMock as any);

    const res = await request(app)
      .post('/api/v1/service-reports')
      .set('Authorization', adminAuthToken)
      .send({
        // reportNumber missing
        scheduleId: sampleScheduleId,
        visitType: 'SERVICE_REQUEST',
        serviceDate: '2026-10-15',
        primaryOutcome: 'COMPLETED',
        workDescription: 'Work completed',
        assets: [
          {
            assetId: sampleAssetId,
            assetOutcome: 'COMPLETED',
            workPerformed: 'Tested okay',
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('4. Rejects report creation with duplicate report number with 409 Conflict', async () => {
    const authMock = setupAuth('ADMIN');
    const mockSupabase = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') return authMock.from(table);
        if (table === 'service_reports') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'existing-rep-id', report_number: 'REP-2026-DUPLICATE' },
              error: null,
            }),
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
        reportNumber: 'REP-2026-DUPLICATE',
        scheduleId: sampleScheduleId,
        visitType: 'SERVICE_REQUEST',
        serviceDate: '2026-10-15',
        primaryOutcome: 'COMPLETED',
        workDescription: 'Checked AC',
        assets: [
          {
            assetId: sampleAssetId,
            assetOutcome: 'COMPLETED',
            workPerformed: 'Tested filter',
          },
        ],
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('already exists');
  });

  it('5. Rejects duplicate report creation for the same scheduled appointment with 409 Conflict', async () => {
    const authMock = setupAuth('ADMIN');
    let callCount = 0;
    const mockSupabase = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') return authMock.from(table);
        if (table === 'service_reports') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string, _val: string) => {
              return {
                maybeSingle: vi.fn().mockImplementation(() => {
                  if (col === 'report_number') {
                    return Promise.resolve({ data: null, error: null }); // Unique number
                  }
                  if (col === 'service_schedule_id') {
                    return Promise.resolve({ data: { id: 'prior-rep', report_number: 'PRIOR-001' }, error: null }); // Duplicate schedule!
                  }
                  return Promise.resolve({ data: null, error: null });
                }),
              };
            }),
          };
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleScheduleSrRecord, error: null }),
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
        reportNumber: 'NEW-REP-001',
        scheduleId: sampleScheduleId,
        visitType: 'SERVICE_REQUEST',
        serviceDate: '2026-10-15',
        primaryOutcome: 'COMPLETED',
        workDescription: 'Repaired fan motor',
        assets: [
          {
            assetId: sampleAssetId,
            assetOutcome: 'COMPLETED',
            workPerformed: 'Fixed motor',
          },
        ],
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('already been recorded for this appointment');
  });

  it('6. Rejects visitType PREVENTIVE when schedule is linked to pure service request only (400 Bad Request)', async () => {
    const authMock = setupAuth('ADMIN');
    const mockSupabase = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') return authMock.from(table);
        if (table === 'service_reports') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleScheduleSrRecord, error: null }),
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
        reportNumber: 'REP-MISMATCH-01',
        scheduleId: sampleScheduleId,
        visitType: 'PREVENTIVE', // Incompatible with SR schedule!
        serviceDate: '2026-10-15',
        primaryOutcome: 'COMPLETED',
        workDescription: 'Routine PM',
        assets: [
          {
            assetId: sampleAssetId,
            assetOutcome: 'COMPLETED',
            workPerformed: 'Routine filter cleaning',
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('PREVENTIVE');
  });

  it('7. Rejects primaryOutcome COMPLETED when an AC asset has pending parts or repairs (400 Bad Request)', async () => {
    const authMock = setupAuth('ADMIN');
    const mockSupabase = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') return authMock.from(table);
        if (table === 'service_reports') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleScheduleSrRecord, error: null }),
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
        reportNumber: 'REP-MULTI-ASSET-01',
        scheduleId: sampleScheduleId,
        visitType: 'SERVICE_REQUEST',
        serviceDate: '2026-10-15',
        primaryOutcome: 'COMPLETED', // Discrepancy!
        workDescription: 'Work done on 1 asset',
        assets: [
          {
            assetId: sampleAssetId,
            assetOutcome: 'COMPLETED',
            workPerformed: 'Cleaned',
          },
          {
            assetId: sampleSecondAssetId,
            assetOutcome: 'PENDING_PARTS', // Outstanding unresolved asset!
            workPerformed: 'Inspected, motor burnt',
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Cannot mark overall visit outcome as COMPLETED');
  });

  // =========================================================================
  // 3. Successful Outcome: Service Completed
  // =========================================================================
  it('8. Successfully creates Service Completed report and updates SR to RESOLVED (preserving payment/closure)', async () => {
    const authMock = setupAuth('ADMIN');
    let scheduleUpdatedStatus: string | null = null;
    let srUpdatedStatus: string | null = null;

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
                  if (col === 'id') return Promise.resolve({ data: sampleFullReportRow, error: null });
                  return Promise.resolve({ data: null, error: null });
                }),
              };
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: sampleReportId, report_number: 'REP-2026-001' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'service_report_assets') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [sampleAssetRow], error: null }),
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
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleScheduleSrRecord, error: null }),
            update: vi.fn().mockImplementation((payload: any) => {
              scheduleUpdatedStatus = payload.status;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        if (table === 'service_requests') {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              srUpdatedStatus = payload.status;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        if (table === 'activity_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
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
        reportNumber: 'REP-2026-001',
        scheduleId: sampleScheduleId,
        visitType: 'SERVICE_REQUEST',
        serviceDate: '2026-10-15',
        startTime: '10:00',
        endTime: '11:45',
        primaryOutcome: 'COMPLETED',
        workDescription: 'Coil cleaning and capacitor testing completed.',
        technicianRemarks: 'Operating smoothly.',
        customerRepresentative: 'John Doe',
        customerAcknowledgement: 'Confirmed working',
        assets: [
          {
            assetId: sampleAssetId,
            faultReported: 'Not cooling',
            diagnosisFindings: 'Dirty filter and dusty condenser coil',
            workPerformed: 'Cleaned coil, inspected blower, checked gas pressure',
            assetOutcome: 'COMPLETED',
            finalCondition: 'Good',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.report.reportNumber).toBe('REP-2026-001');
    expect(res.body.data.report.primaryOutcome).toBe('COMPLETED');
    expect(scheduleUpdatedStatus).toBe('COMPLETED');
    expect(srUpdatedStatus).toBe('RESOLVED'); // Preserves PAYMENT/CLOSED distinction!
  });

  // =========================================================================
  // 4. Successful Outcome: Pending for Parts
  // =========================================================================
  it('9. Successfully creates Pending for Parts report, saves part requirements, and updates SR to AWAITING_PARTS', async () => {
    const authMock = setupAuth('ADMIN');
    let srUpdatedStatus: string | null = null;
    let savedItems: any[] = [];

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
                      data: { ...sampleFullReportRow, primary_outcome: 'PENDING_PARTS' },
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: null });
                }),
              };
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: sampleReportId, report_number: 'REP-2026-PARTS-01' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'service_report_assets') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{ ...sampleAssetRow, asset_outcome: 'PENDING_PARTS' }],
              error: null,
            }),
          };
        }
        if (table === 'service_report_items') {
          return {
            insert: vi.fn().mockImplementation((rows: any[]) => {
              savedItems = rows;
              return Promise.resolve({ error: null });
            }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'item-1',
                  report_id: sampleReportId,
                  asset_id: sampleAssetId,
                  item_type: 'PART_REQUIRED',
                  item_name: 'Blower Fan Motor',
                  part_number: 'BM-240-X',
                  quantity: 1,
                  reason: 'Winding shorted',
                  is_revisit_required: true,
                  ac_condition: 'Fair',
                  is_resolved: false,
                  created_at: '2026-10-15T12:00:00Z',
                  updated_at: '2026-10-15T12:00:00Z',
                },
              ],
              error: null,
            }),
          };
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleScheduleSrRecord, error: null }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'service_requests') {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              srUpdatedStatus = payload.status;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        if (table === 'activity_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
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
        reportNumber: 'REP-2026-PARTS-01',
        scheduleId: sampleScheduleId,
        visitType: 'SERVICE_REQUEST',
        serviceDate: '2026-10-15',
        primaryOutcome: 'PENDING_PARTS',
        workDescription: 'Diagnosed motor issue',
        assets: [
          {
            assetId: sampleAssetId,
            assetOutcome: 'PENDING_PARTS',
            faultReported: 'Noise from blower',
            diagnosisFindings: 'Burnt motor coil',
          },
        ],
        items: [
          {
            itemType: 'PART_REQUIRED',
            itemName: 'Blower Fan Motor',
            partNumber: 'BM-240-X',
            quantity: 1,
            reason: 'Winding shorted',
            acCondition: 'Fair',
            isRevisitRequired: true,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(srUpdatedStatus).toBe('AWAITING_PARTS'); // Correct state machine transition!
    expect(savedItems.length).toBe(1);
    expect(savedItems[0].item_name).toBe('Blower Fan Motor');
    expect(savedItems[0].reason).toBe('Winding shorted');
  });

  // =========================================================================
  // 5. Successful Outcome: Pending for Repairs
  // =========================================================================
  it('10. Successfully creates Pending for Repairs report, saves repair details, and updates SR to REVISIT_REQUIRED', async () => {
    const authMock = setupAuth('ADMIN');
    let srUpdatedStatus: string | null = null;
    let savedItems: any[] = [];

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
                      data: { ...sampleFullReportRow, primary_outcome: 'PENDING_REPAIRS' },
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: null });
                }),
              };
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: sampleReportId, report_number: 'REP-2026-REPAIRS-01' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'service_report_assets') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{ ...sampleAssetRow, asset_outcome: 'PENDING_REPAIRS' }],
              error: null,
            }),
          };
        }
        if (table === 'service_report_items') {
          return {
            insert: vi.fn().mockImplementation((rows: any[]) => {
              savedItems = rows;
              return Promise.resolve({ error: null });
            }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'item-2',
                  report_id: sampleReportId,
                  asset_id: sampleAssetId,
                  item_type: 'REPAIR_REQUIRED',
                  item_name: 'Outdoor unit copper pipe brazing and nitrogen pressure leak test',
                  quantity: 1,
                  reason: 'Micro-leak detected near expansion joint',
                  recommended_action: 'Perform gas leak brazing and evacuate system with vacuum pump',
                  is_revisit_required: true,
                  is_resolved: false,
                  created_at: '2026-10-15T12:00:00Z',
                  updated_at: '2026-10-15T12:00:00Z',
                },
              ],
              error: null,
            }),
          };
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleScheduleSrRecord, error: null }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'service_requests') {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              srUpdatedStatus = payload.status;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        if (table === 'activity_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
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
        reportNumber: 'REP-2026-REPAIRS-01',
        scheduleId: sampleScheduleId,
        visitType: 'SERVICE_REQUEST',
        serviceDate: '2026-10-15',
        primaryOutcome: 'PENDING_REPAIRS',
        workDescription: 'Pressure tested system',
        assets: [
          {
            assetId: sampleAssetId,
            assetOutcome: 'PENDING_REPAIRS',
            faultReported: 'Gas leak suspected',
            diagnosisFindings: 'Expansion joint micro-leak',
          },
        ],
        items: [
          {
            itemType: 'REPAIR_REQUIRED',
            itemName: 'Outdoor unit copper pipe brazing and nitrogen pressure leak test',
            reason: 'Micro-leak detected near expansion joint',
            recommendedAction: 'Perform gas leak brazing and evacuate system with vacuum pump',
            isRevisitRequired: true,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(srUpdatedStatus).toBe('REVISIT_REQUIRED'); // Correct state machine transition!
    expect(savedItems.length).toBe(1);
    expect(savedItems[0].item_type).toBe('REPAIR_REQUIRED');
  });

  // =========================================================================
  // 6. AMC Preventive Maintenance Visit Integration
  // =========================================================================
  it('11. Successfully processes AMC Preventive Visit report without disrupting AMC contracts', async () => {
    const authMock = setupAuth('ADMIN');
    let scheduleUpdatedStatus: string | null = null;

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
                        ...sampleFullReportRow,
                        visit_type: 'PREVENTIVE',
                        amc_id: sampleAmcId,
                        service_request_id: null,
                      },
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: null });
                }),
              };
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: sampleReportId, report_number: 'PM-REP-2026-001' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'service_report_assets') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [sampleAssetRow], error: null }),
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
            maybeSingle: vi.fn().mockResolvedValue({ data: sampleSchedulePmRecord, error: null }),
            update: vi.fn().mockImplementation((payload: any) => {
              scheduleUpdatedStatus = payload.status;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        if (table === 'activity_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
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
        reportNumber: 'PM-REP-2026-001',
        scheduleId: sampleScheduleId,
        visitType: 'PREVENTIVE',
        serviceDate: '2026-10-15',
        primaryOutcome: 'COMPLETED',
        workDescription: 'Full AMC preventive servicing, jet pump cleaning, amp check',
        assets: [
          {
            assetId: sampleAssetId,
            assetOutcome: 'COMPLETED',
            workPerformed: 'Deep jet pump chemical cleaning and filter wash',
            finalCondition: 'Good',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(scheduleUpdatedStatus).toBe('COMPLETED');
  });

  // =========================================================================
  // 7. Follow-Up Revisit Scheduling
  // =========================================================================
  it('12. Successfully arranges follow-up revisit for PENDING report without duplicate contracts', async () => {
    const authMock = setupAuth('ADMIN');
    let followUpLinkedReportId: string | null = null;

    const mockPendingReport = {
      ...sampleFullReportRow,
      primary_outcome: 'PENDING_PARTS',
      follow_up_schedule_id: null,
    };

    const mockSupabase = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') return authMock.from(table);
        if (table === 'service_reports') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              return {
                maybeSingle: vi.fn().mockResolvedValue({ data: mockPendingReport, error: null }),
              };
            }),
            update: vi.fn().mockImplementation((payload: any) => {
              followUpLinkedReportId = payload.follow_up_schedule_id;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        if (table === 'service_report_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [sampleAssetRow], error: null }),
          };
        }
        if (table === 'service_report_items') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'follow-up-sched-id', schedule_number: 'SCH-2026-99999' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'service_requests') {
          return {
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'activity_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      },
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .post(`/api/v1/service-reports/${sampleReportId}/follow-up`)
      .set('Authorization', adminAuthToken)
      .send({
        scheduledDate: '2026-10-20',
        startTime: '10:00',
        endTime: '12:00',
        notes: 'Bring replacement blower motor',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(followUpLinkedReportId).toBe('follow-up-sched-id');
  });

  // =========================================================================
  // 8. Retrieval & Query Operations
  // =========================================================================
  it('13. Lists service reports with search and outcome filters', async () => {
    const authMock = setupAuth('STAFF');
    const mockSupabase = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') return authMock.from(table);
        if (table === 'service_reports') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({
              data: [sampleFullReportRow],
              count: 1,
              error: null,
            }),
          };
        }
        return {};
      },
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase as any);

    const res = await request(app)
      .get('/api/v1/service-reports?search=REP-2026&outcome=COMPLETED&page=1&pageSize=20')
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reports).toHaveLength(1);
    expect(res.body.data.reports[0].reportNumber).toBe('REP-2026-001');
    expect(res.body.meta.total).toBe(1);
  });

  it('14. Retrieves report by appointment ID via /by-schedule/:scheduleId', async () => {
    const authMock = setupAuth('STAFF');
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
                  if (col === 'service_schedule_id') {
                    return Promise.resolve({ data: { id: sampleReportId }, error: null });
                  }
                  if (col === 'id') {
                    return Promise.resolve({ data: sampleFullReportRow, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                }),
              };
            }),
          };
        }
        if (table === 'service_report_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [sampleAssetRow], error: null }),
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
      .get(`/api/v1/service-reports/by-schedule/${sampleScheduleId}`)
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.report.reportNumber).toBe('REP-2026-001');
  });
});
