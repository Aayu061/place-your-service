import { Router } from 'express';
import { serviceReportController } from '../controllers/serviceReport.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { reportEmailController } from '../controllers/reportEmail.controller.js';
import {
  createServiceReportSchema,
  updateServiceReportSchema,
  reportIdParamSchema,
  scheduleReportParamSchema,
  listServiceReportsSchema,
  createFollowUpScheduleSchema,
  reportEmailDeliveryParamSchema,
} from '../validators/serviceReport.validator.js';

const serviceReportRouter = Router();

// All Service Report endpoints require active authentication and either ADMIN or STAFF role
serviceReportRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));

serviceReportRouter.post(
  '/email-deliveries/retry',
  requireRole('ADMIN'),
  reportEmailController.retryPending.bind(reportEmailController)
);

serviceReportRouter.post(
  '/:id/email',
  validate(reportIdParamSchema),
  reportEmailController.send.bind(reportEmailController)
);

serviceReportRouter.get(
  '/:id/email-deliveries',
  validate(reportIdParamSchema),
  reportEmailController.list.bind(reportEmailController)
);

serviceReportRouter.post(
  '/:id/email-deliveries/:deliveryId/retry',
  requireRole('ADMIN'),
  validate(reportEmailDeliveryParamSchema),
  reportEmailController.retry.bind(reportEmailController)
);

// 1. List service reports with search, filtering, and pagination
serviceReportRouter.get(
  '/',
  validate(listServiceReportsSchema),
  serviceReportController.getReports.bind(serviceReportController)
);

// 1b. Get next auto-serial service report number
serviceReportRouter.get(
  '/next-number',
  serviceReportController.getNextReportNumber.bind(serviceReportController)
);

// 2. Create new service visit report
serviceReportRouter.post(
  '/',
  validate(createServiceReportSchema),
  serviceReportController.createReport.bind(serviceReportController)
);

// 3. Get single report by appointment/schedule ID
serviceReportRouter.get(
  '/by-schedule/:scheduleId',
  validate(scheduleReportParamSchema),
  serviceReportController.getReportByScheduleId.bind(serviceReportController)
);

// 4. Get single report by ID
serviceReportRouter.get(
  '/:id',
  validate(reportIdParamSchema),
  serviceReportController.getReportById.bind(serviceReportController)
);

// 5. Update/amend service report details
serviceReportRouter.patch(
  '/:id',
  validate(updateServiceReportSchema),
  serviceReportController.updateReport.bind(serviceReportController)
);

// 5b. Verify submitted service report (Admin / Staff verification)
serviceReportRouter.patch(
  '/:id/verify',
  validate(reportIdParamSchema),
  serviceReportController.verifyReport.bind(serviceReportController)
);

// 6. Schedule a follow-up revisit for pending report
serviceReportRouter.post(
  '/:id/follow-up',
  validate(createFollowUpScheduleSchema),
  serviceReportController.createFollowUp.bind(serviceReportController)
);

export default serviceReportRouter;
