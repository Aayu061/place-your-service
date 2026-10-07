import { Request, Response, NextFunction } from 'express';
import { serviceRequestService } from '../services/serviceRequest.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { ServiceRequestListQuery } from '../types/index.js';

export class ServiceRequestController {
  public async listServiceRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await serviceRequestService.listServiceRequests(req.query as ServiceRequestListQuery);
      sendSuccess(
        res,
        {
          requests: result.requests,
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

  public async getServiceRequestById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const request = await serviceRequestService.getServiceRequestById(req.params.id as string);
      sendSuccess(res, { request });
    } catch (err) {
      next(err);
    }
  }

  public async createServiceRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const request = await serviceRequestService.createServiceRequest(
        req.body,
        req.user?.profileId,
        req.ip
      );
      sendSuccess(res, { request }, 201);
    } catch (err) {
      next(err);
    }
  }

  public async updateServiceRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const request = await serviceRequestService.updateServiceRequest(
        req.params.id as string,
        req.body,
        req.user?.profileId,
        req.ip
      );
      sendSuccess(res, { request });
    } catch (err) {
      next(err);
    }
  }

  public async transitionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, reason } = req.body;
      const request = await serviceRequestService.transitionStatus(
        req.params.id as string,
        status,
        reason,
        req.user?.profileId,
        req.ip
      );
      sendSuccess(res, { request });
    } catch (err) {
      next(err);
    }
  }

  public async cancelServiceRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reason = req.body?.reason;
      const request = await serviceRequestService.cancelServiceRequest(
        req.params.id as string,
        reason,
        req.user?.profileId,
        req.ip
      );
      sendSuccess(res, { request });
    } catch (err) {
      next(err);
    }
  }
}

export const serviceRequestController = new ServiceRequestController();
