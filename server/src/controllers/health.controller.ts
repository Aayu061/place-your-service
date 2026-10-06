import { Request, Response, NextFunction } from 'express';
import { healthService } from '../services/health.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export class HealthController {
  public getHealth(_req: Request, res: Response): void {
    const data = healthService.getLiveness();
    sendSuccess(res, data, 200);
  }

  public async getReadiness(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await healthService.getReadiness();
      const statusCode = data.status === 'healthy' ? 200 : 503;
      sendSuccess(res, data, statusCode);
    } catch (err) {
      next(err);
    }
  }
}

export const healthController = new HealthController();
