import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { requireRole } from '../src/middleware/role.js';
import { errorHandlerMiddleware } from '../src/middleware/errorHandler.js';
import { AuthenticatedUser } from '../src/types/index.js';

describe('requireRole Middleware', () => {
  const createRoleApp = () => {
    const app = express();
    app.use(express.json());

    // Middleware to simulate pre-existing req.user from headers
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const mockRole = req.headers['x-mock-role'] as string;
      if (mockRole) {
        req.user = {
          userId: 'test-user-id',
          email: 'test@pys.internal',
          role: mockRole as AuthenticatedUser['role'],
          profileId: 'test-profile-id',
          isActive: true,
        };
      }
      next();
    });

    app.get('/admin-only', requireRole('ADMIN'), (_req: Request, res: Response) => {
      res.json({ success: true, message: 'Welcome Admin' });
    });

    app.get('/staff-or-admin', requireRole('ADMIN', 'STAFF'), (_req: Request, res: Response) => {
      res.json({ success: true, message: 'Welcome Operational User' });
    });

    app.use(errorHandlerMiddleware);
    return app;
  };

  it('rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
    const app = createRoleApp();
    const res = await request(app).get('/admin-only');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('permits ADMIN user on ADMIN-only endpoint', async () => {
    const app = createRoleApp();
    const res = await request(app)
      .get('/admin-only')
      .set('x-mock-role', 'ADMIN');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Welcome Admin');
  });

  it('blocks STAFF user on ADMIN-only endpoint with 403 FORBIDDEN', async () => {
    const app = createRoleApp();
    const res = await request(app)
      .get('/admin-only')
      .set('x-mock-role', 'STAFF');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('Access denied');
  });

  it('permits both ADMIN and STAFF on shared operational endpoints', async () => {
    const app = createRoleApp();

    const adminRes = await request(app)
      .get('/staff-or-admin')
      .set('x-mock-role', 'ADMIN');
    expect(adminRes.status).toBe(200);

    const staffRes = await request(app)
      .get('/staff-or-admin')
      .set('x-mock-role', 'STAFF');
    expect(staffRes.status).toBe(200);
  });
});
