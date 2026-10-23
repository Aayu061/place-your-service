import { AmcFrequency } from '@/domain/types';

const FREQUENCY_MONTH_INTERVALS: Record<AmcFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};

/**
 * Calendar and UTC-aware month addition handling varying month lengths safely (e.g. Jan 31 -> Feb 28/29).
 */
export function addMonthsSafeUtc(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);

  if (result.getUTCDate() !== originalDay) {
    result.setUTCDate(0); // Revert to last day of previous month
  }
  return result;
}

/**
 * Pure, deterministic date generator for contract-bound preventive maintenance visits.
 * Perfectly synchronized with backend amc.service.ts.
 */
export function calculateScheduleDatesUtc(
  startDateStr: string,
  endDateStr: string,
  frequency: AmcFrequency
): string[] {
  if (!startDateStr || !endDateStr) return [];
  const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
  const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);

  if (!sYear || !sMonth || !sDay || !eYear || !eMonth || !eDay) return [];

  const startDate = new Date(Date.UTC(sYear, sMonth - 1, sDay));
  const endDate = new Date(Date.UTC(eYear, eMonth - 1, eDay));

  if (endDate < startDate) return [];

  const interval = FREQUENCY_MONTH_INTERVALS[frequency] || 3;
  const dates: string[] = [];

  let current = new Date(startDate.getTime());
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current = addMonthsSafeUtc(current, interval);
  }

  return dates;
}

/**
 * Calculates a standard 1-year contract end date given a start date (e.g. 2026-01-01 -> 2026-12-31).
 */
export function calculateDefaultAmcEndDate(startDateStr: string): string {
  if (!startDateStr) return '';
  const [year, month, day] = startDateStr.split('-').map(Number);
  if (!year || !month || !day) return '';

  const endUtc = new Date(Date.UTC(year + 1, month - 1, day - 1));
  return endUtc.toISOString().split('T')[0];
}
