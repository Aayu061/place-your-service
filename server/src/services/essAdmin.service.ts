import { randomBytes } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { catalogService } from './catalog.service.js';
import { mapSeller } from './essSite.service.js';
import type { EssActor, EssRole } from '../middleware/essActor.js';
import {
  businessIdentitySchema,
  ProductInput,
  ProductPatch,
} from '../validators/ess.validator.js';

/**
 * ESS admin area (signed /api/v1/ess/admin routes, ESS Admin / ESS Staff session required).
 * Prices of services and AMC plans stay with PYS Admin; ESS only decides what the website shows.
 */

const MAX_CONTENT_BYTES = 64 * 1024;
/** Only ESS Admin may change these blocks (legal and business facts). */
const ADMIN_ONLY_CONTENT = /^(business\.|legal\.)/;

const PRODUCT_COLUMNS: Array<[keyof ProductInput, string]> = [
  ['name', 'name'],
  ['category', 'category'],
  ['brand', 'brand'],
  ['modelNumber', 'model_number'],
  ['tonnage', 'tonnage'],
  ['starRating', 'star_rating'],
  ['price', 'price'],
  ['mrp', 'mrp'],
  ['stock', 'stock'],
  ['isCustomQuote', 'is_custom_quote'],
  ['description', 'description'],
  ['coolingCapacity', 'cooling_capacity'],
  ['powerConsumption', 'power_consumption'],
  ['refrigerant', 'refrigerant'],
  ['noiseLevel', 'noise_level'],
  ['dimensions', 'dimensions'],
  ['warranty', 'warranty'],
  ['keyFeatures', 'key_features'],
  ['imageUrl', 'image_url'],
  ['spaceType', 'space_type'],
  ['idealFor', 'ideal_for'],
  ['countryOfOrigin', 'country_of_origin'],
  ['isPublished', 'is_published'],
  ['displayOrder', 'display_order'],
];

function productRow(input: Partial<ProductInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, col] of PRODUCT_COLUMNS) if (input[k] !== undefined) row[col] = input[k];
  if (input.stock !== undefined) row.in_stock = input.stock > 0;
  if (input.price !== undefined) {
    row.price_display = input.price == null ? null : `₹${Number(input.price).toLocaleString('en-IN')}`;
  }
  return row;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'ac'
  );
}

function mapAdminProduct(row: any) {
  const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    brand: row.brand ?? null,
    modelNumber: row.model_number ?? null,
    tonnage: row.tonnage ?? null,
    starRating: row.star_rating ?? null,
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    mrp: row.mrp === null || row.mrp === undefined ? null : Number(row.mrp),
    stock: Number(row.stock ?? 0),
    inStock: Boolean(row.in_stock),
    isCustomQuote: Boolean(row.is_custom_quote),
    description: row.description ?? null,
    coolingCapacity: row.cooling_capacity ?? null,
    powerConsumption: row.power_consumption ?? null,
    refrigerant: row.refrigerant ?? null,
    noiseLevel: row.noise_level ?? null,
    dimensions: row.dimensions ?? null,
    warranty: row.warranty ?? null,
    keyFeatures: row.key_features ?? [],
    imageUrl: row.image_url ?? null,
    spaceType: row.space_type ?? null,
    idealFor: row.ideal_for ?? null,
    countryOfOrigin: row.country_of_origin ?? null,
    isPublished: row.is_published !== false,
    displayOrder: Number(row.display_order ?? 100),
    seller: seller ? mapSeller(seller) : null,
    updatedAt: row.updated_at ?? null,
  };
}
export type EssAdminProduct = ReturnType<typeof mapAdminProduct>;

const ADMIN_PRODUCT_SELECT =
  '*, seller:sellers!ess_products_seller_id_fkey(seller_code, legal_name, trade_name, gstin, address, phone, email, ' +
  'grievance_officer_name, grievance_officer_email, grievance_officer_phone, return_policy, is_first_party, status)';

function dbFail(action: string, error: { code?: string; message?: string }): never {
  if (error.code === '23505') throw new ConflictError(`Could not ${action}: it already exists`);
  if (error.code === '23514' || error.code === '22P02' || error.code === '23502') {
    throw new BadRequestError(`Could not ${action}: some values are not valid`);
  }
  throw new Error(`Failed to ${action}: ${error.message}`);
}

