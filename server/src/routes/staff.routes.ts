import { Router } from 'express';
import { staffController } from '../controllers/staff.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import {
  createStaffSchema,
  updateStaffSchema,
  updateStaffStatusSchema,
  getStaffByIdSchema,
} from '../validators/staff.validator.js';

const staffRouter = Router();

// All staff management routes require active authentication and ADMIN role
staffRouter.use(requireAuth, requireRole('ADMIN'));

staffRouter.get('/', staffController.listStaff.bind(staffController));

staffRouter.post(
  '/',
  validate(createStaffSchema),
  staffController.createStaff.bind(staffController)
);

staffRouter.get(
  '/:id',
  validate(getStaffByIdSchema),
  staffController.getStaffById.bind(staffController)
);

staffRouter.patch(
  '/:id',
  validate(updateStaffSchema),
  staffController.updateStaff.bind(staffController)
);

staffRouter.patch(
  '/:id/status',
  validate(updateStaffStatusSchema),
  staffController.updateStaffStatus.bind(staffController)
);

export default staffRouter;
