import { z } from 'zod';

export const scheduleStatusEnum = z.enum([
  'ALL',
  'SCHEDULED',
  'PLANNED',
  'DUE',
  'OVERDUE',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'COMPLETED',
  'SKIPPED',
  'CANCELLED',
  'RESCHEDULED',
]);

export const scheduleIdParamSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Invalid schedule ID format' }),
  }),
};

export const listSchedulesSchema = {
  query: z.object({
    search: z.string().trim().optional(),
    status: scheduleStatusEnum.optional().default('ALL'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD').optional(),
    technicianId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    siteId: z.string().uuid().optional(),
    serviceRequestId: z.string().uuid().optional(),
    amcId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  }),
};

export const calendarSchedulesSchema = {
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
    technicianId: z.string().uuid().optional(),
    status: scheduleStatusEnum.optional().default('ALL'),
  }),
};

export const createScheduleSchema = {
  body: z.object({
    serviceRequestId: z.string().uuid().optional(),
    pmObligationId: z.string().uuid().optional(),
    amcId: z.string().uuid().optional(),
    assetId: z.string().uuid().optional(),
    visitNumber: z.number().int().positive().optional(),
    customerId: z.string().uuid().optional(),
    siteId: z.string().uuid().optional(),
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Scheduled date must be YYYY-MM-DD'),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must be HH:mm (24-hour)').optional().default('09:00'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must be HH:mm (24-hour)').optional().default('11:00'),
    durationMinutes: z.number().int().positive().optional().default(120),
    notes: z.string().trim().max(1000).optional(),
    technicianId: z.string().uuid().optional(),
    isOverride: z.boolean().optional().default(false),
    overrideReason: z.string().trim().optional(),
  }).refine((data) => {
    // Either serviceRequestId, pmObligationId, amcId, or customerId + siteId must be provided
    return Boolean(data.serviceRequestId || data.pmObligationId || data.amcId || (data.customerId && data.siteId));
  }, {
    message: 'Schedule must be linked to either a Service Request, an AMC/PM obligation, or a customer and site.',
  }),
};

export const updateScheduleSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Invalid schedule ID format' }),
  }),
  body: z.object({
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Scheduled date must be YYYY-MM-DD').optional(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must be HH:mm (24-hour)').optional(),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must be HH:mm (24-hour)').optional(),
    durationMinutes: z.number().int().positive().optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
};

export const eligibleTechniciansSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Invalid schedule ID format' }),
  }),
  query: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must be HH:mm').optional(),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must be HH:mm').optional(),
  }),
};

export const assignTechnicianSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Invalid schedule ID format' }),
  }),
  body: z.object({
    technicianId: z.string().uuid({ message: 'Valid technician ID is required' }),
    scheduledStartTime: z.string().optional(),
    scheduledEndTime: z.string().optional(),
    isOverride: z.boolean().optional().default(false),
    overrideReason: z.string().trim().optional(),
  }),
};

export const reassignTechnicianSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Invalid schedule ID format' }),
  }),
  body: z.object({
    technicianId: z.string().uuid({ message: 'Valid technician ID is required' }),
    scheduledStartTime: z.string().optional(),
    scheduledEndTime: z.string().optional(),
    isOverride: z.boolean().optional().default(false),
    overrideReason: z.string().trim().optional(),
  }),
};

export const rescheduleSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Invalid schedule ID format' }),
  }),
  body: z.object({
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Scheduled date must be YYYY-MM-DD'),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must be HH:mm (24-hour)').optional().default('09:00'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must be HH:mm (24-hour)').optional().default('11:00'),
    durationMinutes: z.number().int().positive().optional().default(120),
    technicianId: z.string().uuid().optional(),
    reason: z.string().trim().optional(),
    isOverride: z.boolean().optional().default(false),
    overrideReason: z.string().trim().optional(),
  }),
};

export const cancelScheduleSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Invalid schedule ID format' }),
  }),
  body: z.object({
    reason: z.string().trim().min(3, { message: 'Cancellation reason is required (at least 3 characters)' }),
  }),
};
