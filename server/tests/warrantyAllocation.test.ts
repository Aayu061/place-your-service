import { describe, it, expect } from 'vitest';
import {
  calculateDefaultWarrantyEndDate,
  calculateWarrantyStatus,
  validateWarrantyAllocation,
} from '../src/utils/warranty.js';
import { createAcAssetSchema, updateAcAssetSchema } from '../src/validators/asset.validator.js';
import { AssetService } from '../src/services/asset.service.js';

describe('Server-Side Warranty Calculation & 365-Day Inclusive Rule', () => {
  it('calculates default warranty end date as start date + 364 calendar days (inclusive 365 days)', () => {
    // 13 October 2026 -> 12 October 2027
    expect(calculateDefaultWarrantyEndDate('2026-10-13')).toBe('2027-10-12');
    expect(calculateDefaultWarrantyEndDate('2025-01-01')).toBe('2025-12-31');
    expect(calculateDefaultWarrantyEndDate('2024-01-01')).toBe('2024-12-30'); // Leap year
    expect(calculateDefaultWarrantyEndDate('2024-02-29')).toBe('2025-02-27');
  });

  it('rejects invalid or blank date strings gracefully', () => {
    expect(calculateDefaultWarrantyEndDate('')).toBe('');
    expect(calculateDefaultWarrantyEndDate('not-a-date')).toBe('');
    expect(calculateDefaultWarrantyEndDate(null as unknown as string)).toBe('');
  });
});

describe('Server-Side Warranty Allocation Invariant (Requirement C1)', () => {
  it('accepts matching allocation where Dry + Jet + Pumpdown = Total', () => {
    const res = validateWarrantyAllocation({
      totalWarrantyServices: 4,
      dryWarrantyVisits: 2,
      jetWarrantyVisits: 1,
      pumpdownWarrantyVisits: 1,
    });
    expect(res.isValid).toBe(true);
    expect(res.isBreakdownSpecified).toBe(true);
    expect(res.isExplicitAllocation).toBe(true);
  });

  it('accepts allocation with explicit zero visits for some service types', () => {
    const res = validateWarrantyAllocation({
      totalWarrantyServices: 2,
      dryWarrantyVisits: 2,
      jetWarrantyVisits: 0,
      pumpdownWarrantyVisits: 0,
    });
    expect(res.isValid).toBe(true);
    expect(res.isBreakdownSpecified).toBe(true);
    expect(res.isExplicitAllocation).toBe(true);
  });

  it('accepts unspecified breakdown when manufacturer provides only Total Warranty Services', () => {
    const res = validateWarrantyAllocation({
      totalWarrantyServices: 4,
      dryWarrantyVisits: null,
      jetWarrantyVisits: null,
      pumpdownWarrantyVisits: null,
    });
    expect(res.isValid).toBe(true);
    expect(res.isBreakdownSpecified).toBe(false);
    expect(res.isExplicitAllocation).toBe(false);
  });

  it('accepts legacy records where all allocation fields are null/omitted', () => {
    const res = validateWarrantyAllocation({
      totalWarrantyServices: null,
      dryWarrantyVisits: null,
      jetWarrantyVisits: null,
      pumpdownWarrantyVisits: null,
    });
    expect(res.isValid).toBe(true);
    expect(res.isBreakdownSpecified).toBe(false);
  });

  it('rejects allocation mismatch with clear error message', () => {
    const res = validateWarrantyAllocation({
      totalWarrantyServices: 4,
      dryWarrantyVisits: 2,
      jetWarrantyVisits: 2,
      pumpdownWarrantyVisits: 1, // sum = 5 != 4
    });
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Allocation mismatch');
    expect(res.error).toContain('which does not match Total Warranty Services (4)');
  });

  it('rejects negative service counts', () => {
    const res = validateWarrantyAllocation({
      totalWarrantyServices: -1,
      dryWarrantyVisits: 0,
      jetWarrantyVisits: 0,
      pumpdownWarrantyVisits: 0,
    });
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('cannot be negative');
  });

  it('rejects fractional service counts', () => {
    const res = validateWarrantyAllocation({
      totalWarrantyServices: 3.5,
      dryWarrantyVisits: 2,
      jetWarrantyVisits: 1,
      pumpdownWarrantyVisits: 0.5,
    });
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('must be a whole number');
  });

  it('rejects breakdown visits when total warranty services is omitted', () => {
    const res = validateWarrantyAllocation({
      totalWarrantyServices: null,
      dryWarrantyVisits: 2,
      jetWarrantyVisits: 1,
      pumpdownWarrantyVisits: 1,
    });
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Total Warranty Services must be specified');
  });
});

