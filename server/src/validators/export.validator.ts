import { z } from 'zod';

export const exportKindParamSchema = {
  params: z.object({ kind: z.enum(['customers', 'schedules', 'service-reports', 'amc-expiry']) }),
  query: z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    status: z.string().trim().max(40).optional(),
    customerId: z.string().guid().optional(),
    search: z.string().trim().max(100).optional(),
  }).refine((value) => !value.from || !value.to || value.from <= value.to, 'From date must be before to date'),
};
