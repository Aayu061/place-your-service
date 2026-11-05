import { describe, expect, it } from 'vitest';
import { getAmcCadenceSlotCount } from '@/utils/amcCadence';

describe('AMC cadence slot calculation', () => {
  it('counts every inclusive monthly cadence date', () => {
    expect(getAmcCadenceSlotCount('2026-01-01', '2026-12-31', 'MONTHLY')).toBe(12);
  });

  it('counts quarterly cadence dates within a short term', () => {
    expect(getAmcCadenceSlotCount('2026-01-15', '2026-06-15', 'QUARTERLY')).toBe(2);
  });

  it('clamps month-end dates safely', () => {
    expect(getAmcCadenceSlotCount('2026-01-31', '2026-03-31', 'MONTHLY')).toBe(3);
  });

  it('returns no slots for invalid dates or inverted ranges', () => {
    expect(getAmcCadenceSlotCount('2026-02-30', '2026-12-31', 'QUARTERLY')).toBe(0);
    expect(getAmcCadenceSlotCount('2026-12-31', '2026-01-01', 'QUARTERLY')).toBe(0);
  });
});
