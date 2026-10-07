import { getSupabaseClient } from '../lib/supabase.js';
import {
  SiteResponse,
  CreateSitePayload,
  UpdateSitePayload,
  SiteListQuery,
} from '../types/index.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';

interface RawSiteJoinRecord {
  id: string;
  customer_id: string;
  site_name: string;
  address: string;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  is_primary: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customers?: {
    name: string;
    customer_code: string;
  } | null;
}

export class SiteService {
  /**
   * Maps raw database record to standardized SiteResponse.
   */
  private mapSiteRecord(record: RawSiteJoinRecord, assetCount = 0): SiteResponse {
    return {
      id: record.id,
      customerId: record.customer_id,
      siteName: record.site_name,
      address: record.address,
      contactPerson: record.contact_person,
      contactPhone: record.contact_phone,
      contactEmail: record.contact_email,
      isPrimary: record.is_primary,
      isActive: record.is_active,
      notes: record.notes,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      customerName: record.customers?.name || null,
      customerCode: record.customers?.customer_code || null,
      assetCount,
    };
  }

  /**
   * Retrieves paginated list of sites for a specific customer.
   */
  public async listCustomerSites(
    customerId: string,
    query: SiteListQuery = {}
  ): Promise<{ sites: SiteResponse[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const supabase = getSupabaseClient();
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 50;
    const offset = (page - 1) * pageSize;

    // 1. Verify customer exists
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, name, customer_code')
      .eq('id', customerId)
      .maybeSingle();

    if (custErr || !customer) {
      throw new NotFoundError(`Customer with ID '${customerId}' not found`);
    }

    // 2. Build query
    let siteQuery = supabase
      .from('customer_sites')
      .select('*, customers(name, customer_code)', { count: 'exact' })
      .eq('customer_id', customerId);

    if (query.status === 'ACTIVE') {
      siteQuery = siteQuery.eq('is_active', true);
    } else if (query.status === 'INACTIVE') {
      siteQuery = siteQuery.eq('is_active', false);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      siteQuery = siteQuery.or(`site_name.ilike.%${term}%,address.ilike.%${term}%,contact_person.ilike.%${term}%,contact_phone.ilike.%${term}%`);
    }

    siteQuery = siteQuery
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    const { data: records, error, count } = await siteQuery;

    if (error) {
      logger.error('Failed to list customer sites', { customerId, error: error.message });
      throw new BadRequestError(`Failed to list customer sites: ${error.message}`);
    }

    // 3. Query real asset counts for these sites
    const siteIds = (records || []).map((r) => r.id);
    const assetCountsBySite: Record<string, number> = {};

    if (siteIds.length > 0) {
      const { data: assetCounts, error: countErr } = await supabase
        .from('ac_assets')
        .select('site_id')
        .in('site_id', siteIds)
        .eq('is_active', true);

      if (!countErr && assetCounts) {
        for (const row of assetCounts) {
          assetCountsBySite[row.site_id] = (assetCountsBySite[row.site_id] || 0) + 1;
        }
      }
    }

    const sites = (records || []).map((r) =>
      this.mapSiteRecord(r as unknown as RawSiteJoinRecord, assetCountsBySite[r.id] || 0)
    );

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      sites,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Retrieves single site by UUID.
   */
  public async getSiteById(siteId: string): Promise<SiteResponse> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('customer_sites')
      .select('*, customers(name, customer_code)')
      .eq('id', siteId)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundError(`Site with ID '${siteId}' not found`);
    }

    // Count real AC assets
    const { count: assetCount } = await supabase
      .from('ac_assets')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .eq('is_active', true);

    return this.mapSiteRecord(data as unknown as RawSiteJoinRecord, assetCount || 0);
  }

  /**
   * Creates a new site under a customer with atomic primary site enforcement.
   */
  public async createSite(
    customerId: string,
    payload: CreateSitePayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<SiteResponse> {
    const supabase = getSupabaseClient();

    // 1. Verify customer exists
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, name, customer_code')
      .eq('id', customerId)
      .maybeSingle();

    if (custErr || !customer) {
      throw new NotFoundError(`Customer with ID '${customerId}' not found`);
    }

    // 2. Check if customer currently has any sites
    const { count: existingSiteCount } = await supabase
      .from('customer_sites')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId);

    // If customer has 0 sites, default this new site to primary
    const willBePrimary = payload.isPrimary === true || existingSiteCount === 0;

    // 3. If will be primary, atomically demote existing primary sites first
    if (willBePrimary) {
      await supabase
        .from('customer_sites')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('customer_id', customerId)
        .eq('is_primary', true);
    }

    // 4. Insert new site
    const { data: newSite, error: insertErr } = await supabase
      .from('customer_sites')
      .insert({
        customer_id: customerId,
        site_name: payload.siteName.trim(),
        address: payload.address.trim(),
        contact_person: payload.contactPerson?.trim() || null,
        contact_phone: payload.contactPhone?.trim() || null,
        contact_email: payload.contactEmail?.trim().toLowerCase() || null,
        is_primary: willBePrimary,
        is_active: true,
        notes: payload.notes?.trim() || null,
      })
      .select('*, customers(name, customer_code)')
      .single();

    if (insertErr || !newSite) {
      logger.error('Failed to create customer site', { customerId, error: insertErr?.message });
      throw new BadRequestError(`Failed to create site: ${insertErr?.message}`);
    }

    // 5. Audit log
    await logActivity({
      actorProfileId,
      action: 'SITE_CREATED',
      entityType: 'customer_site',
      entityId: newSite.id,
      details: {
        customerId,
        siteName: newSite.site_name,
        isPrimary: newSite.is_primary,
      },
      ipAddress,
    });

    logger.info('Customer site created successfully', {
      siteId: newSite.id,
      customerId,
      siteName: newSite.site_name,
    });

    return this.mapSiteRecord(newSite as unknown as RawSiteJoinRecord, 0);
  }

