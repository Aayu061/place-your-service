import { z } from 'zod';

export const globalSearchSchema = {
  query: z.object({
    q: z.string().trim().min(2).max(100),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
};
