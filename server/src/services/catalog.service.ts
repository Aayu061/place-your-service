import { getSupabaseClient } from '../lib/supabase.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';

/* ----------------------------------------------------------------------------
 * One service & AMC catalog shared by PYS and ESS (migration 20261118020000).
 * Prices are stored excluding GST; every price returned here carries the
 * GST breakup so both sites show the same GST-inclusive totals.
 * -------------------------------------------------------------------------- */

export interface PriceBreakup {
  base: number;
  gstRatePercent: number;
  gst: number;
  total: number;
}

export interface CatalogServicePrice extends PriceBreakup {
  acType: string;
  tonnageMin: number;
  tonnageMax: number;
}

export interface CatalogServiceItem {
  code: string;
  name: string;
  shortDescription: string | null;
  includes: string[];
  excludes: string[];
  category: string;
  requestType: string;
  serviceType: string;
  pricingModel: 'FIXED' | 'FROM' | 'QUOTE_AFTER_DIAGNOSIS';
  price: PriceBreakup | null;
  priceMatrix: CatalogServicePrice[];
  sacCode: string | null;
  durationMinutes: number | null;
  warrantyDays: number | null;
  appliesToAcTypes: string[];
  formSchema: unknown;
  legacyCodes: string[];
  isPublic: boolean;
  isActive: boolean;
  displayOrder: number;
}

export interface CatalogAmcPlan {
  code: string;
  planCode: string;
  name: string;
  category: string;
  description: string | null;
  coverageSummary: string | null;
  visitsPerYear: number;
  frequency: string;
  appliesToAcTypes: string[];
  maxEquipmentAgeYears: number | null;
  hasGasCharging: boolean;
  hasSpareParts: boolean;
  hasUnlimitedComplaints: boolean;
  pricingModel: string;
  rates: {
    splitSmall: PriceBreakup | null; // 0.8–1.0 ton
    splitLarge: PriceBreakup | null; // 1.5–2.2 ton
    windowSmall: PriceBreakup | null;
    windowLarge: PriceBreakup | null;
    flat: PriceBreakup | null;
  };
  sacCode: string | null;
  legacyCodes: string[];
}

export interface PublicCatalog {
  version: number;
  generatedAt: string;
  currency: 'INR';
  services: CatalogServiceItem[];
  amcPlans: CatalogAmcPlan[];
}

export interface CatalogItemInput {
  code?: string;
  name?: string;
  shortDescription?: string | null;
  includes?: string[];
  excludes?: string[];
  category?: string;
  requestType?: string;
  serviceType?: string;
  pricingModel?: 'FIXED' | 'FROM' | 'QUOTE_AFTER_DIAGNOSIS';
  basePrice?: number | null;
  gstRatePercent?: number;
  sacCode?: string | null;
  durationMinutes?: number | null;
  warrantyDays?: number | null;
  appliesToAcTypes?: string[];
  formSchema?: Record<string, unknown>;
  isPublic?: boolean;
  isActive?: boolean;
  displayOrder?: number;
}

export interface CatalogPriceInput {
  acType: string;
  tonnageMin: number;
  tonnageMax: number;
  price: number;
}

const roundMoney = (n: number): number => Math.round(n * 100) / 100;

export function priceBreakup(base: number | string | null | undefined, gstRatePercent: number | string | null | undefined): PriceBreakup | null {
  if (base === null || base === undefined || base === '') return null;
  const b = Number(base);
  if (!Number.isFinite(b)) return null;
  const rate = Number(gstRatePercent ?? 0) || 0;
  const gst = roundMoney((b * rate) / 100);
  return { base: roundMoney(b), gstRatePercent: rate, gst, total: roundMoney(b + gst) };
}

const CACHE_TTL_MS = 60_000;

function mapService(row: any, prices: any[]): CatalogServiceItem {
  const gstRate = Number(row.gst_rate_percent ?? 18);
  return {
    code: row.code,
    name: row.name,
    shortDescription: row.short_description ?? null,
    includes: row.includes ?? [],
    excludes: row.excludes ?? [],
    category: row.category,
    requestType: row.request_type,
    serviceType: row.service_type,
    pricingModel: row.pricing_model,
    price: row.pricing_model === 'QUOTE_AFTER_DIAGNOSIS' ? null : priceBreakup(row.base_price, gstRate),
    priceMatrix: prices
      .filter((p) => p.item_id === row.id)
      .map((p) => ({
        acType: p.ac_type,
        tonnageMin: Number(p.tonnage_min),
        tonnageMax: Number(p.tonnage_max),
        ...(priceBreakup(p.price, gstRate) as PriceBreakup),
      }))
      .sort((a, b) => a.acType.localeCompare(b.acType) || a.tonnageMin - b.tonnageMin),
    sacCode: row.sac_code ?? null,
    durationMinutes: row.duration_minutes ?? null,
    warrantyDays: row.warranty_days ?? null,
    appliesToAcTypes: row.applies_to_ac_types ?? [],
    formSchema: row.form_schema ?? null,
    legacyCodes: row.legacy_codes ?? [],
    isPublic: Boolean(row.is_public),
    isActive: Boolean(row.is_active),
    displayOrder: Number(row.display_order ?? 100),
  };
}

