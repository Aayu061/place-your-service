import { Request, Response, NextFunction } from 'express';
import { serviceReportService } from '../services/serviceReport.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  CreateServiceReportPayload,
  UpdateServiceReportPayload,
  ServiceReportListQuery,
  CreateFollowUpSchedulePayload,
} from '../types/index.js';

export class ServiceReportController {
  public async createReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorId = req.user?.profileId || '';
      const report = await serviceReportService.createReport(
        req.body as CreateServiceReportPayload,
        actorId
      );
      sendSuccess(res, { report }, 201);
    } catch (err) {
      next(err);
    }
  }

  public async getReports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await serviceReportService.listReports(
        req.query as unknown as ServiceReportListQuery
      );
      sendSuccess(
        res,
        {
          reports: result.reports,
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

  public async getReportById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const report = await serviceReportService.getReportById(req.params.id as string);
      sendSuccess(res, { report });
    } catch (err) {
      next(err);
    }
  }

  public async getReportByScheduleId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const report = await serviceReportService.getReportByScheduleId(req.params.scheduleId as string);
      sendSuccess(res, { report });
    } catch (err) {
      next(err);
    }
  }

  public async updateReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorId = req.user?.profileId || '';
      const report = await serviceReportService.updateReport(
        req.params.id as string,
        req.body as UpdateServiceReportPayload,
        actorId
      );
      sendSuccess(res, { report });
    } catch (err) {
      next(err);
    }
  }

  public async createFollowUp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorId = req.user?.profileId || '';
      const report = await serviceReportService.createFollowUp(
        req.params.id as string,
        req.body as CreateFollowUpSchedulePayload,
        actorId
      );
      sendSuccess(res, { report }, 201);
    } catch (err) {
      next(err);
    }
  }
}

export const serviceReportController = new ServiceReportController();
