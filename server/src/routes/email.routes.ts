import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { emailController } from '../controllers/email.controller.js';
import {
  emailDeliveryIdParamSchema,
  listEmailDeliveriesSchema,
  listInboundEmailsSchema,
  sendTestEmailSchema,
  updateInboundEmailStatusSchema,
} from '../validators/email.validator.js';

const emailRouter = Router();
const staffAccess = [requireAuth, requireRole('ADMIN', 'STAFF')] as const;

emailRouter.get(
  '/email-deliveries',
  ...staffAccess,
  validate(listEmailDeliveriesSchema),
  emailController.listDeliveries.bind(emailController)
);

emailRouter.post(
  '/email-deliveries/:id/retry',
  ...staffAccess,
  validate(emailDeliveryIdParamSchema),
  emailController.retryDelivery.bind(emailController)
);

emailRouter.get(
  '/admin/email-status',
  ...staffAccess,
  emailController.getAdminEmailStatus.bind(emailController)
);

emailRouter.post(
  '/admin/email-test',
  ...staffAccess,
  validate(sendTestEmailSchema),
  emailController.sendTestEmail.bind(emailController)
);

emailRouter.get(
  '/inbound-emails',
  ...staffAccess,
  validate(listInboundEmailsSchema),
  emailController.listInboundEmails.bind(emailController)
);

emailRouter.patch(
  '/inbound-emails/:id/status',
  ...staffAccess,
  validate(updateInboundEmailStatusSchema),
  emailController.updateInboundStatus.bind(emailController)
);

export default emailRouter;

