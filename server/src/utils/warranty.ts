import { WarrantyStatus } from '../types/index.js';

/**
 * Validates if a string matches YYYY-MM-DD calendar format.
 */
export function isValidDateString(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Calculates the default warranty end date from warranty start date
 * using an inclusive 365-calendar-day convention:
 * End Date = Start Date + 364 calendar days.
 * (e.g., 2026-10-13 -> 2027-10-12).
 *
 * Uses UTC date component arithmetic to avoid timezone shift and DST anomalies.
 */
export function calculateDefaultWarrantyEndDate(startDateStr: string): string {
  if (!isValidDateString(startDateStr)) return '';

  const [yearStr, monthStr, dayStr] = startDateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  // Inclusive 365-day period = +364 calendar days
  utcDate.setUTCDate(utcDate.getUTCDate() + 364);

  const endYear = utcDate.getUTCFullYear();
  const endMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const endDay = String(utcDate.getUTCDate()).padStart(2, '0');

  return `${endYear}-${endMonth}-${endDay}`;
}

/**
 * Calculates operational warranty status based on start & end dates.
 * - Missing or invalid dates -> OUT_OF_WARRANTY (or fallbackStatus if provided)
 * - If start date is in the future (not yet started) -> OUT_OF_WARRANTY
 * - If end date is in the past (< today) -> EXPIRED
 * - If end date is within 30 days from today (inclusive) -> EXPIRING_SOON
 * - Otherwise (active period) -> UNDER_WARRANTY
 */
export function calculateWarrantyStatus(
  warrantyEndDate?: string | null,
  warrantyStartDate?: string | null,
  fallbackStatus?: WarrantyStatus,
  referenceDateStr?: string
): WarrantyStatus {
  if (!warrantyEndDate || !isValidDateString(warrantyEndDate)) {
    return fallbackStatus || 'OUT_OF_WARRANTY';
  }

  // Determine reference date (today in local/UTC calendar YYYY-MM-DD or provided string)
  let todayStr = referenceDateStr;
  if (!todayStr || !isValidDateString(todayStr)) {
    const now = new Date();
    todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // Check start date if present
  if (warrantyStartDate && isValidDateString(warrantyStartDate)) {
    if (warrantyStartDate > todayStr) {
      // Period has not started yet
      return 'OUT_OF_WARRANTY';
    }
    if (warrantyEndDate < warrantyStartDate) {
      // Invalid date range
      return 'OUT_OF_WARRANTY';
    }
  }

  if (warrantyEndDate < todayStr) {
    return 'EXPIRED';
  }

  // Calculate 30 days after today
  const [tYear, tMonth, tDay] = todayStr.split('-').map((v) => parseInt(v, 10));
  const thirtyDaysDate = new Date(Date.UTC(tYear, tMonth - 1, tDay));
  thirtyDaysDate.setUTCDate(thirtyDaysDate.getUTCDate() + 30);
  const thirtyDaysStr = `${thirtyDaysDate.getUTCFullYear()}-${String(thirtyDaysDate.getUTCMonth() + 1).padStart(2, '0')}-${String(thirtyDaysDate.getUTCDate()).padStart(2, '0')}`;

  if (warrantyEndDate <= thirtyDaysStr) {
    return 'EXPIRING_SOON';
  }

  return 'UNDER_WARRANTY';
}

export interface WarrantyAllocationInput {
  totalWarrantyServices?: number | null;
  dryWarrantyVisits?: number | null;
  jetWarrantyVisits?: number | null;
  pumpdownWarrantyVisits?: number | null;
}

export interface WarrantyAllocationValidationResult {
  isValid: boolean;
  error?: string;
  isBreakdownSpecified: boolean;
  isExplicitAllocation: boolean;
}

/**
 * Validates the warranty service allocation invariant:
 * - All counts must be non-negative whole numbers (integers).
 * - If total is specified without a breakdown (all breakdown fields null/undefined), it is valid.
 * - If explicit breakdown is entered (at least one visit count provided), all visit fields
 *   must be non-negative integers and Dry + Jet + Pumpdown must equal Total Warranty Services.
 */
export function validateWarrantyAllocation(
  input: WarrantyAllocationInput
): WarrantyAllocationValidationResult {
  const { totalWarrantyServices, dryWarrantyVisits, jetWarrantyVisits, pumpdownWarrantyVisits } = input;

  const values = [
    { name: 'Total Warranty Services', val: totalWarrantyServices },
    { name: 'Dry Service Visits', val: dryWarrantyVisits },
    { name: 'Jet Service Visits', val: jetWarrantyVisits },
    { name: 'Pumpdown Service Visits', val: pumpdownWarrantyVisits },
  ];

  for (const item of values) {
    if (item.val !== null && item.val !== undefined) {
      if (typeof item.val !== 'number' || isNaN(item.val)) {
        return { isValid: false, error: `${item.name} must be a valid number.`, isBreakdownSpecified: false, isExplicitAllocation: false };
      }
      if (!Number.isInteger(item.val)) {
        return { isValid: false, error: `${item.name} must be a whole number (integer).`, isBreakdownSpecified: false, isExplicitAllocation: false };
      }
      if (item.val < 0) {
        return { isValid: false, error: `${item.name} cannot be negative.`, isBreakdownSpecified: false, isExplicitAllocation: false };
      }
    }
  }

  const hasTotal = totalWarrantyServices !== null && totalWarrantyServices !== undefined;
  const hasDry = dryWarrantyVisits !== null && dryWarrantyVisits !== undefined;
  const hasJet = jetWarrantyVisits !== null && jetWarrantyVisits !== undefined;
  const hasPumpdown = pumpdownWarrantyVisits !== null && pumpdownWarrantyVisits !== undefined;

  const anyBreakdownProvided = hasDry || hasJet || hasPumpdown;

  if (!hasTotal && !anyBreakdownProvided) {
    return { isValid: true, isBreakdownSpecified: false, isExplicitAllocation: false };
  }

  if (!hasTotal && anyBreakdownProvided) {
    return {
      isValid: false,
      error: 'Total Warranty Services must be specified when service-type breakdown visits are provided.',
      isBreakdownSpecified: true,
      isExplicitAllocation: true,
    };
  }

  if (hasTotal && !anyBreakdownProvided) {
    return { isValid: true, isBreakdownSpecified: false, isExplicitAllocation: false };
  }

  if (!hasDry || !hasJet || !hasPumpdown) {
    return {
      isValid: false,
      error: 'When specifying service breakdown, all visit types (Dry, Jet, Pumpdown) must be provided (enter 0 if none).',
      isBreakdownSpecified: true,
      isExplicitAllocation: true,
    };
  }

  const dry = dryWarrantyVisits!;
  const jet = jetWarrantyVisits!;
  const pumpdown = pumpdownWarrantyVisits!;
  const total = totalWarrantyServices!;

  if (dry + jet + pumpdown !== total) {
    return {
      isValid: false,
      error: `Allocation mismatch: Dry (${dry}) + Jet (${jet}) + Pumpdown (${pumpdown}) = ${dry + jet + pumpdown}, which does not match Total Warranty Services (${total}).`,
      isBreakdownSpecified: true,
      isExplicitAllocation: true,
    };
  }

  return { isValid: true, isBreakdownSpecified: true, isExplicitAllocation: true };
}
