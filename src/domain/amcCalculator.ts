/**
 * Place Your Service — AMC Schedule Generation Algorithm
 * Implements DOCS/RULES.md Section 7 and DOCS/TRD.md Section 10.
 */

import { AmcFrequency } from './types';

export const FREQUENCY_MONTH_INTERVALS: Record<AmcFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};

/**
 * Calendar-aware month addition that handles varying month lengths safely (e.g. Jan 31 + 1 month -> Feb 28).
 */
export function addMonthsSafe(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setMonth(result.getMonth() + months);

  // If month overflowed due to shorter target month (e.g., Feb 31 -> Mar 3)
  if (result.getDate() !== originalDay) {
    // Set to last day of previous month
    result.setDate(0);
  }
  return result;
}

/**
 * Calculates planned preventive maintenance visit dates for an AMC contract.
 *
 * @param startDate Contract start date
 * @param endDate Contract end date (inclusive upper bound)
 * @param frequency Service frequency
 * @returns Array of planned ISO date strings
 */
export function calculateAmcScheduleDates(
  startDate: Date,
  endDate: Date,
  frequency: AmcFrequency
): string[] {
  if (endDate < startDate) {
    throw new Error('AMC contract end date cannot precede start date.');
  }

  const interval = FREQUENCY_MONTH_INTERVALS[frequency];
  const dates: string[] = [];

  // Anchor at start date
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    dates.push(currentDate.toISOString().split('T')[0]);
    currentDate = addMonthsSafe(currentDate, interval);
  }

  return dates;
}
