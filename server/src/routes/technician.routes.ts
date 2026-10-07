import { Router } from 'express';
import { technicianController } from '../controllers/technician.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import {
  listTechniciansSchema,
  technicianIdParamSchema,
  createTechnicianSchema,
  updateTechnicianSchema,
  updateTechnicianStatusSchema,
} from '../validators/technician.validator.js';

const technicianRouter = Router();

// All Technician endpoints require active authentication and either ADMIN or STAFF role
technicianRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));

// 1. List technicians with search, filtering, and pagination
technicianRouter.get(
  '/',
  validate(listTechniciansSchema),
  technicianController.listTechnicians.bind(technicianController)
);

// 2. Get single technician by ID
technicianRouter.get(
  '/:id',
  validate(technicianIdParamSchema),
  technicianController.getTechnicianById.bind(technicianController)
);

// 3. Create technician
technicianRouter.post(
  '/',
  validate(createTechnicianSchema),
  technicianController.createTechnician.bind(technicianController)
);

// 4. Update technician details
technicianRouter.patch(
  '/:id',
  validate(updateTechnicianSchema),
  technicianController.updateTechnician.bind(technicianController)
);

// 5. Update technician operational status or administrative activation
technicianRouter.patch(
  '/:id/status',
  validate(updateTechnicianStatusSchema),
  technicianController.updateStatus.bind(technicianController)
);

// 6. Explicitly activate technician
technicianRouter.post(
  '/:id/activate',
  validate(technicianIdParamSchema),
  technicianController.activateTechnician.bind(technicianController)
);

// 7. Explicitly deactivate technician (with active work check)
technicianRouter.post(
  '/:id/deactivate',
  validate(technicianIdParamSchema),
  technicianController.deactivateTechnician.bind(technicianController)
);

export default technicianRouter;
