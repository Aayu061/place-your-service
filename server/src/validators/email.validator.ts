import { z } from 'zod';

export const listEmailDeliveriesSchema = {
  query: z.object({
    entityType: z
      .enum([
        'SERVICE_REPORT',
        'AMC_QUOTATION',
        'AMC_EXPIRY_REMINDER',
        'PAYMENT_INVOICE',
        'PAYMENT_RECEIPT',
        'DISPATCH_CONFIRMATION',
        'TEST_EMAIL',
      ])
      .optional(),
    entityId: z.string().uuid().optional(),
    status: z
      .enum(['PENDING', 'SENDING', 'SENT', 'DELIVERED', 'DELAYED', 'BOUNCED', 'COMPLAINED', 'FAILED'])
      .optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
};

export const emailDeliveryIdParamSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const sendTestEmailSchema = {
  body: z.object({
    recipientEmail: z.string().trim().email(),
  }),
};

export const listInboundEmailsSchema = {
  query: z.object({
    status: z.enum(['UNREAD', 'READ', 'ARCHIVED']).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
};

export const updateInboundEmailStatusSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    status: z.enum(['UNREAD', 'READ', 'ARCHIVED']),
  }),
};

