import { Request, Response, NextFunction } from 'express';
import { siteService } from '../services/site.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { SiteListQuery } from '../types/index.js';

export class SiteController {
  public async listCustomerSites(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.customerId as string;
      const result = await siteService.listCustomerSites(customerId, req.query as SiteListQuery);
      sendSuccess(
        res,
        {
          sites: result.sites,
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

  public async getSiteById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const site = await siteService.getSiteById(req.params.id as string);
      sendSuccess(res, { site });
    } catch (err) {
      next(err);
    }
  }

  public async createSite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.customerId as string;
      const site = await siteService.createSite(
        customerId,
        req.body,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { site }, 201);
    } catch (err) {
      next(err);
    }
  }

  public async updateSite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const site = await siteService.updateSite(
        req.params.id as string,
        req.body,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { site });
    } catch (err) {
      next(err);
    }
  }

  public async setPrimarySite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const site = await siteService.setPrimarySite(
        req.params.id as string,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { site });
    } catch (err) {
      next(err);
    }
  }

  public async updateSiteStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const site = await siteService.updateSiteStatus(
        req.params.id as string,
        req.body.isActive,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { site });
    } catch (err) {
      next(err);
    }
  }
}

export const siteController = new SiteController();
