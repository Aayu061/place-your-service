import { Router } from 'express';
import { technicianPortalController } from '../controllers/technicianPortal.controller.js';
import { requireTechAuth } from '../middleware/techAuth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiters.js';
import {
  techLoginSchema,
  techStatusSchema,
  techFieldReportSchema,
  techAssignedJobsQuerySchema,
  techAnalyticsQuerySchema,
  techJobParamSchema,
  techJobStatusSchema,
  techPinChangeSchema,
  mediaUploadUrlSchema,
  mediaSignedUrlQuerySchema,
} from '../validators/technicianPortal.validator.js';

const techRouter = Router();

// 1. Dedicated Mobile Login for Technicians
techRouter.post('/login', authLimiter, validate(techLoginSchema), technicianPortalController.login.bind(technicianPortalController));

// 2. Technician Profile & Live Duty Metrics
techRouter.get('/me', requireTechAuth, technicianPortalController.getProfile.bind(technicianPortalController));

// 3. One-Tap Duty Status Update (AVAILABLE / BUSY / OFF_DUTY)
techRouter.patch('/status', requireTechAuth, validate(techStatusSchema), technicianPortalController.updateStatus.bind(technicianPortalController));

// 4. Today's Assigned Dispatch Queue
techRouter.get('/jobs', requireTechAuth, validate(techAssignedJobsQuerySchema), technicianPortalController.getAssignedJobs.bind(technicianPortalController));

// 4.1 Update Assigned Job Status (e.g. EN_ROUTE, IN_PROGRESS)
techRouter.patch('/jobs/:id/status', requireTechAuth, validate(techJobStatusSchema), technicianPortalController.updateJobStatus.bind(technicianPortalController));

// 4.2 Real-time Daily Work Analytics & 7-Day Performance Trends
techRouter.get('/analytics', requireTechAuth, validate(techAnalyticsQuerySchema), technicianPortalController.getAnalytics.bind(technicianPortalController));

// 5. Job Appointment Context & AC Details
techRouter.get('/jobs/:id', requireTechAuth, validate(techJobParamSchema), technicianPortalController.getJobDetail.bind(technicianPortalController));

// 6. Submit Completed On-Site Service Visit Report
techRouter.post('/service-reports', requireTechAuth, validate(techFieldReportSchema), technicianPortalController.submitFieldReport.bind(technicianPortalController));

// 7. Update 4-6 digit Technician Portal PIN
techRouter.patch('/pin', requireTechAuth, validate(techPinChangeSchema), technicianPortalController.updatePin.bind(technicianPortalController));

// 8. Signed Storage Upload & View URLs for Field Photos/Signatures
techRouter.post('/media/upload-url', requireTechAuth, validate(mediaUploadUrlSchema), technicianPortalController.createMediaUploadUrl.bind(technicianPortalController));
techRouter.get('/media/signed-url', requireTechAuth, validate(mediaSignedUrlQuerySchema), technicianPortalController.getMediaSignedUrl.bind(technicianPortalController));

export default techRouter;

