import { describe, it, expect } from 'vitest';
import {
  calculateAmcScheduleDates,
  addMonthsSafe,
} from '@/domain/amcCalculator';

describe('AMC Schedule Generation Algorithm (DOCS/RULES.md §7 & TRD.md §10)', () => {
  it('correctly calculates quarterly visits over a 1-year contract', () => {
    const start = new Date('2026-04-01');
    const end = new Date('2027-03-31');
    const dates = calculateAmcScheduleDates(start, end, 'QUARTERLY');

    // Quarterly visits over 12 months: month 0, month 3, month 6, month 9
    expect(dates).toHaveLength(4);
    expect(dates[0]).toBe('2026-04-01');
    expect(dates[1]).toBe('2026-07-01');
    expect(dates[2]).toBe('2026-10-01');
    expect(dates[3]).toBe('2027-01-01');
  });

  it('correctly calculates half-yearly visits', () => {
    const start = new Date('2026-01-01');
    const end = new Date('2026-12-31');
    const dates = calculateAmcScheduleDates(start, end, 'HALF_YEARLY');

    expect(dates).toHaveLength(2);
    expect(dates[0]).toBe('2026-01-01');
    expect(dates[1]).toBe('2026-07-01');
  });

  it('safely handles month length edge cases (e.g. Jan 31 -> Feb 28)', () => {
    const jan31 = new Date(2026, 0, 31); // Jan 31, 2026
    const nextMonth = addMonthsSafe(jan31, 1);

    expect(nextMonth.getMonth()).toBe(1); // February
    expect(nextMonth.getDate()).toBe(28); // 2026 is not a leap year, so Feb 28
  });

  it('throws an error if end date precedes start date', () => {
    const start = new Date('2026-12-01');
    const end = new Date('2026-01-01');

    expect(() => calculateAmcScheduleDates(start, end, 'MONTHLY')).toThrow(
      'AMC contract end date cannot precede start date.'
    );
  });
});
