import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { requireAuth } from '../src/middleware/auth.js';
import { errorHandlerMiddleware } from '../src/middleware/errorHandler.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('requireAuth Middleware', () => {
  const createTestApp = () => {
    const app = express();
    app.use(express.json());
    app.get('/protected', requireAuth, (req: Request, res: Response) => {
      res.json({ success: true, user: req.user });
    });
    app.use(errorHandlerMiddleware);
    return app;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects requests with missing Authorization header with 401 UNAUTHORIZED', async () => {
    const app = createTestApp();
    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toContain('Missing or malformed Authorization header');
  });

  it('rejects requests with non-Bearer Authorization header with 401 UNAUTHORIZED', async () => {
    const app = createTestApp();
    const res = await request(app).get('/protected').set('Authorization', 'Basic 123456');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects invalid or expired tokens with 401 UNAUTHORIZED', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'JWT expired' },
        }),
      },
    } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

    const app = createTestApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toContain('Invalid or expired authentication session');
  });

  it('rejects token if staff role assignment is missing with 403 FORBIDDEN', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-uuid-1' } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'user-uuid-1', full_name: 'John Doe', email: 'john@example.com' },
              error: null,
            }),
          };
        }
        if (table === 'staff') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          };
        }
        return {};
      }),
    } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

    const app = createTestApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('No authorized staff or admin role');
  });

  it('rejects inactive staff account with 403 FORBIDDEN', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-uuid-1' } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'user-uuid-1', full_name: 'John Doe', email: 'john@example.com' },
              error: null,
            }),
          };
        }
        if (table === 'staff') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'staff-uuid-1', role: 'STAFF', is_active: false },
              error: null,
            }),
          };
        }
        return {};
      }),
    } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

    const app = createTestApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('Account is inactive');
  });

  it('authenticates valid active user and attaches server-derived req.user', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-uuid-1' } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'user-uuid-1', full_name: 'Admin User', email: 'admin@pys.internal' },
              error: null,
            }),
          };
        }
        if (table === 'staff') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'staff-uuid-1', role: 'ADMIN', is_active: true },
              error: null,
            }),
          };
        }
        return {};
      }),
    } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

    const app = createTestApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-admin-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toEqual({
      userId: 'user-uuid-1',
      email: 'admin@pys.internal',
      role: 'ADMIN',
      profileId: 'user-uuid-1',
      staffId: 'staff-uuid-1',
      isActive: true,
    });
  });
});
