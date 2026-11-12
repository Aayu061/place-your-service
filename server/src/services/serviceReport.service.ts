import { randomUUID } from 'crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import {
  ServiceVisitReportResponse,
  CreateServiceReportPayload,
  UpdateServiceReportPayload,
  ServiceReportListQuery,
  CreateFollowUpSchedulePayload,
  ServiceVisitOutcome,
  ServiceReportSummaryCounts,
} from '../types/index.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { scheduleService } from './schedule.service.js';
import { normalizeTechnology } from '../utils/technology.js';
import { logActivity } from './audit.service.js';
import { essIntegrationService } from './essIntegration.service.js';
import { getResolvedEmailConfig } from './email/emailTransport.service.js';
import {
  mapServiceReportAssetRow,
  mapServiceReportDetailResponse,
  mapServiceReportItemRow,
  normalizeDbPaymentMethod,
  resolveAssetCustomerId,
} from './serviceReport/mappers.js';

export class ServiceReportService {
  /**
   * Resolves a valid profiles(id) actor for ledger operations requiring NOT NULL recorded_by / staff actor.
   */
  private async resolveOperationalProfileActorId(
    supabase: any,
    actorId?: string | null
  ): Promise<string | null> {
    if (actorId && actorId.trim()) {
      return actorId.trim();
    }
    try {
      const staffTable = supabase.from('staff');
      if (staffTable && typeof staffTable.select === 'function') {
        const { data: adminStaff } = await staffTable
          .select('profile_id')
          .eq('role', 'ADMIN')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (adminStaff?.profile_id) {
          return adminStaff.profile_id;
        }
      }
    } catch {
      // Ignore fallback lookup errors
    }
    return null;
  }