const isAdmin = (actor: EssActor) => actor.roles.includes('ESS_ADMIN');

class EssAdminService {
  me(actor: EssActor) {
    return { profileId: actor.profileId, email: actor.email, name: actor.name, roles: actor.roles, isPysAdmin: actor.isPysAdmin };
  }

  async overview() {
    const supabase = getSupabaseClient();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const count = async (build: (q: any) => any): Promise<number> => {
      const { count: n, error } = await build(supabase.from('web_intakes').select('id', { count: 'exact', head: true }));
      if (error) throw new Error(`Failed to count requests: ${error.message}`);
      return n ?? 0;
    };
    const [pending, last24h, sellerInterest, products, content] = await Promise.all([
      count((q) => q.eq('status', 'PENDING_REVIEW')),
      count((q) => q.gte('created_at', since).neq('status', 'SPAM')),
      count((q) => q.eq('status', 'PENDING_REVIEW').eq('kind', 'SELLER_INTEREST')),
      supabase.from('ess_products').select('id, is_published'),
      supabase.from('site_content_blocks').select('key, draft_body, published_body'),
    ]);
    if ((products as any).error) throw new Error(`Failed to count products: ${(products as any).error.message}`);
    if ((content as any).error) throw new Error(`Failed to read content: ${(content as any).error.message}`);
    const productRows = ((products as any).data ?? []) as Array<{ is_published: boolean }>;
    const unpublished = ((content as any).data ?? []).filter(
      (b: any) => JSON.stringify(b.draft_body) !== JSON.stringify(b.published_body)
    ).length;
    return {
      requests: { pendingReview: pending, last24Hours: last24h, sellerInterestPending: sellerInterest },
      products: { total: productRows.length, published: productRows.filter((p) => p.is_published !== false).length },
      content: { blocksWithUnpublishedChanges: unpublished },
    };
  }

  /* ---------------------------------------------------------------- products */

  async listProducts(): Promise<EssAdminProduct[]> {
    const { data, error } = await getSupabaseClient()
      .from('ess_products')
      .select(ADMIN_PRODUCT_SELECT)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw new Error(`Failed to load products: ${error.message}`);
    return (data ?? []).map(mapAdminProduct);
  }

  async createProduct(input: ProductInput, actor: EssActor): Promise<EssAdminProduct> {
    const supabase = getSupabaseClient();
    const id = input.id ?? `${slugify(input.name)}-${randomBytes(3).toString('hex')}`;
    // Phase 2: ESS lists its own ACs only; marketplace sellers arrive in Phase 4.
    const { data: seller, error: sellerErr } = await supabase.from('sellers').select('id').eq('is_first_party', true).single();
    if (sellerErr || !seller) throw new Error('First-party seller (ESS) is missing');
    const { data, error } = await supabase
      .from('ess_products')
      .insert({ ...productRow(input), id, seller_id: (seller as any).id, stock: input.stock ?? 0, in_stock: (input.stock ?? 0) > 0 })
      .select(ADMIN_PRODUCT_SELECT)
      .single();
    if (error) dbFail('add the product', error);
    await logActivity({
      actorProfileId: actor.profileId,
      action: 'ESS_PRODUCT_CREATED',
      entityType: 'ESS_PRODUCT',
      entityId: null,
      details: { productId: id, name: input.name },
    });
    return mapAdminProduct(data);
  }

  async updateProduct(id: string, patch: ProductPatch, actor: EssActor): Promise<EssAdminProduct> {
    const supabase = getSupabaseClient();
    const { data: current, error: curErr } = await supabase.from('ess_products').select('price, mrp').eq('id', id).maybeSingle();
    if (curErr) throw new Error(`Failed to load product: ${curErr.message}`);
    if (!current) throw new NotFoundError('Product not found');
    const price = patch.price !== undefined ? patch.price : (current as any).price;
    const mrp = patch.mrp !== undefined ? patch.mrp : (current as any).mrp;
    if (price != null && mrp != null && Number(price) > Number(mrp)) {
      throw new ValidationError('Request validation failed', [
        { field: 'price', message: 'Selling price cannot be above the MRP', code: 'custom' },
      ]);
    }
    const row = productRow(patch);
    if (Object.keys(row).length === 0) throw new BadRequestError('Nothing to change');
    const { data, error } = await supabase.from('ess_products').update(row).eq('id', id).select(ADMIN_PRODUCT_SELECT).single();
    if (error) dbFail('update the product', error);
    await logActivity({
      actorProfileId: actor.profileId,
      action: 'ESS_PRODUCT_UPDATED',
      entityType: 'ESS_PRODUCT',
      entityId: null,
      details: { productId: id, fields: Object.keys(patch) },
    });
    return mapAdminProduct(data);
  }

