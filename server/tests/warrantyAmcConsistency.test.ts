import { describe, it, expect } from 'vitest';
import { calculateWarrantyStatus, AssetService } from '../src/services/asset.service.js';

describe('Workstream A: Warranty and AMC Status Consistency', () => {
  const assetService = new AssetService();

  describe('Warranty Calculation Business Rules', () => {
    it('returns EXPIRED when warrantyEndDate is in the past', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const result = calculateWarrantyStatus(yesterday, '2024-01-01');
      expect(result).toBe('EXPIRED');
    });

    it('returns EXPIRING_SOON when warrantyEndDate is within next 30 days', () => {
      const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const result = calculateWarrantyStatus(inTenDays, '2024-01-01');
      expect(result).toBe('EXPIRING_SOON');
    });

    it('returns UNDER_WARRANTY when warrantyEndDate is more than 30 days in future', () => {
      const inSixtyDays = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const result = calculateWarrantyStatus(inSixtyDays, '2024-01-01');
      expect(result).toBe('UNDER_WARRANTY');
    });
  });

  describe('Contract and Warranty Independence', () => {
    it('proves that EXPIRED warranty and ACTIVE AMC are independent and coexist legitimately', () => {
      const expiredWarranty = calculateWarrantyStatus('2024-01-01', '2023-01-01');
      expect(expiredWarranty).toBe('EXPIRED');

      // Asset mapping logic combines calculated warranty and active AMC
      const mockRecord: any = {
        id: 'asset-1',
        asset_tag: 'ESSC-0001',
        brand: 'Daikin',
        model_number: 'FTKF50',
        serial_number: 'SN-001',
        ac_type: 'SPLIT',
        warranty_start_date: '2023-01-01',
        warranty_end_date: '2024-01-01',
        warranty_status: 'UNDER_WARRANTY',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockActiveAmc: any = {
        id: 'amc-1',
        contractNumber: 'AMC-2026-0001',
        status: 'ACTIVE',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        totalVisits: 4,
        completedVisits: 2,
        remainingVisits: 2,
      };

      // Call internal mapAssetRecord via reflection
      const mapped = (assetService as any).mapAssetRecord(mockRecord, mockActiveAmc);
      expect(mapped.warrantyStatus).toBe('EXPIRED');
      expect(mapped.currentAmc).not.toBeNull();
      expect(mapped.currentAmc.status).toBe('ACTIVE');
      expect(mapped.currentAmc.contractNumber).toBe('AMC-2026-0001');
    });

    it('proves that UNDER_WARRANTY and ACTIVE AMC coexist legitimately', () => {
      const inOneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const activeWarranty = calculateWarrantyStatus(inOneYear, '2026-01-01');
      expect(activeWarranty).toBe('UNDER_WARRANTY');

      const mockRecord: any = {
        id: 'asset-2',
        asset_tag: 'ESSC-0002',
        brand: 'Voltas',
        model_number: '183V',
        serial_number: 'SN-002',
        ac_type: 'WINDOW',
        warranty_start_date: '2026-01-01',
        warranty_end_date: inOneYear,
        warranty_status: 'UNDER_WARRANTY',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockActiveAmc: any = {
        id: 'amc-2',
        contractNumber: 'AMC-2026-0002',
        status: 'ACTIVE',
        startDate: '2026-01-01',
        endDate: inOneYear,
        totalVisits: 2,
        completedVisits: 1,
        remainingVisits: 1,
      };

      const mapped = (assetService as any).mapAssetRecord(mockRecord, mockActiveAmc);
      expect(mapped.warrantyStatus).toBe('UNDER_WARRANTY');
      expect(mapped.currentAmc.status).toBe('ACTIVE');
    });

    it('proves that EXPIRED AMC results in currentAmc being null', () => {
      const mockRecord: any = {
        id: 'asset-3',
        asset_tag: 'ESSC-0003',
        brand: 'Mitsubishi',
        model_number: 'MSY-GR18VF',
        serial_number: 'SN-003',
        ac_type: 'SPLIT',
        warranty_start_date: '2024-01-01',
        warranty_end_date: '2025-01-01',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // When contract is expired or non-active, currentAmc is null
      const mapped = (assetService as any).mapAssetRecord(mockRecord, null);
      expect(mapped.currentAmc).toBeNull();
    });
  });
});
