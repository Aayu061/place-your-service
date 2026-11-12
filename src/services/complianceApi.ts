import { apiClient } from '@/services/api/client';

export interface GstinLookupResult {
  gstin: string;
  isValid: boolean;
  state: string;
  entityType: string;
  legalName?: string;
  tradeName?: string;
  principalAddress?: string;
  status?: string;
  verificationSource?: string;
}

export const complianceApi = {
  lookupGstin: async (gstin: string): Promise<GstinLookupResult> => {
    return apiClient.post<GstinLookupResult>('/compliance/gstin/lookup', { gstin });
  },
};

