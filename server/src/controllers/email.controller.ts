import { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../utils/apiResponse.js';
import { emailOutboxService, EmailEntityType } from '../services/email/emailOutbox.service.js';
import { getResolvedEmailConfig } from '../services/email/emailTransport.service.js';

class EmailController {
  async listDeliveries(req: Request, res: Response, next: NextFunction) {
    try {
      const deliveries = await emailOutboxService.listDeliveries({
        entityType: req.query.entityType as EmailEntityType | undefined,
        entityId: req.query.entityId as string | undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      sendSuccess(res, { deliveries, config: getResolvedEmailConfig() });
    } catch (err) {
      next(err);
    }
  }

  async retryDelivery(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await emailOutboxService.retryDelivery(
        req.params.id as string,
        req.user!.profileId
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getAdminEmailStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      const recentDeliveries = await emailOutboxService.listDeliveries({ limit: 15 });
      sendSuccess(res, {
        config: getResolvedEmailConfig(),
        recentDeliveries,
      });
    } catch (err) {
      next(err);
    }
  }

  async sendTestEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await emailOutboxService.sendDiagnosticTestEmail(
        String(req.body.recipientEmail),
        req.user!.profileId,
        req.user?.email
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async listInboundEmails(req: Request, res: Response, next: NextFunction) {
    try {
      const emails = await emailOutboxService.listInboundEmails(
        req.query.status as string | undefined,
        req.query.limit ? Number(req.query.limit) : undefined
      );
      sendSuccess(res, { emails });
    } catch (err) {
      next(err);
    }
  }

  async updateInboundStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const email = await emailOutboxService.updateInboundEmailStatus(
        req.params.id as string,
        req.body.status as 'UNREAD' | 'READ' | 'ARCHIVED'
      );
      sendSuccess(res, { email });
    } catch (err) {
      next(err);
    }
  }
}

export const emailController = new EmailController();

