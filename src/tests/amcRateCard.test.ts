import { describe, it, expect } from 'vitest';
import { calculateAmcQuote, AmcPlan } from '../domain/amcRateCard';

describe('AMC Rate Card & Dynamic Contract Quotation Engine', () => {
  const semiCompPlan: AmcPlan = {
    id: 'plan-1',
    planCode: 'SEMI-COMP-SPLIT',
    name: 'Semi-Comprehensive AMC (Non-Inverter Split)',
    category: 'SEMI_COMPREHENSIVE',
    description: '4 services, unlimited complaints, capacitor, motor, PCB repair (no gas)',
    defaultFrequency: 'QUARTERLY',
    defaultVisitsPerYear: 4,
    pricingModel: 'TIERED_TONNAGE',
    rateSplitSmall: 2999,
    rateSplitLarge: 3999,
    rateWindowSmall: null,
    rateWindowLarge: null,
    gstRatePercent: 0,
    hasGasCharging: false,
    hasSpareParts: true,
    hasUnlimitedComplaints: true,
    isActive: true,
  };

  const samc1SplitPlan: AmcPlan = {
    id: 'plan-2',
    planCode: 'SAMC-1-SPLIT',
    name: 'Special Comprehensive AMC (SAMC 1) - Split',
    category: 'SPECIAL_COMPREHENSIVE',
    description: 'Special comprehensive with gas charging for ACs under 3 years old',
    defaultFrequency: 'QUARTERLY',
    defaultVisitsPerYear: 4,
    pricingModel: 'TIERED_TONNAGE',
    rateSplitSmall: 4499,
    rateSplitLarge: 5499,
    gstRatePercent: 28,
    maxEquipmentAgeYears: 3,
    hasGasCharging: true,
    hasSpareParts: true,
    hasUnlimitedComplaints: true,
    isActive: true,
  };

  const ord3Plan: AmcPlan = {
    id: 'plan-4',
    planCode: 'ORD-3-VISIT',
    name: 'Ordinary AMC (3 Services / Visits)',
    category: 'ORDINARY',
    description: '3 services per year',
    defaultFrequency: 'FOUR_MONTHLY',
    defaultVisitsPerYear: 3,
    pricingModel: 'TIERED_TONNAGE',
    rateSplitSmall: 1500,
    rateSplitLarge: 1500,
    rateWindowSmall: 1000,
    rateWindowLarge: 1000,
    gstRatePercent: 0,
    hasGasCharging: false,
    hasSpareParts: false,
    hasUnlimitedComplaints: false,
    isActive: true,
  };

  const jacket2Plan: AmcPlan = {
    id: 'plan-7',
    planCode: 'JACKET-2-SERVICE',
    name: 'Premium Jacket AMC (2 Services)',
    category: 'PREMIUM_JACKET',
    description: '2 jacket cleanings',
    defaultFrequency: 'HALF_YEARLY',
    defaultVisitsPerYear: 2,
    pricingModel: 'FLAT_PER_UNIT',
    rateFlat: 2599,
    gstRatePercent: 0,
    hasGasCharging: false,
    hasSpareParts: false,
    hasUnlimitedComplaints: true,
    isActive: true,
  };

  it('calculates Semi-Comprehensive Split rate by tonnage tier (0.8T vs 1.5T)', () => {
    const assets = [
      { id: 'a1', assetTag: 'AC-01', acType: 'SPLIT', capacityTons: 1.0 },
      { id: 'a2', assetTag: 'AC-02', acType: 'SPLIT', capacityTons: 1.5 },
    ];

    const quote = calculateAmcQuote(semiCompPlan, assets);
    expect(quote.baseAmount).toBe(2999 + 3999); // 6998
    expect(quote.gstRatePercent).toBe(0);
    expect(quote.totalAmount).toBe(6998);
    expect(quote.lines).toHaveLength(2);
    expect(quote.lines[0].unitRate).toBe(2999);
    expect(quote.lines[1].unitRate).toBe(3999);
  });

  it('calculates SAMC 1 Split with 28% GST and flags units older than 3 years', () => {
    const fourYearsAgo = new Date();
    fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const assets = [
      { id: 'a1', assetTag: 'AC-NEW', acType: 'SPLIT', capacityTons: 1.0, installationDate: oneYearAgo.toISOString() },
      { id: 'a2', assetTag: 'AC-OLD', acType: 'SPLIT', capacityTons: 2.0, installationDate: fourYearsAgo.toISOString() },
    ];

    const quote = calculateAmcQuote(samc1SplitPlan, assets);
    expect(quote.baseAmount).toBe(4499 + 5499); // 9998
    expect(quote.gstRatePercent).toBe(28);
    expect(quote.gstAmount).toBe(Math.round(9998 * 0.28 * 100) / 100); // 2799.44
    expect(quote.totalAmount).toBe(9998 + 2799.44); // 12797.44
    expect(quote.hasIneligibleAssets).toBe(true);
    expect(quote.warnings.length).toBeGreaterThan(0);
    expect(quote.lines[1].isEligible).toBe(false);
  });

  it('calculates Ordinary AMC differentiating Split (1500) from Window (1000)', () => {
    const assets = [
      { id: 'a1', assetTag: 'AC-SPLIT', acType: 'SPLIT', capacityTons: 1.5 },
      { id: 'a2', assetTag: 'AC-WIN', acType: 'WINDOW', capacityTons: 1.5 },
    ];

    const quote = calculateAmcQuote(ord3Plan, assets);
    expect(quote.baseAmount).toBe(1500 + 1000); // 2500
    expect(quote.totalAmount).toBe(2500);
    expect(quote.lines[0].unitRate).toBe(1500);
    expect(quote.lines[1].unitRate).toBe(1000);
  });

  it('calculates Premium Jacket plan flat rate per unit regardless of tonnage', () => {
    const assets = [
      { id: 'a1', assetTag: 'AC-01', acType: 'SPLIT', capacityTons: 1.0 },
      { id: 'a2', assetTag: 'AC-02', acType: 'SPLIT', capacityTons: 2.0 },
      { id: 'a3', assetTag: 'AC-03', acType: 'WINDOW', capacityTons: 1.5 },
    ];

    const quote = calculateAmcQuote(jacket2Plan, assets);
    expect(quote.baseAmount).toBe(2599 * 3); // 7797
    expect(quote.totalAmount).toBe(7797);
  });
});

