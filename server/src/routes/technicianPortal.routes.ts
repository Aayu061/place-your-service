import { Router } from 'express';
import { technicianPortalController } from '../controllers/technicianPortal.controller.js';
import { requireTechAuth } from '../middleware/techAuth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiters.js';
import {
  techLoginSchema,
  techStatusSchema,
  techFieldReportSchema,
} from '../validators/technicianPortal.validator.js';

const techRouter = Router();

// 1. Dedicated Mobile Login for Technicians
techRouter.post('/login', authLimiter, validate(techLoginSchema), technicianPortalController.login.bind(technicianPortalController));

// 2. Technician Profile & Live Duty Metrics
techRouter.get('/me', requireTechAuth, technicianPortalController.getProfile.bind(technicianPortalController));

// 3. One-Tap Duty Status Update (AVAILABLE / BUSY / OFF_DUTY)
techRouter.patch('/status', requireTechAuth, validate(techStatusSchema), technicianPortalController.updateStatus.bind(technicianPortalController));

// 4. Today's Assigned Dispatch Queue
techRouter.get('/jobs', requireTechAuth, technicianPortalController.getAssignedJobs.bind(technicianPortalController));

// 5. Job Appointment Context & AC Details
techRouter.get('/jobs/:id', requireTechAuth, technicianPortalController.getJobDetail.bind(technicianPortalController));

// 6. Submit Completed On-Site Service Visit Report
techRouter.post('/service-reports', requireTechAuth, validate(techFieldReportSchema), technicianPortalController.submitFieldReport.bind(technicianPortalController));

export default techRouter;

