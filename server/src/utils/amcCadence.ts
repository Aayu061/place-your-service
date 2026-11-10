import { AmcFrequency } from '../types/index.js';

const FREQUENCY_MONTH_INTERVALS: Record<AmcFrequency, number> = {
  MONTHLY: 1,
  BI_MONTHLY: 2,
  QUARTERLY: 3,
  FOUR_MONTHLY: 4,
  HALF_YEARLY: 6,
  YEARLY: 12,
  CUSTOM: 3,
  ON_DEMAND: 12,
};

function addMonthsSafeUtc(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  if (result.getUTCDate() !== originalDay) result.setUTCDate(0);
  return result;
}

/** Returns every cadence date that falls within the inclusive contract term. */
export function calculateAmcCadenceDates(
  startDateStr: string,
  endDateStr: string,
  frequency: AmcFrequency
): string[] {
  const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
  const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);
  const startDate = new Date(Date.UTC(sYear, sMonth - 1, sDay));
  const endDate = new Date(Date.UTC(eYear, eMonth - 1, eDay));

  if (
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(endDate.getTime()) ||
    startDate.toISOString().slice(0, 10) !== startDateStr ||
    endDate.toISOString().slice(0, 10) !== endDateStr ||
    endDate < startDate
  ) {
    throw new Error('AMC contract dates must be valid and end date cannot precede start date.');
  }

  const interval = FREQUENCY_MONTH_INTERVALS[frequency];
  const dates: string[] = [];
  let current = new Date(startDate.getTime());
  while (current <= endDate) {
    dates.push(current.toISOString().slice(0, 10));
    current = addMonthsSafeUtc(current, interval);
  }
  return dates;
}
