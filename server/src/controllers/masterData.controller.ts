import { Request, Response, NextFunction } from 'express';
import { masterDataService } from '../services/masterData.service.js';

export class MasterDataController {
  // --- BRANDS ---

  public async listBrands(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const activeOnly =
        req.query.activeOnly !== undefined
          ? String(req.query.activeOnly) === 'true'
          : true;

      const result = await masterDataService.listBrands({
        search: req.query.search as string | undefined,
        activeOnly,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 50,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async getBrandById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const brandId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const brand = await masterDataService.getBrandById(brandId);
      res.status(200).json({
        success: true,
        data: { brand },
      });
    } catch (err) {
      next(err);
    }
  }

  public async createBrand(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const brand = await masterDataService.createBrand(
        req.body,
        req.user?.profileId || 'system',
        req.ip
      );
      res.status(201).json({
        success: true,
        message: 'AC brand created successfully',
        data: { brand },
      });
    } catch (err) {
      next(err);
    }
  }

  public async updateBrand(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const brandId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const brand = await masterDataService.updateBrand(
        brandId,
        req.body,
        req.user?.profileId || 'system',
        req.ip
      );
      res.status(200).json({
        success: true,
        message: 'AC brand updated successfully',
        data: { brand },
      });
    } catch (err) {
      next(err);
    }
  }

  public async updateBrandStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const brandId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const brand = await masterDataService.updateBrandStatus(
        brandId,
        req.body.isActive,
        req.user?.profileId || 'system',
        req.ip
      );
      res.status(200).json({
        success: true,
        message: `AC brand ${brand.isActive ? 'activated' : 'deactivated'} successfully`,
        data: { brand },
      });
    } catch (err) {
      next(err);
    }
  }

  // --- MODELS ---

  public async listModels(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const activeOnly =
        req.query.activeOnly !== undefined
          ? String(req.query.activeOnly) === 'true'
          : true;

      const result = await masterDataService.listModels({
        brandId: req.query.brandId as string | undefined,
        search: req.query.search as string | undefined,
        activeOnly,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 50,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async getModelById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const modelId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const model = await masterDataService.getModelById(modelId);
      res.status(200).json({
        success: true,
        data: { model },
      });
    } catch (err) {
      next(err);
    }
  }

  public async createModel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const model = await masterDataService.createModel(
        req.body,
        req.user?.profileId || 'system',
        req.ip
      );
      res.status(201).json({
        success: true,
        message: 'AC model created successfully',
        data: { model },
      });
    } catch (err) {
      next(err);
    }
  }

  public async updateModel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const modelId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const model = await masterDataService.updateModel(
        modelId,
        req.body,
        req.user?.profileId || 'system',
        req.ip
      );
      res.status(200).json({
        success: true,
        message: 'AC model updated successfully',
        data: { model },
      });
    } catch (err) {
      next(err);
    }
  }

  public async updateModelStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const modelId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const model = await masterDataService.updateModelStatus(
        modelId,
        req.body.isActive,
        req.user?.profileId || 'system',
        req.ip
      );
      res.status(200).json({
        success: true,
        message: `AC model ${model.isActive ? 'activated' : 'deactivated'} successfully`,
        data: { model },
      });
    } catch (err) {
      next(err);
    }
  }

  // --- VARIANTS ---

  public async listModelVariants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const modelId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const activeOnly =
        req.query.activeOnly !== undefined ? String(req.query.activeOnly) === 'true' : true;
      const variants = await masterDataService.listModelVariants(modelId, activeOnly);
      res.status(200).json({
        success: true,
        data: { variants },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getVariantById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const variantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const variant = await masterDataService.getVariantById(variantId);
      res.status(200).json({
        success: true,
        data: { variant },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const masterDataController = new MasterDataController();

