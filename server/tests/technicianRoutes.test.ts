import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('Technician Management API (/api/v1/technicians)', () => {
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

  const sampleTechnicianId = '88888888-8888-8888-8888-888888888888';
  const otherTechnicianId = '99999999-9999-9999-9999-999999999999';

  const sampleTechnicianRecord = {
    id: sampleTechnicianId,
    technician_code: 'TECH-0001',
    name: 'Rahul Sharma',
    phone: '9876543210',
    email: 'rahul.sharma@example.com',
    specializations: ['Split AC', 'Cassette AC', 'VRF / VRV'],
    service_areas: ['Panvel', 'Navi Mumbai', 'Kharghar'],
    status: 'AVAILABLE',
    is_active: true,
    max_daily_workload: 5,
    current_workload: 0,
    joining_date: '2025-06-12',
    notes: 'Senior commercial AC specialist',
    working_days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    working_hours: { start: '09:00', end: '18:00' },
    availability: {
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      workingHours: { start: '09:00', end: '18:00' },
    },
    created_by: 'admin-auth-id',
    updated_by: null,
    created_at: '2026-10-07T10:00:00Z',
    updated_at: '2026-10-07T10:00:00Z',
  };

  const otherTechnicianRecord = {
    id: otherTechnicianId,
    technician_code: 'TECH-0002',
    name: 'Amit Patel',
    phone: '9876543211',
    email: 'amit.patel@example.com',
    specializations: ['Window AC', 'Split AC'],
    service_areas: ['Vashi', 'Nerul'],
    status: 'AVAILABLE',
    is_active: true,
    max_daily_workload: 4,
    current_workload: 0,
    joining_date: '2025-08-01',
    notes: 'Residential technician',
    working_days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
    working_hours: { start: '09:00', end: '18:00' },
    availability: {
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
      workingHours: { start: '09:00', end: '18:00' },
    },
    created_by: 'admin-auth-id',
    updated_by: null,
    created_at: '2026-10-07T10:00:00Z',
    updated_at: '2026-10-07T10:00:00Z',
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
          return { data: { user: null }, error: { message: 'Invalid token' } };
        }),
        signInWithPassword: vi.fn(async () => {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => ({
                single: vi.fn(async () => {
                  if (val === 'admin-auth-id') return { data: mockAdminProfile, error: null };
                  if (val === 'staff-auth-id') return { data: mockStaffProfile, error: null };
                  if (val === 'inactive-staff-id') return { data: mockInactiveStaffProfile, error: null };
                  return { data: null, error: { message: 'Profile not found' } };
                }),
              })),
            })),
          };
        }

        if (table === 'staff') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => ({
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

        if (table === 'technicians') {
          return {
            select: vi.fn((columns?: string, options?: any) => {
              if (options?.head && options?.count) {
                return Promise.resolve({ count: 1, error: null });
              }
              const queryBuilder: any = {};
              queryBuilder.eq = vi.fn((col: string, val: any) => {
                queryBuilder.lastEq = { col, val };
                return queryBuilder;
              });
              queryBuilder.neq = vi.fn(() => queryBuilder);
              queryBuilder.contains = vi.fn(() => queryBuilder);
              queryBuilder.or = vi.fn(() => queryBuilder);
              queryBuilder.order = vi.fn(() => queryBuilder);
              queryBuilder.range = vi.fn(async () => ({
                data: [sampleTechnicianRecord],
                error: null,
                count: 1,
              }));
              queryBuilder.maybeSingle = vi.fn(async () => {
                if (queryBuilder.lastEq?.col === 'id' && queryBuilder.lastEq?.val === sampleTechnicianId) {
                  return { data: sampleTechnicianRecord, error: null };
                }
                if (queryBuilder.lastEq?.col === 'phone' && queryBuilder.lastEq?.val === sampleTechnicianRecord.phone) {
                  return { data: sampleTechnicianRecord, error: null };
                }
                if (queryBuilder.lastEq?.col === 'email' && queryBuilder.lastEq?.val === sampleTechnicianRecord.email) {
                  return { data: sampleTechnicianRecord, error: null };
                }
                return { data: null, error: null };
              });
              queryBuilder.single = vi.fn(async () => {
                if (queryBuilder.lastEq?.col === 'id' && queryBuilder.lastEq?.val === sampleTechnicianId) {
                  return { data: sampleTechnicianRecord, error: null };
                }
                return { data: null, error: { message: 'Not found' } };
              });
              return queryBuilder;
            }),
            insert: vi.fn((insertPayload: any) => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    ...sampleTechnicianRecord,
                    ...insertPayload,
                    id: 'new-technician-uuid',
                    technician_code: insertPayload.technician_code || 'TECH-0003',
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((updatePayload: any) => ({
              eq: vi.fn((col: string, val: string) => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: {
                      ...sampleTechnicianRecord,
                      ...updatePayload,
                    },
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }

        if (table === 'service_assignments') {
          return {
            select: vi.fn((cols?: string, opts?: any) => {
              if (opts?.head && opts?.count) {
                return {
                  eq: vi.fn(() => ({
                    in: vi.fn(async () => ({ count: 0, error: null })),
                  })),
                };
              }
              return {
                in: vi.fn(() => ({
                  in: vi.fn(async () => ({ data: [], error: null })),
                })),
                eq: vi.fn(() => ({
                  in: vi.fn(async () => ({ data: [], error: null })),
                })),
              };
            }),
          };
        }

        if (table === 'activity_logs') {
          return {
            insert: vi.fn(async () => ({ data: null, error: null })),
          };
        }

        return {};
      }),
    };

    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);
  });

  // ----------------------------------------------------
  // 1. Authorization Tests
  // ----------------------------------------------------
  describe('1. Authorization & Role Protection', () => {
    it('1. Rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/technicians');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('2. Rejects request with invalid or corrupted token with 401', async () => {
      const res = await request(app)
        .get('/api/v1/technicians')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('3. Rejects inactive staff user with 403', async () => {
      const res = await request(app)
        .get('/api/v1/technicians')
        .set('Authorization', inactiveStaffToken);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('inactive');
    });
  });

  // ----------------------------------------------------
  // 2. Technician Creation (CRUD)
  // ----------------------------------------------------
  describe('2. Technician Creation', () => {
    it('4. Allows ADMIN to create technician with complete valid payload', async () => {
      const res = await request(app)
        .post('/api/v1/technicians')
        .set('Authorization', adminAuthToken)
        .send({
          name: 'Suresh Patil',
          phone: '9822334455',
          email: 'suresh.patil@example.com',
          specializations: ['Split AC', 'Cassette AC'],
          serviceAreas: ['Panvel', 'Kharghar'],
          maxDailyWorkload: 5,
          joiningDate: '2026-01-15',
          notes: 'Commercial technician',
          workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
          workingHours: { start: '09:00', end: '18:00' },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.technician).toBeDefined();
      expect(res.body.data.technician.name).toBe('Suresh Patil');
      expect(res.body.data.technician.technicianCode).toBeDefined();
      expect(res.body.data.technician.status).toBe('AVAILABLE');
      expect(res.body.data.technician.isActive).toBe(true);
    });

    it('5. Allows STAFF to create technician with operational details', async () => {
      const res = await request(app)
        .post('/api/v1/technicians')
        .set('Authorization', staffAuthToken)
        .send({
          name: 'Deepak Varma',
          phone: '9833445566',
          specializations: ['Window AC'],
          serviceAreas: ['Vashi'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.technician.name).toBe('Deepak Varma');
    });

    it('6. Rejects creation with missing name (422 validation error)', async () => {
      const res = await request(app)
        .post('/api/v1/technicians')
        .set('Authorization', adminAuthToken)
        .send({
          phone: '9822334455',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('7. Rejects creation with invalid phone format (422 validation error)', async () => {
      const res = await request(app)
        .post('/api/v1/technicians')
        .set('Authorization', adminAuthToken)
        .send({
          name: 'Invalid Phone Tech',
          phone: 'abc-not-phone',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('8. Rejects creation with invalid email format (422 validation error)', async () => {
      const res = await request(app)
        .post('/api/v1/technicians')
        .set('Authorization', adminAuthToken)
        .send({
          name: 'Invalid Email Tech',
          phone: '9822334455',
          email: 'not-an-email',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('9. Rejects creation with invalid working hours where start >= end (422)', async () => {
      const res = await request(app)
        .post('/api/v1/technicians')
        .set('Authorization', adminAuthToken)
        .send({
          name: 'Invalid Hours Tech',
          phone: '9822334455',
          workingHours: { start: '18:00', end: '09:00' },
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('10. Rejects creation when phone already exists (409 conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/technicians')
        .set('Authorization', adminAuthToken)
        .send({
          name: 'Duplicate Phone Tech',
          phone: '9876543210', // matches sampleTechnicianRecord
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.details.code).toBe('DUPLICATE_PHONE');
    });

    it('11. Rejects creation when email already exists (409 conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/technicians')
        .set('Authorization', adminAuthToken)
        .send({
          name: 'Duplicate Email Tech',
          phone: '9811223344',
          email: 'rahul.sharma@example.com', // matches sampleTechnicianRecord
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.details.code).toBe('DUPLICATE_EMAIL');
    });
  });

  // ----------------------------------------------------
  // 3. Technician Listing & Retrieval (Read)
  // ----------------------------------------------------
  describe('3. Technician Listing & Retrieval', () => {
    it('12. Lists technicians with pagination metadata (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/technicians?page=1&pageSize=10')
        .set('Authorization', staffAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.technicians).toBeInstanceOf(Array);
      expect(res.body.data.total).toBeDefined();
      expect(res.body.data.page).toBe(1);
    });

    it('13. Supports filtering by status, skill, and search query', async () => {
      const res = await request(app)
        .get('/api/v1/technicians?status=AVAILABLE&skill=Split%20AC&search=Rahul')
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.technicians).toBeInstanceOf(Array);
    });

    it('14. Retrieves technician by valid ID (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/technicians/${sampleTechnicianId}`)
        .set('Authorization', staffAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.technician).toBeDefined();
      expect(res.body.data.technician.id).toBe(sampleTechnicianId);
      expect(res.body.data.technician.technicianCode).toBe('TECH-0001');
      expect(res.body.data.technician.specializations).toContain('Split AC');
    });

    it('15. Rejects retrieval with malformed UUID (422 validation error)', async () => {
      const res = await request(app)
        .get('/api/v1/technicians/not-a-valid-uuid')
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('16. Returns 404 when technician does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/v1/technicians/${nonExistentId}`)
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ----------------------------------------------------
  // 4. Technician Updates
  // ----------------------------------------------------
  describe('4. Technician Updates', () => {
    it('17. Updates technician operational details and skills (200 OK)', async () => {
      const res = await request(app)
        .patch(`/api/v1/technicians/${sampleTechnicianId}`)
        .set('Authorization', adminAuthToken)
        .send({
          specializations: ['Split AC', 'Cassette AC', 'VRF / VRV', 'Gas Charging'],
          serviceAreas: ['Panvel', 'Kharghar', 'Belapur'],
          notes: 'Certified for VRV commissioning',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.technician).toBeDefined();
    });

    it('18. Rejects phone update if new phone is already in use by another tech (409)', async () => {
      // Mock duplicate phone query returning another tech
      mockSupabase.from = vi.fn((table: string) => {
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
        if (table === 'technicians') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => {
                if (col === 'id') {
                  return {
                    maybeSingle: vi.fn(async () => ({ data: sampleTechnicianRecord, error: null })),
                  };
                }
                if (col === 'phone') {
                  return {
                    neq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({
                        data: { id: otherTechnicianId, technician_code: 'TECH-0002', name: 'Amit Patel' },
                        error: null,
                      })),
                    })),
                  };
                }
                return { maybeSingle: vi.fn(async () => ({ data: null, error: null })) };
              }),
            })),
          };
        }
        return {};
      });

      const res = await request(app)
        .patch(`/api/v1/technicians/${sampleTechnicianId}`)
        .set('Authorization', adminAuthToken)
        .send({
          phone: '9876543211',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.details.code).toBe('DUPLICATE_PHONE');
    });
  });

  // ----------------------------------------------------
  // 5. Status Management & Deactivation Protection
  // ----------------------------------------------------
  describe('5. Operational Status & Deactivation Protection', () => {
    it('19. Updates operational status to ON_LEAVE (200 OK)', async () => {
      const res = await request(app)
        .patch(`/api/v1/technicians/${sampleTechnicianId}/status`)
        .set('Authorization', staffAuthToken)
        .send({
          status: 'ON_LEAVE',
          reason: 'Medical leave approved',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.technician.status).toBe('ON_LEAVE');
    });

    it('20. Allows activating an inactive technician via /activate (200 OK)', async () => {
      const res = await request(app)
        .post(`/api/v1/technicians/${sampleTechnicianId}/activate`)
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.technician.isActive).toBe(true);
      expect(res.body.data.technician.status).toBe('AVAILABLE');
    });

    it('21. Deactivates technician when no active assignments exist (200 OK)', async () => {
      const res = await request(app)
        .post(`/api/v1/technicians/${sampleTechnicianId}/deactivate`)
        .set('Authorization', adminAuthToken)
        .send({
          reason: 'Resigned from company',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.technician.isActive).toBe(false);
      expect(res.body.data.technician.status).toBe('INACTIVE');
    });

    it('22. Blocks deactivation when technician has active assignments (409 conflict)', async () => {
      // Mock active assignments returned
      mockSupabase.from = vi.fn((table: string) => {
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
        if (table === 'technicians') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: sampleTechnicianRecord, error: null })),
              })),
            })),
          };
        }
        if (table === 'service_assignments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(async () => ({
                  data: [
                    { id: 'assign-1', status: 'IN_PROGRESS' },
                    { id: 'assign-2', status: 'ASSIGNED' },
                  ],
                  error: null,
                })),
              })),
            })),
          };
        }
        return {};
      });

      const res = await request(app)
        .post(`/api/v1/technicians/${sampleTechnicianId}/deactivate`)
        .set('Authorization', adminAuthToken)
        .send({
          reason: 'Attempting deactivation with active work',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.details.code).toBe('TECHNICIAN_HAS_ACTIVE_ASSIGNMENTS');
      expect(res.body.error.details.activeAssignmentsCount).toBe(2);
    });

    it('23. Handles idempotent status update without error', async () => {
      const res = await request(app)
        .patch(`/api/v1/technicians/${sampleTechnicianId}/status`)
        .set('Authorization', staffAuthToken)
        .send({
          status: 'AVAILABLE',
          isActive: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.technician.status).toBe('AVAILABLE');
    });
  });

  // ----------------------------------------------------
  // 6. Security & Integrity Guarantees
  // ----------------------------------------------------
  describe('6. Security & Integrity Guarantees', () => {
    it('24. Rejects hard DELETE on technician resource (404 route not found / no delete route)', async () => {
      const res = await request(app)
        .delete(`/api/v1/technicians/${sampleTechnicianId}`)
        .set('Authorization', adminAuthToken);

      // We intentionally do not expose a DELETE route for technicians
      expect(res.status).toBe(404);
    });

    it('25. Technicians cannot authenticate or obtain session tokens (not auth users)', async () => {
      // Technicians are not registered in Supabase auth; attempting login with technician email fails
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'rahul.sharma@example.com',
          password: 'AnyPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
