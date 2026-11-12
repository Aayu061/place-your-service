import { z } from 'zod';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const gstinLookupSchema = {
  body: z.object({
    gstin: z
      .string()
      .trim()
      .transform((val) => val.toUpperCase())
      .refine((val) => GSTIN_REGEX.test(val), {
        message: 'Invalid 15-character Indian GSTIN format',
      }),
  }),
};

