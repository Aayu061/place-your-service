import { getSupabaseClient } from '../lib/supabase.js';
import {
  AcBrandResponse,
  CreateAcBrandPayload,
  UpdateAcBrandPayload,
  AcBrandListQuery,
  AcModelResponse,
  CreateAcModelPayload,
  UpdateAcModelPayload,
  AcModelListQuery,
  AcModelVariantResponse,
  CreateAcModelVariantPayload,
  UpdateAcModelVariantPayload,
} from '../types/index.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';

interface RawBrandRow {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  ac_models?: { count: number }[] | null;
}

interface RawModelRow {
  id: string;
  brand_id: string;
  model_number: string;
  ac_type: string | null;
  technology: string | null;
  capacity_tons: number | null;
  rating: string | null;
  refrigerant: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  ac_brands?: {
    name: string;
    code: string;
  } | null;
}

export class MasterDataService {
  /**
   * Generates a slug code for a brand if not explicitly provided.
   */
  private generateBrandCode(name: string): string {
    return name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // ==========================================================================
  // BRAND OPERATIONS
  // ==========================================================================

  public async listBrands(
    query: AcBrandListQuery = {}
  ): Promise<{ brands: AcBrandResponse[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const supabase = getSupabaseClient();
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 50;
    const offset = (page - 1) * pageSize;

    let q = supabase
      .from('ac_brands')
      .select('*, ac_models(count)', { count: 'exact' });

    if (query.status === 'ACTIVE') {
      q = q.eq('is_active', true);
    } else if (query.status === 'INACTIVE') {
      q = q.eq('is_active', false);
    } else if (query.status === 'ALL') {
      // Return all brands without is_active restriction
    } else if (query.activeOnly !== false) {
      q = q.eq('is_active', true);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      q = q.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
    }

    q = q.order('name', { ascending: true }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await q;

    if (error) {
      logger.error('Failed to list AC brands', { error: error.message });
      throw new BadRequestError(`Failed to list AC brands: ${error.message}`);
    }

    const brands: AcBrandResponse[] = (data || []).map((row: RawBrandRow) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      modelCount: row.ac_models?.[0]?.count || 0,
    }));

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize) || 1;

    return { brands, total, page, pageSize, totalPages };
  }

