import { getSupabaseClient } from '../lib/supabase.js';
import {
  AcAssetResponse,
  CreateAcAssetPayload,
  UpdateAcAssetPayload,
  AcAssetListQuery,
  AcType,
  WarrantyStatus,
} from '../types/index.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';

interface RawAssetJoinRecord {
  id: string;
  asset_tag: string;
  site_id: string;
  brand: string;
  model_number: string | null;
  serial_number: string | null;
  ac_type: AcType;
  capacity_tons: number | null;
  installation_date: string | null;
  floor_location: string | null;
  room_location: string | null;
  refrigerant_type: string | null;
  warranty_status: WarrantyStatus;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer_sites?: {
    site_name: string;
    customer_id: string;
    customers?: {
      name: string;
      customer_code: string;
    } | null;
  } | null;
}

export class AssetService {
  /**
   * Generates a collision-resistant asset tag (e.g. AC-409122).
   */
  private async generateAssetTag(): Promise<string> {
    const supabase = getSupabaseClient();
    for (let i = 0; i < 5; i++) {
      const num = Math.floor(100000 + Math.random() * 900000);
      const tag = `AC-${num}`;
      const { data } = await supabase
        .from('ac_assets')
        .select('id')
        .eq('asset_tag', tag)
        .maybeSingle();

      if (!data) return tag;
    }
    return `AC-${Date.now().toString().slice(-6)}`;
  }

  /**
   * Maps raw database record to standardized AcAssetResponse.
   */
  private mapAssetRecord(record: RawAssetJoinRecord): AcAssetResponse {
    const site = record.customer_sites;
    const customer = site?.customers;

    return {
      id: record.id,
      assetTag: record.asset_tag,
      siteId: record.site_id,
      customerId: site?.customer_id || '',
      brand: record.brand,
      modelNumber: record.model_number,
      serialNumber: record.serial_number,
      acType: record.ac_type,
      capacityTons: record.capacity_tons ? Number(record.capacity_tons) : null,
      installationDate: record.installation_date,
      floorLocation: record.floor_location,
      roomLocation: record.room_location,
      refrigerantType: record.refrigerant_type,
      warrantyStatus: record.warranty_status,
      isActive: record.is_active,
      notes: record.notes,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      siteName: site?.site_name || null,
      customerName: customer?.name || null,
      customerCode: customer?.customer_code || null,
    };
  }

  /**
   * Retrieves paginated list of assets for a specific site.
   */
  public async listSiteAssets(
    siteId: string,
    query: AcAssetListQuery = {}
  ): Promise<{ assets: AcAssetResponse[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const supabase = getSupabaseClient();
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 50;
    const offset = (page - 1) * pageSize;

    // 1. Verify site exists
    const { data: site, error: siteErr } = await supabase
      .from('customer_sites')
      .select('id, site_name, customer_id')
      .eq('id', siteId)
      .maybeSingle();

    if (siteErr || !site) {
      throw new NotFoundError(`Site with ID '${siteId}' not found`);
    }

    // 2. Query assets
    let assetQuery = supabase
      .from('ac_assets')
      .select('*, customer_sites(site_name, customer_id, customers(name, customer_code))', { count: 'exact' })
      .eq('site_id', siteId);

    if (query.status === 'ACTIVE') {
      assetQuery = assetQuery.eq('is_active', true);
    } else if (query.status === 'INACTIVE') {
      assetQuery = assetQuery.eq('is_active', false);
    }

    if (query.acType && query.acType !== 'ALL') {
      assetQuery = assetQuery.eq('ac_type', query.acType);
    }

    if (query.warrantyStatus && query.warrantyStatus !== 'ALL') {
      assetQuery = assetQuery.eq('warranty_status', query.warrantyStatus);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      assetQuery = assetQuery.or(
        `asset_tag.ilike.%${term}%,brand.ilike.%${term}%,model_number.ilike.%${term}%,serial_number.ilike.%${term}%,floor_location.ilike.%${term}%,room_location.ilike.%${term}%`
      );
    }

    assetQuery = assetQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data: records, error, count } = await assetQuery;

    if (error) {
      logger.error('Failed to list site assets', { siteId, error: error.message });
      throw new BadRequestError(`Failed to list site assets: ${error.message}`);
    }

    const assets = (records || []).map((r) =>
      this.mapAssetRecord(r as unknown as RawAssetJoinRecord)
    );

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      assets,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Retrieves single AC asset by UUID.
   */
  public async getAssetById(assetId: string): Promise<AcAssetResponse> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('ac_assets')
      .select('*, customer_sites(site_name, customer_id, customers(name, customer_code))')
      .eq('id', assetId)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundError(`AC Asset with ID '${assetId}' not found`);
    }

