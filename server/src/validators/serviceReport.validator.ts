import { z } from 'zod';

export const visitTypeEnum = z.enum(['PREVENTIVE', 'SERVICE_REQUEST']);
export const primaryOutcomeEnum = z.enum(['COMPLETED', 'PENDING_PARTS', 'PENDING_REPAIRS']);
export const itemTypeEnum = z.enum(['PART_REQUIRED', 'REPAIR_REQUIRED']);

// Helper preprocessors
const optionalUuid = z.preprocess(
  (val) => (val === null || val === '' || val === undefined ? undefined : val),
  z.string().uuid({ message: 'Invalid UUID format' }).optional()
);

const optionalTrimmedString = z.preprocess(
  (val) => (val === null || val === undefined ? undefined : typeof val === 'string' ? val.trim() : val),
  z.string().trim().max(2000).optional()
);

const optionalTime = z.preprocess(
  (val) => (val === null || val === '' || val === undefined ? undefined : val),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm (24-hour)').optional()
);

export const reportAssetInputSchema = z.object({
  assetId: z.string().uuid({ message: 'Valid asset ID is required' }),
  faultReported: optionalTrimmedString,
  diagnosisFindings: optionalTrimmedString,
  workPerformed: optionalTrimmedString,
  assetOutcome: primaryOutcomeEnum,
  finalCondition: optionalTrimmedString,
  refrigerantAdded: z.boolean().default(false),
  refrigerantQtyKg: z.preprocess(
    (val) => (val === null || val === '' || val === undefined ? undefined : Number(val)),
    z.number().positive().max(50).optional()
  ),
  notes: optionalTrimmedString,
});

export const reportItemInputSchema = z.object({
  assetId: optionalUuid,
  itemType: itemTypeEnum,
  itemName: z.string({ required_error: 'Item/part name is required' }).trim().min(1, 'Item name cannot be empty').max(200),
  partNumber: optionalTrimmedString,
  quantity: z.preprocess(
    (val) => (val === null || val === '' || val === undefined ? 1 : Number(val)),
    z.number().int().positive().default(1)
  ),
  reason: z.string({ required_error: 'Reason is required' }).trim().min(2, 'Reason must be provided').max(1000),
  diagnosis: optionalTrimmedString,
  workCompleted: optionalTrimmedString,
  recommendedAction: optionalTrimmedString,
  isApprovalRequired: z.boolean().default(false),
  isSpecialistRequired: z.boolean().default(false),
  isRevisitRequired: z.boolean().default(true),
  acCondition: optionalTrimmedString,
  followUpNotes: optionalTrimmedString,
});

export const createServiceReportSchema = {
  body: z
    .object({
      reportNumber: z
        .string({ required_error: 'Report number is mandatory' })
        .trim()
        .min(2, 'Report number must have at least 2 characters')
        .max(50, 'Report number cannot exceed 50 characters')
        .regex(/^[A-Za-z0-9_\-\/\.\s]+$/, 'Report number may only contain alphanumeric characters, spaces, dashes, slashes, and periods'),
      scheduleId: z.string().uuid({ message: 'Valid schedule ID is required' }),
      visitType: visitTypeEnum,
      serviceDate: z
        .string({ required_error: 'Service date is required' })
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Service date must be in YYYY-MM-DD format'),
      startTime: optionalTime,
      endTime: optionalTime,
      primaryOutcome: primaryOutcomeEnum,
      workDescription: optionalTrimmedString,
      technicianRemarks: optionalTrimmedString,
      customerRepresentative: optionalTrimmedString,
      customerAcknowledgement: optionalTrimmedString,
      customerSignatureUrl: optionalTrimmedString,
      assets: z.array(reportAssetInputSchema).min(1, 'At least one AC asset detail is required'),
      items: z.array(reportItemInputSchema).optional().default([]),
    })
    .superRefine((data, ctx) => {
      // Conditional validation based on primaryOutcome
      if (data.primaryOutcome === 'PENDING_PARTS') {
        const parts = (data.items || []).filter((i) => i.itemType === 'PART_REQUIRED');
        if (parts.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Pending for Parts requires at least one part item to be specified with quantity and reason.',
            path: ['items'],
          });
        }
      } else if (data.primaryOutcome === 'PENDING_REPAIRS') {
        const repairs = (data.items || []).filter((i) => i.itemType === 'REPAIR_REQUIRED');
        if (repairs.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Pending for Repairs requires at least one repair item with reason and recommended action.',
            path: ['items'],
          });
        }
      } else if (data.primaryOutcome === 'COMPLETED') {
        // Must have work description or work performed on assets
        const hasAssetWork = data.assets.some((a) => a.workPerformed && a.workPerformed.trim().length > 0);
        const hasSummaryWork = data.workDescription && data.workDescription.trim().length > 0;
        if (!hasAssetWork && !hasSummaryWork) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Completed service requires work performed details either in the summary or per asset.',
            path: ['workDescription'],
          });
        }
      }
    }),
};

export const updateServiceReportSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Invalid report ID format' }),
  }),
  body: z.object({
    reportNumber: z
      .string()
      .trim()
      .min(2, 'Report number must have at least 2 characters')
      .max(50, 'Report number cannot exceed 50 characters')
      .regex(/^[A-Za-z0-9_\-\/\.\s]+$/, 'Report number may only contain alphanumeric characters, spaces, dashes, slashes, and periods')
      .optional(),
    startTime: optionalTime,
    endTime: optionalTime,
    workDescription: optionalTrimmedString,
    technicianRemarks: optionalTrimmedString,
    customerRepresentative: optionalTrimmedString,
    customerAcknowledgement: optionalTrimmedString,
    customerSignatureUrl: optionalTrimmedString,
    assets: z.array(reportAssetInputSchema).optional(),
    items: z.array(reportItemInputSchema).optional(),
  }),
};

export const reportIdParamSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Invalid report ID format' }),
  }),
};

export const scheduleReportParamSchema = {
  params: z.object({
    scheduleId: z.string().uuid({ message: 'Invalid schedule ID format' }),
  }),
};

export const listServiceReportsSchema = {
  query: z.object({
    search: optionalTrimmedString,
    visitType: z.preprocess((v) => (v === null || v === '' ? undefined : v), z.enum(['ALL', 'PREVENTIVE', 'SERVICE_REQUEST']).default('ALL')),
    outcome: z.preprocess((v) => (v === null || v === '' ? undefined : v), z.enum(['ALL', 'COMPLETED', 'PENDING_PARTS', 'PENDING_REPAIRS']).default('ALL')),
    technicianId: optionalUuid,
    customerId: optionalUuid,
    siteId: optionalUuid,
    startDate: z.preprocess((v) => (v === null || v === '' ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional()),
    endDate: z.preprocess((v) => (v === null || v === '' ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional()),
    page: z.preprocess((val) => (val === null || val === '' || val === undefined ? 1 : Number(val)), z.number().int().positive().default(1)),
    pageSize: z.preprocess((val) => (val === null || val === '' || val === undefined ? 20 : Number(val)), z.number().int().positive().max(100).default(20)),
  }),
};

export const createFollowUpScheduleSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Invalid report ID format' }),
  }),
  body: z.object({
    scheduledDate: z
      .string({ required_error: 'Follow-up date is required' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Follow-up date must be YYYY-MM-DD'),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must be HH:mm').default('09:00'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must be HH:mm').default('11:00'),
    durationMinutes: z.preprocess(
      (val) => (val === null || val === '' || val === undefined ? 120 : Number(val)),
      z.number().int().positive().default(120)
    ),
    technicianId: optionalUuid,
    notes: optionalTrimmedString,
  }),
};
