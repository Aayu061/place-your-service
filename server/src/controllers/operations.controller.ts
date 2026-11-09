import { Request, Response, NextFunction } from 'express';
import { operationsService } from '../services/operations.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

class OperationsController {
  async listParts(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await operationsService.listParts(req.query as any)); } catch (err) { next(err); }
  }
  async createPart(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, { part: await operationsService.createPart(req.body, req.user!.profileId, req.ip) }, 201); } catch (err) { next(err); }
  }
  async updatePart(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, { part: await operationsService.updatePart(req.params.id as string, req.body, req.user!.profileId, req.ip) }); } catch (err) { next(err); }
  }
  async listInventoryTransactions(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await operationsService.listInventoryTransactions(req.query as any)); } catch (err) { next(err); }
  }
  async recordInventoryTransaction(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, { transaction: await operationsService.recordInventoryTransaction(req.body, req.user!.profileId) }, 201); } catch (err) { next(err); }
  }
  async listPayments(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await operationsService.listPayments(req.query as any)); } catch (err) { next(err); }
  }
  async getPaymentTransactions(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await operationsService.getPaymentTransactions(req.params.id as string, req.query as any)); } catch (err) { next(err); }
  }
  async createPayment(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, { paymentId: await operationsService.createPayment(req.body, req.user!.profileId) }, 201); } catch (err) { next(err); }
  }
  async recordPaymentTransaction(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, { transactionId: await operationsService.recordPaymentTransaction(req.params.id as string, req.body, req.user!.profileId) }, 201); } catch (err) { next(err); }
  }
  async recordPaymentReversal(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, { reversalId: await operationsService.recordPaymentReversal(req.params.transactionId as string, req.body, req.user!.profileId) }, 201); } catch (err) { next(err); }
  }
  async sendPaymentInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await operationsService.sendPaymentInvoice(req.params.id as string, req.body.recipientEmail as string, req.user!.profileId);
      sendSuccess(res, result);
    } catch (err) { next(err); }
  }
  async listNotifications(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await operationsService.listNotifications(req.user!.profileId, req.query as any)); } catch (err) { next(err); }
  }
  async markNotificationRead(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, { notification: await operationsService.markNotificationRead(req.params.id as string, req.user!.profileId, req.body.isRead) }); } catch (err) { next(err); }
  }
  async generateNotifications(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await operationsService.generateNotifications(req.user!.profileId), 201); } catch (err) { next(err); }
  }
  async listActivityLogs(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await operationsService.listActivityLogs(req.query as any)); } catch (err) { next(err); }
  }
  async globalSearch(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, { results: await operationsService.globalSearch(String(req.query.q), Number(req.query.limit)) }); } catch (err) { next(err); }
  }
}

export const operationsController = new OperationsController();
