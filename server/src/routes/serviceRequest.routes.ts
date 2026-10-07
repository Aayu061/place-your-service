import { Router } from 'express';
import { serviceRequestController } from '../controllers/serviceRequest.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import {
  listServiceRequestsSchema,
  serviceRequestIdParamSchema,
  createServiceRequestSchema,
  updateServiceRequestSchema,
  updateServiceRequestStatusSchema,
  cancelServiceRequestSchema,
} from '../validators/serviceRequest.validator.js';

const serviceRequestRouter = Router();

// All Service Request endpoints require active authentication and either ADMIN or STAFF role
serviceRequestRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));

// 1. List service requests with search, filtering, and pagination
serviceRequestRouter.get(
  '/',
  validate(listServiceRequestsSchema),
  serviceRequestController.listServiceRequests.bind(serviceRequestController)
);

// 2. Get single service request by ID
serviceRequestRouter.get(
  '/:id',
  validate(serviceRequestIdParamSchema),
  serviceRequestController.getServiceRequestById.bind(serviceRequestController)
);

// 3. Create service request
serviceRequestRouter.post(
  '/',
  validate(createServiceRequestSchema),
  serviceRequestController.createServiceRequest.bind(serviceRequestController)
);

// 4. Update service request
serviceRequestRouter.patch(
  '/:id',
  validate(updateServiceRequestSchema),
  serviceRequestController.updateServiceRequest.bind(serviceRequestController)
);

// 5. Transition service request status
serviceRequestRouter.post(
  '/:id/status',
  validate(updateServiceRequestStatusSchema),
  serviceRequestController.transitionStatus.bind(serviceRequestController)
);

// 6. Cancel service request
serviceRequestRouter.post(
  '/:id/cancel',
  validate(cancelServiceRequestSchema),
  serviceRequestController.cancelServiceRequest.bind(serviceRequestController)
);

export default serviceRequestRouter;
