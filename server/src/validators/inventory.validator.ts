import { z } from 'zod';

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);

export const listPartsSchema = {
  query: z.object({
    search: z.string().trim().max(100).optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  }),
};

export const partIdParamSchema = { params: z.object({ id: z.string().guid() }) };

export const createPartSchema = {
  body: z.object({
    partCode: z.string().trim().min(1).max(50),
    name: z.string().trim().min(2).max(150),
    category: z.string().trim().max(80).optional().nullable(),
    unitOfMeasure: z.string().trim().min(1).max(30).default('PIECE'),
    unitCost: z.coerce.number().min(0),
    unitPrice: z.coerce.number().min(0),
    lowStockThreshold: z.coerce.number().int().min(0).default(5),
  }),
};

export const updatePartSchema = {
  params: z.object({ id: z.string().guid() }),
  body: z.object({
    name: z.string().trim().min(2).max(150).optional(),
    category: z.string().trim().max(80).optional().nullable(),
    unitOfMeasure: z.string().trim().min(1).max(30).optional(),
    unitCost: z.coerce.number().min(0).optional(),
    unitPrice: z.coerce.number().min(0).optional(),
    lowStockThreshold: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  }).refine((value) => Object.keys(value).length > 0, 'At least one field must be provided'),
};

export const listInventoryTransactionsSchema = {
  query: z.object({
    partId: z.string().guid().optional(),
    type: z.enum(['OPENING', 'PURCHASE', 'ADJUSTMENT', 'SERVICE_USAGE', 'RETURN']).optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  }),
};

export const createInventoryTransactionSchema = {
  body: z.object({
    partId: z.string().guid(),
    transactionType: z.enum(['OPENING', 'PURCHASE', 'ADJUSTMENT', 'SERVICE_USAGE', 'RETURN']),
    quantity: z.coerce.number().int().refine((value) => value !== 0, 'Quantity must not be zero'),
    reason: z.string().trim().min(3).max(500),
    serviceReportId: z.string().guid().optional(),
    unitPrice: z.coerce.number().min(0).optional(),
  }).refine((value) => {
    if (['OPENING', 'PURCHASE', 'RETURN'].includes(value.transactionType)) return value.quantity > 0;
    if (value.transactionType === 'SERVICE_USAGE') return value.quantity > 0 && Boolean(value.serviceReportId);
    return true;
  }, 'Quantity and service report must match the selected movement type'),
};
