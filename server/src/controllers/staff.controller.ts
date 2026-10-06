import { Request, Response, NextFunction } from 'express';
import { staffService } from '../services/staff.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export class StaffController {
  public async listStaff(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await staffService.listStaff();
      sendSuccess(res, { staff: result.staff }, 200, { total: result.total });
    } catch (err) {
      next(err);
    }
  }

  public async getStaffById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const staff = await staffService.getStaffById(req.params.id as string);
      sendSuccess(res, { staff });
    } catch (err) {
      next(err);
    }
  }

  public async createStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const staff = await staffService.createStaff(
        req.body,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { staff }, 201);
    } catch (err) {
      next(err);
    }
  }

  public async updateStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const staff = await staffService.updateStaff(
        req.params.id as string,
        req.body,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { staff });
    } catch (err) {
      next(err);
    }
  }

  public async updateStaffStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const staff = await staffService.updateStaffStatus(
        req.params.id as string,
        req.body.isActive,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { staff });
    } catch (err) {
      next(err);
    }
  }
}

export const staffController = new StaffController();
