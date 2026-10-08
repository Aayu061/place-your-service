import { Router } from 'express';
import { scheduleController } from '../controllers/schedule.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import {
  scheduleIdParamSchema,
  listSchedulesSchema,
  calendarSchedulesSchema,
  createScheduleSchema,
  updateScheduleSchema,
  eligibleTechniciansSchema,
  assignTechnicianSchema,
  reassignTechnicianSchema,
  rescheduleSchema,
  cancelScheduleSchema,
} from '../validators/schedule.validator.js';

const scheduleRouter = Router();

// All Scheduling endpoints require active authentication and either ADMIN or STAFF role
scheduleRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));

// 1. Calendar view (bounded by date range)
scheduleRouter.get(
  '/calendar',
  validate(calendarSchedulesSchema),
  scheduleController.getCalendar.bind(scheduleController)
);

// 2. Unscheduled Work Queue (pending SRs + unassigned PM obligations)
scheduleRouter.get(
  '/unscheduled-work',
  scheduleController.getUnscheduledWork.bind(scheduleController)
);

// 3. List schedules with search, filtering, and pagination
scheduleRouter.get(
  '/',
  validate(listSchedulesSchema),
  scheduleController.getSchedules.bind(scheduleController)
);

// 4. Create new schedule
scheduleRouter.post(
  '/',
  validate(createScheduleSchema),
  scheduleController.createSchedule.bind(scheduleController)
);

// 5. Get eligible technicians with score breakdown & "Why this technician" reasons
scheduleRouter.get(
  '/:id/eligible-technicians',
  validate(eligibleTechniciansSchema),
  scheduleController.getEligibleTechnicians.bind(scheduleController)
);

// 6. Get single schedule by ID
scheduleRouter.get(
  '/:id',
  validate(scheduleIdParamSchema),
  scheduleController.getScheduleById.bind(scheduleController)
);

// 7. Assign technician
scheduleRouter.post(
  '/:id/assign',
  validate(assignTechnicianSchema),
  scheduleController.assignTechnician.bind(scheduleController)
);

// 8. Reassign technician
scheduleRouter.post(
  '/:id/reassign',
  validate(reassignTechnicianSchema),
  scheduleController.reassignTechnician.bind(scheduleController)
);

// 9. Reschedule appointment slot
scheduleRouter.post(
  '/:id/reschedule',
  validate(rescheduleSchema),
  scheduleController.reschedule.bind(scheduleController)
);

// 10. Cancel schedule
scheduleRouter.post(
  '/:id/cancel',
  validate(cancelScheduleSchema),
  scheduleController.cancelSchedule.bind(scheduleController)
);

export default scheduleRouter;
