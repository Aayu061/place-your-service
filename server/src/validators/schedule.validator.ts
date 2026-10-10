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

// Helper preprocessors to handle null, empty string, or undefined for optional inputs gracefully
const optionalUuid = z.preprocess(
  (val) => (val === null || val === '' || val === undefined ? undefined : val),
  z.string().uuid({ message: 'Invalid UUID format' }).optional()
);

const optionalPositiveInt = z.preprocess(
  (val) => (val === null || val === '' || val === undefined ? undefined : Number(val)),
  z.number().int().positive().optional()
);

const optionalTrimmedString = z.preprocess(
  (val) => (val === null || val === undefined ? undefined : typeof val === 'string' ? val.trim() : val),
  z.string().trim().max(1000).optional()
);

const optionalBoolean = z.preprocess(
  (val) => (val === true || val === 'true'),
  z.boolean().default(false)
);

const optionalTimeWithDefault = (defaultVal: string) =>
  z.preprocess(
    (val) => (val === null || val === '' || val === undefined ? defaultVal : val),
    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm (24-hour)').default(defaultVal)
  );

const optionalTime = z.preprocess(
  (val) => (val === null || val === '' || val === undefined ? undefined : val),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm (24-hour)').optional()
);

export const scheduleIdParamSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Invalid schedule ID format' }),
  }),
};

export const listSchedulesSchema = {
  query: z.object({
    search: optionalTrimmedString,
    status: scheduleStatusEnum.optional().default('ALL'),
    date: z.preprocess((v) => (v === null || v === '' ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional()),
    startDate: z.preprocess((v) => (v === null || v === '' ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD').optional()),
    endDate: z.preprocess((v) => (v === null || v === '' ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD').optional()),
    technicianId: optionalUuid,
    customerId: optionalUuid,
    siteId: optionalUuid,
    serviceRequestId: optionalUuid,
    amcId: optionalUuid,
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  }),
};

export const calendarSchedulesSchema = {
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
    technicianId: optionalUuid,
    status: scheduleStatusEnum.optional().default('ALL'),
  }),
};

export const plannedServiceTypeEnum = z.enum(['DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE']);

export const createScheduleSchema = {
  body: z.object({
    serviceRequestId: optionalUuid,
    pmObligationId: optionalUuid,
    amcId: optionalUuid,
    assetId: optionalUuid,
    visitNumber: optionalPositiveInt,
    customerId: optionalUuid,
    siteId: optionalUuid,
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Scheduled date must be YYYY-MM-DD'),
    startTime: optionalTimeWithDefault('09:00'),
    endTime: optionalTimeWithDefault('11:00'),
    durationMinutes: z.preprocess(
      (val) => (val === null || val === '' || val === undefined ? 120 : Number(val)),
      z.number().int().positive().optional().default(120)
    ),
    plannedServiceType: plannedServiceTypeEnum.nullable().optional(),
    notes: optionalTrimmedString,
    technicianId: optionalUuid,
    isOverride: optionalBoolean,
    overrideReason: optionalTrimmedString,
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
    startTime: optionalTime,
    endTime: optionalTime,
    durationMinutes: optionalPositiveInt,
    plannedServiceType: plannedServiceTypeEnum.nullable().optional(),
    notes: optionalTrimmedString,
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
    isOverride: optionalBoolean,
    overrideReason: optionalTrimmedString,
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
    isOverride: optionalBoolean,
    overrideReason: optionalTrimmedString,
  }),
};

export const rescheduleSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Invalid schedule ID format' }),
  }),
  body: z.object({
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Scheduled date must be YYYY-MM-DD'),
    startTime: optionalTimeWithDefault('09:00'),
    endTime: optionalTimeWithDefault('11:00'),
    durationMinutes: z.preprocess(
      (val) => (val === null || val === '' || val === undefined ? 120 : Number(val)),
      z.number().int().positive().optional().default(120)
    ),
    technicianId: optionalUuid,
    reason: optionalTrimmedString,
    isOverride: optionalBoolean,
    overrideReason: optionalTrimmedString,
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
