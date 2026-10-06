import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { logActivity } from '../services/audit.service.js';

export class AuthController {
  public async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getCurrentUser(req.user!.profileId);
      sendSuccess(res, { user });
    } catch (err) {
      next(err);
    }
  }

  public async bootstrapAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.bootstrapAdmin(req.body, req.ip);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user) {
        await logActivity({
          actorProfileId: req.user.profileId,
          action: 'USER_LOGOUT',
          entityType: 'session',
          entityId: req.user.userId,
          ipAddress: req.ip,
        });
      }
      sendSuccess(res, { message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
