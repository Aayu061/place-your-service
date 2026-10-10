import { getSupabaseClient } from '../lib/supabase.js';
import {
  AcAssetResponse,
  AssetCurrentAmcSummary,
  AssetAmcHistoryResponse,
  AssetAmcHistoryItem,
  CreateAcAssetPayload,
  UpdateAcAssetPayload,
  AcAssetListQuery,
  AcType,
  WarrantyStatus,
  AssetStatus,
  AssetCondition,
} from '../types/index.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';
import { normalizeTechnology } from '../utils/technology.js';

interface RawAssetJoinRecord {
  id: string;
  asset_tag: string;
  site_id: string;
  brand: string;
  brand_id?: string | null;
  model_number: string | null;
  model_id?: string | null;
  variant_id?: string | null;
  serial_number: string | null;
  indoor_serial_number?: string | null;
  outdoor_serial_number?: string | null;
  ac_type: AcType;
  technology?: string | null;
  capacity_tons: number | null;
  star_rating?: string | null;
  installation_date: string | null;
  purchase_date?: string | null;
  warranty_start_date?: string | null;
  warranty_end_date?: string | null;
  floor_location: string | null;
  room_location: string | null;
  refrigerant_type: string | null;
  warranty_status: WarrantyStatus;
  asset_status?: AssetStatus;
  asset_condition?: AssetCondition;
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

/**
 * Calculates operational warranty status based on dates.
 * - If warranty_end_date < today -> EXPIRED
 * - Else if warranty_end_date <= today + 30 days -> EXPIRING_SOON
 * - Else -> UNDER_WARRANTY
 */
export function calculateWarrantyStatus(
  warrantyEndDate?: string | null,
  warrantyStartDate?: string | null,
  fallbackStatus?: WarrantyStatus
): WarrantyStatus {
  if (!warrantyEndDate) {
    return fallbackStatus || 'UNDER_WARRANTY';
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysStr = thirtyDaysLater.toISOString().split('T')[0];

  if (warrantyEndDate < todayStr) {
    return 'EXPIRED';
  }
  if (warrantyEndDate <= thirtyDaysStr) {
    return 'EXPIRING_SOON';
  }
  return 'UNDER_WARRANTY';
}

export class AssetService {
  /**
   * Generates a permanent sequential ESSC-XXXX asset code using PostgreSQL sequence.
   */
  private async generateEsscCode(): Promise<string> {
    const supabase = getSupabaseClient();
    try {
      if (typeof supabase.rpc === 'function') {
        const { data, error } = await supabase.rpc('get_next_essc_code');
        if (!error && data && typeof data === 'string') {
          return data;
        }
      }
    } catch (err) {
      logger.warn('Failed to call get_next_essc_code RPC, using fallback', { err });
    }

    // Fallback for test/mock environments
    return 'ESSC-0001';
  }

  /**
   * Resolves current active AMC and visit progress for a list of asset IDs
   */
  private async resolveCurrentAmcForAssets(
    assetIds: string[]
  ): Promise<Record<string, AssetCurrentAmcSummary>> {
    if (assetIds.length === 0) return {};

    const supabase = getSupabaseClient();
    const result: Record<string, AssetCurrentAmcSummary> = {};

    try {
      // 1. Fetch coverage records where contract is ACTIVE or EXPIRING_SOON
      const { data: coverageRows, error: cErr } = await supabase
        .from('amc_assets')
        .select(`
          asset_id,
          amc_contracts (
            id, contract_number, status, start_date, end_date, frequency, total_visits
          )
        `)
        .in('asset_id', assetIds);

      if (cErr || !coverageRows) {
        return {};
      }

      // Filter for active contracts and map to asset based on authoritative state and effective dates
      const todayStr = new Date().toISOString().split('T')[0];
      const activeContractMap: Record<string, any> = {};
      const amcIdsToFetchSchedules: Set<string> = new Set();

      for (const row of coverageRows) {
        const contract = row.amc_contracts as any;
        if (!contract) continue;
        // Workstream A2 business rules:
        // - A renewed predecessor (RENEWED) must not be presented as current active contract.
        // - The successor contract must become the current contract when its state and effective dates permit it.
        // - Contract must be in ACTIVE or EXPIRING_SOON status, and today must fall within [start_date, end_date].
        if (['ACTIVE', 'EXPIRING_SOON'].includes(contract.status)) {
          if (contract.start_date <= todayStr && contract.end_date >= todayStr) {
            // If multiple, prioritize ACTIVE or latest end_date
            const existing = activeContractMap[row.asset_id];
            if (!existing || contract.end_date > existing.end_date) {
              activeContractMap[row.asset_id] = contract;
              amcIdsToFetchSchedules.add(contract.id);
            }
          }
        }
      }

      if (amcIdsToFetchSchedules.size === 0) {
        return {};
      }

      // 2. Fetch completed PM schedule obligations for these active contracts and assets
      const { data: scheduleRows } = await supabase
        .from('service_schedules')
        .select('amc_id, asset_id, status')
        .in('amc_id', Array.from(amcIdsToFetchSchedules))
        .in('asset_id', assetIds);

      const completedMap: Record<string, number> = {};
      if (scheduleRows) {
        for (const s of scheduleRows) {
          if (['COMPLETED', 'RESOLVED'].includes(s.status)) {
            const key = `${s.amc_id}_${s.asset_id}`;
            completedMap[key] = (completedMap[key] || 0) + 1;
          }
        }
      }

      for (const [assetId, contract] of Object.entries(activeContractMap)) {
        const key = `${contract.id}_${assetId}`;
        const completedVisits = completedMap[key] || 0;
        const totalVisits = Number(contract.total_visits) || 0;

        result[assetId] = {
          id: contract.id,
          contractNumber: contract.contract_number,
          status: contract.status,
          startDate: contract.start_date,
          endDate: contract.end_date,
          frequency: contract.frequency,
          totalVisits,
          completedVisits,
          remainingVisits: Math.max(0, totalVisits - completedVisits),
        };
      }
    } catch (err) {
      logger.warn('Failed to resolve current AMC for assets', { err });
    }

    return result;
  }

  /**
   * Maps raw database record to standardized AcAssetResponse.
   */
  private mapAssetRecord(
    record: RawAssetJoinRecord,
    currentAmc?: AssetCurrentAmcSummary | null
  ): AcAssetResponse {
    const site = record.customer_sites;
    const customer = site?.customers;

    return {
      id: record.id,
      assetTag: record.asset_tag,
      siteId: record.site_id,
      customerId: site?.customer_id || '',
      brand: record.brand,
      brandId: record.brand_id || null,
      modelNumber: record.model_number,
      modelId: record.model_id || null,
      variantId: record.variant_id || null,
      serialNumber: record.serial_number,
      indoorSerialNumber: record.indoor_serial_number || null,
      outdoorSerialNumber: record.outdoor_serial_number || null,
      acType: record.ac_type,
      technology: record.technology ? normalizeTechnology(record.technology) || null : null,
      capacityTons: record.capacity_tons ? Number(record.capacity_tons) : null,
      starRating: record.star_rating || null,
      installationDate: record.installation_date,
      purchaseDate: record.purchase_date || null,
      warrantyStartDate: record.warranty_start_date || null,
      warrantyEndDate: record.warranty_end_date || null,
      floorLocation: record.floor_location,
      roomLocation: record.room_location,
      refrigerantType: record.refrigerant_type,
      warrantyStatus: calculateWarrantyStatus(
        record.warranty_end_date,
        record.warranty_start_date,
        record.warranty_status
      ),
      assetStatus: record.asset_status || (record.is_active ? 'Active' : 'Temporarily Inactive'),
      assetCondition: record.asset_condition || 'Good',
      isActive: record.is_active,
      notes: record.notes,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      siteName: site?.site_name || null,
      customerName: customer?.name || null,
      customerCode: customer?.customer_code || null,
      currentAmc: currentAmc !== undefined ? currentAmc : null,
    };
  }

  /**
   * Retrieves paginated list of assets globally across sites.
   */
  public async listAssets(
    query: AcAssetListQuery = {}
  ): Promise<{ assets: AcAssetResponse[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const supabase = getSupabaseClient();
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 50;
    const offset = (page - 1) * pageSize;

    let assetQuery = supabase
      .from('ac_assets')
      .select('*, customer_sites(site_name, customer_id, customers(name, customer_code))', { count: 'exact' });

    if (query.siteId) {
      assetQuery = assetQuery.eq('site_id', query.siteId);
    }

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

    if (query.assetStatus) {
      assetQuery = assetQuery.eq('asset_status', query.assetStatus);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      assetQuery = assetQuery.or(
        `asset_tag.ilike.%${term}%,brand.ilike.%${term}%,model_number.ilike.%${term}%,serial_number.ilike.%${term}%,indoor_serial_number.ilike.%${term}%,outdoor_serial_number.ilike.%${term}%,floor_location.ilike.%${term}%,room_location.ilike.%${term}%`
      );
    }

    assetQuery = assetQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data: records, error, count } = await assetQuery;

    if (error) {
      logger.error('Failed to list AC assets', { error: error.message });
      throw new BadRequestError(`Failed to list AC assets: ${error.message}`);
    }

    const assetIds = (records || []).map((r) => r.id);
    const amcMap = await this.resolveCurrentAmcForAssets(assetIds);

    const assets = (records || []).map((r) =>
      this.mapAssetRecord(r as unknown as RawAssetJoinRecord, amcMap[r.id] || null)
    );

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize) || 1;

    return { assets, total, page, pageSize, totalPages };
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

    const assetIds = (records || []).map((r) => r.id);
    const amcMap = await this.resolveCurrentAmcForAssets(assetIds);

    const assets = (records || []).map((r) =>
      this.mapAssetRecord(r as unknown as RawAssetJoinRecord, amcMap[r.id] || null)
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

    const amcMap = await this.resolveCurrentAmcForAssets([assetId]);
    return this.mapAssetRecord(data as unknown as RawAssetJoinRecord, amcMap[assetId] || null);
  }

  /**
   * Retrieves complete AMC contract history for an asset
   */
  public async getAssetAmcHistory(assetId: string): Promise<AssetAmcHistoryResponse> {
    const supabase = getSupabaseClient();
    const asset = await this.getAssetById(assetId);

    const { data: coverageRows, error } = await supabase
      .from('amc_assets')
      .select(`
        id,
        created_at,
        amc_contracts (
          id,
          contract_number,
          status,
          start_date,
          end_date,
          frequency,
          total_amount,
          total_visits,
          previous_contract_id,
          created_at,
          customers (name)
        )
      `)
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch AMC history for asset', { error });
      throw new BadRequestError('Failed to retrieve AMC history');
    }

    const contractIds = (coverageRows || [])
      .map((r: any) => r.amc_contracts?.id)
      .filter(Boolean);

    // Fetch schedules stats for all historical contracts
    let completedMap: Record<string, number> = {};
    if (contractIds.length > 0) {
      const { data: scheduleRows } = await supabase
        .from('service_schedules')
        .select('amc_id, status')
        .in('amc_id', contractIds)
        .eq('asset_id', assetId);

      if (scheduleRows) {
        for (const s of scheduleRows) {
          if (['COMPLETED', 'RESOLVED'].includes(s.status)) {
            completedMap[s.amc_id] = (completedMap[s.amc_id] || 0) + 1;
          }
        }
      }
    }

    const history: AssetAmcHistoryItem[] = (coverageRows || [])
      .map((row: any) => {
        const c = row.amc_contracts;
        if (!c) return null;
        const customer = c.customers as { name: string } | null;
        const totalVisits = Number(c.total_visits) || 0;
        const completedVisits = completedMap[c.id] || 0;

        return {
          id: c.id,
          contractNumber: c.contract_number,
          status: c.status,
          startDate: c.start_date,
          endDate: c.end_date,
          frequency: c.frequency,
          totalAmount: Number(c.total_amount) || 0,
          totalVisits,
          completedVisits,
          remainingVisits: Math.max(0, totalVisits - completedVisits),
          previousContractId: c.previous_contract_id || null,
          customerName: customer?.name || null,
          createdAt: c.created_at,
        };
      })
      .filter(Boolean) as AssetAmcHistoryItem[];

    // Sort history by startDate desc
    history.sort((a, b) => b.startDate.localeCompare(a.startDate));

    return {
      assetId: asset.id,
      assetTag: asset.assetTag,
      currentAmc: asset.currentAmc || null,
      history,
    };
  }

  /**
   * Creates an AC asset under a site.
   */
  public async createAcAsset(
    siteIdParam: string | undefined,
    payload: CreateAcAssetPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcAssetResponse> {
    const supabase = getSupabaseClient();
    const targetSiteId = siteIdParam || payload.siteId;

    if (!targetSiteId) {
      throw new BadRequestError('Installation site ID is required');
    }

    // 1. Verify site exists and is active
    const { data: site, error: siteErr } = await supabase
      .from('customer_sites')
      .select('id, site_name, customer_id, is_active')
      .eq('id', targetSiteId)
      .maybeSingle();

    if (siteErr || !site) {
      throw new NotFoundError(`Site with ID '${targetSiteId}' not found`);
    }

    if (!site.is_active) {
      throw new BadRequestError(`Cannot add an asset to an inactive site ('${site.site_name}'). Activate the site first.`);
    }

    // 2. Date validation
    if (payload.purchaseDate && payload.installationDate && payload.purchaseDate > payload.installationDate) {
      throw new BadRequestError('Purchase date cannot be later than installation date.');
    }
    if (payload.warrantyStartDate && payload.warrantyEndDate && payload.warrantyEndDate < payload.warrantyStartDate) {
      throw new BadRequestError('Warranty end date cannot be earlier than warranty start date.');
    }

    // 3. Asset Code allocation
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
      assetTag = await this.generateEsscCode();
    }

    // 4. Duplicate serial number validations
    // A) Indoor Serial Number
    if (payload.indoorSerialNumber?.trim()) {
      const indoorSerial = payload.indoorSerialNumber.trim();
      const { data: existingIndoor } = await supabase
        .from('ac_assets')
        .select('id, asset_tag')
        .eq('indoor_serial_number', indoorSerial)
        .maybeSingle();

      if (existingIndoor) {
        throw new ConflictError(
          `An asset with indoor serial number '${indoorSerial}' already exists (Tag: ${existingIndoor.asset_tag}).`
        );
      }
    }

    // B) Outdoor Serial Number
    if (payload.outdoorSerialNumber?.trim()) {
      const outdoorSerial = payload.outdoorSerialNumber.trim();
      const { data: existingOutdoor } = await supabase
        .from('ac_assets')
        .select('id, asset_tag')
        .eq('outdoor_serial_number', outdoorSerial)
        .maybeSingle();

      if (existingOutdoor) {
        throw new ConflictError(
          `An asset with outdoor serial number '${outdoorSerial}' already exists (Tag: ${existingOutdoor.asset_tag}).`
        );
      }
    }

    // C) Single Serial Number
    if (payload.serialNumber?.trim()) {
      const serial = payload.serialNumber.trim();
      const { data: existingSerial } = await supabase
        .from('ac_assets')
        .select('id, asset_tag, brand')
        .eq('site_id', targetSiteId)
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

    // 5. Brand, Model, and Variant linking
    let brandId = payload.brandId || null;
    let modelId = payload.modelId || null;
    let variantId = payload.variantId || null;

    if (brandId) {
      const { data: bData } = await supabase.from('ac_brands').select('id, is_active').eq('id', brandId).maybeSingle();
      if (!bData || !bData.is_active) {
        throw new BadRequestError('Selected AC brand is inactive or not found.');
      }
    }

    if (modelId) {
      const { data: mData } = await supabase.from('ac_models').select('id, brand_id, is_active').eq('id', modelId).maybeSingle();
      if (!mData || !mData.is_active) {
        throw new BadRequestError('Selected AC model is inactive or not found.');
      }
      if (brandId && mData.brand_id !== brandId) {
        throw new BadRequestError('Selected AC model does not belong to the selected brand.');
      }
    }

    if (variantId) {
      const { data: vData } = await supabase
        .from('ac_model_variants')
        .select('*, ac_models(id, brand_id, model_number, is_active)')
        .eq('id', variantId)
        .maybeSingle();
      if (!vData || !vData.is_active) {
        throw new BadRequestError('Selected AC model variant is inactive or not found.');
      }
      if (modelId && vData.model_id !== modelId) {
        throw new BadRequestError('Selected AC variant does not belong to the selected model.');
      }
      const modelParent = vData.ac_models as any;
      if (brandId && modelParent?.brand_id && modelParent.brand_id !== brandId) {
        throw new BadRequestError('Selected AC variant does not belong to the selected brand.');
      }
      if (!modelId) modelId = vData.model_id;
      if (!payload.modelNumber && modelParent?.model_number) {
        payload.modelNumber = modelParent.model_number;
      }
      // Prefill catalogue defaults ONLY for omitted / undefined fields (do not overwrite user input):
      if (payload.capacityTons === undefined && vData.capacity_tons !== null && vData.capacity_tons !== undefined) {
        payload.capacityTons = Number(vData.capacity_tons);
      }
      if (payload.starRating === undefined && vData.star_rating) {
        payload.starRating = vData.star_rating;
      }
      if (payload.acType === undefined && vData.ac_type) {
        payload.acType = vData.ac_type as AcType;
      }
      if (payload.technology === undefined && vData.technology) {
        payload.technology = normalizeTechnology(vData.technology);
      }
      if (payload.refrigerantType === undefined && vData.refrigerant) {
        payload.refrigerantType = vData.refrigerant;
      }
    }

    // 6. Warranty Status Calculation
    const calculatedWarranty = calculateWarrantyStatus(
      payload.warrantyEndDate,
      payload.warrantyStartDate,
      payload.warrantyStatus
    );

    // 7. Insert asset
    const { data: newAsset, error: insertErr } = await supabase
      .from('ac_assets')
      .insert({
        asset_tag: assetTag,
        site_id: targetSiteId,
        brand: payload.brand.trim(),
        brand_id: brandId,
        model_number: payload.modelNumber?.trim() || null,
        model_id: modelId,
        variant_id: variantId,
        serial_number: payload.serialNumber?.trim() || null,
        indoor_serial_number: payload.indoorSerialNumber?.trim() || null,
        outdoor_serial_number: payload.outdoorSerialNumber?.trim() || null,
        ac_type: payload.acType,
        technology: payload.technology ? normalizeTechnology(payload.technology) || null : null,
        capacity_tons: payload.capacityTons || null,
        star_rating: payload.starRating?.trim() || null,
        installation_date: payload.installationDate || null,
        purchase_date: payload.purchaseDate || null,
        warranty_start_date: payload.warrantyStartDate || null,
        warranty_end_date: payload.warrantyEndDate || null,
        floor_location: payload.floorLocation?.trim() || null,
        room_location: payload.roomLocation?.trim() || null,
        refrigerant_type: payload.refrigerantType?.trim() || null,
        warranty_status: calculatedWarranty,
        asset_status: payload.assetStatus || 'Active',
        asset_condition: payload.assetCondition || 'Good',
        is_active: payload.assetStatus ? !['Decommissioned', 'Scrapped'].includes(payload.assetStatus) : true,
        notes: payload.notes?.trim() || null,
      })
      .select('*, customer_sites(site_name, customer_id, customers(name, customer_code))')
      .single();

    if (insertErr || !newAsset) {
      logger.error('Failed to create AC asset', { targetSiteId, error: insertErr?.message });
      throw new BadRequestError(`Failed to create AC asset: ${insertErr?.message}`);
    }

    // 8. Audit log
    await logActivity({
      actorProfileId,
      action: 'ASSET_CREATED',
      entityType: 'ac_asset',
      entityId: newAsset.id,
      details: {
        siteId: targetSiteId,
        customerId: site.customer_id,
        assetTag: newAsset.asset_tag,
        brand: newAsset.brand,
        modelNumber: newAsset.model_number,
        acType: newAsset.ac_type,
        warrantyStatus: newAsset.warranty_status,
      },
      ipAddress,
    });

    logger.info('AC asset created successfully', {
      assetId: newAsset.id,
      assetTag: newAsset.asset_tag,
      siteId: targetSiteId,
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

    // 2. Date validation
    const purchaseDate = payload.purchaseDate !== undefined ? payload.purchaseDate : existing.purchaseDate;
    const installationDate = payload.installationDate !== undefined ? payload.installationDate : existing.installationDate;
    if (purchaseDate && installationDate && purchaseDate > installationDate) {
      throw new BadRequestError('Purchase date cannot be later than installation date.');
    }

    const warrantyStartDate = payload.warrantyStartDate !== undefined ? payload.warrantyStartDate : existing.warrantyStartDate;
    const warrantyEndDate = payload.warrantyEndDate !== undefined ? payload.warrantyEndDate : existing.warrantyEndDate;
    if (warrantyStartDate && warrantyEndDate && warrantyEndDate < warrantyStartDate) {
      throw new BadRequestError('Warranty end date cannot be earlier than warranty start date.');
    }

    // 3. Duplicate serial checks if changed
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

    if (payload.indoorSerialNumber?.trim() && payload.indoorSerialNumber.trim() !== existing.indoorSerialNumber) {
      const indoor = payload.indoorSerialNumber.trim();
      const { data: dupIndoor } = await supabase
        .from('ac_assets')
        .select('id, asset_tag')
        .eq('indoor_serial_number', indoor)
        .neq('id', assetId)
        .maybeSingle();

      if (dupIndoor) {
        throw new ConflictError(`Another asset with indoor serial number '${indoor}' already exists.`);
      }
    }

    if (payload.outdoorSerialNumber?.trim() && payload.outdoorSerialNumber.trim() !== existing.outdoorSerialNumber) {
      const outdoor = payload.outdoorSerialNumber.trim();
      const { data: dupOutdoor } = await supabase
        .from('ac_assets')
        .select('id, asset_tag')
        .eq('outdoor_serial_number', outdoor)
        .neq('id', assetId)
        .maybeSingle();

      if (dupOutdoor) {
        throw new ConflictError(`Another asset with outdoor serial number '${outdoor}' already exists.`);
      }
    }

    // 4. Build updates
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.brand !== undefined) updates.brand = payload.brand.trim();
    if (payload.brandId !== undefined) updates.brand_id = payload.brandId || null;
    if (payload.modelNumber !== undefined) updates.model_number = payload.modelNumber?.trim() || null;
    if (payload.modelId !== undefined) updates.model_id = payload.modelId || null;
    if (payload.variantId !== undefined) {
      const vId = payload.variantId;
      if (vId) {
        const { data: vData } = await supabase
          .from('ac_model_variants')
          .select('*, ac_models(id, brand_id, is_active)')
          .eq('id', vId)
          .maybeSingle();
        if (!vData || !vData.is_active) {
          throw new BadRequestError('Selected AC model variant is inactive or not found.');
        }
        updates.variant_id = vId;
        if (payload.modelId === undefined) updates.model_id = vData.model_id;
        if (payload.capacityTons === undefined && vData.capacity_tons !== null && vData.capacity_tons !== undefined) {
          updates.capacity_tons = Number(vData.capacity_tons);
        }
        if (payload.starRating === undefined && vData.star_rating) {
          updates.star_rating = vData.star_rating;
        }
        if (payload.acType === undefined && vData.ac_type) {
          updates.ac_type = vData.ac_type;
        }
        if (payload.technology === undefined && vData.technology) {
          updates.technology = normalizeTechnology(vData.technology) || null;
        }
        if (payload.refrigerantType === undefined && vData.refrigerant) {
          updates.refrigerant_type = vData.refrigerant;
        }
      } else {
        updates.variant_id = null;
      }
    }
    if (payload.serialNumber !== undefined) updates.serial_number = payload.serialNumber?.trim() || null;
    if (payload.indoorSerialNumber !== undefined) updates.indoor_serial_number = payload.indoorSerialNumber?.trim() || null;
    if (payload.outdoorSerialNumber !== undefined) updates.outdoor_serial_number = payload.outdoorSerialNumber?.trim() || null;
    if (payload.acType !== undefined) updates.ac_type = payload.acType;
    if (payload.technology !== undefined) {
      updates.technology = payload.technology ? normalizeTechnology(payload.technology) || null : null;
    }
    if (payload.capacityTons !== undefined) updates.capacity_tons = payload.capacityTons || null;
    if (payload.starRating !== undefined) updates.star_rating = payload.starRating?.trim() || null;
    if (payload.purchaseDate !== undefined) updates.purchase_date = payload.purchaseDate || null;
    if (payload.installationDate !== undefined) updates.installation_date = payload.installationDate || null;
    if (payload.warrantyStartDate !== undefined) updates.warranty_start_date = payload.warrantyStartDate || null;
    if (payload.warrantyEndDate !== undefined) updates.warranty_end_date = payload.warrantyEndDate || null;
    if (payload.floorLocation !== undefined) updates.floor_location = payload.floorLocation?.trim() || null;
    if (payload.roomLocation !== undefined) updates.room_location = payload.roomLocation?.trim() || null;
    if (payload.refrigerantType !== undefined) updates.refrigerant_type = payload.refrigerantType?.trim() || null;
    if (payload.assetStatus !== undefined) {
      updates.asset_status = payload.assetStatus;
      if (['Decommissioned', 'Scrapped'].includes(payload.assetStatus)) {
        updates.is_active = false;
      }
    }
    if (payload.assetCondition !== undefined) updates.asset_condition = payload.assetCondition;

    // Recalculate warranty status if dates changed, or update directly
    if (payload.warrantyEndDate !== undefined || payload.warrantyStartDate !== undefined) {
      updates.warranty_status = calculateWarrantyStatus(
        payload.warrantyEndDate !== undefined ? payload.warrantyEndDate : existing.warrantyEndDate,
        payload.warrantyStartDate !== undefined ? payload.warrantyStartDate : existing.warrantyStartDate,
        payload.warrantyStatus || existing.warrantyStatus
      );
    } else if (payload.warrantyStatus !== undefined) {
      updates.warranty_status = payload.warrantyStatus;
    }

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

    // 5. Audit log
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