describe('Zod Asset Schema Warranty Allocation Validation', () => {
  const baseValidPayload = {
    brand: 'Daikin',
    modelNumber: 'FTKF50',
    serialNumber: 'SN-12345',
    acType: 'SPLIT',
    purchaseDate: '2026-10-13',
    installationDate: '2026-10-13',
    warrantyStartDate: '2026-10-13',
    warrantyEndDate: '2027-10-12',
  };

  it('accepts creation payload with matching allocation', () => {
    const parsed = createAcAssetSchema.body.safeParse({
      ...baseValidPayload,
      totalWarrantyServices: 4,
      dryWarrantyVisits: 2,
      jetWarrantyVisits: 1,
      pumpdownWarrantyVisits: 1,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.totalWarrantyServices).toBe(4);
      expect(parsed.data.dryWarrantyVisits).toBe(2);
      expect(parsed.data.jetWarrantyVisits).toBe(1);
      expect(parsed.data.pumpdownWarrantyVisits).toBe(1);
    }
  });

  it('accepts creation payload with total services only (unspecified breakdown)', () => {
    const parsed = createAcAssetSchema.body.safeParse({
      ...baseValidPayload,
      totalWarrantyServices: 3,
      dryWarrantyVisits: null,
      jetWarrantyVisits: null,
      pumpdownWarrantyVisits: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.totalWarrantyServices).toBe(3);
      expect(parsed.data.dryWarrantyVisits).toBeNull();
    }
  });

  it('accepts creation payload with omitted allocation fields (backward compatibility)', () => {
    const parsed = createAcAssetSchema.body.safeParse({
      ...baseValidPayload,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects creation payload with mismatched allocation', () => {
    const parsed = createAcAssetSchema.body.safeParse({
      ...baseValidPayload,
      totalWarrantyServices: 4,
      dryWarrantyVisits: 1,
      jetWarrantyVisits: 1,
      pumpdownWarrantyVisits: 1, // sum = 3 != 4
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      expect(issue.message).toContain('Allocation mismatch');
    }
  });

  it('rejects update payload with negative service counts', () => {
    const parsed = updateAcAssetSchema.body.safeParse({
      totalWarrantyServices: -2,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      expect(issue.message).toContain('cannot be negative');
    }
  });
});

describe('Asset Service Record Mapping & AMC Isolation', () => {
  const assetService = new AssetService();

  it('maps database allocation fields to AcAssetResponse correctly', () => {
    const mockDbRecord: any = {
      id: 'asset-test-1',
      asset_tag: 'ESSC-2026-0001',
      site_id: 'site-1',
      customer_id: 'cust-1',
      brand: 'Mitsubishi',
      model_number: 'MSY-GR18',
      serial_number: 'SN-MITS-01',
      indoor_serial_number: 'IDU-01',
      outdoor_serial_number: 'ODU-01',
      ac_type: 'SPLIT',
      purchase_date: '2026-10-13',
      installation_date: '2026-10-13',
      warranty_start_date: '2026-10-13',
      warranty_end_date: '2027-10-12',
      warranty_status: 'UNDER_WARRANTY',
      total_warranty_services: 4,
      dry_warranty_visits: 2,
      jet_warranty_visits: 1,
      pumpdown_warranty_visits: 1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mapped = (assetService as any).mapAssetRecord(mockDbRecord, null);
    expect(mapped.totalWarrantyServices).toBe(4);
    expect(mapped.dryWarrantyVisits).toBe(2);
    expect(mapped.jetWarrantyVisits).toBe(1);
    expect(mapped.pumpdownWarrantyVisits).toBe(1);
    expect(mapped.currentAmc).toBeNull();
  });

  it('handles legacy records where database allocation columns are NULL without regression', () => {
    const mockLegacyRecord: any = {
      id: 'asset-legacy-1',
      asset_tag: 'ESSC-2025-0099',
      site_id: 'site-1',
      customer_id: 'cust-1',
      brand: 'Hitachi',
      model_number: 'RAU518',
      serial_number: 'SN-HIT-01',
      ac_type: 'SPLIT',
      warranty_start_date: '2025-01-01',
      warranty_end_date: '2025-12-31',
      warranty_status: 'EXPIRED',
      total_warranty_services: null,
      dry_warranty_visits: null,
      jet_warranty_visits: null,
      pumpdown_warranty_visits: null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mapped = (assetService as any).mapAssetRecord(mockLegacyRecord, null);
    expect(mapped.totalWarrantyServices).toBeNull();
    expect(mapped.dryWarrantyVisits).toBeNull();
    expect(mapped.jetWarrantyVisits).toBeNull();
    expect(mapped.pumpdownWarrantyVisits).toBeNull();
    expect(mapped.warrantyStatus).toBe('EXPIRED');
  });

  it('guarantees complete isolation between warranty allocations and AMC contract balances', () => {
    const mockDbRecord: any = {
      id: 'asset-amc-test',
      asset_tag: 'ESSC-2026-0005',
      brand: 'Panasonic',
      model_number: 'CS-KU18XKYF',
      ac_type: 'SPLIT',
      warranty_start_date: '2026-10-13',
      warranty_end_date: '2027-10-12',
      total_warranty_services: 4,
      dry_warranty_visits: 2,
      jet_warranty_visits: 1,
      pumpdown_warranty_visits: 1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockAmcContract: any = {
      id: 'amc-option2-contract',
      contractNumber: 'AMC-2026-0042',
      status: 'ACTIVE',
      startDate: '2026-10-14',
      endDate: '2027-10-13',
      totalVisits: 6,
      completedVisits: 1,
      remainingVisits: 5,
    };

    const mapped = (assetService as any).mapAssetRecord(mockDbRecord, mockAmcContract);
    // Warranty counts remain intact
    expect(mapped.totalWarrantyServices).toBe(4);
    expect(mapped.dryWarrantyVisits).toBe(2);
    // AMC contract visits remain strictly isolated and unaffected
    expect(mapped.currentAmc.totalVisits).toBe(6);
    expect(mapped.currentAmc.remainingVisits).toBe(5);
    expect(mapped.currentAmc.completedVisits).toBe(1);
    // Asset warranty fields do not bleed into AMC
    expect(mapped.currentAmc.totalWarrantyServices).toBeUndefined();
  });
});