  /**
   * Generates the next serial Service Report number (REP-YYYY-NNNN) based on total
   * reports in the database and the highest existing sequential number for the year.
   */
  async generateNextReportNumber(): Promise<{ nextReportNumber: string; totalReports: number }> {
    const supabase = getSupabaseClient();
    const year = new Date().getUTCFullYear();
    const prefix = `REP-${year}-`;

    let totalReports = 0;
    let maxYearSeq = 0;

    try {
      const { count } = await supabase
        .from('service_reports')
        .select('id', { count: 'exact', head: true });
      totalReports = count ?? 0;

      const { data: existingRows } = await supabase
        .from('service_reports')
        .select('report_number')
        .ilike('report_number', `${prefix}%`)
        .order('report_number', { ascending: false })
        .limit(50);

      for (const row of existingRows || []) {
        const num = String(row.report_number || '').trim();
        const match = num.match(new RegExp(`^REP-${year}-(\\d+)$`, 'i'));
        if (match) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed > maxYearSeq) {
            maxYearSeq = parsed;
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to inspect existing service_reports sequence cleanly', { error: err });
    }

    let seq = Math.max(totalReports, maxYearSeq) + 1;
    for (let attempt = 0; attempt < 25; attempt++) {
      const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
      const { data: conflict } = await supabase
        .from('service_reports')
        .select('id')
        .eq('report_number', candidate)
        .maybeSingle();
      if (!conflict) {
        return { nextReportNumber: candidate, totalReports };
      }
      seq += 1;
    }

    return {
      nextReportNumber: `${prefix}${String(seq).padStart(4, '0')}`,
      totalReports,
    };
  }

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
    actorId?: string | null
  ): Promise<ServiceVisitReportResponse> {
    const supabase = getSupabaseClient();
    const normalizedActorId = actorId && actorId.trim() ? actorId.trim() : null;
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
        customer_id, site_id, asset_id, technician_id,
        planned_service_type, rescheduled_from_id
      `)
      .eq('id', payload.scheduleId)
      .maybeSingle();

    if (schedErr || !schedule) {
      throw new NotFoundError(`Scheduled appointment with ID "${payload.scheduleId}" not found.`);
    }

    if (['CANCELLED', 'RESCHEDULED', 'SKIPPED'].includes(schedule.status)) {
      throw new BadRequestError(`Cannot issue a service report for a ${schedule.status.toLowerCase()} appointment.`);
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

    // 5b. Validate assets and enforce cross-entity site & customer integrity BEFORE creating report (PYS-005)
    const assetIds = payload.assets.map((a) => a.assetId).filter(Boolean);
    if (assetIds.length !== payload.assets.length) {
      throw new BadRequestError('All assets in the service report must have a valid asset ID.');
    }
    if (new Set(assetIds).size !== assetIds.length) {
      throw new BadRequestError('A service report cannot include the same asset more than once.');
    }
    if (schedule.asset_id && (assetIds.length !== 1 || assetIds[0] !== schedule.asset_id)) {
      throw new BadRequestError('The report assets must match the asset attached to the scheduled work.');
    }
    for (const item of payload.items || []) {
      if (item.assetId && !assetIds.includes(item.assetId)) {
        throw new BadRequestError('Each parts or repair item must belong to an asset included in this report.');
      }
      if (item.isRevisitRequired && !item.assetId) {
        throw new BadRequestError('Every unresolved follow-up item must be linked to a report asset.');
      }
    }

    let assetMap: Record<string, any> = {};
    if (assetIds.length > 0) {
      const query = supabase.from('ac_assets');
      if (query && typeof query.select === 'function') {
        const { data: matchedAssets, error: assetErr } = await query
          .select(`
            id, site_id, customer_sites ( id, customer_id ), asset_tag, brand, model_number, indoor_serial_number, outdoor_serial_number, serial_number,
            ac_type, technology, capacity_tons, star_rating, refrigerant_type, floor_location, room_location
          `)
          .in('id', assetIds);

        if (assetErr) {
          logger.error('Failed to query ac_assets for service report validation', { error: assetErr });
          throw new BadRequestError('Failed to validate equipment records.');
        }

        if (matchedAssets) {
          if (matchedAssets.length !== assetIds.length) {
            throw new BadRequestError('One or more referenced AC assets could not be found.');
          }

          // Fallback batch lookup for customer_id if customer_sites join was not hydrated by caller/mock
          const fallbackSiteCustomerMap: Record<string, string> = {};
          const unresolvedSiteIds = matchedAssets
            .filter((a) => !resolveAssetCustomerId(a) && a.site_id)
            .map((a) => a.site_id);

          if (unresolvedSiteIds.length > 0) {
            const uniqueSiteIds = Array.from(new Set(unresolvedSiteIds));
            const sitesQuery = supabase.from('customer_sites');
            if (sitesQuery && typeof sitesQuery.select === 'function') {
              const { data: sitesData } = await sitesQuery
                .select('id, customer_id')
                .in('id', uniqueSiteIds);
              if (sitesData) {
                for (const s of sitesData) {
                  if (s.id && s.customer_id) {
                    fallbackSiteCustomerMap[s.id] = s.customer_id;
                  }
                }
              }
            }
          }

          for (const asset of matchedAssets) {
            const assetCustomerId = resolveAssetCustomerId(asset, fallbackSiteCustomerMap);
            if (assetCustomerId && assetCustomerId !== customerId) {
              throw new BadRequestError(
                `Asset "${asset.asset_tag || asset.id}" does not belong to the scheduled customer.`
              );
            }
            if (asset.site_id && asset.site_id !== siteId) {
              throw new BadRequestError(
                `Asset "${asset.asset_tag || asset.id}" does not belong to the scheduled site.`
              );
            }
            assetMap[asset.id] = asset;
          }
        }
      }
    }

    // Resolve planned and performed service types
    const plannedServiceType = payload.plannedServiceType || schedule.planned_service_type || null;
    const performedServiceType = payload.performedServiceType || plannedServiceType || null;
    const serviceTypeDeviationReason = payload.serviceTypeDeviationReason?.trim() || null;
    const reportStartTime = payload.startTime || schedule.start_time || null;
    const reportEndTime = payload.endTime || schedule.end_time || null;
    if (reportStartTime && reportEndTime && reportEndTime <= reportStartTime) {
      throw new BadRequestError('Service report end time must be later than its start time.');
    }

    if (
      performedServiceType &&
      plannedServiceType &&
      performedServiceType !== plannedServiceType &&
      (!serviceTypeDeviationReason || serviceTypeDeviationReason.length < 2)
    ) {
      throw new BadRequestError(
        'A deviation reason is mandatory when performed service type differs from planned service type.'
      );
    }

    // Follow-up resolution is derived from the server-created, item-level scope.
    const scopesTable = supabase.from('service_report_follow_up_scopes');
    let followUpScopes: Array<{ source_report_id: string; source_item_id: string; asset_id: string }> = [];
    if (scopesTable && typeof scopesTable.select === 'function') {
      const { data: scopeRows, error: scopeErr } = await scopesTable
        .select('source_report_id, source_item_id, asset_id')
        .eq('follow_up_schedule_id', schedule.id);
      if (scopeErr) {
        logger.error('Failed to validate follow-up scope for service report', { error: scopeErr, scheduleId: schedule.id });
        throw new BadRequestError('Failed to validate the linked follow-up items.');
      }
      followUpScopes = (scopeRows || []) as typeof followUpScopes;
    }

    const scopedReportIds = Array.from(new Set(followUpScopes.map((scope) => scope.source_report_id)));
    const scopedAssetIds = Array.from(new Set(followUpScopes.map((scope) => scope.asset_id)));
    if (scopedReportIds.length > 1 || scopedAssetIds.length > 1) {
      throw new BadRequestError('Follow-up schedule has inconsistent source report or asset scope.');
    }
    if (payload.originatingReportId && payload.originatingReportId !== scopedReportIds[0]) {
      throw new BadRequestError('Originating report must match the follow-up schedule item scope.');
    }
    if (payload.originatingReportId && followUpScopes.length === 0) {
      throw new BadRequestError('A report can only resolve an originating issue through a linked follow-up schedule.');
    }

    const originatingReportId = scopedReportIds[0] || null;
    if (followUpScopes.length > 0) {
      if (followUpScopes.some((scope) => !scope.source_report_id || !scope.source_item_id || !scope.asset_id)) {
        throw new BadRequestError('Follow-up schedule contains an incomplete issue scope.');
      }
      if (assetIds.length !== 1 || assetIds[0] !== scopedAssetIds[0]) {
        throw new BadRequestError('The follow-up report must include only the asset linked to its pending issue scope.');
      }
    }

    // Validate the originating report and ensure it still has an unresolved issue.
    let originatingReport: any = null;
    if (originatingReportId) {
      const { data: orig, error: origErr } = await supabase
        .from('service_reports')
        .select('id, report_number, customer_id, site_id, service_request_id, primary_outcome, resolution_status, resolving_report_id')
        .eq('id', originatingReportId)
        .maybeSingle();

      if (origErr || !orig) {
        throw new BadRequestError('Referenced originating service report does not exist.');
      }

      // Reject cross-customer or cross-site follow-up resolution
      if (orig.customer_id !== customerId || orig.site_id !== siteId) {
        throw new BadRequestError('Cross-customer or cross-site follow-up resolution is strictly prohibited.');
      }
      if (!['AWAITING_PARTS', 'AWAITING_REPAIR'].includes(orig.resolution_status)) {
        throw new BadRequestError('The originating report no longer has an unresolved issue to follow up.');
      }
      if (orig.resolving_report_id) {
        throw new ConflictError('The originating report issue has already been resolved.');
      }

      originatingReport = orig;
    }

    // Determine initial resolution status
    let resolutionStatus: 'OPEN' | 'AWAITING_PARTS' | 'AWAITING_REPAIR' | 'RESOLVED' | 'CANCELLED' = 'OPEN';
    let resolvedAt: string | null = null;
    if (payload.primaryOutcome === 'COMPLETED') {
      resolutionStatus = 'RESOLVED';
      resolvedAt = new Date().toISOString();
    } else if (payload.primaryOutcome === 'PENDING_PARTS') {
      resolutionStatus = 'AWAITING_PARTS';
    } else if (payload.primaryOutcome === 'PENDING_REPAIRS') {
      resolutionStatus = 'AWAITING_REPAIR';
    }

    // 6. Insert Report Header
    const dbPaymentMethod = normalizeDbPaymentMethod(payload.paymentMethod);
    const rawPaymentMode = payload.paymentMethod ? String(payload.paymentMethod).trim().toUpperCase() : null;
    const modeNotePrefix =
      rawPaymentMode && dbPaymentMethod && rawPaymentMode !== dbPaymentMethod
        ? `[Mode: ${rawPaymentMode}] `
        : '';
    const trimmedPaymentNotes = payload.paymentNotes ? payload.paymentNotes.trim() : '';
    const combinedPaymentNotes = `${modeNotePrefix}${trimmedPaymentNotes}`.trim() || null;

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
        assistant_name:
          payload.assistantName !== undefined
            ? (payload.assistantName ? payload.assistantName.trim() || null : null)
            : ((schedule as any).assistant_name || null),
        service_date: payload.serviceDate,
        start_time: reportStartTime,
        end_time: reportEndTime,
        primary_outcome: payload.primaryOutcome,
        planned_service_type: plannedServiceType,
        performed_service_type: performedServiceType,
        service_type_deviation_reason: serviceTypeDeviationReason,
        originating_report_id: originatingReportId,
        resolution_status: resolutionStatus,
        resolved_at: resolvedAt,
        work_description: payload.workDescription || null,
        technician_remarks: payload.technicianRemarks || null,
        customer_representative: payload.customerRepresentative || null,
        customer_acknowledgement: payload.customerAcknowledgement || null,
        customer_signature_url: payload.customerSignatureUrl || null,
        before_photo_url: payload.beforePhotoUrl || null,
        after_photo_url: payload.afterPhotoUrl || null,
        payment_collected: Boolean(payload.paymentCollected),
        payment_amount: payload.paymentAmount != null ? Number(payload.paymentAmount) : 0,
        payment_method: dbPaymentMethod,
        payment_reference: payload.paymentReference ? payload.paymentReference.trim() || null : null,
        payment_notes: combinedPaymentNotes,
        status: 'DRAFT',
        created_by: normalizedActorId,
        updated_by: normalizedActorId,
      })
      .select()
      .single();

    if (insertErr || !newReport) {
      logger.error('Failed to insert service report header', { error: insertErr, trimmedReportNumber });
      if (insertErr?.code === '23505') {
        if (
          insertErr.message?.includes('uq_service_reports_active_schedule') ||
          (insertErr as any).details?.includes('service_schedule_id')
        ) {
          throw new ConflictError('A service report has already been recorded for this scheduled appointment.');
        }
        throw new ConflictError(`Report number "${trimmedReportNumber}" already exists.`);
      }
      throw new BadRequestError('Failed to save service visit report.');
    }

    // Synchronize payment collection with Finance / Payments workspace
    let linkedPaymentId: string | null = null;
    if (payload.paymentAmount && Number(payload.paymentAmount) > 0) {
      try {
        const paymentNumber = `PAY-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const paymentActorId = await this.resolveOperationalProfileActorId(supabase, normalizedActorId);
        if (typeof supabase.rpc === 'function') {
          const { data: payId, error: payErr } = await supabase.rpc('create_payment_record', {
            p_payment_number: paymentNumber,
            p_customer_id: customerId,
            p_service_request_id: schedule.service_request_id || null,
            p_amc_id: schedule.amc_id || null,
            p_total_amount_due: Number(payload.paymentAmount),
            p_actor_profile_id: paymentActorId,
          });

          if (!payErr && payId) {
            linkedPaymentId = payId;
            const txnMethod = dbPaymentMethod || 'CASH';
            const trimmedRef = payload.paymentReference?.trim() || null;
            const canRecordOnline = txnMethod !== 'ONLINE' || Boolean(trimmedRef);
            if (payload.paymentCollected && paymentActorId && canRecordOnline) {
              await supabase.rpc('record_payment_transaction', {
                p_payment_id: linkedPaymentId,
                p_payment_method: txnMethod,
                p_amount: Number(payload.paymentAmount),
                p_external_payment_reference: trimmedRef,
                p_notes: combinedPaymentNotes || `Collected on-site for Service Report #${trimmedReportNumber}`,
                p_actor_profile_id: paymentActorId,
              });
            }
            await supabase
              .from('service_reports')
              .update({ payment_id: linkedPaymentId })
              .eq('id', newReport.id);
          } else if (payErr) {
            logger.warn('Failed to invoke create_payment_record RPC for service report', { error: payErr });
          }
        }
      } catch (paySyncErr) {
        logger.warn('Error synchronizing payment record for service report', { error: paySyncErr });
      }
    }

    // 7. Insert Per-Asset Report Details with immutable equipment snapshot

    const assetInserts = payload.assets.map((a) => {
      const snap = assetMap[a.assetId] || {};
      const tech = a.technology || snap.technology;
      return {
        report_id: newReport.id,
        asset_id: a.assetId,
        asset_tag: a.assetTag ?? snap.asset_tag ?? null,
        brand: a.brand ?? snap.brand ?? null,
        model_number: a.modelNumber ?? snap.model_number ?? null,
        indoor_serial_number: a.indoorSerialNumber ?? snap.indoor_serial_number ?? null,
        outdoor_serial_number: a.outdoorSerialNumber ?? snap.outdoor_serial_number ?? null,
        serial_number: a.serialNumber ?? snap.serial_number ?? null,
        ac_type: a.acType ?? snap.ac_type ?? null,
        technology: tech ? normalizeTechnology(tech) : null,
        capacity_tons: a.capacityTons ?? (snap.capacity_tons != null ? Number(snap.capacity_tons) : null),
        star_rating: a.starRating ?? snap.star_rating ?? null,
        refrigerant_type: a.refrigerantType ?? snap.refrigerant_type ?? null,
        floor_location: a.floorLocation ?? snap.floor_location ?? null,
        room_location: a.roomLocation ?? snap.room_location ?? null,
        fault_reported: a.faultReported || null,
        diagnosis_findings: a.diagnosisFindings || null,
        work_performed: a.workPerformed || null,
        asset_outcome: a.assetOutcome,
        final_condition: a.finalCondition || null,
        refrigerant_added: a.refrigerantAdded ?? false,
        refrigerant_qty_kg: a.refrigerantQtyKg ?? null,
        notes: a.notes || null,
      };
    });

    if (assetInserts.length > 0) {
      const { error: assetErr } = await supabase.from('service_report_assets').insert(assetInserts);
      if (assetErr) {
        logger.error('Failed to insert service report assets', { error: assetErr, reportId: newReport.id });
        // Rollback header
        await supabase.from('service_reports').delete().eq('id', newReport.id);
        throw new BadRequestError('Failed to save per-asset visit findings.');
      }
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

    let submittedAtomically = false;
    if (typeof supabase.rpc === 'function') {
      const { error: submitErr } = await supabase.rpc('submit_service_report_completion', {
        p_service_report_id: newReport.id,
        p_actor_profile_id: normalizedActorId,
      });
      if (submitErr) {
        logger.error('Failed to submit service report transaction', { error: submitErr, reportId: newReport.id });
        await supabase.from('service_report_items').delete().eq('report_id', newReport.id);
        await supabase.from('service_report_assets').delete().eq('report_id', newReport.id);
        await supabase.from('service_reports').delete().eq('id', newReport.id);
        if (submitErr.code === '23505') {
          throw new ConflictError('A service report has already been recorded for this scheduled appointment.');
        }
        throw new BadRequestError(`Failed to complete report submission: ${submitErr.message || 'Database error'}`);
      }
      submittedAtomically = true;
    }

    // 9. State Machine Transitions

    if (!submittedAtomically) {

    // 9a. Resolve only the exact source items linked to this follow-up schedule.
    if (originatingReportId && originatingReport && payload.primaryOutcome === 'COMPLETED') {
      if (typeof supabase.rpc === 'function') {
        const { error: resolveErr } = await supabase.rpc('resolve_service_report_follow_up_scope', {
          p_follow_up_schedule_id: schedule.id,
          p_resolving_report_id: newReport.id,
          p_actor_profile_id: normalizedActorId,
        });
        if (resolveErr) {
          logger.error('Failed to resolve scoped source items after completed follow-up', {
            error: resolveErr,
            reportId: newReport.id,
            originatingReportId,
          });
          throw new BadRequestError('The follow-up report was saved, but its linked issue could not be resolved.');
        }
      } else {
        // Test doubles without RPC support use the same exact item boundary.
        const sourceItemIds = followUpScopes.map((scope) => scope.source_item_id);
        const { error: itemResolveErr } = await supabase
          .from('service_report_items')
          .update({ is_resolved: true, updated_at: new Date().toISOString() })
          .eq('report_id', originatingReportId)
          .in('id', sourceItemIds);
        if (itemResolveErr) {
          throw new BadRequestError('The follow-up report was saved, but its linked issue could not be resolved.');
        }
      }
      await this.recordAudit(normalizedActorId, 'SERVICE_REPORT_ISSUE_RESOLVED', originatingReportId, {
        resolvingReportId: newReport.id,
        resolvingReportNumber: trimmedReportNumber,
        sourceItemIds: followUpScopes.map((scope) => scope.source_item_id),
      });
    }

    // 9b. Update the schedule: The visit has been attended by the technician on-site
    await supabase
      .from('service_schedules')
      .update({
        status: 'COMPLETED',
        notes: `Visit Report #${trimmedReportNumber} filed (${payload.primaryOutcome})`,
        updated_by: normalizedActorId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id);

    // Synchronize active service assignments to COMPLETED to release technician workload
    const assignmentsTable = supabase.from('service_assignments');
    if (assignmentsTable && typeof assignmentsTable.update === 'function') {
      const updateQuery = assignmentsTable.update({
        status: 'COMPLETED',
        updated_at: new Date().toISOString(),
      });
      if (updateQuery && typeof updateQuery.eq === 'function') {
        const eqQuery = updateQuery.eq('service_schedule_id', schedule.id);
        if (eqQuery && typeof eqQuery.in === 'function') {
          await eqQuery.in('status', ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS']);
        } else if (eqQuery) {
          await eqQuery;
        }
      }
    }

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
          updated_by: normalizedActorId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.pm_obligation_id);

      await supabase
        .from('service_assignments')
        .update({
          status: 'COMPLETED',
          updated_at: new Date().toISOString(),
        })
        .eq('service_schedule_id', schedule.pm_obligation_id)
        .in('status', ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS']);
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
          updated_by: normalizedActorId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.service_request_id);

      void essIntegrationService.notifyServiceRequestStatusUpdate(schedule.service_request_id, targetSrStatus);
    }
    }

    // Ensure ESS notification runs even when the database RPC handled state transitions atomically
    if (submittedAtomically && schedule.service_request_id) {
      let targetSrStatus = 'RESOLVED';
      if (payload.primaryOutcome === 'PENDING_PARTS') {
        targetSrStatus = 'AWAITING_PARTS';
      } else if (payload.primaryOutcome === 'PENDING_REPAIRS') {
        targetSrStatus = 'REVISIT_REQUIRED';
      }
      void essIntegrationService.notifyServiceRequestStatusUpdate(schedule.service_request_id, targetSrStatus);
    }

    // 9d. Automated Spares & Refrigerant Stock Deduction (runs reliably on both RPC and fallback paths)
    try {
      await this.deductInventoryForReport(supabase, newReport.id, trimmedReportNumber, payload, normalizedActorId);
    } catch (invErr) {
      logger.warn('Non-blocking inventory deduction warning on service report', { error: invErr, reportId: newReport.id });
    }

    // The transaction RPC creates its immutable activity record in the same
    // database transaction as completion. The fallback is retained for
    // lightweight unit-test clients that do not implement RPC.
    if (!submittedAtomically) {
      await this.recordAudit(normalizedActorId, 'SERVICE_REPORT_CREATED', newReport.id, {
        reportNumber: trimmedReportNumber,
        scheduleId: schedule.id,
        scheduleNumber: schedule.schedule_number,
        visitType: payload.visitType,
        primaryOutcome: payload.primaryOutcome,
        assetCount: payload.assets.length,
        itemCount: payload.items?.length || 0,
      });
    }

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
        amc_id, pm_obligation_id, customer_id, site_id, technician_id, assistant_name,
        service_date, start_time, end_time, primary_outcome,
        planned_service_type, performed_service_type, service_type_deviation_reason,
        originating_report_id, resolving_report_id, resolved_at, resolution_status,
        work_description, technician_remarks, customer_representative,
        customer_acknowledgement, customer_signature_url, before_photo_url, after_photo_url, status,
        payment_collected, payment_amount, payment_method, payment_reference, payment_notes, payment_id,
        follow_up_schedule_id, created_by, updated_by, created_at, updated_at,
        customers (id, name, customer_code, phone, email),
        customer_sites (id, site_name, address),
        technicians (id, name, technician_code),
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

    // Fetch originating & resolving report numbers if linked
    let originatingReportNumber: string | null = null;
    if (row.originating_report_id) {
      const { data: orig } = await supabase
        .from('service_reports')
        .select('report_number')
        .eq('id', row.originating_report_id)
        .maybeSingle();
      if (orig) originatingReportNumber = orig.report_number;
    }

    let resolvingReportNumber: string | null = null;
    if (row.resolving_report_id) {
      const { data: res } = await supabase
        .from('service_reports')
        .select('report_number')
        .eq('id', row.resolving_report_id)
        .maybeSingle();
      if (res) resolvingReportNumber = res.report_number;
    }

    // Fetch assets with snapshot columns and joined ac_assets fallback
    const { data: rawAssets } = await supabase
      .from('service_report_assets')
      .select(`
        id, report_id, asset_id,
        asset_tag, brand, model_number, indoor_serial_number, outdoor_serial_number, serial_number,
        ac_type, technology, capacity_tons, star_rating, refrigerant_type, floor_location, room_location,
        fault_reported, diagnosis_findings,
        work_performed, asset_outcome, final_condition,
        refrigerant_added, refrigerant_qty_kg, notes, created_at, updated_at,
        ac_assets (
          id, asset_tag, brand, model_number, indoor_serial_number, outdoor_serial_number, serial_number,
          ac_type, technology, capacity_tons, star_rating, refrigerant_type, floor_location, room_location
        )
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
        // Follow-up was cancelled or missing: clear stale reference in response without mutating on read
        followUpScheduleNumber = null;
        effectiveFollowUpScheduleId = null;
      }
    }

    const assets = (rawAssets || []).map(mapServiceReportAssetRow);
    const items = (rawItems || []).map(mapServiceReportItemRow);

    return mapServiceReportDetailResponse(row, {
      originatingReportNumber,
      resolvingReportNumber,
      followUpScheduleId: effectiveFollowUpScheduleId,
      followUpScheduleNumber,
      assets,
      items,
    });
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
        amc_id, pm_obligation_id, customer_id, site_id, technician_id, assistant_name,
        service_date, start_time, end_time, primary_outcome,
        planned_service_type, performed_service_type, service_type_deviation_reason,
        originating_report_id, resolving_report_id, resolved_at, resolution_status,
        work_description, technician_remarks, customer_representative,
        customer_acknowledgement, customer_signature_url, before_photo_url, after_photo_url, status,
        payment_collected, payment_amount, payment_method, payment_reference, payment_notes, payment_id,
        follow_up_schedule_id, created_by, updated_by, created_at, updated_at,
        customers (id, name, customer_code, phone, email),
        customer_sites (id, site_name, address),
        technicians (id, name, technician_code),
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

    if (query.resolutionStatus && query.resolutionStatus !== 'ALL') {
      dbQuery = dbQuery.eq('resolution_status', query.resolutionStatus);
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

    // Batch-resolve originating & resolving report numbers for the page
    const linkedIds = Array.from(
      new Set(
        (rows || [])
          .flatMap((r: any) => [r.originating_report_id, r.resolving_report_id])
          .filter((id: any): id is string => Boolean(id))
      )
    );
    let linkedReportNumberMap: Record<string, string> = {};
    if (linkedIds.length > 0) {
      try {
        const { data: linkedRows } = await supabase
          .from('service_reports')
          .select('id, report_number')
          .in('id', linkedIds);
        if (linkedRows) {
          linkedReportNumberMap = linkedRows.reduce((acc, curr) => {
            acc[curr.id] = curr.report_number;
            return acc;
          }, {} as Record<string, string>);
        }
      } catch (err) {
        logger.warn('Failed to batch-resolve linked service report numbers', { err });
      }
    }

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
      customerEmail: row.customers?.email || null,
      siteId: row.site_id,
      siteName: row.customer_sites?.site_name || null,
      siteAddress: row.customer_sites?.address || null,
      technicianId: row.technician_id,
      technicianName: row.technicians?.name || null,
      technicianCode: row.technicians?.technician_code || null,
      technicianPhone: null,
      assistantName: row.assistant_name || null,
      serviceDate: row.service_date,
      startTime: row.start_time,
      endTime: row.end_time,
      primaryOutcome: row.primary_outcome as ServiceVisitOutcome,
      plannedServiceType: row.planned_service_type || null,
      performedServiceType: row.performed_service_type || null,
      serviceTypeDeviationReason: row.service_type_deviation_reason || null,
      originatingReportId: row.originating_report_id || null,
      originatingReportNumber: row.originating_report_id
        ? linkedReportNumberMap[row.originating_report_id] || null
        : null,
      resolvingReportId: row.resolving_report_id || null,
      resolvingReportNumber: row.resolving_report_id
        ? linkedReportNumberMap[row.resolving_report_id] || null
        : null,
      resolvedAt: row.resolved_at || null,
      resolutionStatus: row.resolution_status || 'OPEN',
      workDescription: row.work_description,
      technicianRemarks: row.technician_remarks,
      customerRepresentative: row.customer_representative,
      customerAcknowledgement: row.customer_acknowledgement,
      customerSignatureUrl: row.customer_signature_url,
      beforePhotoUrl: row.before_photo_url || null,
      afterPhotoUrl: row.after_photo_url || null,
      paymentCollected: row.payment_collected ?? false,
      paymentAmount: row.payment_amount != null ? Number(row.payment_amount) : 0,
      paymentMethod: row.payment_method || null,
      paymentReference: row.payment_reference || null,
      paymentNotes: row.payment_notes || null,
      paymentId: row.payment_id || null,
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
    // Pending counts strictly measure distinct currently unresolved issues (not historically resolved ones)
    let totalAll = total;
    let completedAll = 0;
    let pendingPartsAll = 0;
    let pendingRepairsAll = 0;

    try {
      let qTotal = supabase.from('service_reports').select('id', { count: 'exact', head: true });
      let qCompleted = supabase.from('service_reports').select('id', { count: 'exact', head: true }).eq('primary_outcome', 'COMPLETED');
      let qParts = supabase
        .from('service_reports')
        .select('id', { count: 'exact', head: true })
        .eq('resolution_status', 'AWAITING_PARTS')
        .is('resolving_report_id', null);
      let qRepairs = supabase
        .from('service_reports')
        .select('id', { count: 'exact', head: true })
        .eq('resolution_status', 'AWAITING_REPAIR')
        .is('resolving_report_id', null);

      if (query.customerId) {
        qTotal = qTotal.eq('customer_id', query.customerId);
        qCompleted = qCompleted.eq('customer_id', query.customerId);
        qParts = qParts.eq('customer_id', query.customerId);
        qRepairs = qRepairs.eq('customer_id', query.customerId);
      }
      if (query.siteId) {
        qTotal = qTotal.eq('site_id', query.siteId);
        qCompleted = qCompleted.eq('site_id', query.siteId);
        qParts = qParts.eq('site_id', query.siteId);
        qRepairs = qRepairs.eq('site_id', query.siteId);
      }

      const [
        { count: cTotal },
        { count: cCompleted },
        { count: cParts },
        { count: cRepairs },
      ] = await Promise.all([qTotal, qCompleted, qParts, qRepairs]);
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

    if (!payload.correctionReason?.trim() || payload.correctionReason.trim().length < 3) {
      throw new BadRequestError('A correction reason of at least 3 characters is required.');
    }
    if (payload.assets !== undefined || payload.items !== undefined) {
      throw new BadRequestError('Issued equipment and parts/repair snapshots cannot be changed. Update report header and notes only.');
    }
    const effectiveStartTime = payload.startTime !== undefined ? payload.startTime : existing.startTime;
    const effectiveEndTime = payload.endTime !== undefined ? payload.endTime : existing.endTime;
    if (effectiveStartTime && effectiveEndTime && effectiveEndTime <= effectiveStartTime) {
      throw new BadRequestError('Service report end time must be later than its start time.');
    }

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

    const effPlanned = payload.plannedServiceType !== undefined ? payload.plannedServiceType : existing.plannedServiceType;
    const effPerformed = payload.performedServiceType !== undefined ? payload.performedServiceType : existing.performedServiceType;
    const effDeviation = payload.serviceTypeDeviationReason !== undefined ? payload.serviceTypeDeviationReason : existing.serviceTypeDeviationReason;

    if (
      effPlanned &&
      effPerformed &&
      effPlanned !== effPerformed &&
      (!effDeviation || effDeviation.trim().length < 2)
    ) {
      throw new BadRequestError('A deviation reason is mandatory when performed service type differs from planned service type.');
    }

    const updates: Record<string, unknown> = {
      updated_by: actorId || null,
      updated_at: new Date().toISOString(),
      last_correction_reason: payload.correctionReason.trim(),
    };

    if (payload.reportNumber) updates.report_number = payload.reportNumber.trim();
    if (payload.serviceDate !== undefined) updates.service_date = payload.serviceDate;
    if (payload.startTime !== undefined) updates.start_time = payload.startTime;
    if (payload.endTime !== undefined) updates.end_time = payload.endTime;
    if (payload.plannedServiceType !== undefined) updates.planned_service_type = payload.plannedServiceType;
    if (payload.performedServiceType !== undefined) updates.performed_service_type = payload.performedServiceType;
    if (payload.serviceTypeDeviationReason !== undefined) {
      updates.service_type_deviation_reason = payload.serviceTypeDeviationReason ? payload.serviceTypeDeviationReason.trim() : null;
    }
    if (payload.assistantName !== undefined) {
      updates.assistant_name = payload.assistantName ? payload.assistantName.trim() || null : null;
    }
    if (payload.workDescription !== undefined) updates.work_description = payload.workDescription;
    if (payload.technicianRemarks !== undefined) updates.technician_remarks = payload.technicianRemarks;
    if (payload.customerRepresentative !== undefined) updates.customer_representative = payload.customerRepresentative;
    if (payload.customerAcknowledgement !== undefined) updates.customer_acknowledgement = payload.customerAcknowledgement;
    if (payload.customerSignatureUrl !== undefined) updates.customer_signature_url = payload.customerSignatureUrl;
    if (payload.paymentCollected !== undefined) updates.payment_collected = payload.paymentCollected;
    if (payload.paymentAmount !== undefined) updates.payment_amount = payload.paymentAmount;
    if (payload.paymentMethod !== undefined) updates.payment_method = normalizeDbPaymentMethod(payload.paymentMethod);
    if (payload.paymentReference !== undefined) updates.payment_reference = payload.paymentReference ? payload.paymentReference.trim() || null : null;
    if (payload.paymentNotes !== undefined) updates.payment_notes = payload.paymentNotes ? payload.paymentNotes.trim() || null : null;

    const { error } = await supabase.from('service_reports').update(updates).eq('id', id);

    if (error) {
      logger.error('Failed to update service report', { error, id });
      throw new BadRequestError('Failed to update service report.');
    }

    await this.recordAudit(actorId, 'SERVICE_REPORT_UPDATED', id, {
      reportNumber: updates.report_number || existing.reportNumber,
      correctionReason: payload.correctionReason.trim(),
      updatedFields: Object.keys(updates),
      assetCount: existing.assets.length,
      itemCount: existing.items.length,
    });

    return this.getReportById(id);
  }

  /**
   * Verifies a submitted service report (typically field technician submission -> VERIFIED)
   */
  async verifyReport(id: string, actorId: string): Promise<ServiceVisitReportResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getReportById(id);

    if (existing.status === 'VERIFIED') {
      return existing;
    }

    const { error } = await supabase
      .from('service_reports')
      .update({
        status: 'VERIFIED',
        updated_by: actorId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      logger.error('Failed to verify service report', { error, id });
      throw new BadRequestError('Failed to verify service report.');
    }

    await this.recordAudit(actorId || null, 'SERVICE_REPORT_VERIFIED', id, {
      reportNumber: existing.reportNumber,
      previousStatus: existing.status,
      newStatus: 'VERIFIED',
    });

    const updatedReport = await this.getReportById(id);

    if (getResolvedEmailConfig().automation.autoSendReportOnVerify && updatedReport.customerEmail) {
      try {
        const { reportEmailService } = await import('./reportEmail.service.js');
        await reportEmailService.queueAndSend(id, actorId);
      } catch (emailErr) {
        logger.warn('Auto report email send after verification failed non-fatally', {
          reportId: id,
          error: emailErr instanceof Error ? emailErr.message : String(emailErr),
        });
      }
    }

    return updatedReport;
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

    if (report.primaryOutcome === 'COMPLETED' || report.resolutionStatus === 'RESOLVED') {
      throw new BadRequestError('Cannot schedule a follow-up revisit for an already completed visit report.');
    }
    if (!['AWAITING_PARTS', 'AWAITING_REPAIR'].includes(report.resolutionStatus)) {
      throw new BadRequestError('Cannot schedule a follow-up unless the report has an unresolved parts or repair issue.');
    }

    const pendingAssetIds = new Set(
      report.assets
        .filter((asset) => asset.assetOutcome === 'PENDING_PARTS' || asset.assetOutcome === 'PENDING_REPAIRS')
        .map((asset) => asset.assetId)
    );
    const pendingItems = report.items.filter(
      (item) => !item.isResolved && item.isRevisitRequired && item.assetId && pendingAssetIds.has(item.assetId)
    );
    if (pendingItems.length === 0) {
      throw new BadRequestError('No unresolved revisit items are available to schedule.');
    }
    const eligibleAssetIds = Array.from(new Set(pendingItems.map((item) => item.assetId as string)));
    const targetAssetId = payload.assetId || eligibleAssetIds[0];
    if (!eligibleAssetIds.includes(targetAssetId)) {
      throw new BadRequestError('The selected asset does not have an unresolved issue that requires a revisit.');
    }
    const scopedItems = pendingItems.filter((item) => item.assetId === targetAssetId);

    const startTime = payload.startTime || '09:00';
    const endTime = payload.endTime || '11:00';
    if (endTime <= startTime) {
      throw new BadRequestError('Follow-up end time must be later than its start time.');
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
    // Pre-validate technician assignment if technician is assigned
    if (effectiveTechId) {
      await scheduleService.validateTechnicianAssignment(
        effectiveTechId,
        payload.scheduledDate,
        startTime,
        endTime,
        report.siteId,
        targetAssetId,
        false,
        undefined
      );
    }

    const followUpSchedulePayload = {
      schedule_number: scheduleNumber,
      amc_id: report.amcId || null,
      service_request_id: report.serviceRequestId || null,
      pm_obligation_id: report.pmObligationId || null,
      customer_id: report.customerId,
      site_id: report.siteId,
      asset_id: targetAssetId,
      scheduled_date: payload.scheduledDate,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: payload.durationMinutes || 120,
      technician_id: effectiveTechId,
      rescheduled_from_id: report.scheduleId || null,
      planned_service_type: payload.plannedServiceType || report.plannedServiceType || null,
      status: effectiveTechId ? 'ASSIGNED' : 'SCHEDULED',
      is_system_generated: false,
      notes: `Follow-up revisit for Report #${report.reportNumber}: ${report.primaryOutcome}${payload.notes ? ` - ${payload.notes}` : ''}`,
      created_by: actorId || null,
      updated_by: actorId || null,
    };

    if (typeof supabase.rpc === 'function') {
      const { error: rpcErr } = await supabase.rpc('create_service_report_follow_up', {
        p_source_report_id: report.id,
        p_schedule: followUpSchedulePayload,
        p_source_item_ids: scopedItems.map((item) => item.id),
        p_actor_profile_id: actorId || null,
      });
      if (rpcErr) {
        logger.error('Failed to create follow-up appointment transaction', { error: rpcErr, reportId });
        if (rpcErr.code === '23P01' || rpcErr.message?.includes('TECHNICIAN_OVERLAP_CONFLICT')) {
          throw new ConflictError('Technician is already booked for another service during this time window. Overlapping assignments are prohibited.');
        }
        if (rpcErr.code === '23505' || rpcErr.message?.includes('duplicate key')) {
          throw new ConflictError('A follow-up appointment is already active or the generated schedule number is already in use.');
        }
        throw new BadRequestError(`Failed to create follow-up appointment: ${rpcErr.message || 'Database error'}`);
      }
      return this.getReportById(report.id);
    }

    const { data: newSched, error: schedErr } = await supabase
      .from('service_schedules')
      .insert({
        ...followUpSchedulePayload,
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
        const { error: assignmentErr } = await assignmentQuery.insert({
          service_schedule_id: newSched.id,
          service_request_id: report.serviceRequestId || null,
          technician_id: effectiveTechId,
          assigned_by: actorId || null,
          assigned_at: new Date().toISOString(),
          scheduled_start_time: scheduledStart,
          scheduled_end_time: scheduledEnd,
          status: 'ASSIGNED',
        });
        if (assignmentErr) {
          await supabase.from('service_schedules').delete().eq('id', newSched.id);
          throw new BadRequestError('Failed to create the follow-up technician assignment.');
        }
      }
    }

    const { error: scopeErr } = await supabase.from('service_report_follow_up_scopes').insert(
      scopedItems.map((item) => ({
        follow_up_schedule_id: newSched.id,
        source_report_id: report.id,
        source_item_id: item.id,
        asset_id: targetAssetId,
        created_by: actorId || null,
      }))
    );
    if (scopeErr) {
      if (effectiveTechId) {
        await supabase.from('service_assignments').delete().eq('service_schedule_id', newSched.id);
      }
      await supabase.from('service_schedules').delete().eq('id', newSched.id);
      throw new BadRequestError('Failed to record which pending issues this follow-up will address.');
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

  /**
   * Automatically deducts spare parts and refrigerant used during a service visit
   */
  private async deductInventoryForReport(
    supabase: any,
    reportId: string,
    reportNumber: string,
    payload: CreateServiceReportPayload,
    actorId?: string | null
  ): Promise<void> {
    if (!supabase || typeof supabase.from !== 'function') return;
    const recorderId = await this.resolveOperationalProfileActorId(supabase, actorId);

    // 1. Process spare parts listed in report items
    if (payload.items && payload.items.length > 0) {
      for (const item of payload.items) {
        const partName = item.itemName || item.partNumber;
        if (!partName) continue;
        const qty = Math.max(1, Number(item.quantity || 1));

        try {
          const { data: matchedPart } = await supabase
            .from('parts')
            .select('id, part_code, name, current_stock, unit_price')
            .or(`part_code.eq.${partName},name.ilike.%${partName}%`)
            .limit(1)
            .maybeSingle();

          if (matchedPart) {
            const newStock = Math.max(0, (matchedPart.current_stock || 0) - qty);
            await supabase
              .from('parts')
              .update({ current_stock: newStock, updated_at: new Date().toISOString() })
              .eq('id', matchedPart.id);

            if (recorderId) {
              await supabase.from('inventory_transactions').insert({
                part_id: matchedPart.id,
                transaction_type: 'SERVICE_USAGE',
                quantity: -qty,
                reference_type: 'SERVICE_REPORT',
                reference_id: reportId,
                reason: `Used during visit ${reportNumber}`,
                recorded_by: recorderId,
              });
            }

            await supabase.from('service_parts').insert({
              service_report_id: reportId,
              part_id: matchedPart.id,
              quantity: qty,
              unit_price: matchedPart.unit_price || 0,
              total_price: (matchedPart.unit_price || 0) * qty,
            });
          }
        } catch (itemErr) {
          logger.warn('Failed to deduct part stock for item', { partName, error: itemErr });
        }
      }
    }

    // 2. Process refrigerant charged during visit
    for (const asset of payload.assets || []) {
      if (asset.refrigerantAdded && asset.refrigerantType && asset.refrigerantQtyKg && Number(asset.refrigerantQtyKg) > 0) {
        const gasType = asset.refrigerantType.toUpperCase();
        const gasQty = Number(asset.refrigerantQtyKg);

        try {
          const { data: matchedGas } = await supabase
            .from('parts')
            .select('id, part_code, name, current_stock, unit_price')
            .eq('category', 'REFRIGERANT')
            .ilike('name', `%${gasType}%`)
            .limit(1)
            .maybeSingle();

          if (matchedGas) {
            const newStock = Math.max(0, (matchedGas.current_stock || 0) - gasQty);
            await supabase
              .from('parts')
              .update({ current_stock: newStock, updated_at: new Date().toISOString() })
              .eq('id', matchedGas.id);

            if (recorderId) {
              await supabase.from('inventory_transactions').insert({
                part_id: matchedGas.id,
                transaction_type: 'SERVICE_USAGE',
                quantity: -Math.ceil(gasQty),
                reference_type: 'SERVICE_REPORT',
                reference_id: reportId,
                reason: `${gasQty}kg ${gasType} gas charged during visit ${reportNumber}`,
                recorded_by: recorderId,
              });
            }
          }
        } catch (gasErr) {
          logger.warn('Failed to deduct refrigerant stock', { gasType, error: gasErr });
        }
      }
    }
  }
}

export const serviceReportService = new ServiceReportService();