  /* ---------------------------------------------------------------- content */

  async listContent() {
    const { data, error } = await getSupabaseClient()
      .from('site_content_blocks')
      .select('key, draft_body, published_body, published_version, published_at, draft_updated_at')
      .order('key');
    if (error) throw new Error(`Failed to load content: ${error.message}`);
    return ((data ?? []) as any[]).map((b) => ({
      key: b.key,
      publishedVersion: Number(b.published_version),
      publishedAt: b.published_at ?? null,
      draftUpdatedAt: b.draft_updated_at,
      hasUnpublishedChanges: JSON.stringify(b.draft_body) !== JSON.stringify(b.published_body),
      adminOnly: ADMIN_ONLY_CONTENT.test(b.key),
    }));
  }

  async getContent(key: string) {
    const { data, error } = await getSupabaseClient()
      .from('site_content_blocks')
      .select('key, draft_body, published_body, published_version, published_at, draft_updated_at')
      .eq('key', key)
      .maybeSingle();
    if (error) throw new Error(`Failed to load content: ${error.message}`);
    if (!data) throw new NotFoundError('Content block not found');
    const b = data as any;
    const { data: versions, error: vErr } = await getSupabaseClient()
      .from('site_content_versions')
      .select('version, published_at')
      .eq('key', key)
      .order('version', { ascending: false })
      .limit(20);
    if (vErr) throw new Error(`Failed to load content history: ${vErr.message}`);
    return {
      key: b.key,
      draft: b.draft_body,
      published: b.published_body ?? null,
      publishedVersion: Number(b.published_version),
      publishedAt: b.published_at ?? null,
      draftUpdatedAt: b.draft_updated_at,
      adminOnly: ADMIN_ONLY_CONTENT.test(b.key),
      history: ((versions ?? []) as any[]).map((v) => ({ version: Number(v.version), publishedAt: v.published_at })),
    };
  }

