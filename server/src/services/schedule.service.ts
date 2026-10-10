import { getSupabaseClient } from '../lib/supabase.js';
import {
  ServiceScheduleResponse,
  ServiceAssignmentSummary,
  CreateServiceSchedulePayload,
  UpdateServiceSchedulePayload,
  AssignTechnicianPayload,
  ReassignTechnicianPayload,
  ReschedulePayload,
  CancelSchedulePayload,
  ScheduleListQuery,
  CalendarScheduleQuery,
  TechnicianRecommendationItem,
  UnscheduledWorkItem,
  WeekDay,
  ServiceRequestStatus,
} from '../types/index.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';

interface RawScheduleJoinRecord {
  id: string;
  schedule_number: string;
  amc_id: string | null;
  asset_id: string | null;
  service_request_id: string | null;
  customer_id: string | null;
  site_id: string | null;
  technician_id: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  visit_number: number | null;
  status: string;
  is_system_generated: boolean;
  notes: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  rescheduled_from_id: string | null;
  pm_obligation_id?: string | null;
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
    ac_type: string | null;
    room_location: string | null;
  } | null;
  technicians?: {
    technician_code: string;
    name: string;
    phone: string;
  } | null;
  service_requests?: {
    request_number: string;
    request_type: string;
    priority: string;
    description: string;
  } | null;
  amc_contracts?: {
    contract_number: string;
  } | null;
}

