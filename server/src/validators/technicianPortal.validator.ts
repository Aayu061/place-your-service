import { z } from 'zod';

export const techLoginSchema = {
  body: z.object({
    identifier: z
      .string()
      .min(3, 'Identifier must be at least 3 characters')
      .transform((val) => val.trim()),
    pin: z
      .string()
      .regex(/^\d{4,6}$/, 'PIN must be 4 to 6 numeric digits'),
  }),
};

export const techStatusSchema = {
  body: z.object({
    status: z.enum(['AVAILABLE', 'BUSY', 'OFF_DUTY']),
  }),
};

export const techAssetFindingSchema = z.object({
  assetId: z.string().uuid(),
  assetTag: z.string().optional(),
  brand: z.string().optional(),
  modelNumber: z.string().optional(),
  roomLocation: z.string().optional(),
  faultReported: z.string().optional(),
  diagnosisFindings: z.string().min(2, 'Diagnosis findings are required'),
  workPerformed: z.string().min(2, 'Work performed description is required'),
  assetOutcome: z.enum(['COMPLETED', 'PENDING_PARTS', 'PENDING_REPAIRS']),
  finalCondition: z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'CRITICAL', 'OPERATIONAL']).optional(),
  // Field Diagnostics
  filterCleaned: z.boolean().optional(),
  coilJetWashed: z.boolean().optional(),
  drainCleared: z.boolean().optional(),
  electricalTightened: z.boolean().optional(),
  suctionPressurePsi: z.coerce.number().optional().nullable(),
  dischargePressurePsi: z.coerce.number().optional().nullable(),
  runAmperage: z.coerce.number().optional().nullable(),
  operatingVoltage: z.coerce.number().optional().nullable(),
  refrigerantAdded: z.boolean().optional(),
  refrigerantType: z.string().optional().nullable(),
  refrigerantQtyKg: z.coerce.number().optional().nullable(),
});

export const techSparesItemSchema = z.object({
  assetId: z.string().uuid().optional().nullable(),
  partDescription: z.string().min(2),
  quantity: z.coerce.number().min(1).default(1),
  unitCost: z.coerce.number().optional().nullable(),
  isProcurementRequired: z.boolean().default(false),
  isRevisitRequired: z.boolean().default(false),
  actionRemarks: z.string().optional(),
});

const normalizeTimeInput = (val: unknown) => {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  return trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed;
};

export const techFieldReportSchema = {
  body: z.object({
    scheduleId: z.string().uuid(),
    manualReportNumber: z.preprocess(
      (val) => {
        if (val === null || val === undefined) return undefined;
        const trimmed = String(val).trim();
        return trimmed.length === 0 ? undefined : trimmed;
      },
      z.string().min(2, 'Report number must be at least 2 characters').optional()
    ),
    assistantName: z.string().optional().nullable(),
    reportedVisitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid visit date (YYYY-MM-DD) is required'),
    startTime: z.preprocess(
      normalizeTimeInput,
      z.string().regex(/^\d{2}:\d{2}$/, 'Start time (HH:mm) is required')
    ),
    endTime: z.preprocess(
      normalizeTimeInput,
      z.string().regex(/^\d{2}:\d{2}$/, 'End time (HH:mm) is required')
    ),
    serviceExecutionType: z.string().default('DRY_SERVICE'),
    primaryOutcome: z.enum(['COMPLETED', 'PENDING_PARTS', 'PENDING_REPAIRS']),
    workDescription: z.string().optional().nullable(),
    technicianRemarks: z.string().min(3, 'Technician observations must be at least 3 characters'),
    customerRepresentative: z.string().min(2, 'Customer representative name is required'),
    customerAcknowledgement: z.string().optional().nullable(),
    signatureDataUrl: z.string().optional().nullable(),
    beforePhotoUrl: z.string().optional().nullable(),
    afterPhotoUrl: z.string().optional().nullable(),
    paymentCollected: z.boolean().optional().default(false),
    paymentAmount: z.coerce.number().optional().nullable(),
    paymentMethod: z.string().optional().nullable(),
    paymentReference: z.string().optional().nullable(),
    paymentNotes: z.string().optional().nullable(),
    assets: z.array(techAssetFindingSchema).default([]),
    items: z.array(techSparesItemSchema).optional().default([]),
  }),
};

const isoDateQuerySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date filter must follow YYYY-MM-DD format')
  .optional();

export const techAssignedJobsQuerySchema = {
  query: z.object({
    date: isoDateQuerySchema,
    includeOverdue: z.enum(['true', 'false']).optional(),
  }),
};

export const techPinChangeSchema = {
  body: z.object({
    currentPin: z.string().regex(/^\d{4,6}$/, 'Current PIN must be 4 to 6 digits'),
    newPin: z.string().regex(/^\d{4,6}$/, 'New PIN must be 4 to 6 digits'),
  }),
};

export const mediaUploadUrlSchema = {
  body: z.object({
    scope: z.enum(['before-photo', 'after-photo', 'signature']),
    mimeType: z.enum(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']),
    entityRef: z.string().trim().max(48).optional(),
  }),
};

export const mediaSignedUrlQuerySchema = {
  query: z.object({
    path: z.string().trim().min(3).max(260),
  }),
};

export const techAnalyticsQuerySchema = {
  query: z.object({
    date: isoDateQuerySchema,
  }),
};

export const techJobParamSchema = {
  params: z.object({
    id: z.string().uuid('Invalid job schedule ID'),
  }),
};

export const techJobStatusSchema = {
  params: z.object({
    id: z.string().uuid('Invalid job schedule ID'),
  }),
  body: z.object({
    status: z.enum(['SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED']),
  }),
};
