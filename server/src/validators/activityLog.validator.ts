import { z } from 'zod';

export const listActivityLogsSchema = {
  query: z.object({
    entityType: z.string().trim().max(60).optional(),
    actorId: z.string().guid().optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }).refine((value) => !value.from || !value.to || value.from <= value.to, 'From date must be before to date'),
};