  public async getBrandById(brandId: string): Promise<AcBrandResponse> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ac_brands')
      .select('*, ac_models(count)')
      .eq('id', brandId)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundError(`AC Brand with ID '${brandId}' not found`);
    }

    const row = data as RawBrandRow;
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      modelCount: row.ac_models?.[0]?.count || 0,
    };
  }

  public async createBrand(
    payload: CreateAcBrandPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcBrandResponse> {
    const supabase = getSupabaseClient();
    const name = payload.name.trim();
    const code = payload.code?.trim().toUpperCase() || this.generateBrandCode(name);

    // Check duplicate by name or code (case-insensitive)
    const { data: existing } = await supabase
      .from('ac_brands')
      .select('id, name, code, is_active')
      .or(`name.ilike.${name},code.eq.${code}`)
      .maybeSingle();

    if (existing) {
      if (existing.is_active === false) {
        throw new ConflictError(
          `An AC brand with name '${existing.name}' (code: '${existing.code}') already exists but is currently INACTIVE. You can reactivate this existing brand instead of creating a duplicate.`,
          {
            existingBrandId: existing.id,
            isInactive: true,
            brandName: existing.name,
            brandCode: existing.code,
          }
        );
      } else {
        throw new ConflictError(
          `An active AC brand with name '${existing.name}' (code: '${existing.code}') already exists. Please select or edit the existing brand record.`,
          {
            existingBrandId: existing.id,
            isInactive: false,
            brandName: existing.name,
            brandCode: existing.code,
          }
        );
      }
    }

    const { data: created, error } = await supabase
      .from('ac_brands')
      .insert({
        name,
        code,
        is_active: payload.isActive !== false,
      })
      .select()
      .single();

    if (error || !created) {
      if (
        (error as any)?.code === '23505' ||
        error?.message?.includes('duplicate key') ||
        error?.message?.includes('uq_ac_brands')
      ) {
        const { data: dup } = await supabase
          .from('ac_brands')
          .select('id, name, code, is_active')
          .or(`name.ilike.${name},code.eq.${code}`)
          .maybeSingle();

        if (dup && !dup.is_active) {
          throw new ConflictError(
            `An AC brand with name '${dup.name}' (code: '${dup.code}') already exists but is currently INACTIVE. You can reactivate this existing brand instead of creating a duplicate.`,
            { existingBrandId: dup.id, isInactive: true, brandName: dup.name, brandCode: dup.code }
          );
        }
        throw new ConflictError(
          `An AC brand with name '${dup?.name || name}' or code '${dup?.code || code}' already exists.`,
          { existingBrandId: dup?.id, isInactive: false, brandName: dup?.name || name, brandCode: dup?.code || code }
        );
      }
      logger.error('Failed to create AC brand', { error: error?.message });
      throw new BadRequestError('Failed to create AC brand due to a validation or database error.');
    }

    await logActivity({
      actorProfileId,
      action: 'AC_BRAND_CREATED',
      entityType: 'ac_brand',
      entityId: created.id,
      details: { name: created.name, code: created.code },
      ipAddress,
    });

    return {
      id: created.id,
      name: created.name,
      code: created.code,
      isActive: created.is_active,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
      modelCount: 0,
    };
  }

  public async updateBrand(
    brandId: string,
    payload: UpdateAcBrandPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcBrandResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getBrandById(brandId);

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.name !== undefined) {
      const trimmedName = payload.name.trim();
      const { data: dup } = await supabase
        .from('ac_brands')
        .select('id')
        .ilike('name', trimmedName)
        .neq('id', brandId)
        .maybeSingle();

      if (dup) {
        throw new ConflictError(`Another brand with name '${trimmedName}' already exists.`);
      }
      updates.name = trimmedName;
    }

    if (payload.code !== undefined) {
      const code = payload.code.trim().toUpperCase();
      const { data: dupCode } = await supabase
        .from('ac_brands')
        .select('id')
        .eq('code', code)
        .neq('id', brandId)
        .maybeSingle();

      if (dupCode) {
        throw new ConflictError(`Another brand with code '${code}' already exists.`);
      }
      updates.code = code;
    }

    if (payload.isActive !== undefined) {
      updates.is_active = payload.isActive;
    }

    const { data: updated, error } = await supabase
      .from('ac_brands')
      .update(updates)
      .eq('id', brandId)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('Failed to update AC brand database error', { brandId, error: error.message });
      throw new BadRequestError(`Failed to update AC brand: ${error.message}`);
    }

    if (!updated) {
      throw new NotFoundError(`AC brand with ID '${brandId}' not found`);
    }

    await logActivity({
      actorProfileId,
      action: 'AC_BRAND_UPDATED',
      entityType: 'ac_brand',
      entityId: brandId,
      details: { updatedFields: Object.keys(updates) },
      ipAddress,
    });

    return this.getBrandById(brandId);
  }

  public async updateBrandStatus(
    brandId: string,
    isActive: boolean,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcBrandResponse> {
    const supabase = getSupabaseClient();
    await this.getBrandById(brandId);

    const { data: updated, error } = await supabase
      .from('ac_brands')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', brandId)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('Failed to update AC brand status database error', { brandId, error: error.message });
      throw new BadRequestError(`Failed to update AC brand status: ${error.message}`);
    }

    if (!updated) {
      throw new NotFoundError(`AC brand with ID '${brandId}' not found`);
    }

    await logActivity({
      actorProfileId,
      action: 'AC_BRAND_STATUS_CHANGED',
      entityType: 'ac_brand',
      entityId: brandId,
      details: { isActive },
      ipAddress,
    });

    return this.getBrandById(brandId);
  }

  // ==========================================================================
  // MODEL OPERATIONS
  // ==========================================================================

  public async listModels(
    query: AcModelListQuery = {}
  ): Promise<{ models: AcModelResponse[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const supabase = getSupabaseClient();
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 50;
    const offset = (page - 1) * pageSize;

    let q = supabase
      .from('ac_models')
      .select('*, ac_brands(name, code)', { count: 'exact' });

    if (query.brandId) {
      q = q.eq('brand_id', query.brandId);
    }

    if (query.status === 'ACTIVE') {
      q = q.eq('is_active', true);
    } else if (query.status === 'INACTIVE') {
      q = q.eq('is_active', false);
    } else if (query.status === 'ALL') {
      // Return all models without is_active restriction
    } else if (query.activeOnly !== false) {
      q = q.eq('is_active', true);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      q = q.or(
        `model_number.ilike.%${term}%,ac_type.ilike.%${term}%,technology.ilike.%${term}%,refrigerant.ilike.%${term}%`
      );
    }

    q = q.order('model_number', { ascending: true }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await q;

    if (error) {
      logger.error('Failed to list AC models', { error: error.message });
      throw new BadRequestError(`Failed to list AC models: ${error.message}`);
    }

    const models: AcModelResponse[] = (data || []).map((row: RawModelRow) => ({
      id: row.id,
      brandId: row.brand_id,
      brandName: row.ac_brands?.name || null,
      brandCode: row.ac_brands?.code || null,
      modelNumber: row.model_number,
      acType: row.ac_type,
      technology: row.technology,
      capacityTons: row.capacity_tons ? Number(row.capacity_tons) : null,
      rating: row.rating,
      refrigerant: row.refrigerant,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize) || 1;

    return { models, total, page, pageSize, totalPages };
  }

  public async getModelById(modelId: string): Promise<AcModelResponse> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ac_models')
      .select('*, ac_brands(name, code)')
      .eq('id', modelId)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundError(`AC Model with ID '${modelId}' not found`);
    }

    const row = data as RawModelRow;
    return {
      id: row.id,
      brandId: row.brand_id,
      brandName: row.ac_brands?.name || null,
      brandCode: row.ac_brands?.code || null,
      modelNumber: row.model_number,
      acType: row.ac_type,
      technology: row.technology,
      capacityTons: row.capacity_tons ? Number(row.capacity_tons) : null,
      rating: row.rating,
      refrigerant: row.refrigerant,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async createModel(
    payload: CreateAcModelPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcModelResponse> {
    const supabase = getSupabaseClient();

    // 1. Verify brand exists
    const brand = await this.getBrandById(payload.brandId);

    const modelNumber = payload.modelNumber.trim();

    // 2. Check duplicate (brand_id, model_number)
    const { data: existing } = await supabase
      .from('ac_models')
      .select('id')
      .eq('brand_id', payload.brandId)
      .ilike('model_number', modelNumber)
      .maybeSingle();

    if (existing) {
      throw new ConflictError(
        `Model number '${modelNumber}' already exists for brand '${brand.name}'.`
      );
    }

    // 3. Insert model
    const { data: created, error } = await supabase
      .from('ac_models')
      .insert({
        brand_id: payload.brandId,
        model_number: modelNumber,
        ac_type: payload.acType?.trim() || null,
        technology: payload.technology?.trim() || null,
        capacity_tons: payload.capacityTons || null,
        rating: payload.rating?.trim() || null,
        refrigerant: payload.refrigerant?.trim() || null,
        is_active: payload.isActive !== false,
      })
      .select('*, ac_brands(name, code)')
      .single();

    if (error || !created) {
      logger.error('Failed to create AC model', { error: error?.message });
      throw new BadRequestError(`Failed to create AC model: ${error?.message}`);
    }

    await logActivity({
      actorProfileId,
      action: 'AC_MODEL_CREATED',
      entityType: 'ac_model',
      entityId: created.id,
      details: {
        brandId: payload.brandId,
        brandName: brand.name,
        modelNumber: created.model_number,
      },
      ipAddress,
    });

    const row = created as RawModelRow;
    return {
      id: row.id,
      brandId: row.brand_id,
      brandName: row.ac_brands?.name || brand.name,
      brandCode: row.ac_brands?.code || brand.code,
      modelNumber: row.model_number,
      acType: row.ac_type,
      technology: row.technology,
      capacityTons: row.capacity_tons ? Number(row.capacity_tons) : null,
      rating: row.rating,
      refrigerant: row.refrigerant,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async updateModel(
    modelId: string,
    payload: UpdateAcModelPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcModelResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getModelById(modelId);

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.modelNumber !== undefined) {
      const modelNum = payload.modelNumber.trim();
      const { data: dup } = await supabase
        .from('ac_models')
        .select('id')
        .eq('brand_id', existing.brandId)
        .ilike('model_number', modelNum)
        .neq('id', modelId)
        .maybeSingle();

      if (dup) {
        throw new ConflictError(
          `Another model with number '${modelNum}' already exists for this brand.`
        );
      }
      updates.model_number = modelNum;
    }

    if (payload.acType !== undefined) updates.ac_type = payload.acType?.trim() || null;
    if (payload.technology !== undefined) updates.technology = payload.technology?.trim() || null;
    if (payload.capacityTons !== undefined) updates.capacity_tons = payload.capacityTons || null;
    if (payload.rating !== undefined) updates.rating = payload.rating?.trim() || null;
    if (payload.refrigerant !== undefined) updates.refrigerant = payload.refrigerant?.trim() || null;
    if (payload.isActive !== undefined) updates.is_active = payload.isActive;

    const { data: updated, error } = await supabase
      .from('ac_models')
      .update(updates)
      .eq('id', modelId)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('Failed to update AC model database error', { modelId, error: error.message });
      throw new BadRequestError(`Failed to update AC model: ${error.message}`);
    }

    if (!updated) {
      logger.warn('AC model update returned no rows', { modelId });
      throw new NotFoundError(`AC model with ID '${modelId}' not found`);
    }

    await logActivity({
      actorProfileId,
      action: 'AC_MODEL_UPDATED',
      entityType: 'ac_model',
      entityId: modelId,
      details: { updatedFields: Object.keys(updates) },
      ipAddress,
    });

    return this.getModelById(modelId);
  }

  public async updateModelStatus(
    modelId: string,
    isActive: boolean,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcModelResponse> {
    const supabase = getSupabaseClient();
    await this.getModelById(modelId);

    const { data: updated, error } = await supabase
      .from('ac_models')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', modelId)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('Failed to update AC model status database error', { modelId, error: error.message });
      throw new BadRequestError(`Failed to update AC model status: ${error.message}`);
    }

    if (!updated) {
      throw new NotFoundError(`AC model with ID '${modelId}' not found`);
    }

    await logActivity({
      actorProfileId,
      action: 'AC_MODEL_STATUS_CHANGED',
      entityType: 'ac_model',
      entityId: modelId,
      details: { isActive },
      ipAddress,
    });

    return this.getModelById(modelId);
  }

  // --- MODEL VARIANTS ---

  public async listModelVariants(modelId: string, activeOnly = true): Promise<AcModelVariantResponse[]> {
    const supabase = getSupabaseClient();
    await this.getModelById(modelId);

    let query = supabase
      .from('ac_model_variants')
      .select('*')
      .eq('model_id', modelId);

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('capacity_tons', { ascending: true });

    if (error) {
      logger.error('Failed to list AC model variants', { modelId, error: error.message });
      throw new BadRequestError(`Failed to list AC model variants: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      modelId: row.model_id,
      variantCode: row.variant_code || null,
      capacityTons: Number(row.capacity_tons),
      capacityDisplay: row.capacity_display || null,
      starRating: row.star_rating,
      acType: row.ac_type,
      technology: row.technology,
      refrigerant: row.refrigerant || null,
      series: row.series || null,
      sourceProvenance: row.source_provenance || null,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  public async getVariantById(variantId: string): Promise<AcModelVariantResponse> {
    const supabase = getSupabaseClient();
    const { data: row, error } = await supabase
      .from('ac_model_variants')
      .select('*')
      .eq('id', variantId)
      .maybeSingle();

    if (error || !row) {
      throw new NotFoundError(`AC model variant with ID '${variantId}' not found`);
    }

    return {
      id: row.id,
      modelId: row.model_id,
      variantCode: row.variant_code || null,
      capacityTons: Number(row.capacity_tons),
      capacityDisplay: row.capacity_display || null,
      starRating: row.star_rating,
      acType: row.ac_type,
      technology: row.technology,
      refrigerant: row.refrigerant || null,
      series: row.series || null,
      sourceProvenance: row.source_provenance || null,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async createVariant(
    modelId: string,
    payload: CreateAcModelVariantPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcModelVariantResponse> {
    const supabase = getSupabaseClient();
    const model = await this.getModelById(modelId);

    const capacityTons = Number(payload.capacityTons);
    const starRating = payload.starRating?.trim() || '3 Star';
    const acType = payload.acType?.trim() || model.acType || 'Split AC';
    const technology = payload.technology?.trim() || model.technology || 'Inverter';
    const capacityDisplay = payload.capacityDisplay?.trim() || `${capacityTons} TR`;

    // Check duplicate by uq_ac_model_variants_spec: (model_id, capacity_tons, star_rating, ac_type, technology)
    const { data: existing } = await supabase
      .from('ac_model_variants')
      .select('id')
      .eq('model_id', modelId)
      .eq('capacity_tons', capacityTons)
      .eq('star_rating', starRating)
      .eq('ac_type', acType)
      .eq('technology', technology)
      .maybeSingle();

    if (existing) {
      throw new ConflictError(
        `A variant with capacity ${capacityTons} TR, ${starRating}, ${acType}, ${technology} already exists for this model.`
      );
    }

    const { data: created, error } = await supabase
      .from('ac_model_variants')
      .insert({
        model_id: modelId,
        variant_code: payload.variantCode?.trim() || null,
        capacity_tons: capacityTons,
        capacity_display: capacityDisplay,
        star_rating: starRating,
        ac_type: acType,
        technology: technology,
        refrigerant: payload.refrigerant?.trim() || model.refrigerant || null,
        series: payload.series?.trim() || null,
        source_provenance: payload.sourceProvenance?.trim() || 'ADMIN_SPEC',
        is_active: payload.isActive !== false,
      })
      .select('*')
      .maybeSingle();

    if (error || !created) {
      logger.error('Failed to create AC model variant', { error: error?.message });
      throw new BadRequestError(`Failed to create AC model variant: ${error?.message}`);
    }

    await logActivity({
      actorProfileId,
      action: 'AC_MODEL_VARIANT_CREATED',
      entityType: 'ac_model_variant',
      entityId: created.id,
      details: {
        modelId,
        modelNumber: model.modelNumber,
        capacityTons,
        starRating,
      },
      ipAddress,
    });

    return {
      id: created.id,
      modelId: created.model_id,
      variantCode: created.variant_code || null,
      capacityTons: Number(created.capacity_tons),
      capacityDisplay: created.capacity_display || null,
      starRating: created.star_rating,
      acType: created.ac_type,
      technology: created.technology,
      refrigerant: created.refrigerant || null,
      series: created.series || null,
      sourceProvenance: created.source_provenance || null,
      isActive: created.is_active,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };
  }

  public async updateVariant(
    variantId: string,
    payload: UpdateAcModelVariantPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcModelVariantResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getVariantById(variantId);

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.variantCode !== undefined) updates.variant_code = payload.variantCode?.trim() || null;
    if (payload.capacityTons !== undefined) updates.capacity_tons = Number(payload.capacityTons);
    if (payload.capacityDisplay !== undefined) updates.capacity_display = payload.capacityDisplay?.trim() || null;
    if (payload.starRating !== undefined) updates.star_rating = payload.starRating.trim();
    if (payload.acType !== undefined) updates.ac_type = payload.acType.trim();
    if (payload.technology !== undefined) updates.technology = payload.technology.trim();
    if (payload.refrigerant !== undefined) updates.refrigerant = payload.refrigerant?.trim() || null;
    if (payload.series !== undefined) updates.series = payload.series?.trim() || null;
    if (payload.sourceProvenance !== undefined) updates.source_provenance = payload.sourceProvenance?.trim() || null;
    if (payload.isActive !== undefined) updates.is_active = payload.isActive;

    // If spec changed, check uniqueness
    const targetCapacity = updates.capacity_tons !== undefined ? updates.capacity_tons : existing.capacityTons;
    const targetRating = updates.star_rating !== undefined ? updates.star_rating : existing.starRating;
    const targetAcType = updates.ac_type !== undefined ? updates.ac_type : existing.acType;
    const targetTech = updates.technology !== undefined ? updates.technology : existing.technology;

    if (
      updates.capacity_tons !== undefined ||
      updates.star_rating !== undefined ||
      updates.ac_type !== undefined ||
      updates.technology !== undefined
    ) {
      const { data: dup } = await supabase
        .from('ac_model_variants')
        .select('id')
        .eq('model_id', existing.modelId)
        .eq('capacity_tons', targetCapacity)
        .eq('star_rating', targetRating)
        .eq('ac_type', targetAcType)
        .eq('technology', targetTech)
        .neq('id', variantId)
        .maybeSingle();

      if (dup) {
        throw new ConflictError(
          `Another variant with this specification already exists for this model.`
        );
      }
    }

    const { data: updated, error } = await supabase
      .from('ac_model_variants')
      .update(updates)
      .eq('id', variantId)
      .select('*')
      .maybeSingle();

    if (error) {
      logger.error('Failed to update AC model variant database error', { variantId, error: error.message });
      throw new BadRequestError(`Failed to update AC model variant: ${error.message}`);
    }

    if (!updated) {
      throw new NotFoundError(`AC model variant with ID '${variantId}' not found`);
    }

    await logActivity({
      actorProfileId,
      action: 'AC_MODEL_VARIANT_UPDATED',
      entityType: 'ac_model_variant',
      entityId: variantId,
      details: { updatedFields: Object.keys(updates) },
      ipAddress,
    });

    return {
      id: updated.id,
      modelId: updated.model_id,
      variantCode: updated.variant_code || null,
      capacityTons: Number(updated.capacity_tons),
      capacityDisplay: updated.capacity_display || null,
      starRating: updated.star_rating,
      acType: updated.ac_type,
      technology: updated.technology,
      refrigerant: updated.refrigerant || null,
      series: updated.series || null,
      sourceProvenance: updated.source_provenance || null,
      isActive: updated.is_active,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }

  public async updateVariantStatus(
    variantId: string,
    isActive: boolean,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<AcModelVariantResponse> {
    const supabase = getSupabaseClient();
    await this.getVariantById(variantId);

    const { data: updated, error } = await supabase
      .from('ac_model_variants')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', variantId)
      .select('*')
      .maybeSingle();

    if (error) {
      logger.error('Failed to update AC model variant status database error', { variantId, error: error.message });
      throw new BadRequestError(`Failed to update AC model variant status: ${error.message}`);
    }

    if (!updated) {
      throw new NotFoundError(`AC model variant with ID '${variantId}' not found`);
    }

    await logActivity({
      actorProfileId,
      action: 'AC_MODEL_VARIANT_STATUS_CHANGED',
      entityType: 'ac_model_variant',
      entityId: variantId,
      details: { isActive },
      ipAddress,
    });

    return {
      id: updated.id,
      modelId: updated.model_id,
      variantCode: updated.variant_code || null,
      capacityTons: Number(updated.capacity_tons),
      capacityDisplay: updated.capacity_display || null,
      starRating: updated.star_rating,
      acType: updated.ac_type,
      technology: updated.technology,
      refrigerant: updated.refrigerant || null,
      series: updated.series || null,
      sourceProvenance: updated.source_provenance || null,
      isActive: updated.is_active,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }
}

export const masterDataService = new MasterDataService();

