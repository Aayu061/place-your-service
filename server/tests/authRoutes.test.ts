import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('Auth Routes API (/api/v1/auth)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns 401 UNAUTHORIZED when Authorization header is missing', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 UNAUTHORIZED when token is invalid or expired', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Token expired' },
          }),
        },
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when staff account is inactive', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-uuid-inactive' } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'user-uuid-inactive', full_name: 'Inactive Staff', email: 'inactive@pys.internal' },
                error: null,
              }),
            };
          }
          if (table === 'staff') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'staff-uuid-inactive', role: 'STAFF', is_active: false },
                error: null,
              }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer inactive-staff-token');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Account is inactive');
    });

    it('returns 200 and verified user profile for active Admin', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin-uuid-1' } },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'admin-uuid-1',
                  full_name: 'System Admin',
                  email: 'admin@placeyourservice.internal',
                  phone: '+91 9876543210',
                  avatar_url: null,
                },
                error: null,
              }),
            };
          }
          if (table === 'staff') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'staff-admin-id', role: 'ADMIN', is_active: true },
                error: null,
              }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.user.email).toBe('admin@placeyourservice.internal');
      expect(res.body.data.user.isActive).toBe(true);
    });
  });

  describe('POST /api/v1/auth/bootstrap-admin', () => {
    it('returns 422 VALIDATION_ERROR when payload is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/auth/bootstrap-admin')
        .send({ email: 'invalid-email', password: '123' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 CONFLICT if an Admin already exists in the system', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'staff') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'existing-admin-id' }],
                error: null,
              }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/auth/bootstrap-admin')
        .send({
          email: 'admin2@placeyourservice.internal',
          password: 'SecurePassword123!',
          fullName: 'Second Admin Attempt',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('Admin account already exists');
    });

    it('returns 201 CREATED and provisions Admin when no Admin exists', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'staff') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'activity_logs') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return {};
        }),
        auth: {
          admin: {
            createUser: vi.fn().mockResolvedValue({
              data: { user: { id: 'new-admin-user-id' } },
              error: null,
            }),
          },
        },
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/auth/bootstrap-admin')
        .send({
          email: 'admin@placeyourservice.internal',
          password: 'StrongAdminPassword2026!',
          fullName: 'Founding Admin',
          phone: '+91 9999999999',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.user.id).toBe('new-admin-user-id');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns 422 VALIDATION_ERROR when email or password is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 UNAUTHORIZED when credentials are invalid', async () => {
      const mockSupabase = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { session: null, user: null },
            error: { message: 'Invalid login credentials' },
          }),
        },
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@placeyourservice.internal',
          password: 'wrong-password',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 OK with session and user profile when credentials are valid', async () => {
      const mockSupabase = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: {
              session: {
                access_token: 'mock-jwt-token',
                refresh_token: 'mock-refresh-token',
                expires_at: 1700000000,
              },
              user: { id: 'admin-profile-uuid' },
            },
            error: null,
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'admin-profile-uuid',
                  full_name: 'System Administrator',
                  email: 'admin@placeyourservice.internal',
                  phone: null,
                  avatar_url: null,
                },
                error: null,
              }),
            };
          }
          if (table === 'staff') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'staff-admin-uuid', role: 'ADMIN', is_active: true },
                error: null,
              }),
            };
          }
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@placeyourservice.internal',
          password: 'CorrectPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBe('mock-jwt-token');
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.user.email).toBe('admin@placeyourservice.internal');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('returns 200 OK with success message', async () => {
      const res = await request(app).post('/api/v1/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Logged out successfully');
    });
  });
});
