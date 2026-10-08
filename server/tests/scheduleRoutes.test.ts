import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('Phase 9: Scheduling & Technician Assignment API (/api/v1/service-schedules)', () => {
  const adminAuthToken = 'Bearer valid-admin-token';
  const staffAuthToken = 'Bearer valid-staff-token';
  const inactiveStaffToken = 'Bearer inactive-staff-token';

  const mockAdminProfile = { id: 'admin-auth-id', full_name: 'Super Admin', email: 'admin@pys.internal' };
  const mockAdminStaff = { id: 'admin-staff-id', role: 'ADMIN', is_active: true };

  const mockStaffProfile = { id: 'staff-auth-id', full_name: 'Operations Staff', email: 'staff@pys.internal' };
  const mockStaffRecord = { id: 'staff-record-id', role: 'STAFF', is_active: true };

  const sampleCustomerId = '11111111-1111-1111-1111-111111111111';
  const sampleSiteId = '22222222-2222-2222-2222-222222222222';
  const sampleAssetId = '33333333-3333-3333-3333-333333333333';
  const sampleRequestId = '44444444-4444-4444-4444-444444444444';
  const sampleScheduleId = '55555555-5555-5555-5555-555555555555';
  const sampleTechId = '66666666-6666-6666-6666-666666666666';
  const inactiveTechId = '77777777-7777-7777-7777-777777777777';

  const sampleScheduleRecord = {
    id: sampleScheduleId,
    schedule_number: 'SCH-2026-00001',
    amc_id: null,
    asset_id: sampleAssetId,
    service_request_id: sampleRequestId,
    customer_id: sampleCustomerId,
    site_id: sampleSiteId,
    technician_id: null,
    scheduled_date: '2026-10-15',
    start_time: '10:00',
    end_time: '12:00',
    duration_minutes: 120,
    visit_number: null,
    status: 'SCHEDULED',
    is_system_generated: false,
    notes: 'AC cooling issue',
    cancellation_reason: null,
    cancelled_at: null,
    cancelled_by: null,
    rescheduled_from_id: null,
    created_by: 'admin-auth-id',
    updated_by: null,
    created_at: '2026-10-08T10:00:00Z',
    updated_at: '2026-10-08T10:00:00Z',
    customers: {
      name: 'Sachin Parekh',
      customer_code: 'CUST-1001',
      phone: '9820112233',
    },
    customer_sites: {
      site_name: 'Residence',
      address: 'Plot 45, Sector 19, Panvel, Navi Mumbai',
    },
    ac_assets: {
      asset_tag: 'ESSC-0001',
      brand: 'Mitsubishi Heavy',
      model_number: 'SRK24CW',
      ac_type: 'SPLIT',
      room_location: 'Living Room',
    },
    technicians: null,
    service_requests: {
      request_number: 'SR-2026-0001',
      request_type: 'BREAKDOWN',
      priority: 'HIGH',
      description: 'AC not cooling',
    },
    amc_contracts: null,
  };

  const sampleTechnician = {
    id: sampleTechId,
    technician_code: 'TECH-0001',
    name: 'Raj Patel',
    phone: '9892001122',
    email: 'raj.patel@pys.internal',
    specializations: ['SPLIT', 'INVERTER', 'PREVENTIVE_MAINTENANCE'],
    service_areas: ['Panvel', 'Navi Mumbai'],
    status: 'AVAILABLE',
    is_active: true,
    max_daily_workload: 5,
    current_workload: 0,
    working_days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
    working_hours: { start: '09:00', end: '18:00' },
  };

  const sampleInactiveTech = {
    id: inactiveTechId,
    technician_code: 'TECH-0002',
    name: 'Vikram Joshi',
    phone: '9892003344',
    email: 'vikram@pys.internal',
    specializations: ['SPLIT'],
    service_areas: ['Panvel'],
    status: 'ON_LEAVE',
    is_active: false,
    max_daily_workload: 5,
    current_workload: 0,
    working_days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
    working_hours: { start: '09:00', end: '18:00' },
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
    const res = await request(app).get('/api/v1/service-schedules');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('2. Rejects inactive staff with 403', async () => {
    const authMock = setupAuth('INACTIVE');
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(authMock as any);

    const res = await request(app)
      .get('/api/v1/service-schedules')
      .set('Authorization', inactiveStaffToken);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // =========================================================================
  // 2. Schedule Creation
  // =========================================================================
  it('3. Successfully creates schedule for a service request', async () => {
    const authMock = setupAuth('ADMIN');
    const dbMock = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') {
          return authMock.from(table);
        }
        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: sampleRequestId,
                request_number: 'SR-2026-0001',
                customer_id: sampleCustomerId,
                site_id: sampleSiteId,
                asset_id: sampleAssetId,
                status: 'REQUESTED',
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'service_schedules') {
          let lastCol = '';
          const chainable = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string) => {
              lastCol = col;
              return chainable;
            }),
            neq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(() => {
              if (lastCol === 'id') {
                return Promise.resolve({
                  data: { ...sampleScheduleRecord, id: 'new-sched-id', schedule_number: 'SCH-2026-99999' },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { ...sampleScheduleRecord, id: 'new-sched-id', schedule_number: 'SCH-2026-99999' },
                  error: null,
                }),
              }),
            }),
          };
          return chainable;
        }
        if (table === 'service_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'activity_logs') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      },
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(dbMock as any);

    const res = await request(app)
      .post('/api/v1/service-schedules')
      .set('Authorization', adminAuthToken)
      .send({
        serviceRequestId: sampleRequestId,
        scheduledDate: '2026-10-15',
        startTime: '10:00',
        endTime: '12:00',
        notes: 'Customer prefers morning slot',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.schedule).toBeDefined();
  });

  it('4. Rejects invalid date format with 422 validation error', async () => {
    const authMock = setupAuth('STAFF');
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(authMock as any);

    const res = await request(app)
      .post('/api/v1/service-schedules')
      .set('Authorization', staffAuthToken)
      .send({
        serviceRequestId: sampleRequestId,
        scheduledDate: '15-10-2026', // Invalid format
        startTime: '10:00',
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('5. Rejects duplicate active schedule for the same service request with 409 Conflict', async () => {
    const authMock = setupAuth('ADMIN');
    const dbMock = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') {
          return authMock.from(table);
        }
        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: sampleRequestId,
                request_number: 'SR-2026-0001',
                customer_id: sampleCustomerId,
                site_id: sampleSiteId,
                status: 'SCHEDULED',
              },
              error: null,
            }),
          };
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: sampleScheduleId, schedule_number: 'SCH-2026-00001' },
              error: null,
            }),
          };
        }
        return {};
      },
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(dbMock as any);

    const res = await request(app)
      .post('/api/v1/service-schedules')
      .set('Authorization', adminAuthToken)
      .send({
        serviceRequestId: sampleRequestId,
        scheduledDate: '2026-10-15',
        startTime: '10:00',
        endTime: '12:00',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('already has an active schedule');
  });

  // =========================================================================
  // 3. Technician Eligibility & Recommendations
  // =========================================================================
  it('6. Evaluates technician eligibility and returns recommendations with "Why this technician" factors', async () => {
    const authMock = setupAuth('STAFF');
    const dbMock = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') {
          return authMock.from(table);
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            not: vi.fn().mockResolvedValue({ data: [], error: null }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: sampleScheduleRecord,
              error: null,
            }),
          };
        }
        if (table === 'technicians') {
          return {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [sampleTechnician, sampleInactiveTech],
              error: null,
            }),
          };
        }
        if (table === 'service_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {};
      },
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(dbMock as any);

    const res = await request(app)
      .get(`/api/v1/service-schedules/${sampleScheduleId}/eligible-technicians`)
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const recs = res.body.data.recommendations;
    expect(recs).toBeInstanceOf(Array);
    expect(recs.length).toBe(2);

    const tech1 = recs.find((r: any) => r.technicianId === sampleTechId);
    expect(tech1.isEligible).toBe(true);
    expect(tech1.areaMatch).toBe(true);
    expect(tech1.skillMatch).toBe(true);
    expect(tech1.scoreBreakdown.areaScore).toBe(40);
    expect(tech1.scoreBreakdown.availabilityScore).toBe(20);
    expect(tech1.reasons).toContain('✓ Service area match');

    const tech2 = recs.find((r: any) => r.technicianId === inactiveTechId);
    expect(tech2.isEligible).toBe(false);
    expect(tech2.isActive).toBe(false);
    expect(tech2.warnings.some((w: string) => w.includes('Technician is on leave'))).toBe(true);
  });

  // =========================================================================
  // 4. Technician Assignment & Hard Conflict Prevention
  // =========================================================================
  it('7. Assigns technician and updates schedule status to ASSIGNED', async () => {
    const authMock = setupAuth('ADMIN');
    const dbMock = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') {
          return authMock.from(table);
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            neq: vi.fn().mockResolvedValue({ data: [], error: null }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: sampleScheduleRecord,
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'technicians') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: sampleTechnician,
              error: null,
            }),
          };
        }
        if (table === 'service_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            update: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'service_requests') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'activity_logs') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      },
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(dbMock as any);

    const res = await request(app)
      .post(`/api/v1/service-schedules/${sampleScheduleId}/assign`)
      .set('Authorization', adminAuthToken)
      .send({
        technicianId: sampleTechId,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('8. Rejects assignment when technician has an overlapping schedule conflict (409 Conflict)', async () => {
    const authMock = setupAuth('ADMIN');
    const dbMock = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') {
          return authMock.from(table);
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            // Returns an overlapping schedule from 10:30 to 11:30
            neq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'conflict-sched-id',
                  schedule_number: 'SCH-2026-00099',
                  start_time: '10:30',
                  end_time: '11:30',
                },
              ],
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: sampleScheduleRecord, // 10:00 to 12:00
              error: null,
            }),
          };
        }
        if (table === 'technicians') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: sampleTechnician,
              error: null,
            }),
          };
        }
        if (table === 'service_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {};
      },
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(dbMock as any);

    const res = await request(app)
      .post(`/api/v1/service-schedules/${sampleScheduleId}/assign`)
      .set('Authorization', adminAuthToken)
      .send({
        technicianId: sampleTechId,
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('already assigned to another service');
    expect(res.body.error.message).toContain('SCH-2026-00099');
  });

  it('9. Rejects assigning inactive or on-leave technician with 400 Bad Request', async () => {
    const authMock = setupAuth('ADMIN');
    const dbMock = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') {
          return authMock.from(table);
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: sampleScheduleRecord,
              error: null,
            }),
          };
        }
        if (table === 'technicians') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: sampleInactiveTech,
              error: null,
            }),
          };
        }
        if (table === 'service_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {};
      },
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(dbMock as any);

    const res = await request(app)
      .post(`/api/v1/service-schedules/${sampleScheduleId}/assign`)
      .set('Authorization', adminAuthToken)
      .send({
        technicianId: inactiveTechId,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Inactive/Off-duty');
  });

  // =========================================================================
  // 5. Rescheduling, Reassignment & Cancellation
  // =========================================================================
  it('10. Successfully reschedules appointment to a new date and time', async () => {
    const authMock = setupAuth('ADMIN');
    const dbMock = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') {
          return authMock.from(table);
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            neq: vi.fn().mockResolvedValue({ data: [], error: null }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { ...sampleScheduleRecord, technician_id: null },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'service_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'activity_logs') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      },
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(dbMock as any);

    const res = await request(app)
      .post(`/api/v1/service-schedules/${sampleScheduleId}/reschedule`)
      .set('Authorization', adminAuthToken)
      .send({
        scheduledDate: '2026-10-18',
        startTime: '14:00',
        endTime: '16:00',
        reason: 'Customer requested weekend afternoon slot',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('11. Cancels schedule with valid cancellation reason and updates status to CANCELLED', async () => {
    const authMock = setupAuth('ADMIN');
    const dbMock = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') {
          return authMock.from(table);
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: sampleScheduleRecord,
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'service_assignments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            update: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'service_requests') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'activity_logs') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      },
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(dbMock as any);

    const res = await request(app)
      .post(`/api/v1/service-schedules/${sampleScheduleId}/cancel`)
      .set('Authorization', adminAuthToken)
      .send({
        reason: 'Customer relocated to another city',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // =========================================================================
  // 6. Calendar & Unscheduled Queue
  // =========================================================================
  it('12. Fetches calendar view bounded by date range', async () => {
    const authMock = setupAuth('STAFF');
    const dbMock = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') {
          return authMock.from(table);
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({
              data: [sampleScheduleRecord],
              error: null,
            }),
          };
        }
        return {};
      },
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(dbMock as any);

    const res = await request(app)
      .get('/api/v1/service-schedules/calendar?startDate=2026-10-15&endDate=2026-10-21')
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.schedules).toBeInstanceOf(Array);
  });

  it('13. Fetches unscheduled work queue including pending requests and PM obligations', async () => {
    const authMock = setupAuth('STAFF');
    const dbMock = {
      ...authMock,
      from: (table: string) => {
        if (table === 'profiles' || table === 'staff') {
          return authMock.from(table);
        }
        if (table === 'service_requests') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  id: sampleRequestId,
                  request_number: 'SR-2026-0001',
                  customer_id: sampleCustomerId,
                  site_id: sampleSiteId,
                  asset_id: sampleAssetId,
                  request_type: 'BREAKDOWN',
                  priority: 'HIGH',
                  description: 'Not cooling',
                  reported_date: '2026-10-08',
                  customers: { name: 'Sachin Parekh', phone: '9820112233' },
                  customer_sites: { site_name: 'Residence', address: 'Panvel' },
                  ac_assets: { asset_tag: 'ESSC-0001', brand: 'Mitsubishi Heavy', model_number: 'SRK24CW', ac_type: 'SPLIT' },
                },
              ],
              error: null,
            }),
          };
        }
        if (table === 'service_schedules') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            neq: vi.fn().mockResolvedValue({ data: [], error: null }),
            not: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {};
      },
    };
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(dbMock as any);

    const res = await request(app)
      .get('/api/v1/service-schedules/unscheduled-work')
      .set('Authorization', staffAuthToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.items[0].type).toBe('SERVICE_REQUEST');
    expect(res.body.data.items[0].identifier).toBe('SR-2026-0001');
  });
});