function mapAmcPlan(row: any): CatalogAmcPlan {
  const gst = row.gst_rate_percent;
  return {
    code: row.public_code,
    planCode: row.plan_code,
    name: row.name,
    category: row.category,
    description: row.description ?? null,
    coverageSummary: row.coverage_summary ?? null,
    visitsPerYear: Number(row.default_visits_per_year),
    frequency: row.default_frequency,
    appliesToAcTypes: row.applies_to_ac_types ?? [],
    maxEquipmentAgeYears: row.max_equipment_age_years ?? null,
    hasGasCharging: Boolean(row.has_gas_charging),
    hasSpareParts: Boolean(row.has_spare_parts),
    hasUnlimitedComplaints: Boolean(row.has_unlimited_complaints),
    pricingModel: row.pricing_model,
    rates: {
      splitSmall: priceBreakup(row.rate_split_small, gst),
      splitLarge: priceBreakup(row.rate_split_large, gst),
      windowSmall: priceBreakup(row.rate_window_small, gst),
      windowLarge: priceBreakup(row.rate_window_large, gst),
      flat: priceBreakup(row.rate_flat, gst),
    },
    sacCode: row.sac_code ?? null,
    legacyCodes: row.legacy_codes ?? [],
  };
}

function toRow(input: CatalogItemInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const map: Array<[keyof CatalogItemInput, string]> = [
    ['code', 'code'],
    ['name', 'name'],
    ['shortDescription', 'short_description'],
    ['includes', 'includes'],
    ['excludes', 'excludes'],
    ['category', 'category'],
    ['requestType', 'request_type'],
    ['serviceType', 'service_type'],
    ['pricingModel', 'pricing_model'],
    ['basePrice', 'base_price'],
    ['gstRatePercent', 'gst_rate_percent'],
    ['sacCode', 'sac_code'],
    ['durationMinutes', 'duration_minutes'],
    ['warrantyDays', 'warranty_days'],
    ['appliesToAcTypes', 'applies_to_ac_types'],
    ['formSchema', 'form_schema'],
    ['isPublic', 'is_public'],
    ['isActive', 'is_active'],
    ['displayOrder', 'display_order'],
  ];
  for (const [k, col] of map) {
    if (input[k] !== undefined) row[col] = input[k];
  }
  return row;
}

function dbError(action: string, error: { code?: string; message?: string }): never {
  if (error.code === '23505') throw new ConflictError('A catalog item with this code already exists');
  if (error.code === '23514' || error.code === '22P02') {
    throw new BadRequestError('Catalog values are not valid (check price, codes and categories)');
  }
  logger.error(`Catalog ${action} failed`, { error: error.message });
  throw new BadRequestError(`Failed to ${action} catalog item`);
}

export class CatalogService {
  private cache: { version: number; at: number; data: PublicCatalog } | null = null;

  /** Invalidate the in-process cache (after Admin edits or in tests). */
  clearCache(): void {
    this.cache = null;
  }

  /**
   * Make the next public read re-check catalog_meta.version instead of trusting the 60 s window.
   * The copy is kept: same version → same copy; database down → it is still served as the last good copy.
   */
  markStale(): void {
    if (this.cache) this.cache.at = 0;
  }

  private async currentVersion(): Promise<number | null> {
    const { data, error } = await getSupabaseClient().from('catalog_meta').select('version').maybeSingle();
    if (error || !data) return null;
    return Number(data.version);
  }

  /** Public catalog: active + public services and AMC plans, with GST breakup. */
  async getPublicCatalog(): Promise<PublicCatalog> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.data;

    const version = await this.currentVersion();
    if (this.cache && version !== null && version === this.cache.version) {
      this.cache.at = Date.now();
      return this.cache.data;
    }

    const supabase = getSupabaseClient();
    const [itemsRes, plansRes] = await Promise.all([
      supabase
        .from('service_catalog_items')
        .select('*')
        .eq('is_active', true)
        .eq('is_public', true)
        .order('display_order', { ascending: true }),
      supabase
        .from('amc_plans')
        .select('*')
        .eq('is_active', true)
        .eq('is_public', true)
        .order('display_order', { ascending: true }),
    ]);

