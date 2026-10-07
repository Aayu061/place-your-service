import { Request, Response, NextFunction } from 'express';
import { amcService } from '../services/amc.service.js';

export class AmcController {
  async listPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await amcService.listPlans();
      res.json({
        success: true,
        data: { plans },
      });
    } catch (err) {
      next(err);
    }
  }

  async getMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await amcService.getDashboardMetrics();
      res.json({
        success: true,
        data: { metrics },
      });
    } catch (err) {
      next(err);
    }
  }

  async listContracts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await amcService.listContracts(req.query as never);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const contract = await amcService.getContractById(id);
      res.json({
        success: true,
        data: { contract },
      });
    } catch (err) {
      next(err);
    }
  }

  async createContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorId = req.user?.profileId || req.user?.userId || '00000000-0000-0000-0000-000000000000';
      const contract = await amcService.createContract(req.body, actorId);
      res.status(201).json({
        success: true,
        data: { contract },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const actorId = req.user?.profileId || req.user?.userId || '00000000-0000-0000-0000-000000000000';
      const contract = await amcService.updateContract(id, req.body, actorId);
      res.json({
        success: true,
        data: { contract },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const actorId = req.user?.profileId || req.user?.userId || '00000000-0000-0000-0000-000000000000';
      const contract = await amcService.updateStatus(id, req.body, actorId);
      res.json({
        success: true,
        data: { contract },
      });
    } catch (err) {
      next(err);
    }
  }

  async cancelContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const actorId = req.user?.profileId || req.user?.userId || '00000000-0000-0000-0000-000000000000';
      const contract = await amcService.cancelContract(id, req.body, actorId);
      res.json({
        success: true,
        data: { contract },
      });
    } catch (err) {
      next(err);
    }
  }

  async getAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const contract = await amcService.getContractById(id);
      res.json({
        success: true,
        data: { assets: contract.coveredAssets || [] },
      });
    } catch (err) {
      next(err);
    }
  }

  async addAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const actorId = req.user?.profileId || req.user?.userId || '00000000-0000-0000-0000-000000000000';
      const assets = await amcService.addAssets(id, req.body, actorId);
      res.json({
        success: true,
        data: { assets },
      });
    } catch (err) {
      next(err);
    }
  }

  async removeAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const assetId = req.params.assetId as string;
      const actorId = req.user?.profileId || req.user?.userId || '00000000-0000-0000-0000-000000000000';
      await amcService.removeAsset(id, assetId, actorId);
      res.json({
        success: true,
        data: { message: 'Asset removed from AMC coverage successfully' },
      });
    } catch (err) {
      next(err);
    }
  }

  async generatePm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const actorId = req.user?.profileId || req.user?.userId || '00000000-0000-0000-0000-000000000000';
      const result = await amcService.generatePmObligations(id, req.body, actorId);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getSchedules(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const schedules = await amcService.getSchedulesForContract(id);
      res.json({
        success: true,
        data: { schedules },
      });
    } catch (err) {
      next(err);
    }
  }

  async renewContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const actorId = req.user?.profileId || req.user?.userId || '00000000-0000-0000-0000-000000000000';
      const contract = await amcService.renewContract(id, req.body, actorId);
      res.status(201).json({
        success: true,
        data: { contract },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const amcController = new AmcController();
