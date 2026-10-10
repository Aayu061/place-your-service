import { getSupabaseClient } from '../lib/supabase.js';
import {
  ServiceRequestResponse,
  CreateServiceRequestPayload,
  UpdateServiceRequestPayload,
  ServiceRequestListQuery,
  ServiceRequestStatus,
  ServiceRequestType,
  ServiceRequestPriority,
} from '../types/index.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';

interface RawServiceRequestJoinRecord {
  id: string;
  request_number: string;
  customer_id: string;
  site_id: string;
  asset_id: string | null;
  request_type: ServiceRequestType;
  priority: ServiceRequestPriority;
  description: string;
  reported_date: string;
  preferred_date: string | null;
  status: ServiceRequestStatus;
  notes: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: {
    name: string;
    customer_code: string;
    phone: string;
  } | null;
  customer_sites?: {
    site_name: string;
    address: string;
  } | null;
  ac_assets?: {
    asset_tag: string;
    brand: string;
    model_number: string | null;
  } | null;
}

export const ALLOWED_SERVICE_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  REQUESTED: ['PENDING', 'CANCELLED', 'ON_HOLD'],
  PENDING: ['SCHEDULED', 'CANCELLED', 'ON_HOLD'],
  SCHEDULED: ['ASSIGNED', 'AWAITING_PARTS', 'REVISIT_REQUIRED', 'PENDING', 'CANCELLED', 'ON_HOLD'],
  ASSIGNED: ['IN_PROGRESS', 'SCHEDULED', 'PENDING', 'AWAITING_PARTS', 'REVISIT_REQUIRED', 'CANCELLED', 'ON_HOLD'],
  IN_PROGRESS: ['AWAITING_PARTS', 'REVISIT_REQUIRED', 'RESOLVED', 'ON_HOLD'],
  AWAITING_PARTS: ['IN_PROGRESS', 'SCHEDULED', 'ASSIGNED', 'CANCELLED', 'ON_HOLD'],
  REVISIT_REQUIRED: ['IN_PROGRESS', 'SCHEDULED', 'ASSIGNED', 'CANCELLED', 'ON_HOLD'],
  ON_HOLD: ['REQUESTED', 'PENDING', 'SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  RESOLVED: ['COMPLETED', 'IN_PROGRESS'],
  COMPLETED: ['PAYMENT', 'CLOSED'],
  PAYMENT: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export class ServiceRequestService {
  /**
   * Generates a collision-resistant unique Service Request number (e.g. SR-2026-104921).
   */
  private async generateRequestNumber(): Promise<string> {
    const supabase = getSupabaseClient();
    const year = new Date().getFullYear();
    for (let i = 0; i < 5; i++) {
      const num = Math.floor(100000 + Math.random() * 900000);
      const candidate = `SR-${year}-${num}`;

      const { data } = await supabase
        .from('service_requests')
        .select('id')
        .eq('request_number', candidate)
        .maybeSingle();

      if (!data) {
        return candidate;
      }
    }
    // Fallback timestamp format
    return `SR-${year}-${Date.now().toString().slice(-6)}`;
  }

  /**
   * Maps raw database join record to standardized ServiceRequestResponse.
   */
  private mapServiceRequestRecord(record: RawServiceRequestJoinRecord): ServiceRequestResponse {
    return {
      id: record.id,
      requestNumber: record.request_number,
      customerId: record.customer_id,
      siteId: record.site_id,
      assetId: record.asset_id,
      requestType: record.request_type,
      priority: record.priority,
      description: record.description,
      reportedDate: record.reported_date,
      preferredDate: record.preferred_date,
      status: record.status,
      notes: record.notes,
      cancellationReason: record.cancellation_reason,
      cancelledAt: record.cancelled_at,
      cancelledBy: record.cancelled_by,
      createdBy: record.created_by,
      updatedBy: record.updated_by,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      customerName: record.customers?.name || null,
      customerCode: record.customers?.customer_code || null,
      customerPhone: record.customers?.phone || null,
      siteName: record.customer_sites?.site_name || null,
      siteAddress: record.customer_sites?.address || null,
      assetTag: record.ac_assets?.asset_tag || null,
      assetBrand: record.ac_assets?.brand || null,
      assetModel: record.ac_assets?.model_number || null,
    };
  }

  /**
   * Validates relational integrity:
   * 1. Customer exists & is valid.
   * 2. Site exists, is active, and belongs to Customer.
   * 3. Asset (if provided) exists, is active, and belongs to Site.
   */
  private async validateRelationships(
    customerId: string,
    siteId: string,
    assetId?: string | null
  ): Promise<void> {
    const supabase = getSupabaseClient();

    // 1. Verify customer exists
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, name, is_active')
      .eq('id', customerId)
      .maybeSingle();

    if (custErr || !customer) {
      throw new NotFoundError(`Customer with ID '${customerId}' not found`);
    }

    if (!customer.is_active) {
      throw new BadRequestError(`Cannot create or modify service request for inactive customer '${customer.name}'`);
    }

    // 2. Verify site exists and belongs to customer
    const { data: site, error: siteErr } = await supabase
      .from('customer_sites')
      .select('id, site_name, customer_id, is_active')
      .eq('id', siteId)
      .maybeSingle();

    if (siteErr || !site) {
      throw new NotFoundError(`Customer site with ID '${siteId}' not found`);
    }

    if (!site.is_active) {
      throw new BadRequestError(`Cannot assign service request to inactive site '${site.site_name}'`);
    }

    if (site.customer_id !== customerId) {
      throw new BadRequestError(
        `Relational Mismatch: Site '${site.site_name}' does not belong to the selected customer`,
        { code: 'SITE_CUSTOMER_MISMATCH' }
      );
    }

    // 3. Verify asset if specified
    if (assetId) {
      const { data: asset, error: assetErr } = await supabase
        .from('ac_assets')
        .select('id, asset_tag, site_id, is_active')
        .eq('id', assetId)
        .maybeSingle();

      if (assetErr || !asset) {
        throw new NotFoundError(`AC Asset with ID '${assetId}' not found`);
      }

      if (!asset.is_active) {
        throw new BadRequestError(`Cannot assign service request to inactive AC asset '${asset.asset_tag}'`);
      }

      if (asset.site_id !== siteId) {
        throw new BadRequestError(
          `Relational Mismatch: AC Asset '${asset.asset_tag}' is located at a different site than '${site.site_name}'`,
          { code: 'ASSET_SITE_MISMATCH' }
        );
      }
    }
  }

  /**
   * Creates a new service request with relational validation.
   */
  public async createServiceRequest(
    payload: CreateServiceRequestPayload,
    actorProfileId?: string,
    ipAddress?: string
  ): Promise<ServiceRequestResponse> {
    const supabase = getSupabaseClient();

    // Validate customer -> site -> asset relationship
    await this.validateRelationships(payload.customerId, payload.siteId, payload.assetId);

    const requestNumber = await this.generateRequestNumber();

    const insertData = {
      request_number: requestNumber,
      customer_id: payload.customerId,
      site_id: payload.siteId,
      asset_id: payload.assetId || null,
      request_type: payload.requestType,
      priority: payload.priority || 'MEDIUM',
      description: payload.description.trim(),
      preferred_date: payload.preferredDate || null,
      status: 'REQUESTED' as ServiceRequestStatus,
      notes: payload.notes?.trim() || null,
      created_by: actorProfileId || null,
    };

    const { data: inserted, error } = await supabase
      .from('service_requests')
      .insert(insertData)
      .select('*, customers(name, customer_code, phone), customer_sites(site_name, address), ac_assets(asset_tag, brand, model_number)')
      .single();

    if (error || !inserted) {
      logger.error('Failed to create service request', { error: error?.message, payload });
      throw new BadRequestError(`Failed to create service request: ${error?.message || 'Unknown database error'}`);
    }

    const response = this.mapServiceRequestRecord(inserted as RawServiceRequestJoinRecord);

    // Audit logging
    await logActivity({
      actorProfileId: actorProfileId || null,
      action: 'SERVICE_REQUEST_CREATED',
      entityType: 'service_request',
      entityId: response.id,
      details: {
        requestNumber: response.requestNumber,
        customerId: response.customerId,
        siteId: response.siteId,
        assetId: response.assetId,
        requestType: response.requestType,
        priority: response.priority,
      },
      ipAddress,
    });

    return response;
  }

  /**
   * Lists service requests with server-side search, filtering, and pagination.
   */
  public async listServiceRequests(
    query: ServiceRequestListQuery = {}
  ): Promise<{
    requests: ServiceRequestResponse[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const supabase = getSupabaseClient();
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;
    const offset = (page - 1) * pageSize;

    let reqQuery = supabase
      .from('service_requests')
      .select('*, customers(name, customer_code, phone), customer_sites(site_name, address), ac_assets(asset_tag, brand, model_number)', { count: 'exact' });

    if (query.status && query.status !== 'ALL') {
      reqQuery = reqQuery.eq('status', query.status);
    }

    if (query.priority && query.priority !== 'ALL') {
      reqQuery = reqQuery.eq('priority', query.priority);
    }

    if (query.requestType && query.requestType !== 'ALL') {
      reqQuery = reqQuery.eq('request_type', query.requestType);
    }

    if (query.customerId) {
      reqQuery = reqQuery.eq('customer_id', query.customerId);
    }

    if (query.siteId) {
      reqQuery = reqQuery.eq('site_id', query.siteId);
    }

    if (query.assetId) {
      reqQuery = reqQuery.eq('asset_id', query.assetId);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      reqQuery = reqQuery.or(`request_number.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`);
    }

    reqQuery = reqQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data: records, error, count } = await reqQuery;

    if (error) {
      logger.error('Failed to list service requests', { error: error.message });
      throw new BadRequestError(`Failed to list service requests: ${error.message}`);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const requests = (records || []).map((r) => this.mapServiceRequestRecord(r as RawServiceRequestJoinRecord));

    return {
      requests,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Retrieves a single service request by UUID.
   */
  public async getServiceRequestById(id: string): Promise<ServiceRequestResponse> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('service_requests')
      .select('*, customers(name, customer_code, phone), customer_sites(site_name, address), ac_assets(asset_tag, brand, model_number)')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundError(`Service request with ID '${id}' not found`);
    }

    return this.mapServiceRequestRecord(data as RawServiceRequestJoinRecord);
  }

  /**
   * Updates service request details (type, priority, description, notes, site, asset).
   */
  public async updateServiceRequest(
    id: string,
    payload: UpdateServiceRequestPayload,
    actorProfileId?: string,
    ipAddress?: string
  ): Promise<ServiceRequestResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getServiceRequestById(id);

    if (existing.status === 'CANCELLED' || existing.status === 'CLOSED') {
      throw new BadRequestError(`Cannot modify a service request that is already in '${existing.status}' status`);
    }

    // If site or asset is being modified, validate relationship
    const targetSiteId = payload.siteId || existing.siteId;
    const targetAssetId = payload.assetId !== undefined ? payload.assetId : existing.assetId;

    if (payload.siteId || payload.assetId !== undefined) {
      await this.validateRelationships(existing.customerId, targetSiteId, targetAssetId);
    }

    const updateData: Record<string, unknown> = {
      updated_by: actorProfileId || null,
    };

    if (payload.requestType !== undefined) updateData.request_type = payload.requestType;
    if (payload.priority !== undefined) updateData.priority = payload.priority;
    if (payload.description !== undefined) updateData.description = payload.description.trim();
    if (payload.preferredDate !== undefined) updateData.preferred_date = payload.preferredDate;
    if (payload.notes !== undefined) updateData.notes = payload.notes ? payload.notes.trim() : null;
    if (payload.siteId !== undefined) updateData.site_id = payload.siteId;
    if (payload.assetId !== undefined) updateData.asset_id = payload.assetId;

    const { data: updated, error } = await supabase
      .from('service_requests')
      .update(updateData)
      .eq('id', id)
      .select('*, customers(name, customer_code, phone), customer_sites(site_name, address), ac_assets(asset_tag, brand, model_number)')
      .single();

    if (error || !updated) {
      logger.error('Failed to update service request', { id, error: error?.message });
      throw new BadRequestError(`Failed to update service request: ${error?.message || 'Database error'}`);
    }

    const response = this.mapServiceRequestRecord(updated as RawServiceRequestJoinRecord);

    await logActivity({
      actorProfileId: actorProfileId || null,
      action: 'SERVICE_REQUEST_UPDATED',
      entityType: 'service_request',
      entityId: id,
      details: {
        requestNumber: response.requestNumber,
        changedFields: Object.keys(updateData),
      },
      ipAddress,
    });

    return response;
  }

  /**
   * Controlled state transition using the PYS state machine.
   */
  public async transitionStatus(
    id: string,
    newStatus: ServiceRequestStatus,
    reason?: string,
    actorProfileId?: string,
    ipAddress?: string
  ): Promise<ServiceRequestResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getServiceRequestById(id);

    // Idempotent no-op check
    if (existing.status === newStatus) {
      return existing;
    }

    // Terminal states cannot be changed
    if (existing.status === 'CANCELLED' || existing.status === 'CLOSED') {
      throw new ConflictError(
        `Cannot change status of a request in terminal state '${existing.status}'`,
        { currentStatus: existing.status, targetStatus: newStatus }
      );
    }

    // Check state machine validity
    const allowedNext = ALLOWED_SERVICE_TRANSITIONS[existing.status] || [];
    if (!allowedNext.includes(newStatus)) {
      throw new ConflictError(
        `Invalid status transition from '${existing.status}' to '${newStatus}'. Allowed: ${allowedNext.join(', ') || 'None'}`,
        { code: 'INVALID_STATUS_TRANSITION', currentStatus: existing.status, targetStatus: newStatus }
      );
    }

    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_by: actorProfileId || null,
    };

    if (newStatus === 'CANCELLED') {
      updateData.cancellation_reason = reason?.trim() || 'Cancelled by staff';
      updateData.cancelled_at = new Date().toISOString();
      updateData.cancelled_by = actorProfileId || null;
    }

    const { data: updated, error } = await supabase
      .from('service_requests')
      .update(updateData)
      .eq('id', id)
      .select('*, customers(name, customer_code, phone), customer_sites(site_name, address), ac_assets(asset_tag, brand, model_number)')
      .single();

    if (error || !updated) {
      logger.error('Failed to transition service request status', { id, error: error?.message });
      throw new BadRequestError(`Failed to update status: ${error?.message || 'Database error'}`);
    }

    const response = this.mapServiceRequestRecord(updated as RawServiceRequestJoinRecord);

    await logActivity({
      actorProfileId: actorProfileId || null,
      action: newStatus === 'CANCELLED' ? 'SERVICE_REQUEST_CANCELLED' : 'SERVICE_REQUEST_STATUS_CHANGED',
      entityType: 'service_request',
      entityId: id,
      details: {
        requestNumber: response.requestNumber,
        previousStatus: existing.status,
        newStatus,
        reason: reason || null,
      },
      ipAddress,
    });

    return response;
  }

  /**
   * Idempotent cancellation of a service request.
   */
  public async cancelServiceRequest(
    id: string,
    reason?: string,
    actorProfileId?: string,
    ipAddress?: string
  ): Promise<ServiceRequestResponse> {
    const existing = await this.getServiceRequestById(id);

    // Idempotent: if already cancelled, return existing without side effects
    if (existing.status === 'CANCELLED') {
      return existing;
    }

    if (existing.status === 'COMPLETED' || existing.status === 'CLOSED') {
      throw new BadRequestError(`Cannot cancel a service request that is already ${existing.status.toLowerCase()}`);
    }

    return this.transitionStatus(id, 'CANCELLED', reason, actorProfileId, ipAddress);
  }
}

export const serviceRequestService = new ServiceRequestService();
