import { z } from 'zod';

export const healthQuerySchema = z.object({
  checkDb: z.enum(['true', 'false']).optional(),
});
