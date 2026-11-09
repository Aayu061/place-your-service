import { Request, Response, NextFunction } from 'express';
import { reportEmailService } from '../services/reportEmail.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

class ReportEmailController {
  async send(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await reportEmailService.queueAndSend(req.params.id as string, req.user!.profileId), 202); } catch (err) { next(err); }
  }
  async list(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, { deliveries: await reportEmailService.listDeliveries(req.params.id as string) }); } catch (err) { next(err); }
  }
  async retry(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await reportEmailService.retryDelivery(req.params.id as string, req.params.deliveryId as string, req.user!.profileId), 202); } catch (err) { next(err); }
  }
  async retryPending(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await reportEmailService.processPending(50, req.user!.profileId)); } catch (err) { next(err); }
  }
}

export const reportEmailController = new ReportEmailController();
