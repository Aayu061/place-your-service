/**
 * AMC Rate Card & Dynamic Contract Quotation Domain Module
 *
 * Implements authoritative pricing logic and eligibility checks
 * from the Extreme Sales & Services official AMC Contract Rate Chart.
 */

import type { AmcPlan } from './types';

export type { AmcPlan };

export type AmcPlanCategory =
  | 'SPECIAL_COMPREHENSIVE'
  | 'SEMI_COMPREHENSIVE'
  | 'ORDINARY'
  | 'PREMIUM_JACKET'
  | 'STANDALONE';

export type AmcPricingModel = 'TIERED_TONNAGE' | 'FLAT_PER_UNIT' | 'PER_SERVICE';

export interface CoveredAssetContext {
  id: string;
  assetTag?: string;
  acType: string;
  capacityTons?: number | null;
  installationDate?: string | null;
}

export interface AssetQuoteLine {
  assetId: string;
  assetTag: string;
  acType: string;
  capacityTons: number;
  tier: 'SMALL' | 'LARGE' | 'FLAT' | 'NOT_APPLICABLE';
  unitRate: number;
  isEligible: boolean;
  notes?: string;
}

export interface AmcQuoteResult {
  baseAmount: number;
  gstRatePercent: number;
  gstAmount: number;
  totalAmount: number;
  lines: AssetQuoteLine[];
  warnings: string[];
  hasIneligibleAssets: boolean;
}

/**
 * Calculates equipment age in years from installationDate
 */
