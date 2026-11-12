import { decodeGstin, GstinInfo } from '../utils/gstinDecoder.js';

export interface GstinLookupResult extends GstinInfo {
  legalName?: string;
  tradeName?: string;
  principalAddress?: string;
  status?: string;
  verificationSource?: 'LOCAL_DECODE' | 'LIVE_API';
}

export class GstLookupService {
  /**
   * Performs an instant offline decode of the 15-character GSTIN format and checksum.
   */
  async lookupGstin(gstin: string): Promise<GstinLookupResult> {
    const offlineInfo = decodeGstin(gstin);
    
    if (!offlineInfo.isValid) {
      return {
        ...offlineInfo,
        verificationSource: 'LOCAL_DECODE',
      };
    }

    return {
      ...offlineInfo,
      status: 'LOCAL_FORMAT_DECODED',
      verificationSource: 'LOCAL_DECODE',
      legalName: '',
      tradeName: '',
    };
  }
}

export const gstLookupService = new GstLookupService();

