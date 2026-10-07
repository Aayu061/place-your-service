import { z } from 'zod';

export const requestTypeEnum = z.enum([
  'BREAKDOWN',
  'COMPLAINT',
  'REPAIR',
  'EMERGENCY',
  'INSTALLATION',
  'GENERAL_SERVICE',
  'INSPECTION',
  'PREVENTIVE_MAINTENANCE',
  'UNPLANNED_OTHER',
  'OTHER',
]);

export const priorityEnum = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
  'EMERGENCY',
]);

export const statusEnum = z.enum([
  'REQUESTED',
  'PENDING',
  'SCHEDULED',
  'ASSIGNED',
  'IN_PROGRESS',
  'AWAITING_PARTS',
  'ON_HOLD',
  'REVISIT_REQUIRED',
  'RESOLVED',
  'COMPLETED',
  'PAYMENT',
  'CLOSED',
  'CANCELLED',
]);

export const listServiceRequestsSchema = {
  query: z.object({
    search: z.string().trim().optional(),
    status: z.enum([
      'ALL',
      'REQUESTED',
      'PENDING',
      'SCHEDULED',
      'ASSIGNED',
      'IN_PROGRESS',
      'AWAITING_PARTS',
      'ON_HOLD',
      'REVISIT_REQUIRED',
      'RESOLVED',
      'COMPLETED',
      'PAYMENT',
      'CLOSED',
      'CANCELLED',
    ]).optional().default('ALL'),
    priority: z.enum(['ALL', 'LOW', 'MEDIUM', 'HIGH', 'URGENT', 'EMERGENCY']).optional().default('ALL'),
    requestType: z.enum([
      'ALL',
      'BREAKDOWN',
      'COMPLAINT',
      'REPAIR',
      'EMERGENCY',
      'INSTALLATION',
      'GENERAL_SERVICE',
      'INSPECTION',
      'PREVENTIVE_MAINTENANCE',
      'UNPLANNED_OTHER',
      'OTHER',
    ]).optional().default('ALL'),
    customerId: z.string().uuid('Invalid customer UUID').optional(),
    siteId: z.string().uuid('Invalid site UUID').optional(),
    assetId: z.string().uuid('Invalid asset UUID').optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  }),
};

export const serviceRequestIdParamSchema = {
  params: z.object({
    id: z.string().uuid('Invalid service request UUID identifier'),
  }),
};

export const createServiceRequestSchema = {
  body: z.object({
    customerId: z.string().uuid('Invalid customer UUID identifier'),
    siteId: z.string().uuid('Invalid site UUID identifier'),
    assetId: z.string().uuid('Invalid asset UUID identifier').optional().nullable(),
    requestType: requestTypeEnum,
    priority: priorityEnum.optional().default('MEDIUM'),
    description: z.string().min(5, 'Problem description must be at least 5 characters long').max(2000).trim(),
    preferredDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Preferred date must be in YYYY-MM-DD format')
      .optional()
      .nullable(),
    notes: z.string().max(2000).trim().optional().nullable(),
  }),
};

export const updateServiceRequestSchema = {
  params: z.object({
    id: z.string().uuid('Invalid service request UUID identifier'),
  }),
  body: z.object({
    requestType: requestTypeEnum.optional(),
    priority: priorityEnum.optional(),
    description: z.string().min(5, 'Problem description must be at least 5 characters long').max(2000).trim().optional(),
    preferredDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Preferred date must be in YYYY-MM-DD format')
      .optional()
      .nullable(),
    notes: z.string().max(2000).trim().optional().nullable(),
    siteId: z.string().uuid('Invalid site UUID identifier').optional(),
    assetId: z.string().uuid('Invalid asset UUID identifier').optional().nullable(),
  }),
};

export const updateServiceRequestStatusSchema = {
  params: z.object({
    id: z.string().uuid('Invalid service request UUID identifier'),
  }),
  body: z.object({
    status: statusEnum,
    reason: z.string().max(500).trim().optional(),
  }),
};

export const cancelServiceRequestSchema = {
  params: z.object({
    id: z.string().uuid('Invalid service request UUID identifier'),
  }),
  body: z.object({
    reason: z.string().max(500).trim().optional(),
  }).optional(),
};