  async saveDraft(key: string, body: Record<string, unknown>, actor: EssActor) {
    if (ADMIN_ONLY_CONTENT.test(key) && !isAdmin(actor)) throw new ForbiddenError('Only an ESS Admin can edit business and legal details.');
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_CONTENT_BYTES) {
      throw new BadRequestError('This content is too long (64 KB limit).');
    }
    if (key === 'business.identity') {
      const parsed = businessIdentitySchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError(
          'Request validation failed',
          parsed.error.issues.map((i) => ({ field: `body.${i.path.join('.')}`, message: i.message, code: i.code }))
        );
      }
      body = parsed.data as Record<string, unknown>;
    }
    const { error } = await getSupabaseClient()
      .from('site_content_blocks')
      .upsert(
        { key, draft_body: body, draft_updated_by: actor.profileId, draft_updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    if (error) dbFail('save the draft', error);
    return this.getContent(key);
  }

  async publish(key: string, actor: EssActor) {
    if (!isAdmin(actor)) throw new ForbiddenError('Only an ESS Admin can publish website content.');
    const { data, error } = await getSupabaseClient().rpc('publish_site_content', { p_key: key, p_actor: actor.profileId });
    if (error) {
      if ((error as any).code === 'P0002') throw new NotFoundError('Content block not found');
      throw new Error(`Failed to publish: ${error.message}`);
    }
    await logActivity({
      actorProfileId: actor.profileId,
      action: 'ESS_CONTENT_PUBLISHED',
      entityType: 'SITE_CONTENT',
      entityId: null,
      details: data as Record<string, unknown>,
    });
    return this.getContent(key);
  }

  /* ---------------------------------------------------------------- catalog display */

  async getCatalogDisplay() {
    const supabase = getSupabaseClient();
    const [services, plans] = await Promise.all([
      supabase.from('service_catalog_items').select('code, name, category, is_public, is_active, display_order').order('display_order'),
      supabase.from('amc_plans').select('public_code, plan_code, name, category, is_public, is_active, display_order').order('display_order'),
    ]);
    if (services.error) throw new Error(`Failed to load services: ${services.error.message}`);
    if (plans.error) throw new Error(`Failed to load AMC plans: ${plans.error.message}`);
    return {
      services: ((services.data ?? []) as any[]).map((s) => ({
        code: s.code, name: s.name, category: s.category, isPublic: Boolean(s.is_public), isActive: Boolean(s.is_active),
        displayOrder: Number(s.display_order),
      })),
      amcPlans: ((plans.data ?? []) as any[]).map((p) => ({
        code: p.public_code ?? p.plan_code, planCode: p.plan_code, name: p.name, category: p.category,
        isPublic: Boolean(p.is_public), isActive: Boolean(p.is_active), displayOrder: Number(p.display_order ?? 100),
      })),
    };
  }

  async updateCatalogDisplay(
    items: Array<{ type: 'SERVICE' | 'AMC'; code: string; isPublic?: boolean; displayOrder?: number }>,
    actor: EssActor
  ) {
    const supabase = getSupabaseClient();
    for (const it of items) {
      const row: Record<string, unknown> = {};
      if (it.isPublic !== undefined) row.is_public = it.isPublic;
      if (it.displayOrder !== undefined) row.display_order = it.displayOrder;
      if (Object.keys(row).length === 0) continue;
      const q =
        it.type === 'SERVICE'
          ? supabase.from('service_catalog_items').update(row).eq('code', it.code)
          : supabase.from('amc_plans').update(row).or(`public_code.eq.${it.code},plan_code.eq.${it.code}`);
      const { data, error } = await q.select('id');
      if (error) dbFail('update what the website shows', error);
      if (!data || data.length === 0) throw new NotFoundError(`${it.type === 'SERVICE' ? 'Service' : 'AMC plan'} ${it.code} not found`);
    }
    catalogService.clearCache();
    await logActivity({
      actorProfileId: actor.profileId,
      action: 'ESS_CATALOG_DISPLAY_UPDATED',
      entityType: 'CATALOG',
      entityId: null,
      details: { items },
    });
    return this.getCatalogDisplay();
  }

  /* ---------------------------------------------------------------- service areas */

  async listAreas() {
    const { data, error } = await getSupabaseClient()
      .from('service_areas')
      .select('pincode_prefix, label, is_active, notes, updated_at')
      .order('pincode_prefix');
    if (error) throw new Error(`Failed to load service areas: ${error.message}`);
    return ((data ?? []) as any[]).map((a) => ({
      pincodePrefix: a.pincode_prefix, label: a.label, isActive: Boolean(a.is_active), notes: a.notes ?? null, updatedAt: a.updated_at,
    }));
  }

  async upsertArea(input: { pincodePrefix: string; label: string; isActive: boolean; notes?: string | null }, actor: EssActor) {
    const { error } = await getSupabaseClient()
      .from('service_areas')
      .upsert(
        { pincode_prefix: input.pincodePrefix, label: input.label, is_active: input.isActive, notes: input.notes ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'pincode_prefix' }
      );
    if (error) dbFail('save the service area', error);
    await logActivity({
      actorProfileId: actor.profileId,
      action: 'ESS_SERVICE_AREA_SAVED',
      entityType: 'SERVICE_AREA',
      entityId: null,
      details: input,
    });
    return this.listAreas();
  }

  async deleteArea(prefix: string, actor: EssActor) {
    const { data, error } = await getSupabaseClient().from('service_areas').delete().eq('pincode_prefix', prefix).select('id');
    if (error) dbFail('remove the service area', error);
    if (!data || data.length === 0) throw new NotFoundError('Service area not found');
    await logActivity({
      actorProfileId: actor.profileId,
      action: 'ESS_SERVICE_AREA_REMOVED',
      entityType: 'SERVICE_AREA',
      entityId: null,
      details: { pincodePrefix: prefix },
    });
    return this.listAreas();
  }

  /* ---------------------------------------------------------------- users & roles */

  async listUsers() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('app_role_grants')
      .select('id, role, granted_at, profile:profiles!app_role_grants_profile_id_fkey(id, full_name, email)')
      .is('revoked_at', null)
      .order('granted_at');
    if (error) throw new Error(`Failed to load ESS users: ${error.message}`);
    return ((data ?? []) as any[]).map((g) => {
      const p = Array.isArray(g.profile) ? g.profile[0] : g.profile;
      return { grantId: g.id, role: g.role as EssRole, grantedAt: g.granted_at, profileId: p?.id, name: p?.full_name ?? null, email: p?.email ?? null };
    });
  }

  /**
   * Gives an ESS role to a person by email. If they have no account yet, one is created with a
   * one-time password that is returned ONCE (the ESS admin passes it on; they change it at first sign-in).
   */
  async grantRole(input: { email: string; fullName?: string; role: EssRole }, actor: EssActor) {
    const supabase = getSupabaseClient();
    let temporaryPassword: string | null = null;

    let { data: profile, error: pErr } = await supabase.from('profiles').select('id, email, full_name').ilike('email', input.email).maybeSingle();
    if (pErr) throw new Error(`Failed to look up the account: ${pErr.message}`);

    if (!profile) {
      temporaryPassword = `${randomBytes(9).toString('base64url')}-${randomBytes(2).toString('hex')}`;
      const { data: created, error: cErr } = await supabase.auth.admin.createUser({
        email: input.email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: input.fullName ?? null, must_change_password: true, created_for: 'ESS_ADMIN_AREA' },
      });
      if (cErr || !created?.user) {
        if (/already|registered|exists/i.test(cErr?.message ?? '')) {
          throw new ConflictError('An account with this email exists but has no profile. Ask PYS Admin to fix it.');
        }
        throw new Error(`Failed to create the account: ${cErr?.message ?? 'unknown error'}`);
      }
      const { data: newProfile, error: npErr } = await supabase
        .from('profiles')
        .upsert({ id: created.user.id, email: input.email, full_name: input.fullName ?? input.email.split('@')[0] }, { onConflict: 'id' })
        .select('id, email, full_name')
        .single();
      if (npErr) throw new Error(`Failed to create the profile: ${npErr.message}`);
      profile = newProfile;
    }

    const { error: gErr } = await supabase
      .from('app_role_grants')
      .insert({ profile_id: (profile as any).id, role: input.role, granted_by: actor.profileId });
    if (gErr) {
      if ((gErr as any).code === '23505') throw new ConflictError('This person already has that role.');
      dbFail('give the role', gErr);
    }
    await logActivity({
      actorProfileId: actor.profileId,
      action: 'ESS_ROLE_GRANTED',
      entityType: 'PROFILE',
      entityId: (profile as any).id,
      details: { role: input.role, email: input.email, accountCreated: Boolean(temporaryPassword) },
    });
    return { users: await this.listUsers(), temporaryPassword };
  }

  async revokeRole(grantId: string, actor: EssActor) {
    const supabase = getSupabaseClient();
    const { data: grant, error } = await supabase
      .from('app_role_grants')
      .select('id, profile_id, role, revoked_at')
      .eq('id', grantId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load the role: ${error.message}`);
    if (!grant || (grant as any).revoked_at) throw new NotFoundError('Role not found');
    if ((grant as any).profile_id === actor.profileId && (grant as any).role === 'ESS_ADMIN' && !actor.isPysAdmin) {
      throw new BadRequestError('You cannot remove your own ESS Admin role. Ask another ESS Admin.');
    }
    const { error: uErr } = await supabase
      .from('app_role_grants')
      .update({ revoked_at: new Date().toISOString(), revoked_by: actor.profileId })
      .eq('id', grantId);
    if (uErr) dbFail('remove the role', uErr);
    await logActivity({
      actorProfileId: actor.profileId,
      action: 'ESS_ROLE_REVOKED',
      entityType: 'PROFILE',
      entityId: (grant as any).profile_id,
      details: { role: (grant as any).role },
    });
    return this.listUsers();
  }
}

export const essAdminService = new EssAdminService();
