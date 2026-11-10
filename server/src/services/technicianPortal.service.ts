import { getSupabaseClient } from '../lib/supabase.js';
import { UnauthorizedError, NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors.js';
import { verifyPin, signTechToken } from '../utils/techAuth.js';
import { serviceReportService } from './serviceReport.service.js';
import { logger } from '../utils/logger.js';
import { ServiceVisitType } from '../types/index.js';

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
        customers ( id, name, phone, customer_code ),
        sites ( id, site_name, address, city, landmark, pincode ),
        ac_assets ( id, brand, model_number, room_location, asset_tag, serial_number, tonnage ),
        service_requests ( id, request_number, request_type, priority, description, issue_category )
      `)
      .eq('technician_id', techId)
      .eq('scheduled_date', targetDate)
      .order('start_time', { ascending: true });

    if (error) {
      logger.error('Error fetching technician assigned jobs', { techId, targetDate, error });
      throw new BadRequestError('Failed to load dispatch queue.');
    }

    return schedules || [];
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
        customers ( id, name, phone, email, customer_code ),
        sites ( id, site_name, address, city, landmark, pincode ),
        ac_assets ( id, brand, model_number, room_location, asset_tag, serial_number, tonnage, refrigerant_type ),
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
      schedule,
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

    // Format payload for serviceReportService
    const reportPayload = {
      scheduleId: payload.scheduleId,
      visitType,
      reportNumber: payload.manualReportNumber,
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
}

export const technicianPortalService = new TechnicianPortalService();

