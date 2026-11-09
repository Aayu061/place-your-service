import { z } from 'zod';

export const listPaymentsSchema = {
  query: z.object({
    status: z.enum(['PENDING', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'REFUNDED']).optional(),
    customerId: z.string().guid().optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
};

export const paymentIdParamSchema = { params: z.object({ id: z.string().guid() }) };
export const paymentTransactionIdParamSchema = { params: z.object({ transactionId: z.string().guid() }) };

export const createPaymentSchema = {
  body: z.object({
    customerId: z.string().guid(),
    serviceRequestId: z.string().guid().optional(),
    amcId: z.string().guid().optional(),
    totalAmountDue: z.coerce.number().positive(),
  }).refine((value) => !(value.serviceRequestId && value.amcId), 'Choose one linked service request or AMC contract'),
};

export const createPaymentTransactionSchema = {
  params: z.object({ id: z.string().guid() }),
  body: z.object({
    paymentMethod: z.enum(['CASH', 'ONLINE']),
    amount: z.coerce.number().positive(),
    externalPaymentReference: z.string().trim().min(2).max(150).optional(),
    notes: z.string().trim().max(500).optional(),
  }).refine((value) => value.paymentMethod !== 'ONLINE' || Boolean(value.externalPaymentReference),
    'External payment reference is required for online records'),
};

export const createPaymentReversalSchema = {
  params: z.object({ transactionId: z.string().guid() }),
  body: z.object({
    amount: z.coerce.number().positive(),
    reason: z.string().trim().min(3).max(500),
  }),
};
