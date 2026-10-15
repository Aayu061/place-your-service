import { describe, it, expect } from 'vitest';
import {
  calculateDefaultWarrantyEndDate,
  calculateWarrantyStatus,
  validateWarrantyAllocation,
} from '@/utils/warranty';

describe('Requirement B: 365-Day Inclusive Warranty Rule', () => {
  it('calculates default warranty end date as start date + 364 calendar days (inclusive 365 days)', () => {
    // Standard year: 13 October 2026 -> 12 October 2027 (inclusive 365 days)
    expect(calculateDefaultWarrantyEndDate('2026-10-13')).toBe('2027-10-12');
    // Start of year
    expect(calculateDefaultWarrantyEndDate('2025-01-01')).toBe('2025-12-31');
    // Mid-year
    expect(calculateDefaultWarrantyEndDate('2025-06-15')).toBe('2026-06-14');
  });

  it('handles leap years correctly using calendar day arithmetic', () => {
    // 2024 is a leap year (366 days). +364 calendar days from Jan 1:
    // Jan (31) + Feb (29) + Mar (31) + Apr (30) + May (31) + Jun (30) + Jul (31) + Aug (31) + Sep (30) + Oct (31) + Nov (30) + Dec (30) = 365 days -> Dec 30
    expect(calculateDefaultWarrantyEndDate('2024-01-01')).toBe('2024-12-30');
    // Crossing leap day in non-leap start: 2023-03-01 + 364 days -> 2024-02-28
    expect(calculateDefaultWarrantyEndDate('2023-03-01')).toBe('2024-02-28');
    // Starting on leap day: 2024-02-29 + 364 days -> 2025-02-27
    expect(calculateDefaultWarrantyEndDate('2024-02-29')).toBe('2025-02-27');
  });

  it('handles year boundaries and month end dates', () => {
    expect(calculateDefaultWarrantyEndDate('2025-12-31')).toBe('2026-12-30');
  });

  it('returns empty string for missing or invalid dates without throwing', () => {
    expect(calculateDefaultWarrantyEndDate('')).toBe('');
    expect(calculateDefaultWarrantyEndDate('not-a-date')).toBe('');
    expect(calculateDefaultWarrantyEndDate(null as unknown as string)).toBe('');
    expect(calculateDefaultWarrantyEndDate(undefined as unknown as string)).toBe('');
  });
});

describe('Requirement B3: Warranty Status Derivation', () => {
  const referenceDate = new Date('2026-10-14T12:00:00Z');

  it('returns UNDER_WARRANTY when current date is well within coverage window', () => {
    const status = calculateWarrantyStatus('2026-01-01', '2026-12-31', referenceDate);
    expect(status).toBe('UNDER_WARRANTY');
  });

  it('returns EXPIRING_SOON when remaining days <= 30', () => {
    // 2026-10-14 to 2026-11-01 is 18 days <= 30
    const status = calculateWarrantyStatus('2025-11-02', '2026-11-01', referenceDate);
    expect(status).toBe('EXPIRING_SOON');
  });

  it('returns EXPIRED when current date is past the end date', () => {
    const status = calculateWarrantyStatus('2025-01-01', '2025-12-31', referenceDate);
    expect(status).toBe('EXPIRED');
  });

  it('returns OUT_OF_WARRANTY when start date is in the future (not yet active)', () => {
    const status = calculateWarrantyStatus('2026-11-01', '2027-10-31', referenceDate);
    expect(status).toBe('OUT_OF_WARRANTY');
  });

  it('returns OUT_OF_WARRANTY when dates are missing, blank, or invalid', () => {
    expect(calculateWarrantyStatus(null, null, referenceDate)).toBe('OUT_OF_WARRANTY');
    expect(calculateWarrantyStatus('', '2026-12-31', referenceDate)).toBe('OUT_OF_WARRANTY');
    expect(calculateWarrantyStatus('2026-01-01', '', referenceDate)).toBe('OUT_OF_WARRANTY');
    expect(calculateWarrantyStatus('invalid', 'dates', referenceDate)).toBe('OUT_OF_WARRANTY');
  });

  it('returns OUT_OF_WARRANTY when end date is before start date (invalid reversed dates)', () => {
    expect(calculateWarrantyStatus('2026-12-31', '2026-01-01', referenceDate)).toBe('OUT_OF_WARRANTY');
  });
});

