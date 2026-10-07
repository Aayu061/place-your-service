import { Request, Response, NextFunction } from 'express';
import { technicianService } from '../services/technician.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { TechnicianListQuery } from '../types/index.js';

export class TechnicianController {
  public async listTechnicians(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await technicianService.listTechnicians(req.query as TechnicianListQuery);
      sendSuccess(
        res,
        {
          technicians: result.technicians,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
        },
        200,
        {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
        }
      );
    } catch (err) {
      next(err);
    }
  }

  public async getTechnicianById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const technician = await technicianService.getTechnicianById(req.params.id as string);
      sendSuccess(res, { technician });
    } catch (err) {
      next(err);
    }
  }

  public async createTechnician(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const technician = await technicianService.createTechnician(
        req.body,
        req.user?.profileId,
        req.ip
      );
      sendSuccess(res, { technician }, 201);
    } catch (err) {
      next(err);
    }
  }

  public async updateTechnician(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const technician = await technicianService.updateTechnician(
        req.params.id as string,
        req.body,
        req.user?.profileId,
        req.ip
      );
      sendSuccess(res, { technician });
    } catch (err) {
      next(err);
    }
  }

  public async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const technician = await technicianService.updateStatus(
        req.params.id as string,
        req.body,
        req.user?.profileId,
        req.ip
      );
      sendSuccess(res, { technician });
    } catch (err) {
      next(err);
    }
  }

  public async activateTechnician(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const technician = await technicianService.updateStatus(
        req.params.id as string,
        { isActive: true, status: 'AVAILABLE' },
        req.user?.profileId,
        req.ip
      );
      sendSuccess(res, { technician });
    } catch (err) {
      next(err);
    }
  }

  public async deactivateTechnician(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reason = req.body?.reason as string | undefined;
      const technician = await technicianService.updateStatus(
        req.params.id as string,
        { isActive: false, status: 'INACTIVE', reason },
        req.user?.profileId,
        req.ip
      );
      sendSuccess(res, { technician });
    } catch (err) {
      next(err);
    }
  }
}

export const technicianController = new TechnicianController();
