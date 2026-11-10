/**
 * Server-side AMC Rate Card & Quotation Domain Module
 */

export type AmcPlanCategory =
  | 'SPECIAL_COMPREHENSIVE'
  | 'SEMI_COMPREHENSIVE'
  | 'ORDINARY'
  | 'PREMIUM_JACKET'
  | 'STANDALONE';

export type AmcPricingModel = 'TIERED_TONNAGE' | 'FLAT_PER_UNIT' | 'PER_SERVICE';

export interface AmcPlan {
  id: string;
  planCode: string;
  name: string;
  category: AmcPlanCategory;
  description: string | null;
  coverageSummary?: string | null;
  defaultFrequency: string;
  defaultVisitsPerYear: number;
  pricingModel: AmcPricingModel;
  rateSplitSmall?: number | null;
  rateSplitLarge?: number | null;
  rateWindowSmall?: number | null;
  rateWindowLarge?: number | null;
  rateFlat?: number | null;
  gstRatePercent: number;
  maxEquipmentAgeYears?: number | null;
  hasGasCharging: boolean;
  hasSpareParts: boolean;
  hasUnlimitedComplaints: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

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

export function getAssetAgeYears(installationDate?: string | null): number | null {
  if (!installationDate) return null;
  const install = new Date(installationDate);
  if (isNaN(install.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - install.getTime();
  const ageYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, Math.floor(ageYears * 10) / 10);
}

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
      lineNotes.push(`Flat rate: ₹${unitRate}`);
    } else {
      if (isWindow) {
        unitRate = isSmall
          ? Number(plan.rateWindowSmall ?? plan.rateSplitSmall ?? 0)
          : Number(plan.rateWindowLarge ?? plan.rateSplitLarge ?? 0);
        lineNotes.push(isSmall ? 'Window 0.8T-1.0T' : 'Window 1.5T-2.2T');
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

