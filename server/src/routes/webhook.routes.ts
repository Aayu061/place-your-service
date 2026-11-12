import express, { Router } from 'express';
import { resendWebhookController } from '../controllers/resendWebhook.controller.js';

const webhookRouter = Router();

webhookRouter.post(
  '/resend',
  express.raw({ type: 'application/json', limit: '2mb' }),
  resendWebhookController.handle.bind(resendWebhookController)
);

export default webhookRouter;

