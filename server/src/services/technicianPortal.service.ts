import { getSupabaseClient } from '../lib/supabase.js';
import { UnauthorizedError, NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors.js';
import { verifyPin, hashPin, signTechToken } from '../utils/techAuth.js';
import { serviceReportService } from './serviceReport.service.js';
import { logger } from '../utils/logger.js';
import { ServiceVisitType } from '../types/index.js';
import { essIntegrationService } from './essIntegration.service.js';
import { addDaysIstIso, getCalendarWeekdayShort, getIstTodayIso } from '../utils/date.js';
import { sanitizePostgrestFilterTerm } from '../utils/postgrestFilter.js';

export interface TechLoginResponse {
  token: string;
  technician: {
    id: string;
    technicianCode: string;
    name: string;
    phone: string;
    email: string | null;
    status: string;
  };
}

export class TechnicianPortalService {
  /**
   * Fast mobile authentication using Technician Code or Phone Number + 4-digit PIN
   */
  async login(identifier: string, pin: string): Promise<TechLoginResponse> {
    const supabase = getSupabaseClient();
    const cleanId = sanitizePostgrestFilterTerm(identifier);
    const cleanDigits = cleanId.replace(/\D/g, '');

    if (!cleanId) {
      throw new UnauthorizedError('Invalid technician code or mobile number.');
    }

    // Search by technician_code or phone
    const { data: tech, error } = await supabase
      .from('technicians')
      .select('id, technician_code, name, phone, email, status, is_active, pin_hash')
      .or(`technician_code.ilike.${cleanId},phone.ilike.%${cleanDigits || cleanId}%`)
      .maybeSingle();

    if (error || !tech) {
      logger.warn('Technician login failed: identifier not found', { identifier: cleanId });
      throw new UnauthorizedError('Invalid technician code or mobile number.');
    }

    if (!tech.is_active) {
      logger.warn('Inactive technician login attempted', { techId: tech.id });
      throw new ForbiddenError('Your technician account is inactive. Please contact your administrator.');
    }

    const isPinValid = verifyPin(pin, tech.pin_hash);
    if (!isPinValid) {
      logger.warn('Technician login failed: incorrect PIN', { techId: tech.id });
      throw new UnauthorizedError('Incorrect 4-digit PIN. Please try again or ask admin to reset.');
    }

    // Opportunistically upgrade legacy SHA-256 PIN hashes to salted scrypt on successful login
    if (tech.pin_hash && !tech.pin_hash.startsWith('scrypt$')) {
      try {
        await supabase
          .from('technicians')
          .update({ pin_hash: hashPin(pin) })
          .eq('id', tech.id);
      } catch {
        // Non-fatal if upgrade write fails
      }
    }

    const token = signTechToken({
      id: tech.id,
      technicianCode: tech.technician_code,
      phone: tech.phone,
      name: tech.name,
    });

    return {
      token,
      technician: {
        id: tech.id,
        technicianCode: tech.technician_code,
        name: tech.name,
        phone: tech.phone,
        email: tech.email,
        status: tech.status,
      },
    };
  }

  /**
   * Returns technician profile with today's dispatch stats
   */
  async getProfile(techId: string) {
    const supabase = getSupabaseClient();
    const today = getIstTodayIso();

    const { data: tech, error } = await supabase
      .from('technicians')
      .select('id, technician_code, name, phone, email, status, is_active, specializations, service_areas, last_duty_status_at')
      .eq('id', techId)
      .single();

    if (error || !tech) {
      throw new NotFoundError('Technician record not found.');
    }

    // Compute today's counts
    const { count: assignedCount } = await supabase
      .from('service_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('technician_id', techId)
      .eq('scheduled_date', today);

    const { count: completedCount } = await supabase
      .from('service_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('technician_id', techId)
      .eq('scheduled_date', today)
      .eq('status', 'COMPLETED');

    return {
      ...tech,
      metrics: {
        assignedToday: assignedCount || 0,
        completedToday: completedCount || 0,
        pendingToday: Math.max(0, (assignedCount || 0) - (completedCount || 0)),
      },
    };
  }

  /**
   * One-tap technician duty status update
   */
  async updateStatus(techId: string, status: string) {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('technicians')
      .update({
        status,
        last_duty_status_at: now,
        updated_at: now,
      })
      .eq('id', techId)
      .select('id, technician_code, name, status, last_duty_status_at')
      .single();

    if (error || !data) {
      logger.error('Failed to update technician duty status', { techId, status, error });
      throw new BadRequestError('Failed to update duty status.');
    }

    return data;
  }

  /**
   * Retrieves today's assigned jobs for the logged-in technician
   */
  async getAssignedJobs(techId: string, filterDate?: string, includeOverdue = false) {
    const supabase = getSupabaseClient();
    const targetDate = filterDate || getIstTodayIso();

    const fullSelect = `
      id, schedule_number, status, scheduled_date, start_time, end_time,
      planned_service_type, notes, amc_id, service_request_id,
      customers ( id, name, phone, customer_code, city ),
      sites:customer_sites ( id, site_name, address ),
      ac_assets ( id, brand, model_number, room_location, asset_tag, serial_number, tonnage:capacity_tons, refrigerant_type ),
      service_requests ( id, request_number, request_type, priority, description, issue_category )
    `;

    const applyScheduleScope = (q: any) => {
      if (includeOverdue && !filterDate) {
        return q
          .lte('scheduled_date', targetDate)
          .or(
            `scheduled_date.eq.${targetDate},and(scheduled_date.lt.${targetDate},status.in.(SCHEDULED,EN_ROUTE,IN_PROGRESS))`
          )
          .order('scheduled_date', { ascending: true })
          .order('start_time', { ascending: true });
      }
      return q.eq('scheduled_date', targetDate).order('start_time', { ascending: true });
    };

    let { data: schedules, error }: { data: any[] | null; error: any } = await applyScheduleScope(
      supabase.from('service_schedules').select(fullSelect).eq('technician_id', techId)
    );

    // Graceful fallback if an optional schema column (e.g. issue_category) is not yet migrated on target DB
    if (error) {
      logger.warn('Retrying technician assigned jobs query with base columns after schema error', {
        techId,
        targetDate,
        error,
      });
      const baseSelect = `
        id, schedule_number, status, scheduled_date, start_time, end_time,
        planned_service_type, notes, amc_id, service_request_id,
        customers ( id, name, phone, customer_code, city ),
        sites:customer_sites ( id, site_name, address ),
        ac_assets ( id, brand, model_number, room_location, asset_tag, serial_number, tonnage:capacity_tons, refrigerant_type ),
        service_requests ( id, request_number, request_type, priority, description )
      `;
      const fallback = await applyScheduleScope(
        supabase.from('service_schedules').select(baseSelect).eq('technician_id', techId)
      );
      schedules = fallback.data as any[] | null;
      error = fallback.error;
    }

    if (error) {
      logger.error('Error fetching technician assigned jobs', { techId, targetDate, error });
      throw new BadRequestError(`Failed to load dispatch queue${error.message ? `: ${error.message}` : '.'}`);
    }

    return (schedules || []).map((s: any) => ({
      ...s,
      sites: s.sites
        ? {
            ...s.sites,
            city: s.customers?.city || '',
          }
        : null,
    }));
  }

  /**
   * Retrieves full context for a single assigned job
   */
  async getJobDetail(techId: string, scheduleId: string) {
    const supabase = getSupabaseClient();

    const fullDetailSelect = `
      id, schedule_number, status, scheduled_date, start_time, end_time,
      planned_service_type, notes, amc_id, service_request_id,
      customers ( id, name, phone, email, customer_code, city ),
      sites:customer_sites ( id, site_name, address ),
      ac_assets ( id, brand, model_number, room_location, asset_tag, serial_number, tonnage:capacity_tons, refrigerant_type ),
      service_requests ( id, request_number, request_type, priority, description, issue_category )
    `;

    let { data: schedule, error }: { data: any; error: any } = await supabase
      .from('service_schedules')
      .select(fullDetailSelect)
      .eq('id', scheduleId)
      .eq('technician_id', techId)
      .maybeSingle();

    if (error) {
      logger.warn('Retrying technician job detail query with base columns after schema error', {
        techId,
        scheduleId,
        error,
      });
      const baseDetailSelect = `
        id, schedule_number, status, scheduled_date, start_time, end_time,
        planned_service_type, notes, amc_id, service_request_id,
        customers ( id, name, phone, email, customer_code, city ),
        sites:customer_sites ( id, site_name, address ),
        ac_assets ( id, brand, model_number, room_location, asset_tag, serial_number, tonnage:capacity_tons, refrigerant_type ),
        service_requests ( id, request_number, request_type, priority, description )
      `;
      const fallback = await supabase
        .from('service_schedules')
        .select(baseDetailSelect)
        .eq('id', scheduleId)
        .eq('technician_id', techId)
        .maybeSingle();
      schedule = fallback.data;
      error = fallback.error;
    }

    if (error || !schedule) {
      throw new NotFoundError('Job assignment not found or not allocated to your technician profile.');
    }

    // Check if report already filed for this schedule
    const { data: existingReport } = await supabase
      .from('service_reports')
      .select('id, report_number, primary_outcome, created_at')
      .eq('service_schedule_id', scheduleId)
      .maybeSingle();

    // Pre-fetch next sequential serial number & available site AC units (when visit isn't tied to one unit)
    const [{ nextReportNumber }, siteAssetsRes] = await Promise.all([
      serviceReportService.generateNextReportNumber(),
      !(schedule as any).ac_assets && (schedule as any).sites?.id
        ? supabase
            .from('ac_assets')
            .select('id, brand, model_number, room_location, asset_tag, serial_number, tonnage:capacity_tons, refrigerant_type')
            .eq('site_id', (schedule as any).sites.id)
            .eq('is_active', true)
            .order('asset_tag', { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    return {
      schedule: {
        ...schedule,
        sites: (schedule as any).sites
          ? {
              ...(schedule as any).sites,
              city: (schedule as any).customers?.city || '',
            }
          : null,
      },
      existingReport: existingReport || null,
      suggestedReportNumber: nextReportNumber,
      siteAssets: siteAssetsRes?.data || [],
    };
  }

  /**
   * Submits on-site service report and syncs with central database
   */
  async submitFieldReport(techId: string, payload: any) {
    const supabase = getSupabaseClient();

    // Verify schedule belongs to this technician
    const { data: schedule, error: schedErr } = await supabase
      .from('service_schedules')
      .select('id, technician_id, amc_id, service_request_id, start_time, end_time, schedule_number')
      .eq('id', payload.scheduleId)
      .maybeSingle();

    if (schedErr || !schedule) {
      throw new NotFoundError('Scheduled visit not found.');
    }

    if (schedule.technician_id !== techId) {
      throw new ForbiddenError('You can only submit service reports for visits assigned to you.');
    }

    // Determine visitType automatically
    const visitType: ServiceVisitType = schedule.amc_id ? 'PREVENTIVE' : 'SERVICE_REQUEST';

    // Auto-generate deterministic serial report number if technician left it empty
    let reportNumber = (payload.manualReportNumber || '').trim();
    if (!reportNumber) {
      const next = await serviceReportService.generateNextReportNumber();
      reportNumber = next.nextReportNumber;
    }

    const normalizedStartTime = (payload.startTime || schedule.start_time || '').trim().slice(0, 5) || null;
    const normalizedEndTime = (payload.endTime || schedule.end_time || '').trim().slice(0, 5) || null;

    // Format payload for serviceReportService
    const firstAssetWork = Array.isArray(payload.assets)
      ? payload.assets.map((a: any) => a?.workPerformed).filter(Boolean).join('; ')
      : '';
    const reportPayload = {
      scheduleId: payload.scheduleId,
      visitType,
      reportNumber,
      serviceDate: payload.reportedVisitDate,
      assistantName: payload.assistantName || null,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      plannedServiceType: null,
      performedServiceType: payload.serviceExecutionType && payload.serviceExecutionType !== 'MAINTENANCE'
        ? payload.serviceExecutionType
        : (schedule.service_request_id ? 'DIAGNOSTIC_INSPECTION' : 'DRY_SERVICE'),
      primaryOutcome: payload.primaryOutcome,
      workDescription: (payload.workDescription && String(payload.workDescription).trim()) || firstAssetWork || payload.technicianRemarks || null,
      technicianRemarks: payload.technicianRemarks,
      customerRepresentative: payload.customerRepresentative,
      customerAcknowledgement: payload.customerAcknowledgement || (payload.signatureDataUrl ? 'Digitally Signed by Customer on Field Device' : null),
      customerSignatureUrl: payload.signatureDataUrl || null,
      beforePhotoUrl: payload.beforePhotoUrl || null,
      afterPhotoUrl: payload.afterPhotoUrl || null,
      paymentCollected: Boolean(payload.paymentCollected),
      paymentAmount: payload.paymentAmount ? Number(payload.paymentAmount) : 0,
      paymentMethod: payload.paymentMethod || null,
      paymentReference: payload.paymentReference ? String(payload.paymentReference).trim() : null,
      paymentNotes: payload.paymentNotes ? String(payload.paymentNotes).trim() : null,
      assets: (payload.assets || []).map((a: any) => ({
        assetId: a.assetId,
        faultReported: a.faultReported || null,
        diagnosisFindings: a.diagnosisFindings,
        workPerformed: a.workPerformed,
        assetOutcome: a.assetOutcome,
        finalCondition: a.finalCondition || 'GOOD',
        refrigerantAdded: a.refrigerantAdded || false,
        refrigerantType: a.refrigerantType || null,
        refrigerantQtyKg: a.refrigerantQtyKg || null,
      })),
      items: (payload.items || []).map((item: any) => {
        const effectiveAssetId = item.assetId || payload.assets?.[0]?.assetId || null;
        return {
          assetId: effectiveAssetId,
          itemType: (payload.primaryOutcome === 'PENDING_PARTS' ? 'PART_REQUIRED' : 'REPAIR_REQUIRED') as 'PART_REQUIRED' | 'REPAIR_REQUIRED',
          itemName: item.partDescription,
          quantity: Number(item.quantity || 1),
          reason: item.actionRemarks || payload.technicianRemarks || 'Reported during on-site visit',
          isApprovalRequired: false,
          isSpecialistRequired: false,
          isRevisitRequired: Boolean(effectiveAssetId) && (item.isRevisitRequired ?? true),
          followUpNotes: item.actionRemarks || null,
        };
      }),
    };

    // Execute through authoritative serviceReportService (null actorId: technician uses PIN auth without profiles row)
    const createdReport = await serviceReportService.createReport(reportPayload, null);

    // Notify Admin & Staff dispatchers in real-time inside Operations -> Notifications
    try {
      const { data: recipients } = await supabase
        .from('staff')
        .select('profile_id')
        .in('role', ['ADMIN', 'STAFF'])
        .eq('is_active', true);

      const recipientIds = Array.from(
        new Set((recipients || []).map((r: any) => r.profile_id).filter(Boolean))
      );

      if (recipientIds.length > 0) {
        const outcomeLabel = payload.primaryOutcome === 'COMPLETED'
          ? 'Completed'
          : payload.primaryOutcome === 'PENDING_PARTS'
          ? 'Pending Parts'
          : 'Needs Revisit';
        const notificationRows = recipientIds.map((profileId: string) => ({
          recipient_profile_id: profileId,
          title: `Field Report #${createdReport.reportNumber} Submitted`,
          message: `${createdReport.technicianName || 'Field technician'} filed visit report #${createdReport.reportNumber} (${outcomeLabel}) for ${createdReport.customerName || 'customer'}.`,
          type: payload.primaryOutcome === 'COMPLETED' ? 'SUCCESS' : 'WARNING',
          category: payload.primaryOutcome === 'PENDING_PARTS' ? 'AWAITING_PARTS' : 'SYSTEM',
          entity_type: 'service_report',
          entity_id: createdReport.id,
          dedupe_key: `field-report-${createdReport.id}-${profileId}`,
        }));
        await supabase.from('notifications').insert(notificationRows);
      }
    } catch (notifyErr) {
      logger.warn('Non-blocking dispatcher notification error after field report', {
        error: notifyErr,
        reportId: createdReport.id,
      });
    }

    logger.info('Field service report submitted by technician', {
      techId,
      reportNumber: createdReport.reportNumber,
      scheduleId: payload.scheduleId,
      primaryOutcome: payload.primaryOutcome,
    });

    return createdReport;
  }

  /**
   * Updates the on-site execution status of an assigned job (e.g. EN_ROUTE, IN_PROGRESS)
   */
  async updateJobStatus(techId: string, scheduleId: string, status: string) {
    const supabase = getSupabaseClient();

    const validStatuses = ['SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestError(`Invalid schedule status: ${status}. Must be one of ${validStatuses.join(', ')}`);
    }

    const { data: schedule, error: schedErr } = await supabase
      .from('service_schedules')
      .select('id, technician_id, status, service_request_id')
      .eq('id', scheduleId)
      .maybeSingle();

    if (schedErr || !schedule) {
      throw new NotFoundError('Scheduled visit not found.');
    }

    if (schedule.technician_id !== techId) {
      throw new ForbiddenError('You can only update status for visits assigned to you.');
    }

    const { error: updateErr } = await supabase
      .from('service_schedules')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId);

    if (updateErr) {
      logger.error('Failed to update schedule status', { error: updateErr, scheduleId, status });
      throw new BadRequestError('Failed to update job status.');
    }

    // Advance Service Request lifecycle state if linked
    if (schedule.service_request_id && (status === 'IN_PROGRESS' || status === 'COMPLETED')) {
      const targetSrStatus = status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'COMPLETED';
      await supabase
        .from('service_requests')
        .update({
          status: targetSrStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.service_request_id);

      void essIntegrationService.notifyServiceRequestStatusUpdate(schedule.service_request_id, targetSrStatus);
    }

    // Auto-update technician operational status
    if (status === 'IN_PROGRESS' || status === 'EN_ROUTE') {
      await supabase
        .from('technicians')
        .update({ status: 'BUSY', updated_at: new Date().toISOString() })
        .eq('id', techId);
    } else if (status === 'COMPLETED') {
      await supabase
        .from('technicians')
        .update({ status: 'AVAILABLE', updated_at: new Date().toISOString() })
        .eq('id', techId);
    }

    return {
      success: true,
      scheduleId,
      status,
    };
  }

  /**
   * Retrieves real-time daily work analytics and 7-day rolling performance trends for a technician
   */
  async getDailyAnalytics(techId: string, filterDate?: string) {
    const supabase = getSupabaseClient();
    const todayStr = filterDate || getIstTodayIso();

    // 1. Fetch today's schedules assigned to this technician
    const { data: todaySchedules } = await supabase
      .from('service_schedules')
      .select('id, status, amc_id, service_request_id, start_time, end_time')
      .eq('technician_id', techId)
      .eq('scheduled_date', todayStr);

    const todayList = todaySchedules || [];
    const totalAssigned = todayList.length;
    const completed = todayList.filter((s: any) => s.status === 'COMPLETED').length;
    const inProgress = todayList.filter((s: any) => s.status === 'IN_PROGRESS' || s.status === 'EN_ROUTE').length;
    const pending = totalAssigned - completed;
    const completionRatePercent = totalAssigned > 0 ? Math.round((completed / totalAssigned) * 100) : 0;

    // 2. Fetch last 7 days of completed schedules & reports for weekly analytics
    const sevenDaysAgoStr = addDaysIstIso(todayStr, -6);

    const { data: weekSchedules } = await supabase
      .from('service_schedules')
      .select('id, scheduled_date, status, amc_id, service_request_id')
      .eq('technician_id', techId)
      .gte('scheduled_date', sevenDaysAgoStr)
      .lte('scheduled_date', todayStr);

    const { data: weekReports } = await supabase
      .from('service_reports')
      .select('id, service_date, start_time, end_time, primary_outcome, customer_signature_url')
      .eq('technician_id', techId)
      .gte('service_date', sevenDaysAgoStr)
      .lte('service_date', todayStr);

    const reportsList = weekReports || [];
    const schedulesList = weekSchedules || [];

    // Calculate duration in minutes from reports with valid start and end times
    let totalDurationMinutes = 0;
    let durationCount = 0;
    let signedReportsCount = 0;

    for (const r of reportsList) {
      if (r.customer_signature_url) {
        signedReportsCount++;
      }
      if (r.start_time && r.end_time) {
        const [sh, sm] = String(r.start_time).split(':').map(Number);
        const [eh, em] = String(r.end_time).split(':').map(Number);
        if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
          const diffMin = (eh * 60 + em) - (sh * 60 + sm);
          if (diffMin > 0 && diffMin < 720) {
            totalDurationMinutes += diffMin;
            durationCount++;
          }
        }
      }
    }

    const avgDurationMinutes = durationCount > 0
      ? Math.round(totalDurationMinutes / durationCount)
      : 0;

    const customerSignOffRatePercent = reportsList.length > 0
      ? Math.round((signedReportsCount / reportsList.length) * 100)
      : 0;

    const totalCompleted = reportsList.length;
    const completedWeekSchedules = schedulesList.filter((s: any) => s.status === 'COMPLETED');
    const breakdownCompleted = completedWeekSchedules.filter((s: any) => Boolean(s.service_request_id)).length;
    const amcCompleted = completedWeekSchedules.filter((s: any) => Boolean(s.amc_id)).length;

    // Build 7-day rolling daily trend
    const dailyTrend: Array<{
      date: string;
      dayName: string;
      totalCompleted: number;
      breakdownCount: number;
      amcCount: number;
    }> = [];

    for (let i = 6; i >= 0; i--) {
      const dateIso = addDaysIstIso(todayStr, -i);
      const dayName = getCalendarWeekdayShort(dateIso);

      const dayScheds = schedulesList.filter((s: any) => s.scheduled_date === dateIso && s.status === 'COMPLETED');
      const dayBreakdowns = dayScheds.filter((s: any) => Boolean(s.service_request_id)).length;
      const dayAmc = dayScheds.filter((s: any) => Boolean(s.amc_id)).length;

      dailyTrend.push({
        date: dateIso,
        dayName,
        totalCompleted: dayScheds.length,
        breakdownCount: dayBreakdowns,
        amcCount: dayAmc,
      });
    }

    return {
      today: {
        totalAssigned,
        completed,
        inProgress,
        pending,
        completionRatePercent,
      },
      weekly: {
        totalCompleted,
        breakdownCompleted,
        amcCompleted,
        avgDurationMinutes,
        customerSignOffRatePercent,
      },
      dailyTrend,
    };
  }

  async updatePin(techId: string, currentPin: string, newPin: string): Promise<{ updated: boolean }> {
    const supabase = getSupabaseClient();
    const { data: tech, error } = await supabase
      .from('technicians')
      .select('id,pin_hash')
      .eq('id', techId)
      .maybeSingle();

    if (error || !tech) {
      throw new NotFoundError('Technician record was not found.');
    }

    if (!verifyPin(currentPin, tech.pin_hash)) {
      throw new UnauthorizedError('Current PIN is incorrect.');
    }

    if (currentPin === newPin) {
      throw new BadRequestError('New PIN must differ from the current PIN.');
    }

    const { error: updateErr } = await supabase
      .from('technicians')
      .update({
        pin_hash: hashPin(newPin),
        updated_at: new Date().toISOString(),
      })
      .eq('id', techId);

    if (updateErr) {
      throw new BadRequestError('Could not update technician PIN.');
    }

    return { updated: true };
  }
}

export const technicianPortalService = new TechnicianPortalService();

