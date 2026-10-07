import { Router } from 'express';
import { customerController } from '../controllers/customer.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import {
  listCustomersSchema,
  createCustomerSchema,
  updateCustomerSchema,
  updateCustomerStatusSchema,
  customerIdParamSchema,
} from '../validators/customer.validator.js';

const customerRouter = Router();

// All Customer endpoints require active authentication and either ADMIN or STAFF role
customerRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));

// 1. List customers with search, filters, and pagination
customerRouter.get(
  '/',
  validate(listCustomersSchema),
  customerController.listCustomers.bind(customerController)
);

// 2. Create customer
customerRouter.post(
  '/',
  validate(createCustomerSchema),
  customerController.createCustomer.bind(customerController)
);

// 3. Get customer by ID
customerRouter.get(
  '/:id',
  validate(customerIdParamSchema),
  customerController.getCustomerById.bind(customerController)
);

// 4. Update customer details
customerRouter.patch(
  '/:id',
  validate(updateCustomerSchema),
  customerController.updateCustomer.bind(customerController)
);

// 5. Update customer active status
customerRouter.patch(
  '/:id/status',
  validate(updateCustomerStatusSchema),
  customerController.updateCustomerStatus.bind(customerController)
);

// 6. Convert temporary customer to permanent
customerRouter.post(
  '/:id/convert-to-permanent',
  validate(customerIdParamSchema),
  customerController.convertToPermanent.bind(customerController)
);
import { siteController } from '../controllers/site.controller.js';
import {
  listCustomerSitesSchema,
  createSiteSchema,
} from '../validators/site.validator.js';

// 7. List customer sites
customerRouter.get(
  '/:customerId/sites',
  validate(listCustomerSitesSchema),
  siteController.listCustomerSites.bind(siteController)
);

// 8. Create site under customer
customerRouter.post(
  '/:customerId/sites',
  validate(createSiteSchema),
  siteController.createSite.bind(siteController)
);

export default customerRouter;
