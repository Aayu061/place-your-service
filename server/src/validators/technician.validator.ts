import { z } from 'zod';

export const technicianStatusEnum = z.enum([
  'AVAILABLE',
  'BUSY',
  'ON_LEAVE',
  'OFF_DUTY',
  'INACTIVE',
]);

export const weekDayEnum = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

export const workingHoursSchema = z
  .object({
    start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid start time format (HH:MM)'),
    end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid end time format (HH:MM)'),
  })
  .refine(
    (data) => {
      return data.start < data.end;
    },
    {
      message: 'Start time must be strictly before end time',
      path: ['start'],
    }
  );

export const availabilitySchema = z.object({
  workingDays: z.array(weekDayEnum).min(1, 'At least one working day required'),
  workingHours: workingHoursSchema,
  notes: z.string().trim().max(500).optional(),
});

export const listTechniciansSchema = {
  query: z.object({
    search: z.string().trim().optional(),
    status: z
      .enum(['ALL', 'AVAILABLE', 'BUSY', 'ON_LEAVE', 'OFF_DUTY', 'INACTIVE'])
      .optional()
      .default('ALL'),
    isActive: z.enum(['ALL', 'true', 'false']).optional().default('ALL'),
    skill: z.string().trim().optional(),
    serviceArea: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  }),
};

export const technicianIdParamSchema = {
  params: z.object({
    id: z.string().uuid('Invalid technician ID format'),
  }),
};

export const createTechnicianSchema = {
  body: z.object({
    name: z
      .string({ required_error: 'Technician name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name cannot exceed 100 characters'),
    phone: z
      .string({ required_error: 'Phone number is required' })
      .trim()
      .regex(/^\+?[0-9\s-]{8,20}$/, 'Invalid phone number format'),
    email: z
      .string()
      .trim()
      .email('Invalid email address format')
      .nullable()
      .optional()
      .or(z.literal('')),
    specializations: z.array(z.string().trim().min(1)).optional().default([]),
    skills: z.array(z.string().trim().min(1)).optional(),
    serviceAreas: z.array(z.string().trim().min(1)).optional().default([]),
    status: technicianStatusEnum.optional().default('AVAILABLE'),
    maxDailyWorkload: z.number().int().positive('Max daily workload must be positive').max(20).optional().default(5),
    joiningDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
      .nullable()
      .optional()
      .or(z.literal('')),
    notes: z.string().trim().max(1000).nullable().optional(),
    workingDays: z.array(weekDayEnum).optional(),
    workingHours: workingHoursSchema.optional(),
    availability: availabilitySchema.optional(),
  }),
};

export const updateTechnicianSchema = {
  params: z.object({
    id: z.string().uuid('Invalid technician ID format'),
  }),
  body: z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
    phone: z.string().trim().regex(/^\+?[0-9\s-]{8,20}$/, 'Invalid phone number format').optional(),
    email: z
      .string()
      .trim()
      .email('Invalid email address format')
      .nullable()
      .optional()
      .or(z.literal('')),
    specializations: z.array(z.string().trim().min(1)).optional(),
    skills: z.array(z.string().trim().min(1)).optional(),
    serviceAreas: z.array(z.string().trim().min(1)).optional(),
    status: technicianStatusEnum.optional(),
    maxDailyWorkload: z.number().int().positive().max(20).optional(),
    joiningDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
      .nullable()
      .optional()
      .or(z.literal('')),
    notes: z.string().trim().max(1000).nullable().optional(),
    workingDays: z.array(weekDayEnum).optional(),
    workingHours: workingHoursSchema.optional(),
    availability: availabilitySchema.optional(),
  }),
};

export const updateTechnicianStatusSchema = {
  params: z.object({
    id: z.string().uuid('Invalid technician ID format'),
  }),
  body: z
    .object({
      status: technicianStatusEnum.optional(),
      isActive: z.boolean().optional(),
      reason: z.string().trim().max(500).optional(),
    })
    .refine((data) => data.status !== undefined || data.isActive !== undefined, {
      message: 'At least one of status or isActive must be provided',
    }),
};
