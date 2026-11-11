import { getSupabaseClient } from '../lib/supabase.js';
import { UnauthorizedError, NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors.js';
import { verifyPin, signTechToken } from '../utils/techAuth.js';
import { serviceReportService } from './serviceReport.service.js';
import { logger } from '../utils/logger.js';
import { ServiceVisitType } from '../types/index.js';
import { essIntegrationService } from './essIntegration.service.js';

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
    const cleanId = identifier.trim();
    const cleanDigits = cleanId.replace(/\D/g, '');

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
    const today = new Date().toISOString().split('T')[0];

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
  async getAssignedJobs(techId: string, filterDate?: string) {
    const supabase = getSupabaseClient();
    const targetDate = filterDate || new Date().toISOString().split('T')[0];

    const { data: schedules, error } = await supabase
      .from('service_schedules')
      .select(`
        id, schedule_number, status, scheduled_date, start_time, end_time,
        planned_service_type, notes, amc_id, service_request_id,
        customers ( id, name, phone, customer_code, city ),
        sites:customer_sites ( id, site_name, address ),
        ac_assets ( id, brand, model_number, room_location, asset_tag, serial_number, tonnage:capacity_tons, refrigerant_type ),
        service_requests ( id, request_number, request_type, priority, description, issue_category )
      `)
      .eq('technician_id', techId)
      .eq('scheduled_date', targetDate)
      .order('start_time', { ascending: true });

    if (error) {
      logger.error('Error fetching technician assigned jobs', { techId, targetDate, error });
      throw new BadRequestError('Failed to load dispatch queue.');
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

    const { data: schedule, error } = await supabase
      .from('service_schedules')
      .select(`
        id, schedule_number, status, scheduled_date, start_time, end_time,
        planned_service_type, notes, amc_id, service_request_id,
        customers ( id, name, phone, email, customer_code, city ),
        sites:customer_sites ( id, site_name, address ),
        ac_assets ( id, brand, model_number, room_location, asset_tag, serial_number, tonnage:capacity_tons, refrigerant_type ),
        service_requests ( id, request_number, request_type, priority, description, issue_category )
      `)
      .eq('id', scheduleId)
      .eq('technician_id', techId)
      .maybeSingle();

    if (error || !schedule) {
      throw new NotFoundError('Job assignment not found or not allocated to your technician profile.');
    }

    // Check if report already filed for this schedule
    const { data: existingReport } = await supabase
      .from('service_reports')
      .select('id, report_number, primary_outcome, created_at')
      .eq('service_schedule_id', scheduleId)
      .maybeSingle();

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
      .select('id, technician_id, amc_id, service_request_id')
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

    // Auto-generate report number if technician left it empty on mobile
    let reportNumber = (payload.manualReportNumber || '').trim();
    if (!reportNumber) {
      const year = new Date().getUTCFullYear();
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      reportNumber = `REP-${year}-${randSuffix}`;
    }

    // Format payload for serviceReportService
    const reportPayload = {
      scheduleId: payload.scheduleId,
      visitType,
      reportNumber,
      serviceDate: payload.reportedVisitDate,
      assistantName: payload.assistantName || null,
      startTime: payload.startTime,
      endTime: payload.endTime,
      plannedServiceType: null,
      performedServiceType: payload.serviceExecutionType && payload.serviceExecutionType !== 'MAINTENANCE'
        ? payload.serviceExecutionType
        : (schedule.service_request_id ? 'DIAGNOSTIC_INSPECTION' : 'DRY_SERVICE'),
      primaryOutcome: payload.primaryOutcome,
      technicianRemarks: payload.technicianRemarks,
      customerRepresentative: payload.customerRepresentative,
      customerAcknowledgement: payload.customerAcknowledgement || (payload.signatureDataUrl ? 'Digitally Signed by Customer on Field Device' : null),
      customerSignatureUrl: payload.signatureDataUrl || null,
      assets: payload.assets.map((a: any) => ({
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
      items: (payload.items || []).map((item: any) => ({
        assetId: item.assetId || null,
        partDescription: item.partDescription,
        quantity: Number(item.quantity || 1),
        unitCost: item.unitCost ? Number(item.unitCost) : null,
        isProcurementRequired: item.isProcurementRequired || false,
        isRevisitRequired: item.isRevisitRequired || false,
        actionRemarks: item.actionRemarks || null,
      })),
    };

    // Execute through authoritative serviceReportService
    const createdReport = await serviceReportService.createReport(reportPayload, techId);

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
    const todayStr = filterDate || new Date().toISOString().split('T')[0];

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
    const completionRatePercent = totalAssigned > 0 ? Math.round((completed / totalAssigned) * 100) : 100;

    // 2. Fetch last 7 days of completed schedules & reports for weekly analytics
    const sevenDaysAgo = new Date(todayStr);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

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
      : 55;

    const customerSignOffRatePercent = reportsList.length > 0
      ? Math.round((signedReportsCount / reportsList.length) * 100)
      : 100;

    const totalCompleted = reportsList.length;
    const completedWeekSchedules = schedulesList.filter((s: any) => s.status === 'COMPLETED');
    const breakdownCompleted = completedWeekSchedules.filter((s: any) => Boolean(s.service_request_id)).length;
    const amcCompleted = completedWeekSchedules.filter((s: any) => Boolean(s.amc_id)).length;

    // Build 7-day rolling daily trend
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailyTrend: Array<{
      date: string;
      dayName: string;
      totalCompleted: number;
      breakdownCount: number;
      amcCount: number;
    }> = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStr);
      d.setDate(d.getDate() - i);
      const dateIso = d.toISOString().split('T')[0];
      const dayName = dayNames[d.getDay()];

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
}

export const technicianPortalService = new TechnicianPortalService();

