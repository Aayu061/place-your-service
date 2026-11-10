import { apiClient } from './apiClient';

export interface GstinLookupResult {
  gstin: string;
  isValid: boolean;
  state: string;
  entityType: string;
  legalName?: string;
  tradeName?: string;
  principalAddress?: string;
  status?: string;
}

export const complianceApi = {
  lookupGstin: async (gstin: string): Promise<GstinLookupResult> => {
    const { data } = await apiClient.post('/compliance/gstin/lookup', { gstin });
    return data;
  },
};

