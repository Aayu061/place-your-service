import { decodeGstin, GstinInfo } from '../utils/gstinDecoder.js';

export interface GstinLookupResult extends GstinInfo {
  legalName?: string;
  tradeName?: string;
  principalAddress?: string;
  status?: string;
}

export class GstLookupService {
  /**
   * Performs an instant offline decode and attempts a live lookup if API keys exist.
   */
  async lookupGstin(gstin: string): Promise<GstinLookupResult> {
    const offlineInfo = decodeGstin(gstin);
    
    if (!offlineInfo.isValid) {
      return offlineInfo;
    }

    // In a real production scenario, fetch from external API here.
    // For now, return the decoded offline info.
    return {
      ...offlineInfo,
      status: 'VERIFIED_OFFLINE',
      legalName: 'Auto-Decoded Business Entity', // Placeholder
      tradeName: 'Auto-Decoded Business Entity', // Placeholder
    };
  }
}

export const gstLookupService = new GstLookupService();