describe('Requirement C: Warranty Service Allocation Invariant', () => {
  it('accepts matching allocation when Dry + Jet + Pumpdown = Total', () => {
    const result = validateWarrantyAllocation({
      totalWarrantyServices: 4,
      dryWarrantyVisits: 2,
      jetWarrantyVisits: 1,
      pumpdownWarrantyVisits: 1,
    });
    expect(result.isValid).toBe(true);
    expect(result.isExplicitAllocation).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts allocation when some visit types are zero', () => {
    const result = validateWarrantyAllocation({
      totalWarrantyServices: 3,
      dryWarrantyVisits: 3,
      jetWarrantyVisits: 0,
      pumpdownWarrantyVisits: 0,
    });
    expect(result.isValid).toBe(true);
    expect(result.isExplicitAllocation).toBe(true);
  });

  it('accepts unspecified breakdown when only total is recorded', () => {
    const result = validateWarrantyAllocation({
      totalWarrantyServices: 4,
      dryWarrantyVisits: null,
      jetWarrantyVisits: null,
      pumpdownWarrantyVisits: null,
    });
    expect(result.isValid).toBe(true);
    expect(result.isExplicitAllocation).toBe(false);
  });

  it('accepts completely omitted/null warranty counts (legacy assets)', () => {
    const result = validateWarrantyAllocation({
      totalWarrantyServices: null,
      dryWarrantyVisits: null,
      jetWarrantyVisits: null,
      pumpdownWarrantyVisits: null,
    });
    expect(result.isValid).toBe(true);
    expect(result.isExplicitAllocation).toBe(false);
  });

  it('rejects mismatched allocation when sum does not equal Total', () => {
    const result = validateWarrantyAllocation({
      totalWarrantyServices: 4,
      dryWarrantyVisits: 2,
      jetWarrantyVisits: 2,
      pumpdownWarrantyVisits: 1, // sum = 5 != 4
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Allocation mismatch');
    expect(result.error).toContain('which does not match Total Warranty Services (4)');
  });

  it('rejects negative numbers', () => {
    const result = validateWarrantyAllocation({
      totalWarrantyServices: -1,
      dryWarrantyVisits: 0,
      jetWarrantyVisits: 0,
      pumpdownWarrantyVisits: 0,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('cannot be negative');
  });

  it('rejects fractional numbers', () => {
    const result = validateWarrantyAllocation({
      totalWarrantyServices: 3.5,
      dryWarrantyVisits: 2,
      jetWarrantyVisits: 1,
      pumpdownWarrantyVisits: 0.5,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('must be a whole number');
  });

  it('rejects visit breakdown provided when total is missing', () => {
    const result = validateWarrantyAllocation({
      totalWarrantyServices: null,
      dryWarrantyVisits: 2,
      jetWarrantyVisits: 1,
      pumpdownWarrantyVisits: 1,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Total Warranty Services must be specified');
  });

  it('rejects partial breakdown where some visit types are omitted while others are specified', () => {
    const result = validateWarrantyAllocation({
      totalWarrantyServices: 4,
      dryWarrantyVisits: 2,
      jetWarrantyVisits: null,
      pumpdownWarrantyVisits: null,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('all visit types (Dry, Jet, Pumpdown) must be provided');
  });

  describe('Comprehensive Allocation Permutations & Edge Cases', () => {
    it('accepts all-zero allocation when total is zero (0 = 0 + 0 + 0)', () => {
      const res = validateWarrantyAllocation({
        totalWarrantyServices: 0,
        dryWarrantyVisits: 0,
        jetWarrantyVisits: 0,
        pumpdownWarrantyVisits: 0,
      });
      expect(res.isValid).toBe(true);
      expect(res.isExplicitAllocation).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('accepts each single-type allocation (100% Dry, 100% Jet, 100% Pumpdown)', () => {
      // 100% Dry
      const dryOnly = validateWarrantyAllocation({
        totalWarrantyServices: 3,
        dryWarrantyVisits: 3,
        jetWarrantyVisits: 0,
        pumpdownWarrantyVisits: 0,
      });
      expect(dryOnly.isValid).toBe(true);

      // 100% Jet
      const jetOnly = validateWarrantyAllocation({
        totalWarrantyServices: 4,
        dryWarrantyVisits: 0,
        jetWarrantyVisits: 4,
        pumpdownWarrantyVisits: 0,
      });
      expect(jetOnly.isValid).toBe(true);

      // 100% Pumpdown
      const pumpdownOnly = validateWarrantyAllocation({
        totalWarrantyServices: 2,
        dryWarrantyVisits: 0,
        jetWarrantyVisits: 0,
        pumpdownWarrantyVisits: 2,
      });
      expect(pumpdownOnly.isValid).toBe(true);
    });

    it('accepts every two-type split combination', () => {
      // Dry + Jet split (Pumpdown = 0)
      const dryJet = validateWarrantyAllocation({
        totalWarrantyServices: 4,
        dryWarrantyVisits: 3,
        jetWarrantyVisits: 1,
        pumpdownWarrantyVisits: 0,
      });
      expect(dryJet.isValid).toBe(true);

      // Dry + Pumpdown split (Jet = 0)
      const dryPump = validateWarrantyAllocation({
        totalWarrantyServices: 5,
        dryWarrantyVisits: 2,
        jetWarrantyVisits: 0,
        pumpdownWarrantyVisits: 3,
      });
      expect(dryPump.isValid).toBe(true);

      // Jet + Pumpdown split (Dry = 0)
      const jetPump = validateWarrantyAllocation({
        totalWarrantyServices: 4,
        dryWarrantyVisits: 0,
        jetWarrantyVisits: 1,
        pumpdownWarrantyVisits: 3,
      });
      expect(jetPump.isValid).toBe(true);
    });

    it('accepts three-type allocations across various sums', () => {
      // Equal split
      const equal3 = validateWarrantyAllocation({
        totalWarrantyServices: 3,
        dryWarrantyVisits: 1,
        jetWarrantyVisits: 1,
        pumpdownWarrantyVisits: 1,
      });
      expect(equal3.isValid).toBe(true);

      // Varied split
      const varied = validateWarrantyAllocation({
        totalWarrantyServices: 6,
        dryWarrantyVisits: 3,
        jetWarrantyVisits: 2,
        pumpdownWarrantyVisits: 1,
      });
      expect(varied.isValid).toBe(true);

      // Large allocation
      const large = validateWarrantyAllocation({
        totalWarrantyServices: 10,
        dryWarrantyVisits: 5,
        jetWarrantyVisits: 3,
        pumpdownWarrantyVisits: 2,
      });
      expect(large.isValid).toBe(true);
    });

    it('handles explicit zero values for any service type', () => {
      expect(validateWarrantyAllocation({
        totalWarrantyServices: 4,
        dryWarrantyVisits: 0,
        jetWarrantyVisits: 2,
        pumpdownWarrantyVisits: 2,
      }).isValid).toBe(true);

      expect(validateWarrantyAllocation({
        totalWarrantyServices: 4,
        dryWarrantyVisits: 2,
        jetWarrantyVisits: 0,
        pumpdownWarrantyVisits: 2,
      }).isValid).toBe(true);

      expect(validateWarrantyAllocation({
        totalWarrantyServices: 4,
        dryWarrantyVisits: 2,
        jetWarrantyVisits: 2,
        pumpdownWarrantyVisits: 0,
      }).isValid).toBe(true);
    });

    it('rejects mismatched totals (both under-allocation and over-allocation)', () => {
      // Over-allocation (sum > total)
      const over = validateWarrantyAllocation({
        totalWarrantyServices: 4,
        dryWarrantyVisits: 2,
        jetWarrantyVisits: 2,
        pumpdownWarrantyVisits: 1, // sum = 5
      });
      expect(over.isValid).toBe(false);
      expect(over.error).toContain('Allocation mismatch');

      // Under-allocation (sum < total)
      const under = validateWarrantyAllocation({
        totalWarrantyServices: 4,
        dryWarrantyVisits: 1,
        jetWarrantyVisits: 1,
        pumpdownWarrantyVisits: 1, // sum = 3
      });
      expect(under.isValid).toBe(false);
      expect(under.error).toContain('Allocation mismatch');

      // Zero total with non-zero visits
      const zeroMismatch = validateWarrantyAllocation({
        totalWarrantyServices: 0,
        dryWarrantyVisits: 1,
        jetWarrantyVisits: 0,
        pumpdownWarrantyVisits: 0,
      });
      expect(zeroMismatch.isValid).toBe(false);
      expect(zeroMismatch.error).toContain('Allocation mismatch');
    });

    it('rejects negative values in any field', () => {
      expect(validateWarrantyAllocation({
        totalWarrantyServices: -1,
        dryWarrantyVisits: 0,
        jetWarrantyVisits: 0,
        pumpdownWarrantyVisits: 0,
      }).isValid).toBe(false);

      expect(validateWarrantyAllocation({
        totalWarrantyServices: 3,
        dryWarrantyVisits: -1,
        jetWarrantyVisits: 2,
        pumpdownWarrantyVisits: 2,
      }).isValid).toBe(false);

      expect(validateWarrantyAllocation({
        totalWarrantyServices: 3,
        dryWarrantyVisits: 2,
        jetWarrantyVisits: -1,
        pumpdownWarrantyVisits: 2,
      }).isValid).toBe(false);

      expect(validateWarrantyAllocation({
        totalWarrantyServices: 3,
        dryWarrantyVisits: 2,
        jetWarrantyVisits: 2,
        pumpdownWarrantyVisits: -1,
      }).isValid).toBe(false);
    });

    it('rejects decimals in any field', () => {
      expect(validateWarrantyAllocation({
        totalWarrantyServices: 3.5,
        dryWarrantyVisits: 1.5,
        jetWarrantyVisits: 1,
        pumpdownWarrantyVisits: 1,
      }).isValid).toBe(false);

      expect(validateWarrantyAllocation({
        totalWarrantyServices: 3,
        dryWarrantyVisits: 1.5,
        jetWarrantyVisits: 1.5,
        pumpdownWarrantyVisits: 0,
      }).isValid).toBe(false);

      expect(validateWarrantyAllocation({
        totalWarrantyServices: 3,
        dryWarrantyVisits: 1,
        jetWarrantyVisits: 1.25,
        pumpdownWarrantyVisits: 0.75,
      }).isValid).toBe(false);

      expect(validateWarrantyAllocation({
        totalWarrantyServices: 3,
        dryWarrantyVisits: 1,
        jetWarrantyVisits: 1,
        pumpdownWarrantyVisits: 1.001,
      }).isValid).toBe(false);
    });
  });
});