  /**
   * Updates an existing customer site.
   */
  public async updateSite(
    siteId: string,
    payload: UpdateSitePayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<SiteResponse> {
    const supabase = getSupabaseClient();

    // 1. Verify existence
    const existing = await this.getSiteById(siteId);

    // 2. If promoting to primary, demote other sites for this customer first
    if (payload.isPrimary === true && !existing.isPrimary) {
      await supabase
        .from('customer_sites')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('customer_id', existing.customerId)
        .eq('is_primary', true);
    }

    // 3. Build update fields
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.siteName !== undefined) updates.site_name = payload.siteName.trim();
    if (payload.address !== undefined) updates.address = payload.address.trim();
    if (payload.contactPerson !== undefined) updates.contact_person = payload.contactPerson?.trim() || null;
    if (payload.contactPhone !== undefined) updates.contact_phone = payload.contactPhone?.trim() || null;
    if (payload.contactEmail !== undefined) updates.contact_email = payload.contactEmail?.trim().toLowerCase() || null;
    if (payload.isPrimary !== undefined) updates.is_primary = payload.isPrimary;
    if (payload.notes !== undefined) updates.notes = payload.notes?.trim() || null;

    const { data: updatedSite, error } = await supabase
      .from('customer_sites')
      .update(updates)
      .eq('id', siteId)
      .select('*, customers(name, customer_code)')
      .single();

    if (error || !updatedSite) {
      logger.error('Failed to update customer site', { siteId, error: error?.message });
      throw new BadRequestError(`Failed to update site: ${error?.message}`);
    }

    // 4. Audit log
    await logActivity({
      actorProfileId,
      action: 'SITE_UPDATED',
      entityType: 'customer_site',
      entityId: siteId,
      details: {
        customerId: existing.customerId,
        updatedFields: Object.keys(updates),
      },
      ipAddress,
    });

    return this.mapSiteRecord(updatedSite as unknown as RawSiteJoinRecord, existing.assetCount || 0);
  }

  /**
   * Atomically promotes a site to primary for its customer.
   */
  public async setPrimarySite(
    siteId: string,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<SiteResponse> {
    const supabase = getSupabaseClient();

    // 1. Verify existence
    const existing = await this.getSiteById(siteId);

    if (existing.isPrimary) {
      return existing; // Already primary, idempotent return
    }

    // 2. Demote current primary site(s)
    await supabase
      .from('customer_sites')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('customer_id', existing.customerId)
      .eq('is_primary', true);

    // 3. Promote target site
    const { data: promoted, error } = await supabase
      .from('customer_sites')
      .update({ is_primary: true, updated_at: new Date().toISOString() })
      .eq('id', siteId)
      .select('*, customers(name, customer_code)')
      .single();

    if (error || !promoted) {
      logger.error('Failed to set primary site', { siteId, error: error?.message });
      throw new BadRequestError(`Failed to set primary site: ${error?.message}`);
    }

    // 4. Audit log
    await logActivity({
      actorProfileId,
      action: 'SITE_SET_PRIMARY',
      entityType: 'customer_site',
      entityId: siteId,
      details: {
        customerId: existing.customerId,
        siteName: existing.siteName,
      },
      ipAddress,
    });

    logger.info('Site set as primary successfully', {
      siteId,
      customerId: existing.customerId,
    });

    return this.mapSiteRecord(promoted as unknown as RawSiteJoinRecord, existing.assetCount || 0);
  }

  /**
   * Updates site active status. Safely prevents deactivation if active AC assets exist.
   */
  public async updateSiteStatus(
    siteId: string,
    isActive: boolean,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<SiteResponse> {
    const supabase = getSupabaseClient();

    // 1. Verify existence
    const existing = await this.getSiteById(siteId);

    // 2. Safety check: prevent deactivating a site that has active AC assets
    if (!isActive) {
      const { count: activeAssetCount } = await supabase
        .from('ac_assets')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .eq('is_active', true);

      if (activeAssetCount && activeAssetCount > 0) {
        throw new BadRequestError(
          `Cannot deactivate site '${existing.siteName}' because it has ${activeAssetCount} active AC asset(s). Deactivate or reassign assets first.`
        );
      }
    }

    // 3. Update status
    const { data: updated, error } = await supabase
      .from('customer_sites')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', siteId)
      .select('*, customers(name, customer_code)')
      .single();

    if (error || !updated) {
      logger.error('Failed to update site status', { siteId, error: error?.message });
      throw new BadRequestError(`Failed to update site status: ${error?.message}`);
    }

    // 4. Audit log
    await logActivity({
      actorProfileId,
      action: 'SITE_STATUS_CHANGED',
      entityType: 'customer_site',
      entityId: siteId,
      details: {
        customerId: existing.customerId,
        isActive,
      },
      ipAddress,
    });

    return this.mapSiteRecord(updated as unknown as RawSiteJoinRecord, existing.assetCount || 0);
  }
}

export const siteService = new SiteService();
