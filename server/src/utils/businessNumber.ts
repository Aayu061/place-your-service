import { getSupabaseClient } from '../lib/supabase.js';
import { logger } from './logger.js';

/** Number series defined in migration 20261118010000 (table business_number_series). */
export type BusinessNumberKind =
  | 'SERVICE_REQUEST'
  | 'CUSTOMER'
  | 'AMC_CONTRACT'
  | 'SCHEDULE'
  | 'PM_SCHEDULE'
  | 'SERVICE_REPORT'
  | 'PAYMENT'
  | 'ENQUIRY'
  | 'TECHNICIAN'
  | 'WEB_INTAKE';

/**
 * Reserves `count` consecutive business numbers from the database counter (atomic, never
 * repeats). If the database function is unavailable (e.g. the migration has not reached this
 * database yet) the caller's legacy generator is used, so creating records keeps working.
 */
export async function nextBusinessNumbers(
  kind: BusinessNumberKind,
  count: number,
  fallback: (count: number) => Promise<string[]> | string[]
): Promise<string[]> {
  if (count <= 0) return [];
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('generate_business_numbers', {
      p_kind: kind,
      p_count: count,
    });
    if (!error && Array.isArray(data) && data.length === count && data.every((v) => typeof v === 'string')) {
      return data as string[];
    }
    logger.warn('Business number counter unavailable; using legacy generator', {
      kind,
      error: error?.message,
    });
  } catch (err) {
    logger.warn('Business number counter failed; using legacy generator', {
      kind,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return fallback(count);
}

export async function nextBusinessNumber(
  kind: BusinessNumberKind,
  fallback: () => Promise<string> | string
): Promise<string> {
  const [value] = await nextBusinessNumbers(kind, 1, async () => [await fallback()]);
  return value;
}
