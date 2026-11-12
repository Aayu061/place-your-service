import { ServiceSchedule, ServiceVisitOutcome, ServiceVisitReport } from '@/domain/types';

export interface ServiceVisitReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule?: ServiceSchedule | null;
  initialReport?: ServiceVisitReport | null;
  mode?: 'create' | 'edit';
  onSuccess: () => void;
}

export interface AssetReportState {
  assetId: string;
  assetTag: string;
  brand: string;
  modelNumber: string;
  roomLocation: string;
  faultReported: string;
  diagnosisFindings: string;
  workPerformed: string;
  assetOutcome: ServiceVisitOutcome;
  finalCondition: string;
  refrigerantAdded: boolean;
  refrigerantQtyKg: string;
  notes: string;
}

export interface PartItemState {
  id: string;
  assetId?: string;
  itemName: string;
  partNumber: string;
  quantity: number;
  reason: string;
  acCondition: string;
  isRevisitRequired: boolean;
}

export interface RepairItemState {
  id: string;
  assetId?: string;
  itemName: string;
  reason: string;
  diagnosis: string;
  workCompleted: string;
  isApprovalRequired: boolean;
  isSpecialistRequired: boolean;
  isRevisitRequired: boolean;
}

export type FormStatus = 'IDLE' | 'VALIDATING' | 'SUBMITTING' | 'SUCCESS' | 'ERROR';