    return this.mapAssetRecord(data as unknown as RawAssetJoinRecord);
  }

  /**
   * Creates an AC asset under a site.
   */
  public async createAcAsset(
    siteId: string,
    payload: CreateAcAssetPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcAssetResponse> {
    const supabase = getSupabaseClient();

    // 1. Verify site exists and is active
    const { data: site, error: siteErr } = await supabase
      .from('customer_sites')
      .select('id, site_name, customer_id, is_active')
      .eq('id', siteId)
      .maybeSingle();

    if (siteErr || !site) {
      throw new NotFoundError(`Site with ID '${siteId}' not found`);
    }

    if (!site.is_active) {
      throw new BadRequestError(`Cannot add an asset to an inactive site ('${site.site_name}'). Activate the site first.`);
    }

    // 2. Duplicate detection
    // A) If custom assetTag provided, check uniqueness
    let assetTag = payload.assetTag?.trim();
    if (assetTag) {
      const { data: existingTag } = await supabase
        .from('ac_assets')
        .select('id, asset_tag')
        .eq('asset_tag', assetTag)
        .maybeSingle();

      if (existingTag) {
        throw new ConflictError(`An asset with tag '${assetTag}' already exists. Asset tags must be globally unique.`);
      }
    } else {
      assetTag = await this.generateAssetTag();
    }

    // B) If serialNumber provided, check if same brand + serial exists under same site
    if (payload.serialNumber?.trim()) {
      const serial = payload.serialNumber.trim();
      const { data: existingSerial } = await supabase
        .from('ac_assets')
        .select('id, asset_tag, brand')
        .eq('site_id', siteId)
        .eq('brand', payload.brand.trim())
        .eq('serial_number', serial)
        .eq('is_active', true)
        .maybeSingle();

      if (existingSerial) {
        throw new ConflictError(
          `An active asset with brand '${payload.brand}' and serial number '${serial}' already exists at this site (Tag: ${existingSerial.asset_tag}).`
        );
      }
    }

    // 3. Insert asset
    const { data: newAsset, error: insertErr } = await supabase
      .from('ac_assets')
      .insert({
        asset_tag: assetTag,
        site_id: siteId,
        brand: payload.brand.trim(),
        model_number: payload.modelNumber?.trim() || null,
        serial_number: payload.serialNumber?.trim() || null,
        ac_type: payload.acType,
        capacity_tons: payload.capacityTons || null,
        installation_date: payload.installationDate || null,
        floor_location: payload.floorLocation?.trim() || null,
        room_location: payload.roomLocation?.trim() || null,
        refrigerant_type: payload.refrigerantType?.trim() || null,
        warranty_status: payload.warrantyStatus || 'UNDER_WARRANTY',
        is_active: true,
        notes: payload.notes?.trim() || null,
      })
      .select('*, customer_sites(site_name, customer_id, customers(name, customer_code))')
      .single();

    if (insertErr || !newAsset) {
      logger.error('Failed to create AC asset', { siteId, error: insertErr?.message });
      throw new BadRequestError(`Failed to create AC asset: ${insertErr?.message}`);
    }

    // 4. Audit log
    await logActivity({
      actorProfileId,
      action: 'ASSET_CREATED',
      entityType: 'ac_asset',
      entityId: newAsset.id,
      details: {
        siteId,
        customerId: site.customer_id,
        assetTag: newAsset.asset_tag,
        brand: newAsset.brand,
        acType: newAsset.ac_type,
      },
      ipAddress,
    });

    logger.info('AC asset created successfully', {
      assetId: newAsset.id,
      assetTag: newAsset.asset_tag,
      siteId,
    });

    return this.mapAssetRecord(newAsset as unknown as RawAssetJoinRecord);
  }

  /**
   * Updates an existing AC asset.
   */
  public async updateAcAsset(
    assetId: string,
    payload: UpdateAcAssetPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcAssetResponse> {
    const supabase = getSupabaseClient();

    // 1. Verify existence
    const existing = await this.getAssetById(assetId);

    // 2. Duplicate serial number check if serial or brand changed
    const targetBrand = payload.brand !== undefined ? payload.brand.trim() : existing.brand;
    const targetSerial = payload.serialNumber !== undefined ? payload.serialNumber?.trim() || null : existing.serialNumber;

    if (targetSerial && (payload.brand !== undefined || payload.serialNumber !== undefined)) {
      const { data: conflict } = await supabase
        .from('ac_assets')
        .select('id, asset_tag')
        .eq('site_id', existing.siteId)
        .eq('brand', targetBrand)
        .eq('serial_number', targetSerial)
        .eq('is_active', true)
        .neq('id', assetId)
        .maybeSingle();

      if (conflict) {
        throw new ConflictError(
          `Another active asset with brand '${targetBrand}' and serial number '${targetSerial}' already exists at this site (Tag: ${conflict.asset_tag}).`
        );
      }
    }

    // 3. Build update
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.brand !== undefined) updates.brand = payload.brand.trim();
    if (payload.modelNumber !== undefined) updates.model_number = payload.modelNumber?.trim() || null;
    if (payload.serialNumber !== undefined) updates.serial_number = payload.serialNumber?.trim() || null;
    if (payload.acType !== undefined) updates.ac_type = payload.acType;
    if (payload.capacityTons !== undefined) updates.capacity_tons = payload.capacityTons || null;
    if (payload.installationDate !== undefined) updates.installation_date = payload.installationDate || null;
    if (payload.floorLocation !== undefined) updates.floor_location = payload.floorLocation?.trim() || null;
    if (payload.roomLocation !== undefined) updates.room_location = payload.roomLocation?.trim() || null;
    if (payload.refrigerantType !== undefined) updates.refrigerant_type = payload.refrigerantType?.trim() || null;
    if (payload.warrantyStatus !== undefined) updates.warranty_status = payload.warrantyStatus;
    if (payload.notes !== undefined) updates.notes = payload.notes?.trim() || null;

    const { data: updated, error } = await supabase
      .from('ac_assets')
      .update(updates)
      .eq('id', assetId)
      .select('*, customer_sites(site_name, customer_id, customers(name, customer_code))')
      .single();

    if (error || !updated) {
      logger.error('Failed to update AC asset', { assetId, error: error?.message });
      throw new BadRequestError(`Failed to update AC asset: ${error?.message}`);
    }

    // 4. Audit log
    await logActivity({
      actorProfileId,
      action: 'ASSET_UPDATED',
      entityType: 'ac_asset',
      entityId: assetId,
      details: {
        siteId: existing.siteId,
        customerId: existing.customerId,
        updatedFields: Object.keys(updates),
      },
      ipAddress,
    });

    return this.mapAssetRecord(updated as unknown as RawAssetJoinRecord);
  }

  /**
   * Updates AC asset active status (non-destructive).
   */
  public async updateAcAssetStatus(
    assetId: string,
    isActive: boolean,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcAssetResponse> {
    const supabase = getSupabaseClient();

    // 1. Verify existence
    const existing = await this.getAssetById(assetId);

    // 2. Update status
    const { data: updated, error } = await supabase
      .from('ac_assets')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', assetId)
      .select('*, customer_sites(site_name, customer_id, customers(name, customer_code))')
      .single();

    if (error || !updated) {
      logger.error('Failed to update AC asset status', { assetId, error: error?.message });
      throw new BadRequestError(`Failed to update AC asset status: ${error?.message}`);
    }

    // 3. Audit log
    await logActivity({
      actorProfileId,
      action: 'ASSET_STATUS_CHANGED',
      entityType: 'ac_asset',
      entityId: assetId,
      details: {
        siteId: existing.siteId,
        customerId: existing.customerId,
        isActive,
      },
      ipAddress,
    });

    return this.mapAssetRecord(updated as unknown as RawAssetJoinRecord);
  }
}

export const assetService = new AssetService();
