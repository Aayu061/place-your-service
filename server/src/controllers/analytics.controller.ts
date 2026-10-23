import { Request, Response, NextFunction } from 'express';
import { analyticsService } from '../services/analytics.service.js';

export class AnalyticsController {
  public async getDashboardSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await analyticsService.getDashboardSummary();
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const analyticsController = new AnalyticsController();