const WEEK_DAYS: WeekDay[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

export class ScheduleService {
  /**
   * Generates a collision-resistant unique Service Schedule number (e.g. SCH-2026-10492).
   */
  private async generateScheduleNumber(isPm = false): Promise<string> {
    const supabase = getSupabaseClient();
    const year = new Date().getFullYear();
    const prefix = isPm ? `PM-${year}-` : `SCH-${year}-`;

    for (let i = 0; i < 5; i++) {
      const num = Math.floor(10000 + Math.random() * 90000);
      const candidate = `${prefix}${num}`;

      const { data } = await supabase
        .from('service_schedules')
        .select('id')
        .eq('schedule_number', candidate)
        .maybeSingle();

      if (!data) {
        return candidate;
      }
    }

    return `${prefix}${Date.now().toString().slice(-5)}`;
  }

  /**
   * Maps a raw join record to a standardized ServiceScheduleResponse.
   */
  private mapScheduleRecord(
    record: RawScheduleJoinRecord,
    activeAssignment?: ServiceAssignmentSummary | null,
    assignmentHistory?: ServiceAssignmentSummary[]
  ): ServiceScheduleResponse {
    return {
      id: record.id,
      scheduleNumber: record.schedule_number,
      amcId: record.amc_id,
      amcContractNumber: record.amc_contracts?.contract_number || null,
      serviceRequestId: record.service_request_id,
      serviceRequestNumber: record.service_requests?.request_number || null,
      serviceRequestType: (record.service_requests?.request_type as any) || null,
      serviceRequestPriority: (record.service_requests?.priority as any) || null,
      customerId: record.customer_id,
      customerName: record.customers?.name || null,
      customerCode: record.customers?.customer_code || null,
      customerPhone: record.customers?.phone || null,
      siteId: record.site_id,
      siteName: record.customer_sites?.site_name || null,
      siteAddress: record.customer_sites?.address || null,
      assetId: record.asset_id,
      assetTag: record.ac_assets?.asset_tag || null,
      brand: record.ac_assets?.brand || null,
      modelNumber: record.ac_assets?.model_number || null,
      acType: record.ac_assets?.ac_type || null,
      roomLocation: record.ac_assets?.room_location || null,
      scheduledDate: record.scheduled_date,
      startTime: record.start_time || '09:00',
      endTime: record.end_time || '11:00',
      durationMinutes: record.duration_minutes || 120,
      visitNumber: record.visit_number,
      status: record.status as any,
      isSystemGenerated: record.is_system_generated,
      technicianId: record.technician_id,
      technicianName: record.technicians?.name || activeAssignment?.technicianName || null,
      technicianCode: record.technicians?.technician_code || activeAssignment?.technicianCode || null,
      technicianPhone: record.technicians?.phone || activeAssignment?.technicianPhone || null,
      activeAssignment: activeAssignment || null,
      assignmentHistory: assignmentHistory || [],
      cancellationReason: record.cancellation_reason,
      cancelledAt: record.cancelled_at,
      cancelledBy: record.cancelled_by,
      rescheduledFromId: record.rescheduled_from_id,
      pmObligationId: record.pm_obligation_id || null,
      notes: record.notes,
      createdBy: record.created_by,
      updatedBy: record.updated_by,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }

  /**
   * Helper to fetch assignments for a specific schedule.
   */
  private async getAssignmentsForSchedule(scheduleId: string): Promise<{
    active: ServiceAssignmentSummary | null;
    history: ServiceAssignmentSummary[];
  }> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('service_assignments')
      .select('*, technicians(technician_code, name, phone)')
      .eq('service_schedule_id', scheduleId)
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return { active: null, history: [] };
    }

    const history: ServiceAssignmentSummary[] = data.map((row: any) => ({
      id: row.id,
      technicianId: row.technician_id,
      technicianCode: row.technicians?.technician_code || 'N/A',
      technicianName: row.technicians?.name || 'Unknown Technician',
      technicianPhone: row.technicians?.phone || 'N/A',
      assignedBy: row.assigned_by,
      assignedAt: row.assigned_at,
      scheduledStartTime: row.scheduled_start_time,
      scheduledEndTime: row.scheduled_end_time,
      isOverride: row.is_override || false,
      overrideReason: row.override_reason || null,
      status: row.status,
      createdAt: row.created_at,
    }));

    const active = history.find((a) => a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS') || null;
    return { active, history };
  }

  /**
   * List schedules with search, date bounding, filtering, and pagination.
   */
  public async getSchedules(query: ScheduleListQuery): Promise<{
    schedules: ServiceScheduleResponse[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const supabase = getSupabaseClient();
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;
    const offset = (page - 1) * pageSize;

    let dbQuery = supabase
      .from('service_schedules')
      .select(
        '*, customers(name, customer_code, phone), customer_sites(site_name, address), ac_assets(asset_tag, brand, model_number, ac_type, room_location), technicians(technician_code, name, phone), service_requests(request_number, request_type, priority, description), amc_contracts(contract_number)',
        { count: 'exact' }
      );

    // Filters
    if (query.status && query.status !== 'ALL') {
      dbQuery = dbQuery.eq('status', query.status);
    }

    if (query.date) {
      dbQuery = dbQuery.eq('scheduled_date', query.date);
    } else {
      if (query.startDate) {
        dbQuery = dbQuery.gte('scheduled_date', query.startDate);
      }
      if (query.endDate) {
        dbQuery = dbQuery.lte('scheduled_date', query.endDate);
      }
    }

    if (query.technicianId) {
      dbQuery = dbQuery.eq('technician_id', query.technicianId);
    }

    if (query.customerId) {
      dbQuery = dbQuery.eq('customer_id', query.customerId);
    }

    if (query.siteId) {
      dbQuery = dbQuery.eq('site_id', query.siteId);
    }

    if (query.serviceRequestId) {
      dbQuery = dbQuery.eq('service_request_id', query.serviceRequestId);
    }

    if (query.amcId) {
      dbQuery = dbQuery.eq('amc_id', query.amcId);
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      dbQuery = dbQuery.or(
        `schedule_number.ilike.%${term}%,notes.ilike.%${term}%`
      );
    }

    // Sort order: by scheduled_date ASC, start_time ASC
    dbQuery = dbQuery
      .order('scheduled_date', { ascending: true })
      .order('start_time', { ascending: true })
      .range(offset, offset + pageSize - 1);

    const { data, count, error } = await dbQuery;

    if (error) {
      logger.error('Failed to list service schedules', { error: error.message });
      throw new BadRequestError(`Failed to fetch service schedules: ${error.message}`);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);
    const schedules = (data || []).map((row) =>
      this.mapScheduleRecord(row as RawScheduleJoinRecord)
    );

    return {
      schedules,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Calendar view bounded by date range (Day/Week view).
   */
  public async getCalendar(query: CalendarScheduleQuery): Promise<ServiceScheduleResponse[]> {
    const supabase = getSupabaseClient();

    let dbQuery = supabase
      .from('service_schedules')
      .select(
        '*, customers(name, customer_code, phone), customer_sites(site_name, address), ac_assets(asset_tag, brand, model_number, ac_type, room_location), technicians(technician_code, name, phone), service_requests(request_number, request_type, priority, description), amc_contracts(contract_number)'
      )
      .gte('scheduled_date', query.startDate)
      .lte('scheduled_date', query.endDate);

    if (query.technicianId) {
      dbQuery = dbQuery.eq('technician_id', query.technicianId);
    }

    if (query.status && query.status !== 'ALL') {
      dbQuery = dbQuery.eq('status', query.status);
    }

    dbQuery = dbQuery
      .order('scheduled_date', { ascending: true })
      .order('start_time', { ascending: true });

    const { data, error } = await dbQuery;

    if (error) {
      logger.error('Failed to fetch calendar schedules', { error: error.message });
      throw new BadRequestError(`Failed to fetch calendar: ${error.message}`);
    }

    return (data || []).map((row) =>
      this.mapScheduleRecord(row as RawScheduleJoinRecord)
    );
  }

  /**
   * Get single schedule with enriched joins and assignment history.
   */
  public async getScheduleById(id: string): Promise<ServiceScheduleResponse> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('service_schedules')
      .select(
        '*, customers(name, customer_code, phone), customer_sites(site_name, address), ac_assets(asset_tag, brand, model_number, ac_type, room_location), technicians(technician_code, name, phone), service_requests(request_number, request_type, priority, description), amc_contracts(contract_number)'
      )
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundError(`Service schedule with ID '${id}' not found`);
    }

    const { active, history } = await this.getAssignmentsForSchedule(id);
    return this.mapScheduleRecord(data as RawScheduleJoinRecord, active, history);
  }

  /**
   * Identifies unscheduled work waiting for appointment booking.
   * Source A: Service requests in REQUESTED / PENDING without active schedule.
   * Source B: AMC PM obligations in PLANNED / SCHEDULED / DUE without technician assigned.
   */
  public async getUnscheduledWork(): Promise<UnscheduledWorkItem[]> {
    const supabase = getSupabaseClient();
    const items: UnscheduledWorkItem[] = [];

    // 1. Unscheduled Service Requests
    const { data: requests, error: srErr } = await supabase
      .from('service_requests')
      .select('id, request_number, customer_id, site_id, asset_id, request_type, priority, description, preferred_date, reported_date, customers(name, phone), customer_sites(site_name, address), ac_assets(asset_tag, brand, model_number, ac_type)')
      .in('status', ['REQUESTED', 'PENDING'])
      .order('reported_date', { ascending: true })
      .limit(50);

    if (srErr) {
      logger.warn('Failed to query service requests for unscheduled queue', { error: srErr.message });
    } else if (requests && requests.length > 0) {
      // Find which ones already have active schedules
      const requestIds = requests.map((r) => r.id);
      const { data: activeSchedules } = await supabase
        .from('service_schedules')
        .select('service_request_id')
        .in('service_request_id', requestIds)
        .neq('status', 'CANCELLED');

      const scheduledRequestIds = new Set(
        (activeSchedules || []).map((s) => s.service_request_id)
      );

      for (const r of requests as any[]) {
        if (!scheduledRequestIds.has(r.id)) {
          items.push({
            type: 'SERVICE_REQUEST',
            id: r.id,
            identifier: r.request_number,
            customerId: r.customer_id,
            customerName: r.customers?.name || 'Unknown Customer',
            customerPhone: r.customers?.phone || null,
            siteId: r.site_id,
            siteName: r.customer_sites?.site_name || 'Primary Site',
            siteAddress: r.customer_sites?.address || 'Site Address',
            assetId: r.asset_id || null,
            assetTag: r.ac_assets?.asset_tag || null,
            brand: r.ac_assets?.brand || null,
            modelNumber: r.ac_assets?.model_number || null,
            acType: r.ac_assets?.ac_type || null,
            dueDate: r.preferred_date || r.reported_date,
            priority: r.priority,
            description: r.description,
            suggestedDurationMinutes: 120,
          });
        }
      }
    }

    // 2. Unassigned PM Obligations
    const { data: pmSchedules, error: pmErr } = await supabase
      .from('service_schedules')
      .select('id, schedule_number, amc_id, asset_id, customer_id, site_id, scheduled_date, visit_number, notes, customers(name, phone), customer_sites(site_name, address), ac_assets(asset_tag, brand, model_number, ac_type, site_id, customer_sites(site_name, address, customer_id, customers(name, phone))), amc_contracts(contract_number, customer_id, customers(name, phone))')
      .not('amc_id', 'is', null)
      .is('technician_id', null)
      .in('status', ['SCHEDULED', 'PLANNED', 'DUE', 'OVERDUE'])
      .order('scheduled_date', { ascending: true })
      .limit(50);

    if (pmErr) {
      logger.warn('Failed to query PM obligations for unscheduled queue', { error: pmErr.message });
    } else if (pmSchedules) {
      for (const p of pmSchedules as any[]) {
        const resolvedCustomerId = p.customer_id || p.amc_contracts?.customer_id || p.ac_assets?.customer_sites?.customer_id || null;
        const resolvedCustomerName = p.customers?.name || p.amc_contracts?.customers?.name || p.ac_assets?.customer_sites?.customers?.name || 'AMC Client';
        const resolvedCustomerPhone = p.customers?.phone || p.amc_contracts?.customers?.phone || p.ac_assets?.customer_sites?.customers?.phone || null;
        const resolvedSiteId = p.site_id || p.ac_assets?.site_id || null;
        const resolvedSiteName = p.customer_sites?.site_name || p.ac_assets?.customer_sites?.site_name || 'Covered Site';
        const resolvedSiteAddress = p.customer_sites?.address || p.ac_assets?.customer_sites?.address || 'Covered Address';

        items.push({
          type: 'PM_OBLIGATION',
          id: p.id,
          identifier: p.schedule_number,
          customerId: resolvedCustomerId,
          customerName: resolvedCustomerName,
          customerPhone: resolvedCustomerPhone,
          siteId: resolvedSiteId,
          siteName: resolvedSiteName,
          siteAddress: resolvedSiteAddress,
          assetId: p.asset_id,
          assetTag: p.ac_assets?.asset_tag || null,
          brand: p.ac_assets?.brand || null,
          modelNumber: p.ac_assets?.model_number || null,
          acType: p.ac_assets?.ac_type || null,
          dueDate: p.scheduled_date,
          visitNumber: p.visit_number || null,
          priority: 'MEDIUM',
          description: `Preventive Maintenance Visit #${p.visit_number || 1}`,
          amcId: p.amc_id,
          amcContractNumber: p.amc_contracts?.contract_number || null,
          suggestedDurationMinutes: 120,
        });
      }
    }

    return items;
  }

  /**
   * Creates a new operational schedule.
   * Links to either a Service Request, an AMC obligation, or a customer site.
   */
  public async createSchedule(
    payload: CreateServiceSchedulePayload,
    actorId: string,
    ipAddress?: string
  ): Promise<ServiceScheduleResponse> {
    const supabase = getSupabaseClient();
    const startTime = payload.startTime || '09:00';
    const endTime = payload.endTime || '11:00';
    const durationMinutes = payload.durationMinutes || 120;

    let targetCustomerId = payload.customerId || null;
    let targetSiteId = payload.siteId || null;
    let targetAssetId = payload.assetId || null;

    // Handle Service Request Linkage
    if (payload.serviceRequestId) {
      const { data: sr, error: srErr } = await supabase
        .from('service_requests')
        .select('id, request_number, customer_id, site_id, asset_id, status')
        .eq('id', payload.serviceRequestId)
        .maybeSingle();

      if (srErr || !sr) {
        throw new NotFoundError(`Service Request '${payload.serviceRequestId}' not found`);
      }

      if (sr.status === 'CANCELLED' || sr.status === 'CLOSED') {
        throw new BadRequestError(`Cannot schedule service request in terminal state '${sr.status}'`);
      }

      // Check for active duplicate schedule
      const { data: existingActive } = await supabase
        .from('service_schedules')
        .select('id, schedule_number')
        .eq('service_request_id', payload.serviceRequestId)
        .neq('status', 'CANCELLED')
        .maybeSingle();

      if (existingActive) {
        throw new ConflictError(
          `Service Request already has an active schedule (${existingActive.schedule_number}). Use reschedule instead.`,
          { existingScheduleId: existingActive.id, scheduleNumber: existingActive.schedule_number }
        );
      }

      targetCustomerId = targetCustomerId || sr.customer_id;
      targetSiteId = targetSiteId || sr.site_id;
      targetAssetId = targetAssetId || sr.asset_id;
    }

    // Handle PM Obligation Linkage
    if (payload.pmObligationId) {
      const { data: pmById } = await supabase
        .from('service_schedules')
        .select('id, schedule_number, amc_id, asset_id, visit_number, customer_id, site_id, status, technician_id, start_time, end_time, scheduled_date, is_system_generated, notes')
        .eq('id', payload.pmObligationId)
        .maybeSingle();

      let pm = pmById;
      if (!pm) {
        const { data: pmByRef } = await supabase
          .from('service_schedules')
          .select('id, schedule_number, amc_id, asset_id, visit_number, customer_id, site_id, status, technician_id, start_time, end_time, scheduled_date, is_system_generated, notes')
          .eq('pm_obligation_id', payload.pmObligationId)
          .maybeSingle();
        pm = pmByRef;
      }

      if (pm) {
        if (pm.status === 'COMPLETED') {
          throw new ConflictError(
            `PM Obligation '${pm.schedule_number}' has already been completed and cannot be scheduled again.`,
            { status: pm.status, scheduleNumber: pm.schedule_number }
          );
        }

        // Check if this PM obligation record is already active and confirmed with technician/status
        if (
          pm.technician_id ||
          pm.status === 'ASSIGNED' ||
          pm.status === 'IN_PROGRESS' ||
          (pm.status === 'SCHEDULED' && pm.id !== payload.pmObligationId)
        ) {
          throw new ConflictError(
            `PM Obligation '${pm.schedule_number}' already has an active operational schedule. Use reschedule instead.`,
            { existingScheduleId: pm.id, scheduleNumber: pm.schedule_number }
          );
        }

        // Check if another active schedule already references this PM obligation or contract visit
        let duplicatePmQuery = supabase
          .from('service_schedules')
          .select('id, schedule_number')
          .neq('id', pm.id)
          .not('status', 'in', '("CANCELLED","RESCHEDULED")');

        if (pm.amc_id && pm.asset_id && pm.visit_number) {
          duplicatePmQuery = duplicatePmQuery.or(
            `pm_obligation_id.eq.${payload.pmObligationId},and(amc_id.eq.${pm.amc_id},asset_id.eq.${pm.asset_id},visit_number.eq.${pm.visit_number})`
          );
        } else {
          duplicatePmQuery = duplicatePmQuery.eq('pm_obligation_id', payload.pmObligationId);
        }

        const { data: existingPmActive } = await duplicatePmQuery.maybeSingle();

        if (existingPmActive) {
          throw new ConflictError(
            `PM Obligation '${pm.schedule_number}' already has an active schedule (${existingPmActive.schedule_number}). Use reschedule instead.`,
            { existingScheduleId: existingPmActive.id, scheduleNumber: existingPmActive.schedule_number }
          );
        }

        targetCustomerId = targetCustomerId || pm.customer_id;
        targetSiteId = targetSiteId || pm.site_id;
        targetAssetId = targetAssetId || pm.asset_id;

        // If the PM obligation itself is an unassigned placeholder generated by AMC,
        // update and plan this exact schedule record rather than creating an uncontrolled duplicate
        if (pm.id === payload.pmObligationId && (pm.is_system_generated || !pm.technician_id)) {
          if (payload.technicianId) {
            await this.validateTechnicianAssignment(
              payload.technicianId,
              payload.scheduledDate,
              startTime,
              endTime,
              targetSiteId,
              targetAssetId,
              payload.isOverride,
              payload.overrideReason,
              pm.id
            );
          }

          const updateRecord: Record<string, any> = {
            scheduled_date: payload.scheduledDate,
            start_time: startTime,
            end_time: endTime,
            duration_minutes: durationMinutes,
            status: payload.technicianId ? 'ASSIGNED' : 'SCHEDULED',
            technician_id: payload.technicianId || null,
            notes: payload.notes?.trim() || pm.notes || null,
            updated_by: actorId,
          };

          if (!pm.customer_id && targetCustomerId) {
            updateRecord.customer_id = targetCustomerId;
          }
          if (!pm.site_id && targetSiteId) {
            updateRecord.site_id = targetSiteId;
          }

          const { error: updErr } = await supabase
            .from('service_schedules')
            .update(updateRecord)
            .eq('id', pm.id);

          if (updErr) {
            if (
              updErr.code === '23505' ||
              updErr.code === '23P01' ||
              updErr.message?.includes('duplicate key') ||
              updErr.message?.includes('idx_active_schedule') ||
              updErr.message?.includes('TECHNICIAN_OVERLAP_CONFLICT')
            ) {
              throw new ConflictError(
                updErr.message?.includes('TECHNICIAN_OVERLAP_CONFLICT')
                  ? `Technician is already booked for another service during this time window. Overlapping assignments are prohibited.`
                  : `PM Obligation already has an active schedule. Use reschedule instead.`,
                { error: updErr.message }
              );
            }
            throw new BadRequestError(`Failed to update PM schedule: ${updErr.message}`);
          }

          if (payload.technicianId) {
            const scheduledStart = `${payload.scheduledDate}T${startTime}:00Z`;
            const scheduledEnd = `${payload.scheduledDate}T${endTime}:00Z`;

            const { error: assignErr } = await supabase.from('service_assignments').insert({
              service_schedule_id: pm.id,
              service_request_id: null,
              technician_id: payload.technicianId,
              assigned_by: actorId,
              assigned_at: new Date().toISOString(),
              scheduled_start_time: scheduledStart,
              scheduled_end_time: scheduledEnd,
              is_override: payload.isOverride || false,
              override_reason: payload.overrideReason?.trim() || null,
              status: 'ASSIGNED',
            });

            if (assignErr) {
              if (
                assignErr.code === '23P01' ||
                assignErr.code === '23505' ||
                assignErr.message?.includes('TECHNICIAN_OVERLAP_CONFLICT')
              ) {
                throw new ConflictError(
                  `Technician is already booked for another service during this time window. Overlapping assignments are prohibited.`,
                  { conflict: true }
                );
              }
              throw new BadRequestError(`Failed to save assignment: ${assignErr.message}`);
            }
          }

          await logActivity({
            actorProfileId: actorId,
            action: payload.technicianId ? 'SCHEDULE_ASSIGNED' : 'SCHEDULE_UPDATED',
            entityType: 'service_schedule',
            entityId: pm.id,
            details: {
              scheduleNumber: pm.schedule_number,
              pmObligationId: pm.id,
              scheduledDate: payload.scheduledDate,
              technicianId: payload.technicianId || null,
            },
            ipAddress,
          });

          return this.getScheduleById(pm.id);
        }
      } else {
        // If no existing record references this pmObligationId, check for active duplicates
        const { data: existingActive } = await supabase
          .from('service_schedules')
          .select('id, schedule_number')
          .eq('pm_obligation_id', payload.pmObligationId)
          .not('status', 'in', '("CANCELLED","RESCHEDULED")')
          .maybeSingle();

        if (existingActive) {
          throw new ConflictError(
            `PM Obligation '${payload.pmObligationId}' already has an active operational schedule (${existingActive.schedule_number}). Use reschedule instead.`,
            { existingScheduleId: existingActive.id, scheduleNumber: existingActive.schedule_number }
          );
        }
      }
    }

    // Handle AMC Linkage
    if (payload.amcId) {
      const { data: amc, error: amcErr } = await supabase
        .from('amc_contracts')
        .select('id, customer_id')
        .eq('id', payload.amcId)
        .maybeSingle();

      if (amcErr || !amc) {
        throw new NotFoundError(`AMC Contract '${payload.amcId}' not found`);
      }

      targetCustomerId = targetCustomerId || amc.customer_id;
    }

    // Check for duplicate visit if amcId, assetId, and visitNumber are specified
    if (payload.amcId && payload.assetId && payload.visitNumber) {
      const { data: existingVisit } = await supabase
        .from('service_schedules')
        .select('id, schedule_number')
        .eq('amc_id', payload.amcId)
        .eq('asset_id', payload.assetId)
        .eq('visit_number', payload.visitNumber)
        .not('status', 'in', '("CANCELLED","RESCHEDULED")')
        .maybeSingle();

      if (existingVisit) {
        throw new ConflictError(
          `AMC Visit #${payload.visitNumber} for this asset already has an active schedule (${existingVisit.schedule_number}). Use reschedule instead.`,
          { existingScheduleId: existingVisit.id, scheduleNumber: existingVisit.schedule_number }
        );
      }
    }

    // Ensure customer and site are known
    if (!targetCustomerId || !targetSiteId) {
      // If asset is provided, resolve site and customer
      if (targetAssetId) {
        const { data: asset } = await supabase
          .from('ac_assets')
          .select('customer_id, site_id')
          .eq('id', targetAssetId)
          .maybeSingle();

        if (asset) {
          targetCustomerId = targetCustomerId || asset.customer_id;
          targetSiteId = targetSiteId || asset.site_id;
        }
      }
    }

    if (!targetCustomerId || !targetSiteId) {
      throw new BadRequestError('Customer ID and Site ID must be resolved for this schedule');
    }

    const scheduleNumber = await this.generateScheduleNumber(Boolean(payload.amcId || payload.pmObligationId));
    let initialStatus = payload.technicianId ? 'ASSIGNED' : 'SCHEDULED';

    // If technician is requested on creation, validate availability/conflicts
    if (payload.technicianId) {
      await this.validateTechnicianAssignment(
        payload.technicianId,
        payload.scheduledDate,
        startTime,
        endTime,
        targetSiteId,
        targetAssetId,
        payload.isOverride,
        payload.overrideReason
      );
    }

    const insertRecord = {
      schedule_number: scheduleNumber,
      service_request_id: payload.serviceRequestId || null,
      pm_obligation_id: payload.pmObligationId || null,
      amc_id: payload.amcId || null,
      asset_id: targetAssetId,
      visit_number: payload.visitNumber || null,
      customer_id: targetCustomerId,
      site_id: targetSiteId,
      technician_id: payload.technicianId || null,
      scheduled_date: payload.scheduledDate,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: durationMinutes,
      status: initialStatus,
      is_system_generated: false,
      notes: payload.notes?.trim() || null,
      created_by: actorId,
    };

    const { data: inserted, error: insErr } = await supabase
      .from('service_schedules')
      .insert(insertRecord)
      .select()
      .single();

    if (insErr || !inserted) {
      if (
        insErr?.code === '23505' ||
        insErr?.code === '23P01' ||
        insErr?.message?.includes('duplicate key') ||
        insErr?.message?.includes('idx_active_schedule') ||
        insErr?.message?.includes('TECHNICIAN_OVERLAP_CONFLICT')
      ) {
        throw new ConflictError(
          insErr.message?.includes('TECHNICIAN_OVERLAP_CONFLICT')
            ? `Technician is already booked for another service during this time window. Overlapping assignments are prohibited.`
            : `An active schedule already exists for this service request or PM obligation. Use reschedule instead.`,
          { error: insErr.message }
        );
      }
      logger.error('Failed to create service schedule', { error: insErr });
      throw new BadRequestError(`Failed to persist schedule: ${insErr?.message || 'Database error'}`);
    }

    // Create active assignment record if technician specified
    if (payload.technicianId) {
      const scheduledStart = `${payload.scheduledDate}T${startTime}:00Z`;
      const scheduledEnd = `${payload.scheduledDate}T${endTime}:00Z`;

      await supabase.from('service_assignments').insert({
        service_schedule_id: inserted.id,
        service_request_id: payload.serviceRequestId || null,
        technician_id: payload.technicianId,
        assigned_by: actorId,
        assigned_at: new Date().toISOString(),
        scheduled_start_time: scheduledStart,
        scheduled_end_time: scheduledEnd,
        is_override: payload.isOverride || false,
        override_reason: payload.overrideReason?.trim() || null,
        status: 'ASSIGNED',
      });
    }

    // Advance Service Request lifecycle state machine
    if (payload.serviceRequestId) {
      const targetSrStatus = payload.technicianId ? 'ASSIGNED' : 'SCHEDULED';
      await supabase
        .from('service_requests')
        .update({
          status: targetSrStatus,
          updated_by: actorId,
        })
        .eq('id', payload.serviceRequestId);
    }

    await logActivity({
      actorProfileId: actorId,
      action: 'SCHEDULE_CREATED',
      entityType: 'service_schedule',
      entityId: inserted.id,
      details: {
        scheduleNumber,
        scheduledDate: payload.scheduledDate,
        technicianId: payload.technicianId || null,
        serviceRequestId: payload.serviceRequestId || null,
        amcId: payload.amcId || null,
      },
      ipAddress,
    });

    return this.getScheduleById(inserted.id);
  }

  /**
   * Evaluates all technicians for a given schedule context and returns
   * eligibility, conflict detection, score breakdown, and "Why this technician" explanations.
   */
  public async getEligibleTechnicians(
    scheduleId: string,
    queryDate?: string,
    queryStart?: string,
    queryEnd?: string
  ): Promise<TechnicianRecommendationItem[]> {
    const supabase = getSupabaseClient();
    const schedule = await this.getScheduleById(scheduleId);

    const targetDate = queryDate || schedule.scheduledDate;
    const targetStart = queryStart || schedule.startTime || '09:00';
    const targetEnd = queryEnd || schedule.endTime || '11:00';

    // Day of the week for date
    const dateObj = new Date(`${targetDate}T00:00:00Z`);
    const dayOfWeek = WEEK_DAYS[dateObj.getUTCDay()];

    // Site address for area matching
    const siteAddress = (schedule.siteAddress || '').toLowerCase();
    const siteName = (schedule.siteName || '').toLowerCase();

    // Required skills
    const requiredSkills: string[] = [];
    if (schedule.acType) requiredSkills.push(schedule.acType.toLowerCase());
    if (schedule.brand) requiredSkills.push(schedule.brand.toLowerCase());
    if (schedule.serviceRequestType) requiredSkills.push(schedule.serviceRequestType.toLowerCase());
    if (schedule.amcId) requiredSkills.push('preventive', 'pm', 'maintenance');

    // 1. Fetch all technicians
    const { data: technicians, error: techErr } = await supabase
      .from('technicians')
      .select('*')
      .order('name', { ascending: true });

    if (techErr || !technicians) {
      logger.error('Failed to fetch technicians for eligibility', { error: techErr });
      throw new BadRequestError('Failed to query technicians');
    }

    // 2. Fetch all active schedules on targetDate to calculate real workloads and conflicts
    const { data: daySchedules } = await supabase
      .from('service_schedules')
      .select('id, schedule_number, technician_id, start_time, end_time, status')
      .eq('scheduled_date', targetDate)
      .in('status', ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS'])
      .not('technician_id', 'is', null);

    const activeDaySchedules = daySchedules || [];

    const recommendations: TechnicianRecommendationItem[] = [];

    for (const tech of technicians as any[]) {
      // Rule 1: Operational Status
      const isActive =
        tech.is_active === true &&
        tech.status !== 'INACTIVE' &&
        tech.status !== 'ON_LEAVE' &&
        tech.status !== 'OFF_DUTY';

      // Rule 2: Working Days Availability
      const workingDays: WeekDay[] =
        tech.working_days || ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const worksOnDay = workingDays.includes(dayOfWeek);

      // Rule 3: Working Hours Availability
      const startH = tech.working_hours?.start || '09:00';
      const endH = tech.working_hours?.end || '18:00';
      const withinWorkingHours = targetStart >= startH && targetEnd <= endH;

      const isAvailable = isActive && worksOnDay && withinWorkingHours;

      // Rule 4: Overlapping Schedule Conflict
      const techSchedules = activeDaySchedules.filter(
        (s) => s.technician_id === tech.id && s.id !== scheduleId
      );

      const conflict = techSchedules.find((s) => {
        const sStart = s.start_time || '09:00';
        const sEnd = s.end_time || '11:00';
        // Overlap condition: S1 < E2 and E1 > S2
        return sStart < targetEnd && sEnd > targetStart;
      });

      const hasConflict = Boolean(conflict);

      // Rule 5: Workload calculation
      const dailyWorkload = techSchedules.length;
      const maxDailyWorkload = tech.max_daily_workload || 5;
      const isOverloaded = dailyWorkload >= maxDailyWorkload;

      // Rule 6: Service Area Matching
      const techAreas: string[] = tech.service_areas || [];
      const areaMatch =
        techAreas.length === 0 ||
        techAreas.some(
          (area) =>
            siteAddress.includes(area.toLowerCase()) ||
            siteName.includes(area.toLowerCase()) ||
            area.toLowerCase().includes('all')
        );

      // Rule 7: Skill Matching
      const specializations: string[] = tech.specializations || [];
      const skillMatch =
        requiredSkills.length === 0 ||
        specializations.length === 0 ||
        specializations.some((spec) =>
          requiredSkills.some(
            (req) =>
              spec.toLowerCase().includes(req) ||
              req.includes(spec.toLowerCase())
          )
        );

      // Eligibility: strictly false if inactive, not available, conflicting, or max workload reached
      const isEligible = isActive && worksOnDay && withinWorkingHours && !hasConflict && !isOverloaded;

      // Score Calculation (Area: 40%, Availability: 20%, Proximity: 0% [N/A without live GPS], Workload: 10%, Skill: 10%)
      const areaScore = areaMatch ? 40 : 0;
      const availabilityScore = isAvailable ? 20 : 0;
      const proximityScore = 0; // Documented as 0/N/A: GPS tracking is future phase
      const workloadScore = Math.max(0, Math.round(10 * (1 - dailyWorkload / maxDailyWorkload)));
      const skillScore = skillMatch ? 10 : 0;
      const totalScore = areaScore + availabilityScore + proximityScore + workloadScore + skillScore;

      // Human-readable "Why this technician" reasons
      const reasons: string[] = [];
      const warnings: string[] = [];

      if (areaMatch && techAreas.length > 0) {
        reasons.push('✓ Service area match');
      } else if (!areaMatch) {
        warnings.push('⚠ Outside primary service area');
      }

      if (isAvailable) {
        reasons.push('✓ Available during schedule slot');
      } else {
        if (!isActive) warnings.push(`⚠ Technician is ${tech.status.toLowerCase().replace('_', ' ')}`);
        if (!worksOnDay) warnings.push(`⚠ Off-duty on ${dayOfWeek}`);
        if (!withinWorkingHours) warnings.push(`⚠ Outside working hours (${startH} – ${endH})`);
      }

      if (skillMatch && specializations.length > 0) {
        reasons.push('✓ Skill match');
      } else if (!skillMatch) {
        warnings.push('⚠ Missing specialized skill');
      }

      if (hasConflict) {
        warnings.push(
          `⚠ Schedule conflict: assigned to ${conflict?.schedule_number} (${conflict?.start_time}–${conflict?.end_time})`
        );
      } else {
        reasons.push('✓ No schedule conflict');
      }

      reasons.push(`Workload: ${dailyWorkload}/${maxDailyWorkload} jobs today`);
      if (isOverloaded) {
        warnings.push(`⚠ Daily workload limit reached (${dailyWorkload}/${maxDailyWorkload})`);
      }

      recommendations.push({
        technicianId: tech.id,
        technicianCode: tech.technician_code,
        name: tech.name,
        phone: tech.phone,
        specializations,
        serviceAreas: techAreas,
        status: tech.status,
        isActive,
        isEligible,
        score: totalScore,
        scoreBreakdown: {
          areaScore,
          availabilityScore,
          proximityScore,
          workloadScore,
          skillScore,
        },
        areaMatch,
        isAvailable,
        skillMatch,
        hasConflict,
        dailyWorkload,
        maxDailyWorkload,
        reasons,
        warnings,
        conflictDetails: conflict
          ? {
              scheduleId: conflict.id,
              scheduleNumber: conflict.schedule_number,
              startTime: conflict.start_time || '09:00',
              endTime: conflict.end_time || '11:00',
            }
          : undefined,
      });
    }

    // Sort order:
    // 1. Conflict-free & eligible first
    // 2. Total score DESC
    // 3. Lowest daily workload ASC
    recommendations.sort((a, b) => {
      if (a.isEligible && !b.isEligible) return -1;
      if (!a.isEligible && b.isEligible) return 1;
      if (a.hasConflict && !b.hasConflict) return 1;
      if (!a.hasConflict && b.hasConflict) return -1;
      if (b.score !== a.score) return b.score - a.score;
      return a.dailyWorkload - b.dailyWorkload;
    });

    return recommendations;
  }

  /**
   * Validates technician assignment rules, working hours, and schedule conflicts.
   */
  public async validateTechnicianAssignment(
    technicianId: string,
    scheduledDate: string,
    startTime: string,
    endTime: string,
    siteId?: string | null,
    assetId?: string | null,
    isOverride = false,
    overrideReason?: string,
    excludeScheduleId?: string
  ): Promise<void> {
    const supabase = getSupabaseClient();

    // 1. Technician Existence and Operational Status
    const { data: tech, error: techErr } = await supabase
      .from('technicians')
      .select('*')
      .eq('id', technicianId)
      .maybeSingle();

    if (techErr || !tech) {
      throw new NotFoundError(`Technician with ID '${technicianId}' not found`);
    }

    if (!tech.is_active || tech.status === 'INACTIVE' || tech.status === 'ON_LEAVE' || tech.status === 'OFF_DUTY') {
      throw new BadRequestError(
        `Technician '${tech.name}' cannot be assigned because their status is '${tech.status}' (Inactive/Off-duty)`
      );
    }

    // 2. HARD CONFLICT CHECK: Cannot have overlapping active schedule
    let conflictQuery = supabase
      .from('service_schedules')
      .select('id, schedule_number, start_time, end_time')
      .eq('technician_id', technicianId)
      .eq('scheduled_date', scheduledDate)
      .in('status', ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS']);

    if (excludeScheduleId) {
      conflictQuery = conflictQuery.neq('id', excludeScheduleId);
    }

    const { data: existingSchedules } = await conflictQuery;

    const conflict = (existingSchedules || []).find((s) => {
      const sStart = s.start_time || '09:00';
      const sEnd = s.end_time || '11:00';
      return sStart < endTime && sEnd > startTime;
    });

    if (conflict) {
      throw new ConflictError(
        `Technician '${tech.name}' is already assigned to another service (${conflict.schedule_number}) from ${conflict.start_time} to ${conflict.end_time}. Overlapping assignments are prohibited.`,
        {
          conflictScheduleId: conflict.id,
          conflictScheduleNumber: conflict.schedule_number,
          startTime: conflict.start_time,
          endTime: conflict.end_time,
        }
      );
    }

    // 3. SOFT RULES: Working Days and Hours Check
    const dateObj = new Date(`${scheduledDate}T00:00:00Z`);
    const dayOfWeek = WEEK_DAYS[dateObj.getUTCDay()];
    const workingDays: WeekDay[] =
      tech.working_days || ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const worksOnDay = workingDays.includes(dayOfWeek);

    const startH = tech.working_hours?.start || '09:00';
    const endH = tech.working_hours?.end || '18:00';
    const withinWorkingHours = startTime >= startH && endTime <= endH;

    if (!worksOnDay || !withinWorkingHours) {
      if (!isOverride) {
        throw new BadRequestError(
          `Technician '${tech.name}' is scheduled outside working availability (${dayOfWeek}, ${startTime}–${endTime}). Explicit supervisor override and reason are required to proceed.`
        );
      }
      if (!overrideReason || overrideReason.trim().length < 3) {
        throw new BadRequestError('A valid override reason is required when assigning outside technician working hours.');
      }
    }
  }

  /**
   * Assigns a technician to a schedule.
   */
  public async assignTechnician(
    scheduleId: string,
    payload: AssignTechnicianPayload,
    actorId: string,
    ipAddress?: string
  ): Promise<ServiceScheduleResponse> {
    const supabase = getSupabaseClient();
    const schedule = await this.getScheduleById(scheduleId);

    if (schedule.status === 'CANCELLED' || schedule.status === 'COMPLETED') {
      throw new BadRequestError(`Cannot assign technician to schedule in terminal status '${schedule.status}'`);
    }

    const startTime = schedule.startTime || '09:00';
    const endTime = schedule.endTime || '11:00';

    await this.validateTechnicianAssignment(
      payload.technicianId,
      schedule.scheduledDate,
      startTime,
      endTime,
      schedule.siteId,
      schedule.assetId,
      payload.isOverride,
      payload.overrideReason,
      scheduleId
    );

    // Transition any prior active assignments for this schedule to REASSIGNED
    await supabase
      .from('service_assignments')
      .update({ status: 'REASSIGNED' })
      .eq('service_schedule_id', scheduleId)
      .in('status', ['ASSIGNED', 'IN_PROGRESS']);

    // Create new active assignment
    const scheduledStart = `${schedule.scheduledDate}T${startTime}:00Z`;
    const scheduledEnd = `${schedule.scheduledDate}T${endTime}:00Z`;

    const { error: assignErr } = await supabase.from('service_assignments').insert({
      service_schedule_id: scheduleId,
      service_request_id: schedule.serviceRequestId || null,
      technician_id: payload.technicianId,
      assigned_by: actorId,
      assigned_at: new Date().toISOString(),
      scheduled_start_time: scheduledStart,
      scheduled_end_time: scheduledEnd,
      is_override: payload.isOverride || false,
      override_reason: payload.overrideReason?.trim() || null,
      status: 'ASSIGNED',
    });

    if (assignErr) {
      logger.error('Failed to insert service assignment', { error: assignErr });
      if (
        (assignErr as any).code === '23P01' ||
        (assignErr as any).code === '23505' ||
        assignErr.message?.includes('TECHNICIAN_OVERLAP_CONFLICT')
      ) {
        throw new ConflictError(`Technician conflict: ${assignErr.message}`);
      }
      throw new BadRequestError(`Failed to save assignment: ${assignErr.message}`);
    }

    // Update schedule technician and status
    const { error: schedUpErr } = await supabase
      .from('service_schedules')
      .update({
        technician_id: payload.technicianId,
        status: 'ASSIGNED',
        updated_by: actorId,
      })
      .eq('id', scheduleId);

    if (schedUpErr) {
      logger.error('Failed to update schedule status to ASSIGNED', { error: schedUpErr });
      if (
        (schedUpErr as any).code === '23P01' ||
        (schedUpErr as any).code === '23505' ||
        schedUpErr.message?.includes('TECHNICIAN_OVERLAP_CONFLICT')
      ) {
        throw new ConflictError(`Technician conflict: ${schedUpErr.message}`);
      }
      throw new BadRequestError(`Failed to update schedule status: ${schedUpErr.message}`);
    }

    // Advance Service Request lifecycle state if linked
    if (schedule.serviceRequestId) {
      await supabase
        .from('service_requests')
        .update({
          status: 'ASSIGNED',
          updated_by: actorId,
        })
        .eq('id', schedule.serviceRequestId);
    }

    await logActivity({
      actorProfileId: actorId,
      action: 'SCHEDULE_ASSIGNED',
      entityType: 'service_schedule',
      entityId: scheduleId,
      details: {
        scheduleNumber: schedule.scheduleNumber,
        technicianId: payload.technicianId,
        isOverride: payload.isOverride || false,
        overrideReason: payload.overrideReason || null,
      },
      ipAddress,
    });

    return this.getScheduleById(scheduleId);
  }

  /**
   * Reassigns an existing schedule to a new technician.
   * Preserves assignment history and audit trail.
   */
  public async reassignTechnician(
    scheduleId: string,
    payload: ReassignTechnicianPayload,
    actorId: string,
    ipAddress?: string
  ): Promise<ServiceScheduleResponse> {
    const schedule = await this.getScheduleById(scheduleId);
    const previousTechId = schedule.technicianId;

    const result = await this.assignTechnician(scheduleId, payload, actorId, ipAddress);

    await logActivity({
      actorProfileId: actorId,
      action: 'SCHEDULE_REASSIGNED',
      entityType: 'service_schedule',
      entityId: scheduleId,
      details: {
        scheduleNumber: schedule.scheduleNumber,
        previousTechnicianId: previousTechId,
        newTechnicianId: payload.technicianId,
        isOverride: payload.isOverride || false,
        overrideReason: payload.overrideReason || null,
      },
      ipAddress,
    });

    return result;
  }

  /**
   * Reschedules an existing appointment to a new date and time slot.
   * Revalidates technician availability and conflicts on the new slot.
   */
  public async reschedule(
    scheduleId: string,
    payload: ReschedulePayload,
    actorId: string,
    ipAddress?: string
  ): Promise<ServiceScheduleResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getScheduleById(scheduleId);

    if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
      throw new BadRequestError(`Cannot reschedule a service in '${existing.status}' status`);
    }

    const newDate = payload.scheduledDate;
    const newStart = payload.startTime || existing.startTime || '09:00';
    const newEnd = payload.endTime || existing.endTime || '11:00';
    const newDuration = payload.durationMinutes || existing.durationMinutes || 120;
    const targetTechId = payload.technicianId !== undefined ? payload.technicianId : existing.technicianId;

    // If technician is remaining or assigned, revalidate availability & conflicts on the new slot
    if (targetTechId) {
      await this.validateTechnicianAssignment(
        targetTechId,
        newDate,
        newStart,
        newEnd,
        existing.siteId,
        existing.assetId,
        payload.isOverride,
        payload.overrideReason,
        scheduleId
      );
    }

    const newStatus = targetTechId ? 'ASSIGNED' : 'RESCHEDULED';

    const { error: updErr } = await supabase
      .from('service_schedules')
      .update({
        scheduled_date: newDate,
        start_time: newStart,
        end_time: newEnd,
        duration_minutes: newDuration,
        technician_id: targetTechId || null,
        status: newStatus,
        updated_by: actorId,
      })
      .eq('id', scheduleId);

    if (updErr) {
      logger.error('Failed to reschedule service', { error: updErr });
      if (
        (updErr as any).code === '23P01' ||
        (updErr as any).code === '23505' ||
        updErr.message?.includes('TECHNICIAN_OVERLAP_CONFLICT')
      ) {
        throw new ConflictError(`Technician conflict: ${updErr.message}`);
      }
      throw new BadRequestError(`Failed to update schedule: ${updErr.message}`);
    }

    // Update active assignment timestamps if technician exists
    if (targetTechId) {
      const scheduledStart = `${newDate}T${newStart}:00Z`;
      const scheduledEnd = `${newDate}T${newEnd}:00Z`;

      const { error: asgnUpErr } = await supabase
        .from('service_assignments')
        .update({
          scheduled_start_time: scheduledStart,
          scheduled_end_time: scheduledEnd,
          technician_id: targetTechId,
          is_override: payload.isOverride || false,
          override_reason: payload.overrideReason?.trim() || null,
        })
        .eq('service_schedule_id', scheduleId)
        .in('status', ['ASSIGNED', 'IN_PROGRESS']);

      if (asgnUpErr) {
        logger.error('Failed to update assignment timestamps on reschedule', { error: asgnUpErr });
        if (
          (asgnUpErr as any).code === '23P01' ||
          (asgnUpErr as any).code === '23505' ||
          asgnUpErr.message?.includes('TECHNICIAN_OVERLAP_CONFLICT')
        ) {
          throw new ConflictError(`Technician conflict: ${asgnUpErr.message}`);
        }
      }
    }

    await logActivity({
      actorProfileId: actorId,
      action: 'SCHEDULE_RESCHEDULED',
      entityType: 'service_schedule',
      entityId: scheduleId,
      details: {
        scheduleNumber: existing.scheduleNumber,
        previousDate: existing.scheduledDate,
        previousStartTime: existing.startTime,
        previousEndTime: existing.endTime,
        newDate,
        newStartTime: newStart,
        newEndTime: newEnd,
        technicianId: targetTechId || null,
        reason: payload.reason || null,
      },
      ipAddress,
    });

    return this.getScheduleById(scheduleId);
  }

  /**
   * Cancels a schedule with reason.
   * Cancels active assignment and preserves audit trail.
   */
  public async cancelSchedule(
    scheduleId: string,
    payload: CancelSchedulePayload,
    actorId: string,
    ipAddress?: string
  ): Promise<ServiceScheduleResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getScheduleById(scheduleId);

    if (existing.status === 'CANCELLED') {
      return existing;
    }

    if (existing.status === 'COMPLETED') {
      throw new BadRequestError('Cannot cancel a completed service schedule');
    }

    const { error: updErr } = await supabase
      .from('service_schedules')
      .update({
        status: 'CANCELLED',
        cancellation_reason: payload.reason.trim(),
        cancelled_at: new Date().toISOString(),
        cancelled_by: actorId,
        updated_by: actorId,
      })
      .eq('id', scheduleId);

    if (updErr) {
      logger.error('Failed to cancel schedule', { error: updErr });
      throw new BadRequestError(`Failed to cancel schedule: ${updErr.message}`);
    }

    // Cancel active assignment
    await supabase
      .from('service_assignments')
      .update({ status: 'CANCELLED' })
      .eq('service_schedule_id', scheduleId)
      .in('status', ['ASSIGNED', 'IN_PROGRESS']);

    // If this schedule was a follow-up appointment for a service report, clear follow_up_schedule_id so operator can reschedule
    await supabase
      .from('service_reports')
      .update({
        follow_up_schedule_id: null,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      })
      .eq('follow_up_schedule_id', scheduleId);

    // If linked to service request, preserve meaningful prior status rather than blindly overwriting to PENDING
    if (existing.serviceRequestId) {
      const { data: linkedReport } = await supabase
        .from('service_reports')
        .select('primary_outcome')
        .eq('service_request_id', existing.serviceRequestId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let targetStatus: ServiceRequestStatus = 'PENDING';
      if (linkedReport?.primary_outcome === 'PENDING_PARTS') {
        targetStatus = 'AWAITING_PARTS';
      } else if (linkedReport?.primary_outcome === 'PENDING_REPAIRS') {
        targetStatus = 'REVISIT_REQUIRED';
      }

      const { data: currentSr } = await supabase
        .from('service_requests')
        .select('status')
        .eq('id', existing.serviceRequestId)
        .maybeSingle();

      if (currentSr && !['COMPLETED', 'CLOSED', 'RESOLVED'].includes(currentSr.status)) {
        await supabase
          .from('service_requests')
          .update({
            status: targetStatus,
            updated_by: actorId,
          })
          .eq('id', existing.serviceRequestId);
      }
    }

    await logActivity({
      actorProfileId: actorId,
      action: 'SCHEDULE_CANCELLED',
      entityType: 'service_schedule',
      entityId: scheduleId,
      details: {
        scheduleNumber: existing.scheduleNumber,
        reason: payload.reason.trim(),
      },
      ipAddress,
    });

    return this.getScheduleById(scheduleId);
  }
}

export const scheduleService = new ScheduleService();
