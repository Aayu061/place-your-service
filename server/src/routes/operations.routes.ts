import { Router } from 'express';
import { operationsController } from '../controllers/operations.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import {
  createInventoryTransactionSchema, createPartSchema, listInventoryTransactionsSchema,
  listPartsSchema, partIdParamSchema, updatePartSchema,
} from '../validators/inventory.validator.js';
import {
  createPaymentReversalSchema, createPaymentSchema, createPaymentTransactionSchema,
  listPaymentsSchema, paymentIdParamSchema, sendPaymentInvoiceSchema,
} from '../validators/payments.validator.js';
import { listNotificationsSchema, markNotificationReadSchema } from '../validators/notification.validator.js';
import { listActivityLogsSchema } from '../validators/activityLog.validator.js';
import { globalSearchSchema } from '../validators/search.validator.js';

const router = Router();
const staffAccess = [requireAuth, requireRole('ADMIN', 'STAFF')];

router.get('/inventory/parts', ...staffAccess, validate(listPartsSchema), operationsController.listParts.bind(operationsController));
router.post('/inventory/parts', ...staffAccess, validate(createPartSchema), operationsController.createPart.bind(operationsController));
router.patch('/inventory/parts/:id', ...staffAccess, validate(updatePartSchema), operationsController.updatePart.bind(operationsController));
router.get('/inventory/transactions', ...staffAccess, validate(listInventoryTransactionsSchema), operationsController.listInventoryTransactions.bind(operationsController));
router.post('/inventory/transactions', ...staffAccess, validate(createInventoryTransactionSchema), operationsController.recordInventoryTransaction.bind(operationsController));

router.get('/payments', ...staffAccess, validate(listPaymentsSchema), operationsController.listPayments.bind(operationsController));
router.post('/payments', ...staffAccess, validate(createPaymentSchema), operationsController.createPayment.bind(operationsController));
router.get('/payments/:id/transactions', ...staffAccess, validate(paymentIdParamSchema), operationsController.getPaymentTransactions.bind(operationsController));
router.post('/payments/:id/transactions', ...staffAccess, validate(createPaymentTransactionSchema), operationsController.recordPaymentTransaction.bind(operationsController));
router.post('/payments/:id/send-invoice', ...staffAccess, validate(sendPaymentInvoiceSchema), operationsController.sendPaymentInvoice.bind(operationsController));
router.post('/payment-transactions/:transactionId/reversals', ...staffAccess, validate(createPaymentReversalSchema), operationsController.recordPaymentReversal.bind(operationsController));

router.get('/notifications', ...staffAccess, validate(listNotificationsSchema), operationsController.listNotifications.bind(operationsController));
router.patch('/notifications/:id/read', ...staffAccess, validate(markNotificationReadSchema), operationsController.markNotificationRead.bind(operationsController));
router.post('/notifications/generate', ...staffAccess, requireRole('ADMIN'), operationsController.generateNotifications.bind(operationsController));

router.get('/activity-logs', ...staffAccess, requireRole('ADMIN'), validate(listActivityLogsSchema), operationsController.listActivityLogs.bind(operationsController));
router.get('/search', ...staffAccess, validate(globalSearchSchema), operationsController.globalSearch.bind(operationsController));

export default router;
