import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('Staff Management API (/api/v1/staff)', () => {
  const adminAuthToken = 'Bearer valid-admin-token';
  const staffAuthToken = 'Bearer valid-staff-token';

  const mockAdminUser = { id: 'admin-auth-id' };
  const mockAdminProfile = { id: 'admin-auth-id', full_name: 'Super Admin', email: 'admin@pys.internal' };
  const mockAdminStaff = { id: 'admin-staff-id', role: 'ADMIN', is_active: true };

  const mockStaffUser = { id: 'staff-auth-id' };
  const mockStaffProfile = { id: 'staff-auth-id', full_name: 'Regular Staff', email: 'staff@pys.internal' };
  const mockStaffRecord = { id: 'staff-record-id', role: 'STAFF', is_active: true };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupAuthMock = (role: 'ADMIN' | 'STAFF') => {
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

  describe('Authorization Boundary', () => {
    it('rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/staff');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects STAFF role with 403 FORBIDDEN on GET /api/v1/staff', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: mockStaffUser },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation(setupAuthMock('STAFF')),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/staff')
        .set('Authorization', staffAuthToken);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Access denied');
    });

    it('rejects STAFF role with 403 FORBIDDEN on POST /api/v1/staff', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: mockStaffUser },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation(setupAuthMock('STAFF')),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', staffAuthToken)
        .send({
          email: 'new@staff.com',
          password: 'Password123!',
          fullName: 'New Staff',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/staff (Admin View)', () => {
    it('returns 200 and staff directory for ADMIN user', async () => {
      const sampleStaffList = [
        {
          id: 's-1',
          profile_id: 'p-1',
          role: 'ADMIN',
          is_active: true,
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
          profiles: {
            id: 'p-1',
            full_name: 'Admin User',
            email: 'admin@pys.internal',
            phone: null,
            avatar_url: null,
          },
        },
        {
          id: 's-2',
          profile_id: 'p-2',
          role: 'STAFF',
          is_active: true,
          created_at: '2026-10-02T00:00:00Z',
          updated_at: '2026-10-02T00:00:00Z',
          profiles: {
            id: 'p-2',
            full_name: 'Staff Member',
            email: 'staff@pys.internal',
            phone: '+91 9876543210',
            avatar_url: null,
          },
        },
      ];

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: mockAdminUser },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockAdminProfile, error: null }),
            };
          }
          if (table === 'staff') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockAdminStaff, error: null }),
              order: vi.fn().mockResolvedValue({
                data: sampleStaffList,
                error: null,
                count: 2,
              }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/staff')
        .set('Authorization', adminAuthToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.staff).toHaveLength(2);
      expect(res.body.data.staff[0].role).toBe('ADMIN');
      expect(res.body.data.staff[1].role).toBe('STAFF');
      expect(res.body.meta.total).toBe(2);
    });
  });

  describe('POST /api/v1/staff (Create Staff)', () => {
    it('returns 422 VALIDATION_ERROR on invalid input', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation(setupAuthMock('ADMIN')),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', adminAuthToken)
        .send({ email: 'bad-email', password: 'short' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 CONFLICT if email already exists', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === 'email' && val === 'duplicate@pys.internal') {
                  return {
                    limit: vi.fn().mockResolvedValue({ data: [{ id: 'existing-id' }], error: null }),
                  };
                }
                return {
                  single: vi.fn().mockResolvedValue({ data: mockAdminProfile, error: null }),
                };
              }),
            };
          }
          if (table === 'staff') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockAdminStaff, error: null }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', adminAuthToken)
        .send({
          email: 'duplicate@pys.internal',
          password: 'Password123!',
          fullName: 'Duplicate User',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('creates staff account successfully and prevents role escalation', async () => {
      const newUserId = 'new-staff-user-id';
      const newStaffId = 'new-staff-record-id';

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
          admin: {
            createUser: vi.fn().mockResolvedValue({
              data: { user: { id: newUserId } },
              error: null,
            }),
          },
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation((col: string) => {
                if (col === 'email') {
                  return {
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  };
                }
                return {
                  single: vi.fn().mockResolvedValue({ data: mockAdminProfile, error: null }),
                };
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'staff') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockAdminStaff, error: null }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: newStaffId,
                      profile_id: newUserId,
                      role: 'STAFF',
                      is_active: true,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
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
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      // Even if client attempts to pass role: 'ADMIN', backend must enforce 'STAFF'
      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', adminAuthToken)
        .send({
          email: 'operations@pys.internal',
          password: 'StaffPassword2026!',
          fullName: 'Operations Agent',
          phone: '+91 9888877777',
          role: 'ADMIN', // SILLY CLIENT SPOOF ATTEMPT
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.staff.role).toBe('STAFF'); // Enforced as STAFF
      expect(res.body.data.staff.fullName).toBe('Operations Agent');
      expect(res.body.data.staff.isActive).toBe(true);
    });
  });

  describe('PATCH /api/v1/staff/:id/status (Activation / Deactivation)', () => {
    it('prevents deactivation of the singleton ADMIN account with 403 FORBIDDEN', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockAdminProfile, error: null }),
            };
          }
          if (table === 'staff') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === 'id' && val === '11111111-1111-1111-1111-111111111111') {
                  // Target is Admin
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: '11111111-1111-1111-1111-111111111111',
                        profile_id: 'admin-auth-id',
                        role: 'ADMIN',
                        is_active: true,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        profiles: mockAdminProfile,
                      },
                      error: null,
                    }),
                  };
                }
                return {
                  single: vi.fn().mockResolvedValue({ data: mockAdminStaff, error: null }),
                };
              }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .patch('/api/v1/staff/11111111-1111-1111-1111-111111111111/status')
        .set('Authorization', adminAuthToken)
        .send({ isActive: false });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Cannot modify the active status of the singleton Admin account');
    });

    it('successfully deactivates and activates a STAFF account', async () => {
      const targetStaffId = '22222222-2222-2222-2222-222222222222';

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockAdminProfile, error: null }),
            };
          }
          if (table === 'staff') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === 'id' && val === targetStaffId) {
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: targetStaffId,
                        profile_id: 'staff-auth-id',
                        role: 'STAFF',
                        is_active: false,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        profiles: mockStaffProfile,
                      },
                      error: null,
                    }),
                  };
                }
                return {
                  single: vi.fn().mockResolvedValue({ data: mockAdminStaff, error: null }),
                };
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
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
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .patch(`/api/v1/staff/${targetStaffId}/status`)
        .set('Authorization', adminAuthToken)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.staff.isActive).toBe(false);
    });
  });
});
