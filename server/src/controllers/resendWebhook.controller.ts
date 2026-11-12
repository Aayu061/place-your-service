import { Request, Response, NextFunction } from 'express';
import { emailOutboxService } from '../services/email/emailOutbox.service.js';
import { EmailDeliveryError } from '../services/email/emailTransport.service.js';
import { sendError, sendSuccess } from '../utils/apiResponse.js';

class ResendWebhookController {
  async handle(req: Request, res: Response, next: NextFunction) {
    try {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body || {});

      const result = await emailOutboxService.handleResendWebhook(rawBody, {
        id: req.header('svix-id'),
        timestamp: req.header('svix-timestamp'),
        signature: req.header('svix-signature'),
      });

      sendSuccess(res, { received: true, ...result });
    } catch (err) {
      if (err instanceof EmailDeliveryError) {
        sendError(res, 400, err.code, err.message);
        return;
      }
      next(err);
    }
  }
}

export const resendWebhookController = new ResendWebhookController();