    if (itemsRes.error || plansRes.error) {
      logger.error('Failed to load public catalog', {
        items: itemsRes.error?.message,
        plans: plansRes.error?.message,
      });
      if (this.cache) return this.cache.data; // serve the last good copy
      throw new BadRequestError('Catalog is temporarily unavailable');
    }

    const items = itemsRes.data ?? [];
    let prices: any[] = [];
    if (items.length > 0) {
      const { data, error } = await supabase
        .from('service_catalog_prices')
        .select('*')
        .in('item_id', items.map((i: any) => i.id));
      if (error) logger.warn('Failed to load catalog price matrix', { error: error.message });
      prices = data ?? [];
    }

    const catalog: PublicCatalog = {
      version: version ?? 0,
      generatedAt: new Date().toISOString(),
      currency: 'INR',
      services: items.map((row: any) => mapService(row, prices)),
      amcPlans: (plansRes.data ?? []).filter((p: any) => p.public_code).map(mapAmcPlan),
    };
    this.cache = { version: catalog.version, at: Date.now(), data: catalog };
    return catalog;
  }

  /** Staff view: every service item including hidden/inactive ones. */
  async listItems(): Promise<CatalogServiceItem[]> {
    const supabase = getSupabaseClient();
    const { data: items, error } = await supabase
      .from('service_catalog_items')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) dbError('list', error);
    const { data: prices } = await supabase.from('service_catalog_prices').select('*');
    return (items ?? []).map((row: any) => mapService(row, prices ?? []));
  }

  async getItem(code: string): Promise<CatalogServiceItem> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('service_catalog_items').select('*').eq('code', code).maybeSingle();
    if (error) dbError('read', error);
    if (!data) throw new NotFoundError(`Catalog item ${code} not found`);
    const { data: prices } = await supabase.from('service_catalog_prices').select('*').eq('item_id', data.id);
    return mapService(data, prices ?? []);
  }

  async createItem(input: CatalogItemInput, actorId?: string): Promise<CatalogServiceItem> {
    const { data, error } = await getSupabaseClient()
      .from('service_catalog_items')
      .insert(toRow(input))
      .select('*')
      .single();
    if (error) dbError('create', error);
    this.clearCache();
    await logActivity({
      actorProfileId: actorId,
      action: 'CATALOG_ITEM_CREATED',
      entityType: 'SERVICE_CATALOG',
      entityId: data.id,
      details: { code: data.code, basePrice: data.base_price },
    });
    return mapService(data, []);
  }

  async updateItem(code: string, input: CatalogItemInput, actorId?: string): Promise<CatalogServiceItem> {
    const before = await this.getItem(code);
    const row = toRow(input);
    if (Object.keys(row).length === 0) return before;
    const { data, error } = await getSupabaseClient()
      .from('service_catalog_items')
      .update(row)
      .eq('code', code)
      .select('*')
      .maybeSingle();
    if (error) dbError('update', error);
    if (!data) throw new NotFoundError(`Catalog item ${code} not found`);
    this.clearCache();
    await logActivity({
      actorProfileId: actorId,
      action: 'CATALOG_ITEM_UPDATED',
      entityType: 'SERVICE_CATALOG',
      entityId: data.id,
      details: { code, changed: Object.keys(row), previousBasePrice: before.price?.base ?? null },
    });
    return this.getItem(data.code);
  }

  /** Replace the AC-type × tonnage price matrix of one item. */
  async replacePrices(code: string, prices: CatalogPriceInput[], actorId?: string): Promise<CatalogServiceItem> {
    const supabase = getSupabaseClient();
    const { data: item, error } = await supabase.from('service_catalog_items').select('id').eq('code', code).maybeSingle();
    if (error) dbError('read', error);
    if (!item) throw new NotFoundError(`Catalog item ${code} not found`);

    const { error: delErr } = await supabase.from('service_catalog_prices').delete().eq('item_id', item.id);
    if (delErr) dbError('update prices of', delErr);
    if (prices.length > 0) {
      const { error: insErr } = await supabase.from('service_catalog_prices').insert(
        prices.map((p) => ({
          item_id: item.id,
          ac_type: p.acType,
          tonnage_min: p.tonnageMin,
          tonnage_max: p.tonnageMax,
          price: p.price,
        }))
      );
      if (insErr) dbError('update prices of', insErr);
    }
    this.clearCache();
    await logActivity({
      actorProfileId: actorId,
      action: 'CATALOG_PRICES_REPLACED',
      entityType: 'SERVICE_CATALOG',
      entityId: item.id,
      details: { code, rows: prices.length },
    });
    return this.getItem(code);
  }
}

export const catalogService = new CatalogService();
