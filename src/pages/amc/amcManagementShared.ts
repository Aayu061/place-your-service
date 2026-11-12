import { AcAsset, AmcContract, AmcPlan, Customer, PlannedServiceType } from '@/domain/types';
import { WizardStepItem } from '@/components/ui/ModalStepWizard';
import { getAssetAgeYears } from '@/domain/amcRateCard';

export const AMC_WIZARD_STEPS: WizardStepItem[] = [
  { id: 'terms', label: '1. Commercial Terms', description: 'Customer & billing' },
  { id: 'allocation', label: '2. PM Allocation', description: 'Dry / Jet visits' },
  { id: 'assets', label: '3. Covered Equipment', description: 'Protected units' },
];

export interface AmcContractsApiResponse {
  contracts: AmcContract[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AmcMetricsApiResponse {
  metrics: {
    activeContracts: number;
    expiringSoonContracts: number;
    expiredContracts: number;
    coveredAssetsCount: number;
    upcomingPmCount: number;
    overduePmCount: number;
  };
}

export interface AmcPlansApiResponse {
  plans: AmcPlan[];
}

export interface AmcSingleApiResponse {
  contract: AmcContract;
}

export interface PmSchedulesApiResponse {
  schedules: Array<{
    id: string;
    scheduleNumber: string;
    amcId: string | null;
    assetId: string;
    assetTag?: string | null;
    brand?: string | null;
    modelNumber?: string | null;
    siteName?: string | null;
    roomLocation?: string | null;
    scheduledDate: string;
    visitNumber: number | null;
    status: string;
    plannedServiceType?: PlannedServiceType | null;
    isSystemGenerated: boolean;
    notes: string | null;
  }>;
}

export interface PmGenerationResultResponse {
  contractId: string;
  contractNumber: string;
  generatedCount: number;
  existingCount: number;
  skippedCount: number;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  generatedDates: string[];
}

export interface CustomersApiResponse {
  customers: Customer[];
}

export interface SitesApiResponse {
  sites: Array<{ id: string; siteName: string; isPrimary: boolean }>;
}

export interface AssetsApiResponse {
  assets: AcAsset[];
}

export interface AmcManagementProps {
  onNavigate?: (page: string) => void;
  preselectedCustomerId?: string;
}

export function isAssetCompatible(asset: AcAsset, plan?: AmcPlan | null): { compatible: boolean; reason?: string } {
  if (!plan) return { compatible: true };
  const isSplitOnly = plan.planCode === 'SEMI-COMP-SPLIT' || plan.planCode === 'SAMC-1-SPLIT';
  const isWindowOnly = plan.planCode === 'SAMC-2-WINDOW';
  const isWindow = (asset.acType || '').toUpperCase().includes('WINDOW');

  if (isSplitOnly && isWindow) {
    return { compatible: false, reason: 'Split AC only' };
  }
  if (isWindowOnly && !isWindow) {
    return { compatible: false, reason: 'Window AC only' };
  }
  if (plan.maxEquipmentAgeYears) {
    const age = getAssetAgeYears(asset.installationDate);
    if (age !== null && age > plan.maxEquipmentAgeYears) {
      return { compatible: false, reason: `Age ${age}y > ${plan.maxEquipmentAgeYears}y max` };
    }
  }
  return { compatible: true };
}