export function getAssetAgeYears(installationDate?: string | null): number | null {
  if (!installationDate) return null;
  const install = new Date(installationDate);
  if (isNaN(install.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - install.getTime();
  const ageYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, Math.floor(ageYears * 10) / 10);
}

/**
 * Calculates deterministic AMC quotation based on selected plan and covered assets
 */
export function calculateAmcQuote(
  plan: AmcPlan,
  coveredAssets: CoveredAssetContext[],
  options?: { customGstPercent?: number }
): AmcQuoteResult {
  const lines: AssetQuoteLine[] = [];
  const warnings: string[] = [];
  let baseAmount = 0;
  let hasIneligibleAssets = false;

  for (const asset of coveredAssets) {
    const rawType = (asset.acType || '').toUpperCase();
    const isWindow = rawType.includes('WINDOW');
    const tons = Number(asset.capacityTons) || 1.5;
    const isSmall = tons <= 1.0;
    const assetTag = asset.assetTag || asset.id.slice(0, 8);

    let unitRate = 0;
    let tier: 'SMALL' | 'LARGE' | 'FLAT' | 'NOT_APPLICABLE' = isSmall ? 'SMALL' : 'LARGE';
    let isEligible = true;
    const lineNotes: string[] = [];

    // Equipment Age Validation for Special Comprehensive (SAMC)
    if (plan.maxEquipmentAgeYears) {
      const age = getAssetAgeYears(asset.installationDate);
      if (age !== null && age > plan.maxEquipmentAgeYears) {
        isEligible = false;
        hasIneligibleAssets = true;
        const warn = `Asset ${assetTag} is ${age} years old (exceeds ${plan.maxEquipmentAgeYears}-year age limit for ${plan.name}).`;
        warnings.push(warn);
        lineNotes.push(`Age ${age} yrs exceeds ${plan.maxEquipmentAgeYears} yr limit`);
      }
    }

    if (plan.pricingModel === 'FLAT_PER_UNIT') {
      tier = 'FLAT';
      unitRate = Number(plan.rateFlat) || 0;
      lineNotes.push(`Flat rate: ₹${unitRate.toLocaleString('en-IN')}`);
    } else {
      // Tiered Tonnage Pricing
      if (isWindow) {
        unitRate = isSmall
          ? Number(plan.rateWindowSmall ?? plan.rateSplitSmall ?? 0)
          : Number(plan.rateWindowLarge ?? plan.rateSplitLarge ?? 0);

        if (plan.rateWindowSmall === null && plan.rateWindowLarge === null) {
          lineNotes.push('Window rate mapped from split base');
        } else {
          lineNotes.push(isSmall ? 'Window 0.8T-1.0T' : 'Window 1.5T-2.2T');
        }
      } else {
        unitRate = isSmall
          ? Number(plan.rateSplitSmall ?? plan.rateWindowSmall ?? 0)
          : Number(plan.rateSplitLarge ?? plan.rateWindowLarge ?? 0);
        lineNotes.push(isSmall ? 'Split 0.8T-1.0T' : 'Split 1.5T-2.2T');
      }
    }

    baseAmount += unitRate;
    lines.push({
      assetId: asset.id,
      assetTag,
      acType: asset.acType,
      capacityTons: tons,
      tier,
      unitRate,
      isEligible,
      notes: lineNotes.join(' • '),
    });
  }

  // GST calculation
  const gstRatePercent = options?.customGstPercent !== undefined
    ? options.customGstPercent
    : Number(plan.gstRatePercent) || 0;

  const gstAmount = Math.round((baseAmount * gstRatePercent) / 100 * 100) / 100;
  const totalAmount = Math.round((baseAmount + gstAmount) * 100) / 100;

  return {
    baseAmount,
    gstRatePercent,
    gstAmount,
    totalAmount,
    lines,
    warnings,
    hasIneligibleAssets,
  };
}

/**
 * Authoritative Extreme Sales & Services Official AMC Rate Chart Plans (8 AMC Plans + 2 Standalone Services)
 * Formatted directly from ESS Contract Rate Chart_New Address.pdf.
 * Provides immediate resilience for offline, initial mount, and server cold starts.
 */
export const OFFICIAL_ESS_RATE_CHART_PLANS: AmcPlan[] = [
  {
    id: '3238949c-d021-4f9a-985e-64e0297fe1e2',
    planCode: 'SEMI-COMP-SPLIT',
    name: 'Semi-Comprehensive AMC (Non-Inverter Split)',
    category: 'SEMI_COMPREHENSIVE',
    description:
      'Includes 4 routine services, unlimited complaints attend, capacitor replacement, motor winding, and PCB repair (refrigerant gas charging excluded).',
    coverageSummary: '4 Services, Unlimited Complaints, Capacitor, Motor Winding & PCB Repair (No Gas)',
    defaultFrequency: 'QUARTERLY',
    defaultVisitsPerYear: 4,
    pricingModel: 'TIERED_TONNAGE',
    rateSplitSmall: 2999,
    rateSplitLarge: 3999,
    rateWindowSmall: null,
    rateWindowLarge: null,
    rateFlat: null,
    gstRatePercent: 0,
    maxEquipmentAgeYears: null,
    hasGasCharging: false,
    hasSpareParts: true,
    hasUnlimitedComplaints: true,
    isActive: true,
  },
  {
    id: 'ad54ae16-ad35-4c54-9238-95182baf8ea8',
    planCode: 'SAMC-1-SPLIT',
    name: 'Special Comprehensive AMC (SAMC 1) - Split',
    category: 'SPECIAL_COMPREHENSIVE',
    description:
      'Special comprehensive protection for Split ACs under 3 years old. Includes 4 services, unlimited complaints, capacitor, PCB repair, motor winding, and gas charging.',
    coverageSummary: '4 Services, Unlimited Complaints, Capacitor, PCB Repair, Motor Winding & Gas Charging Included',
    defaultFrequency: 'QUARTERLY',
    defaultVisitsPerYear: 4,
    pricingModel: 'TIERED_TONNAGE',
    rateSplitSmall: 4499,
    rateSplitLarge: 5499,
    rateWindowSmall: null,
    rateWindowLarge: null,
    rateFlat: null,
    gstRatePercent: 28,
    maxEquipmentAgeYears: 3,
    hasGasCharging: true,
    hasSpareParts: true,
    hasUnlimitedComplaints: true,
    isActive: true,
  },
  {
    id: '712a7cb0-3144-4d01-81e2-8918d2f6375e',
    planCode: 'SAMC-2-WINDOW',
    name: 'Special Comprehensive AMC (SAMC 2) - Window',
    category: 'SPECIAL_COMPREHENSIVE',
    description:
      'Special comprehensive protection for Window ACs under 3 years old. Includes 4 services, unlimited complaints, capacitor, PCB repair, motor winding, and gas charging.',
    coverageSummary: '4 Services, Unlimited Complaints, Capacitor, PCB Repair, Motor Winding & Gas Charging Included',
    defaultFrequency: 'QUARTERLY',
    defaultVisitsPerYear: 4,
    pricingModel: 'TIERED_TONNAGE',
    rateSplitSmall: null,
    rateSplitLarge: null,
    rateWindowSmall: 3499,
    rateWindowLarge: 4499,
    rateFlat: null,
    gstRatePercent: 28,
    maxEquipmentAgeYears: 3,
    hasGasCharging: true,
    hasSpareParts: true,
    hasUnlimitedComplaints: true,
    isActive: true,
  },
  {
    id: '4b597950-78ee-49c5-8d1a-a7b1c868ad5a',
    planCode: 'ORD-3-VISIT',
    name: 'Ordinary AMC (3 Services / Visits)',
    category: 'ORDINARY',
    description:
      'Standard non-comprehensive routine maintenance for Split & Window units with 3 scheduled preventive visits per year.',
    coverageSummary: '3 Routine Preventive Services (Parts & Gas Extra)',
    defaultFrequency: 'FOUR_MONTHLY',
    defaultVisitsPerYear: 3,
    pricingModel: 'TIERED_TONNAGE',
    rateSplitSmall: 1499,
    rateSplitLarge: 1799,
    rateWindowSmall: 1099,
    rateWindowLarge: 1299,
    rateFlat: null,
    gstRatePercent: 0,
    maxEquipmentAgeYears: null,
    hasGasCharging: false,
    hasSpareParts: false,
    hasUnlimitedComplaints: false,
    isActive: true,
  },
  {
    id: '162c13b4-9a4c-4a7c-bcfe-d5e88a069467',
    planCode: 'ORD-4-VISIT',
    name: 'Ordinary AMC (4 Services + Complaints)',
    category: 'ORDINARY',
    description:
      'Comprehensive quarterly servicing package with 4 scheduled PM visits and unlimited complaint attendance throughout the contract term.',
    coverageSummary: '4 Routine Preventive Services & Unlimited Breakdown Complaint Attendance',
    defaultFrequency: 'QUARTERLY',
    defaultVisitsPerYear: 4,
    pricingModel: 'TIERED_TONNAGE',
    rateSplitSmall: 1899,
    rateSplitLarge: 2199,
    rateWindowSmall: 1399,
    rateWindowLarge: 1699,
    rateFlat: null,
    gstRatePercent: 0,
    maxEquipmentAgeYears: null,
    hasGasCharging: false,
    hasSpareParts: false,
    hasUnlimitedComplaints: true,
    isActive: true,
  },
  {
    id: '52e57dd7-5cdb-41bb-ab46-59a9753eaa1e',
    planCode: 'ORD-6-VISIT',
    name: 'Ordinary AMC (6 Services / Bi-Monthly)',
    category: 'ORDINARY',
    description:
      'High-frequency preventive care with bi-monthly scheduled visits (6 visits per year) and unlimited breakdown complaint attendance.',
    coverageSummary: '6 Routine Preventive Services (Bi-Monthly) & Unlimited Complaints',
    defaultFrequency: 'BI_MONTHLY',
    defaultVisitsPerYear: 6,
    pricingModel: 'TIERED_TONNAGE',
    rateSplitSmall: 2699,
    rateSplitLarge: 2999,
    rateWindowSmall: 1999,
    rateWindowLarge: 2399,
    rateFlat: null,
    gstRatePercent: 0,
    maxEquipmentAgeYears: null,
    hasGasCharging: false,
    hasSpareParts: false,
    hasUnlimitedComplaints: true,
    isActive: true,
  },
  {
    id: '212ca084-b094-43ba-b89c-48bfdbe7cd9f',
    planCode: 'JACKET-2-SERVICE',
    name: 'Premium Jacket AMC (2 Services)',
    category: 'PREMIUM_JACKET',
    description:
      'Deep clean jacket wash preventive care. Includes 2 jacket chemical cleans and unlimited breakdown complaint attendance.',
    coverageSummary: '2 Jacket Deep Cleaning Services & Unlimited Complaints',
    defaultFrequency: 'HALF_YEARLY',
    defaultVisitsPerYear: 2,
    pricingModel: 'FLAT_PER_UNIT',
    rateSplitSmall: null,
    rateSplitLarge: null,
    rateWindowSmall: null,
    rateWindowLarge: null,
    rateFlat: 2599,
    gstRatePercent: 0,
    maxEquipmentAgeYears: null,
    hasGasCharging: false,
    hasSpareParts: false,
    hasUnlimitedComplaints: true,
    isActive: true,
  },
  {
    id: '1f33c224-7ef5-418d-acf1-963a6536d39a',
    planCode: 'JACKET-3-SERVICE',
    name: 'Premium Jacket AMC (3 Services)',
    category: 'PREMIUM_JACKET',
    description:
      'Maximum preventive care with 3 jacket deep chemical wash services per year and unlimited complaint attendance.',
    coverageSummary: '3 Jacket Deep Cleaning Services & Unlimited Complaints',
    defaultFrequency: 'FOUR_MONTHLY',
    defaultVisitsPerYear: 3,
    pricingModel: 'FLAT_PER_UNIT',
    rateSplitSmall: null,
    rateSplitLarge: null,
    rateWindowSmall: null,
    rateWindowLarge: null,
    rateFlat: 3599,
    gstRatePercent: 0,
    maxEquipmentAgeYears: null,
    hasGasCharging: false,
    hasSpareParts: false,
    hasUnlimitedComplaints: true,
    isActive: true,
  },
  {
    id: '3dd95c8b-45e0-4be9-81d9-3c8da914f78d',
    planCode: 'STANDALONE-PUMP',
    name: 'Pump Down Service (Overhaul)',
    category: 'STANDALONE',
    description:
      'Refrigerant gas recovery, system pump down, and indoor/outdoor unit dismounting or relocation (gas top-up extra if required).',
    coverageSummary: 'Pump Down Refrigerant Recovery Service',
    defaultFrequency: 'ON_DEMAND',
    defaultVisitsPerYear: 1,
    pricingModel: 'FLAT_PER_UNIT',
    rateSplitSmall: null,
    rateSplitLarge: null,
    rateWindowSmall: null,
    rateWindowLarge: null,
    rateFlat: 1299,
    gstRatePercent: 0,
    maxEquipmentAgeYears: null,
    hasGasCharging: false,
    hasSpareParts: false,
    hasUnlimitedComplaints: false,
    isActive: true,
  },
  {
    id: 'd35a8366-8456-4fa8-91ae-a9663041f775',
    planCode: 'STANDALONE-JET',
    name: 'Jet Wash Service (High-Pressure Deep Clean)',
    category: 'STANDALONE',
    description: 'High-pressure motorized wet pump coil wash for deep dirt and grease elimination.',
    coverageSummary: 'High-Pressure Jet Wash Deep Clean Service',
    defaultFrequency: 'ON_DEMAND',
    defaultVisitsPerYear: 1,
    pricingModel: 'FLAT_PER_UNIT',
    rateSplitSmall: null,
    rateSplitLarge: null,
    rateWindowSmall: null,
    rateWindowLarge: null,
    rateFlat: 1199,
    gstRatePercent: 0,
    maxEquipmentAgeYears: null,
    hasGasCharging: false,
    hasSpareParts: false,
    hasUnlimitedComplaints: false,
    isActive: true,
  },
];

