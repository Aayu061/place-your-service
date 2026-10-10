import { getSupabaseClient } from '../lib/supabase.js';
import {
  ServiceVisitReportResponse,
  ServiceReportAssetResponse,
  ServiceReportItemResponse,
  CreateServiceReportPayload,
  UpdateServiceReportPayload,
  ServiceReportListQuery,
  CreateFollowUpSchedulePayload,
  ServiceVisitOutcome,
  ServiceReportSummaryCounts,
} from '../types/index.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';
import { scheduleService } from './schedule.service.js';

export class ServiceReportService {
  /**
   * Helper to write audit logs to activity_logs
   */
  private async recordAudit(
    actorId: string | null,
    action: string,
    entityId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      await logActivity({
        actorProfileId: actorId || null,
        action,
        entityType: 'service_report',
        entityId,
        details,
      });
    } catch (err) {
      logger.error('Failed to log service report activity', { error: err, action, entityId });
    }
  }

  /**
   * Generates a collision-resistant unique Service Schedule number for follow-ups
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
   * Create a Service Visit Report with manually entered unique report number,
   * per-asset details, outcome-specific parts/repairs requirements,
   * and strict workflow state transitions.
   */
  async createReport(
    payload: CreateServiceReportPayload,
    actorId: string
  ): Promise<ServiceVisitReportResponse> {
    const supabase = getSupabaseClient();
    const trimmedReportNumber = payload.reportNumber.trim();

    if (!trimmedReportNumber) {
      throw new BadRequestError('Manual report number is mandatory.');
    }

    // 1. Enforce uniqueness of manually entered report number
    const { data: existingReport, error: checkErr } = await supabase
      .from('service_reports')
      .select('id, report_number')
      .eq('report_number', trimmedReportNumber)
      .maybeSingle();

    if (checkErr) {
      logger.error('Error checking report number uniqueness', { error: checkErr, trimmedReportNumber });
      throw new BadRequestError('Failed to validate report number uniqueness.');
    }

    if (existingReport) {
      throw new ConflictError(
        `Report number "${trimmedReportNumber}" already exists. Please enter a unique report number.`
      );
    }

    // 2. Fetch and validate authoritative schedule
    const { data: schedule, error: schedErr } = await supabase
      .from('service_schedules')
      .select(`
        id, schedule_number, status, scheduled_date, start_time, end_time,
        amc_id, service_request_id, pm_obligation_id,
        customer_id, site_id, asset_id, technician_id
      `)
      .eq('id', payload.scheduleId)
      .maybeSingle();

    if (schedErr || !schedule) {
      throw new NotFoundError(`Scheduled appointment with ID "${payload.scheduleId}" not found.`);
    }

    // 3. Prevent duplicate report submission for the same appointment
    const { data: duplicateScheduleReport } = await supabase
      .from('service_reports')
      .select('id, report_number')
      .eq('service_schedule_id', schedule.id)
      .maybeSingle();

    if (duplicateScheduleReport) {
      throw new ConflictError(
        `A service report (No: "${duplicateScheduleReport.report_number}") has already been recorded for this appointment.`
      );
    }

    // 4. Validate Visit Type Compatibility
    if (payload.visitType === 'PREVENTIVE') {
      if (!schedule.amc_id && !schedule.pm_obligation_id) {
        throw new BadRequestError(
          'Cannot submit a PREVENTIVE visit report for an appointment not linked to an AMC contract or PM obligation.'
        );
      }
    } else if (payload.visitType === 'SERVICE_REQUEST') {
      if (!schedule.service_request_id) {
        throw new BadRequestError(
          'Cannot submit a SERVICE_REQUEST visit report for an appointment not linked to a customer service request.'
        );
      }
    }

    // 5. Multi-asset outcome validation:
    // If any asset is PENDING_PARTS or PENDING_REPAIRS, the overall visit cannot be marked COMPLETED.
    if (payload.primaryOutcome === 'COMPLETED') {
      const pendingAsset = payload.assets.find(
        (a) => a.assetOutcome === 'PENDING_PARTS' || a.assetOutcome === 'PENDING_REPAIRS'
      );
      if (pendingAsset) {
        throw new BadRequestError(
          'Cannot mark overall visit outcome as COMPLETED when one or more AC assets have unresolved pending parts or repairs.'
        );
      }
    }

    const customerId = schedule.customer_id;
    const siteId = schedule.site_id;
    const technicianId = schedule.technician_id;

    if (!customerId || !siteId || !technicianId) {
      throw new BadRequestError(
        'The scheduled appointment must have valid customer, site, and assigned technician references.'
      );
    }

    // 6. Insert Report Header
    const { data: newReport, error: insertErr } = await supabase
      .from('service_reports')
      .insert({
        report_number: trimmedReportNumber,
        visit_type: payload.visitType,
        service_schedule_id: schedule.id,
        service_request_id: schedule.service_request_id || null,
        amc_id: schedule.amc_id || null,
        pm_obligation_id: schedule.pm_obligation_id || null,
        customer_id: customerId,
        site_id: siteId,
        technician_id: technicianId,
        service_date: payload.serviceDate,
        start_time: payload.startTime || schedule.start_time || null,
        end_time: payload.endTime || schedule.end_time || null,
        primary_outcome: payload.primaryOutcome,
        work_description: payload.workDescription || null,
        technician_remarks: payload.technicianRemarks || null,
        customer_representative: payload.customerRepresentative || null,
        customer_acknowledgement: payload.customerAcknowledgement || null,
        customer_signature_url: payload.customerSignatureUrl || null,
        status: 'SUBMITTED',
        created_by: actorId || null,
        updated_by: actorId || null,
      })
      .select()
      .single();

    if (insertErr || !newReport) {
      logger.error('Failed to insert service report header', { error: insertErr, trimmedReportNumber });
      if (insertErr?.code === '23505') {
        throw new ConflictError(`Report number "${trimmedReportNumber}" already exists.`);
      }
      throw new BadRequestError('Failed to save service visit report.');
    }

    // 7. Insert Per-Asset Report Details
    const assetInserts = payload.assets.map((a) => ({
      report_id: newReport.id,
      asset_id: a.assetId,
      fault_reported: a.faultReported || null,
      diagnosis_findings: a.diagnosisFindings || null,
      work_performed: a.workPerformed || null,
      asset_outcome: a.assetOutcome,
      final_condition: a.finalCondition || null,
      refrigerant_added: a.refrigerantAdded ?? false,
      refrigerant_qty_kg: a.refrigerantQtyKg ?? null,
      notes: a.notes || null,
    }));

    const { error: assetErr } = await supabase.from('service_report_assets').insert(assetInserts);
    if (assetErr) {
      logger.error('Failed to insert service report assets', { error: assetErr, reportId: newReport.id });
      // Rollback header
      await supabase.from('service_reports').delete().eq('id', newReport.id);
      throw new BadRequestError('Failed to save per-asset visit findings.');
    }

    // 8. Insert Parts / Repairs Requirements (if any)
    if (payload.items && payload.items.length > 0) {
      const itemInserts = payload.items.map((item) => ({
        report_id: newReport.id,
        asset_id: item.assetId || null,
        item_type: item.itemType,
        item_name: item.itemName,
        part_number: item.partNumber || null,
        quantity: item.quantity || 1,
        reason: item.reason,
        diagnosis: item.diagnosis || null,
        work_completed: item.workCompleted || null,
        recommended_action: item.recommendedAction || null,
        is_approval_required: item.isApprovalRequired ?? false,
        is_specialist_required: item.isSpecialistRequired ?? false,
        is_revisit_required: item.isRevisitRequired ?? true,
        ac_condition: item.acCondition || null,
        follow_up_notes: item.followUpNotes || null,
        is_resolved: false,
      }));

      const { error: itemsErr } = await supabase.from('service_report_items').insert(itemInserts);
      if (itemsErr) {
        logger.error('Failed to insert service report items', { error: itemsErr, reportId: newReport.id });
        await supabase.from('service_report_assets').delete().eq('report_id', newReport.id);
        await supabase.from('service_reports').delete().eq('id', newReport.id);
        throw new BadRequestError('Failed to save outcome-specific parts/repairs details.');
      }
    }

    // 9. State Machine Transitions

    // 9a. Update the schedule: The visit has been attended by the technician on-site
    await supabase
      .from('service_schedules')
      .update({
        status: 'COMPLETED',
        notes: `Visit Report #${trimmedReportNumber} filed (${payload.primaryOutcome})`,
        updated_by: actorId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id);

    // 9b. If linked to an AMC PM obligation (distinct from current appointment), synchronize it to COMPLETED
    if (
      schedule.pm_obligation_id &&
      schedule.pm_obligation_id !== schedule.id &&
      payload.primaryOutcome === 'COMPLETED'
    ) {
      await supabase
        .from('service_schedules')
        .update({
          status: 'COMPLETED',
          notes: `Completed by Visit Report #${trimmedReportNumber}`,
          updated_by: actorId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.pm_obligation_id);
    }

    // 9c. Update Service Request (if applicable) preserving workflow stages:
    // COMPLETED -> RESOLVED (does not skip PAYMENT/CLOSED!)
    // PENDING_PARTS -> AWAITING_PARTS
    // PENDING_REPAIRS -> REVISIT_REQUIRED
    if (schedule.service_request_id) {
      let targetSrStatus = 'RESOLVED';
      if (payload.primaryOutcome === 'PENDING_PARTS') {
        targetSrStatus = 'AWAITING_PARTS';
      } else if (payload.primaryOutcome === 'PENDING_REPAIRS') {
        targetSrStatus = 'REVISIT_REQUIRED';
      }

      await supabase
        .from('service_requests')
        .update({
          status: targetSrStatus,
          notes: `Updated by Report #${trimmedReportNumber} (${payload.primaryOutcome})`,
          updated_by: actorId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.service_request_id);
    }

    // 10. Audit Logging
    await this.recordAudit(actorId, 'SERVICE_REPORT_CREATED', newReport.id, {
      reportNumber: trimmedReportNumber,
      scheduleId: schedule.id,
      scheduleNumber: schedule.schedule_number,
      visitType: payload.visitType,
      primaryOutcome: payload.primaryOutcome,
      assetCount: payload.assets.length,
      itemCount: payload.items?.length || 0,
    });

    return this.getReportById(newReport.id);
  }

  /**
   * Get single report by UUID with joined schedule, customer, site, technician, assets, and items.
   */
  async getReportById(id: string): Promise<ServiceVisitReportResponse> {
    const supabase = getSupabaseClient();

    const { data: row, error } = await supabase
      .from('service_reports')
      .select(`
        id, report_number, visit_type, service_schedule_id, service_request_id,
        amc_id, pm_obligation_id, customer_id, site_id, technician_id,
        service_date, start_time, end_time, primary_outcome,
        work_description, technician_remarks, customer_representative,
        customer_acknowledgement, customer_signature_url, status,
        follow_up_schedule_id, created_by, updated_by, created_at, updated_at,
        customers (id, name, customer_code, phone),
        customer_sites (id, site_name, address),
        technicians (id, name, technician_code, phone),
        service_schedules!service_reports_service_schedule_id_fkey (id, schedule_number),
        service_requests (id, request_number),
        amc_contracts (id, contract_number),
        profiles!service_reports_created_by_fkey (id, full_name)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error || !row) {
      throw new NotFoundError(`Service report with ID "${id}" not found.`);
    }

    // Fetch assets
    const { data: rawAssets } = await supabase
      .from('service_report_assets')
      .select(`
        id, report_id, asset_id, fault_reported, diagnosis_findings,
        work_performed, asset_outcome, final_condition,
        refrigerant_added, refrigerant_qty_kg, notes, created_at, updated_at,
        ac_assets (id, asset_tag, brand, model_number, room_location)
      `)
      .eq('report_id', id);

    // Fetch items
    const { data: rawItems } = await supabase
      .from('service_report_items')
      .select(`
        id, report_id, asset_id, item_type, item_name, part_number,
        quantity, reason, diagnosis, work_completed, recommended_action,
        is_approval_required, is_specialist_required, is_revisit_required,
        ac_condition, follow_up_notes, is_resolved, created_at, updated_at,
        ac_assets (id, asset_tag)
      `)
      .eq('report_id', id);

    // Fetch follow-up schedule number if exists and is active (not cancelled)
    let followUpScheduleNumber: string | null = null;
    let effectiveFollowUpScheduleId: string | null = row.follow_up_schedule_id;
    if (row.follow_up_schedule_id) {
      const { data: followUpSched } = await supabase
        .from('service_schedules')
        .select('schedule_number, status')
        .eq('id', row.follow_up_schedule_id)
        .maybeSingle();

      if (followUpSched && followUpSched.status !== 'CANCELLED') {
        followUpScheduleNumber = followUpSched.schedule_number;
      } else {
        // Follow-up was cancelled or missing: clear stale reference so parent report is unblocked
        followUpScheduleNumber = null;
        effectiveFollowUpScheduleId = null;
        await supabase
          .from('service_reports')
          .update({ follow_up_schedule_id: null, updated_at: new Date().toISOString() })
          .eq('id', row.id);
      }
    }

    const assets: ServiceReportAssetResponse[] = (rawAssets || []).map((a: any) => ({
      id: a.id,
      reportId: a.report_id,
      assetId: a.asset_id,
      assetTag: a.ac_assets?.asset_tag || null,
      brand: a.ac_assets?.brand || null,
      modelNumber: a.ac_assets?.model_number || null,
      roomLocation: a.ac_assets?.room_location || null,
      faultReported: a.fault_reported,
      diagnosisFindings: a.diagnosis_findings,
      workPerformed: a.work_performed,
      assetOutcome: a.asset_outcome as ServiceVisitOutcome,
      finalCondition: a.final_condition,
      refrigerantAdded: a.refrigerant_added,
      refrigerantQtyKg: a.refrigerant_qty_kg ? Number(a.refrigerant_qty_kg) : null,
      notes: a.notes,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    }));

    const items: ServiceReportItemResponse[] = (rawItems || []).map((i: any) => ({
      id: i.id,
      reportId: i.report_id,
      assetId: i.asset_id,
      assetTag: i.ac_assets?.asset_tag || null,
      itemType: i.item_type,
      itemName: i.item_name,
      partNumber: i.part_number,
      quantity: i.quantity,
      reason: i.reason,
      diagnosis: i.diagnosis,
      workCompleted: i.work_completed,
      recommendedAction: i.recommended_action,
      isApprovalRequired: i.is_approval_required,
      isSpecialistRequired: i.is_specialist_required,
      isRevisitRequired: i.is_revisit_required,
      acCondition: i.ac_condition,
      followUpNotes: i.follow_up_notes,
      isResolved: i.is_resolved,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
    }));

    return {
      id: row.id,
      reportNumber: row.report_number,
      visitType: row.visit_type,
      scheduleId: row.service_schedule_id,
      scheduleNumber: (row.service_schedules as any)?.schedule_number || null,
      serviceRequestId: row.service_request_id,
      serviceRequestNumber: (row.service_requests as any)?.request_number || null,
      amcId: row.amc_id,
      amcContractNumber: (row.amc_contracts as any)?.contract_number || null,
      pmObligationId: row.pm_obligation_id,
      customerId: row.customer_id,
      customerName: (row.customers as any)?.name || null,
      customerCode: (row.customers as any)?.customer_code || null,
      customerPhone: (row.customers as any)?.phone || null,
      siteId: row.site_id,
      siteName: (row.customer_sites as any)?.site_name || null,
      siteAddress: (row.customer_sites as any)?.address || null,
      technicianId: row.technician_id,
      technicianName: (row.technicians as any)?.name || null,
      technicianCode: (row.technicians as any)?.technician_code || null,
      technicianPhone: (row.technicians as any)?.phone || null,
      serviceDate: row.service_date,
      startTime: row.start_time,
      endTime: row.end_time,
      primaryOutcome: row.primary_outcome as ServiceVisitOutcome,
      workDescription: row.work_description,
      technicianRemarks: row.technician_remarks,
      customerRepresentative: row.customer_representative,
      customerAcknowledgement: row.customer_acknowledgement,
      customerSignatureUrl: row.customer_signature_url,
      status: row.status,
      followUpScheduleId: effectiveFollowUpScheduleId,
      followUpScheduleNumber,
      assets,
      items,
      createdBy: row.created_by,
      createdByName: (row.profiles as any)?.full_name || null,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get single report by appointment/schedule ID.
   */
  async getReportByScheduleId(scheduleId: string): Promise<ServiceVisitReportResponse | null> {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('service_reports')
      .select('id')
      .eq('service_schedule_id', scheduleId)
      .maybeSingle();

    if (!data) {
      return null;
    }

    return this.getReportById(data.id);
  }

  /**
   * List reports with search, filtering, and pagination.
   */
  async listReports(query: ServiceReportListQuery): Promise<{
    reports: ServiceVisitReportResponse[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    summary: ServiceReportSummaryCounts;
  }> {
    const supabase = getSupabaseClient();
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let dbQuery = supabase
      .from('service_reports')
      .select(
        `
        id, report_number, visit_type, service_schedule_id, service_request_id,
        amc_id, pm_obligation_id, customer_id, site_id, technician_id,
        service_date, start_time, end_time, primary_outcome,
        work_description, technician_remarks, customer_representative,
        customer_acknowledgement, customer_signature_url, status,
        follow_up_schedule_id, created_by, updated_by, created_at, updated_at,
        customers (id, name, customer_code, phone),
        customer_sites (id, site_name, address),
        technicians (id, name, technician_code, phone),
        service_schedules!service_reports_service_schedule_id_fkey (id, schedule_number),
        follow_up_schedules:service_schedules!service_reports_follow_up_schedule_id_fkey (id, schedule_number, status),
        service_requests (id, request_number),
        amc_contracts (id, contract_number),
        profiles!service_reports_created_by_fkey (id, full_name)
      `,
        { count: 'exact' }
      );

    if (query.visitType && query.visitType !== 'ALL') {
      dbQuery = dbQuery.eq('visit_type', query.visitType);
    }

    if (query.outcome && query.outcome !== 'ALL') {
      dbQuery = dbQuery.eq('primary_outcome', query.outcome);
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

    if (query.startDate) {
      dbQuery = dbQuery.gte('service_date', query.startDate);
    }

    if (query.endDate) {
      dbQuery = dbQuery.lte('service_date', query.endDate);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      dbQuery = dbQuery.ilike('report_number', `%${term}%`);
    }

    dbQuery = dbQuery.order('service_date', { ascending: false }).order('created_at', { ascending: false });
    dbQuery = dbQuery.range(from, to);

    const { data: rows, count, error } = await dbQuery;

    if (error) {
      logger.error('Failed to list service reports', { error, query });
      throw new BadRequestError('Failed to fetch service reports.');
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize) || 1;

    // Fast-map reports for list view
    const reports: ServiceVisitReportResponse[] = (rows || []).map((row: any) => ({
      id: row.id,
      reportNumber: row.report_number,
      visitType: row.visit_type,
      scheduleId: row.service_schedule_id,
      scheduleNumber: row.service_schedules?.schedule_number || null,
      serviceRequestId: row.service_request_id,
      serviceRequestNumber: row.service_requests?.request_number || null,
      amcId: row.amc_id,
      amcContractNumber: row.amc_contracts?.contract_number || null,
      pmObligationId: row.pm_obligation_id,
      customerId: row.customer_id,
      customerName: row.customers?.name || null,
      customerCode: row.customers?.customer_code || null,
      customerPhone: row.customers?.phone || null,
      siteId: row.site_id,
      siteName: row.customer_sites?.site_name || null,
      siteAddress: row.customer_sites?.address || null,
      technicianId: row.technician_id,
      technicianName: row.technicians?.name || null,
      technicianCode: row.technicians?.technician_code || null,
      technicianPhone: row.technicians?.phone || null,
      serviceDate: row.service_date,
      startTime: row.start_time,
      endTime: row.end_time,
      primaryOutcome: row.primary_outcome as ServiceVisitOutcome,
      workDescription: row.work_description,
      technicianRemarks: row.technician_remarks,
      customerRepresentative: row.customer_representative,
      customerAcknowledgement: row.customer_acknowledgement,
      customerSignatureUrl: row.customer_signature_url,
      status: row.status,
      followUpScheduleId:
        (row.follow_up_schedules as any)?.status !== 'CANCELLED' ? row.follow_up_schedule_id : null,
      followUpScheduleNumber:
        (row.follow_up_schedules as any)?.status !== 'CANCELLED'
          ? (row.follow_up_schedules as any)?.schedule_number || null
          : null,
      assets: [],
      items: [],
      createdBy: row.created_by,
      createdByName: row.profiles?.full_name || null,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    // Server-wide aggregate counts
    let totalAll = total;
    let completedAll = 0;
    let pendingPartsAll = 0;
    let pendingRepairsAll = 0;

    try {
      const [
        { count: cTotal },
        { count: cCompleted },
        { count: cParts },
        { count: cRepairs },
      ] = await Promise.all([
        supabase.from('service_reports').select('id', { count: 'exact', head: true }),
        supabase.from('service_reports').select('id', { count: 'exact', head: true }).eq('primary_outcome', 'COMPLETED'),
        supabase.from('service_reports').select('id', { count: 'exact', head: true }).eq('primary_outcome', 'PENDING_PARTS'),
        supabase.from('service_reports').select('id', { count: 'exact', head: true }).eq('primary_outcome', 'PENDING_REPAIRS'),
      ]);
      totalAll = cTotal ?? total;
      completedAll = cCompleted ?? 0;
      pendingPartsAll = cParts ?? 0;
      pendingRepairsAll = cRepairs ?? 0;
    } catch {
      // Keep fallbacks
    }

    const summary: ServiceReportSummaryCounts = {
      total: totalAll,
      completed: completedAll,
      pendingParts: pendingPartsAll,
      pendingRepairs: pendingRepairsAll,
    };

    return { reports, total, page, pageSize, totalPages, summary };
  }

  /**
   * Update report fields (e.g. technician remarks, customer feedback, corrected details)
   */
  async updateReport(
    id: string,
    payload: UpdateServiceReportPayload,
    actorId: string
  ): Promise<ServiceVisitReportResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getReportById(id);

    // If reportNumber changed, check uniqueness
    if (payload.reportNumber && payload.reportNumber.trim() !== existing.reportNumber) {
      const trimmedNumber = payload.reportNumber.trim();
      const { data: conflict } = await supabase
        .from('service_reports')
        .select('id')
        .eq('report_number', trimmedNumber)
        .neq('id', id)
        .maybeSingle();

      if (conflict) {
        throw new ConflictError(`Report number "${trimmedNumber}" is already used by another visit report.`);
      }
    }

    const updates: Record<string, unknown> = {
      updated_by: actorId || null,
      updated_at: new Date().toISOString(),
    };

    if (payload.reportNumber) updates.report_number = payload.reportNumber.trim();
    if (payload.serviceDate !== undefined) updates.service_date = payload.serviceDate;
    if (payload.startTime !== undefined) updates.start_time = payload.startTime;
    if (payload.endTime !== undefined) updates.end_time = payload.endTime;
    if (payload.workDescription !== undefined) updates.work_description = payload.workDescription;
    if (payload.technicianRemarks !== undefined) updates.technician_remarks = payload.technicianRemarks;
    if (payload.customerRepresentative !== undefined) updates.customer_representative = payload.customerRepresentative;
    if (payload.customerAcknowledgement !== undefined) updates.customer_acknowledgement = payload.customerAcknowledgement;
    if (payload.customerSignatureUrl !== undefined) updates.customer_signature_url = payload.customerSignatureUrl;

    const { error } = await supabase.from('service_reports').update(updates).eq('id', id);

    if (error) {
      logger.error('Failed to update service report', { error, id });
      throw new BadRequestError('Failed to update service report.');
    }

    // Update asset findings if supplied
    if (payload.assets && payload.assets.length > 0) {
      await supabase.from('service_report_assets').delete().eq('report_id', id);
      const assetInserts = payload.assets.map((a) => ({
        report_id: id,
        asset_id: a.assetId,
        fault_reported: a.faultReported || null,
        diagnosis_findings: a.diagnosisFindings || null,
        work_performed: a.workPerformed || null,
        asset_outcome: a.assetOutcome,
        final_condition: a.finalCondition || null,
        refrigerant_added: a.refrigerantAdded ?? false,
        refrigerant_qty_kg: a.refrigerantQtyKg ?? null,
        notes: a.notes || null,
      }));
      const { error: aErr } = await supabase.from('service_report_assets').insert(assetInserts);
      if (aErr) {
        logger.error('Failed to update service report assets', { error: aErr, id });
        throw new BadRequestError('Failed to update asset inspection findings.');
      }
    }

    // Update outcome items if supplied
    if (payload.items !== undefined) {
      await supabase.from('service_report_items').delete().eq('report_id', id);
      if (payload.items.length > 0) {
        const itemInserts = payload.items.map((item) => ({
          report_id: id,
          asset_id: item.assetId || null,
          item_type: item.itemType,
          item_name: item.itemName,
          part_number: item.partNumber || null,
          quantity: item.quantity || 1,
          reason: item.reason,
          diagnosis: item.diagnosis || null,
          work_completed: item.workCompleted || null,
          recommended_action: item.recommendedAction || null,
          is_approval_required: item.isApprovalRequired ?? false,
          is_specialist_required: item.isSpecialistRequired ?? false,
          is_revisit_required: item.isRevisitRequired ?? true,
          ac_condition: item.acCondition || null,
          follow_up_notes: item.followUpNotes || null,
          is_resolved: false,
        }));
        const { error: iErr } = await supabase.from('service_report_items').insert(itemInserts);
        if (iErr) {
          logger.error('Failed to update service report items', { error: iErr, id });
          throw new BadRequestError('Failed to update parts and repair items.');
        }
      }
    }

    await this.recordAudit(actorId, 'SERVICE_REPORT_UPDATED', id, {
      reportNumber: updates.report_number || existing.reportNumber,
      updatedFields: Object.keys(updates),
      assetCount: payload.assets?.length ?? existing.assets.length,
      itemCount: payload.items?.length ?? existing.items.length,
    });

    return this.getReportById(id);
  }

  /**
   * Create a linked follow-up revisit schedule for PENDING_PARTS or PENDING_REPAIRS
   */
  async createFollowUp(
    reportId: string,
    payload: CreateFollowUpSchedulePayload,
    actorId: string
  ): Promise<ServiceVisitReportResponse> {
    const supabase = getSupabaseClient();
    const report = await this.getReportById(reportId);

    if (report.primaryOutcome === 'COMPLETED') {
      throw new BadRequestError('Cannot schedule a follow-up revisit for an already completed visit report.');
    }

    if (report.followUpScheduleId) {
      const { data: existingFollowUp } = await supabase
        .from('service_schedules')
        .select('id, schedule_number, status')
        .eq('id', report.followUpScheduleId)
        .maybeSingle();

      if (existingFollowUp && existingFollowUp.status !== 'CANCELLED') {
        throw new ConflictError(
          `A follow-up revisit appointment (#${existingFollowUp.schedule_number || report.followUpScheduleId}) has already been scheduled for this report.`
        );
      }
    }

    const isPm = report.visitType === 'PREVENTIVE';
    const scheduleNumber = await this.generateScheduleNumber(isPm);
    const effectiveTechId = payload.technicianId || null;
    const startTime = payload.startTime || '09:00';
    const endTime = payload.endTime || '11:00';

    // Pre-validate technician assignment if technician is assigned
    if (effectiveTechId) {
      await scheduleService.validateTechnicianAssignment(
        effectiveTechId,
        payload.scheduledDate,
        startTime,
        endTime,
        report.siteId,
        report.assets[0]?.assetId || null,
        false,
        undefined
      );
    }

    const { data: newSched, error: schedErr } = await supabase
      .from('service_schedules')
      .insert({
        schedule_number: scheduleNumber,
        amc_id: report.amcId || null,
        service_request_id: report.serviceRequestId || null,
        pm_obligation_id: report.pmObligationId || null,
        customer_id: report.customerId,
        site_id: report.siteId,
        asset_id: report.assets[0]?.assetId || null,
        scheduled_date: payload.scheduledDate,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: payload.durationMinutes || 120,
        technician_id: effectiveTechId,
        rescheduled_from_id: report.scheduleId || null,
        status: effectiveTechId ? 'ASSIGNED' : 'SCHEDULED',
        is_system_generated: false,
        notes: `Follow-up revisit for Report #${report.reportNumber}: ${report.primaryOutcome}${
          payload.notes ? ` - ${payload.notes}` : ''
        }`,
        created_by: actorId || null,
        updated_by: actorId || null,
      })
      .select()
      .single();

    if (schedErr || !newSched) {
      logger.error('Failed to create follow-up schedule', { error: schedErr, reportId });
      if (
        schedErr?.code === '23P01' ||
        schedErr?.message?.includes('TECHNICIAN_OVERLAP_CONFLICT')
      ) {
        throw new ConflictError(
          'Technician is already booked for another service during this time window. Overlapping assignments are prohibited.',
          { error: schedErr.message }
        );
      }
      if (
        schedErr?.code === '23505' ||
        schedErr?.message?.includes('duplicate key') ||
        schedErr?.message?.includes('idx_active_schedule')
      ) {
        throw new ConflictError(
          'An active schedule already exists for this service request or PM obligation.',
          { error: schedErr.message }
        );
      }
      throw new BadRequestError(`Failed to create follow-up appointment: ${schedErr?.message || 'Database error'}`);
    }

    // Create assignment if technician assigned
    if (effectiveTechId) {
      const scheduledStart = `${payload.scheduledDate}T${startTime}:00Z`;
      const scheduledEnd = `${payload.scheduledDate}T${endTime}:00Z`;
      const assignmentQuery = supabase.from('service_assignments');
      if (assignmentQuery && typeof assignmentQuery.insert === 'function') {
        await assignmentQuery.insert({
          service_schedule_id: newSched.id,
          service_request_id: report.serviceRequestId || null,
          technician_id: effectiveTechId,
          assigned_by: actorId || null,
          assigned_at: new Date().toISOString(),
          scheduled_start_time: scheduledStart,
          scheduled_end_time: scheduledEnd,
          status: 'ASSIGNED',
        });
      }
    }

    // Link follow_up_schedule_id back to service_reports
    await supabase
      .from('service_reports')
      .update({
        follow_up_schedule_id: newSched.id,
        updated_by: actorId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    // If Service Request visit, advance status
    if (report.serviceRequestId) {
      const targetSrStatus = effectiveTechId ? 'ASSIGNED' : 'SCHEDULED';
      await supabase
        .from('service_requests')
        .update({
          status: targetSrStatus,
          notes: `Follow-up revisit scheduled (#${scheduleNumber}) from Report #${report.reportNumber}`,
          updated_by: actorId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', report.serviceRequestId);
    }

    // Audit Logging
    await this.recordAudit(actorId, 'SERVICE_REPORT_FOLLOWUP_CREATED', report.id, {
      reportNumber: report.reportNumber,
      followUpScheduleId: newSched.id,
      followUpScheduleNumber: scheduleNumber,
      scheduledDate: payload.scheduledDate,
    });

    return this.getReportById(report.id);
  }
}

export const serviceReportService = new ServiceReportService();
