import { Request, Response, NextFunction } from 'express';
import { assetService } from '../services/asset.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AcAssetListQuery } from '../types/index.js';

export class AssetController {
  public async listAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await assetService.listAssets(req.query as AcAssetListQuery);
      sendSuccess(
        res,
        {
          assets: result.assets,
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

  public async listSiteAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const siteId = req.params.siteId as string;
      const result = await assetService.listSiteAssets(siteId, req.query as AcAssetListQuery);
      sendSuccess(
        res,
        {
          assets: result.assets,
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

  public async getAssetById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const asset = await assetService.getAssetById(req.params.id as string);
      sendSuccess(res, { asset });
    } catch (err) {
      next(err);
    }
  }

  public async createAcAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const siteId = (req.params.siteId as string) || (req.body.siteId as string);
      const asset = await assetService.createAcAsset(
        siteId,
        req.body,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { asset }, 201);
    } catch (err) {
      next(err);
    }
  }

  public async updateAcAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const asset = await assetService.updateAcAsset(
        req.params.id as string,
        req.body,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { asset });
    } catch (err) {
      next(err);
    }
  }

  public async updateAcAssetStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const asset = await assetService.updateAcAssetStatus(
        req.params.id as string,
        req.body.isActive,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { asset });
    } catch (err) {
      next(err);
    }
  }

  public async getAssetAmcHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await assetService.getAssetAmcHistory(req.params.id as string);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
}

export const assetController = new AssetController();

