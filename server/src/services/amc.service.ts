import { randomUUID } from 'crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import {
  AmcContractResponse,
  AmcPlanResponse,
  AmcCoveredAssetResponse,
  ServiceScheduleResponse,
  CreateAmcContractPayload,
  RenewAmcContractPayload,
  UpdateAmcContractPayload,
  UpdateAmcStatusPayload,
  CancelAmcContractPayload,
  AddAmcAssetsPayload,
  GeneratePmPayload,
  PmGenerationResult,
  AmcContractListQuery,
  AmcDashboardMetrics,
  AmcFrequency,
  AmcStatus,
  ServiceScheduleStatus,
  PlannedServiceType,
} from '../types/index.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';
import { calculateAmcCadenceDates } from '../utils/amcCadence.js';

/**
 * Calendar and UTC-aware month addition handling varying month lengths safely (e.g. Jan 31 -> Feb 28/29).
 */
export function addMonthsSafeUtc(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);

  if (result.getUTCDate() !== originalDay) {
    result.setUTCDate(0); // Revert to last day of previous month
  }
  return result;
}

/**
 * Pure, deterministic date generator for contract-bound preventive maintenance visits.
 */
export function calculateScheduleDatesUtc(
  startDateStr: string,
  endDateStr: string,
  frequency: AmcFrequency
): string[] {
  try {
    return calculateAmcCadenceDates(startDateStr, endDateStr, frequency);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : 'Invalid AMC cadence');
  }
}

/**
 * Deterministic service type generator matching the contract's PM allocation across Dry, Jet, and Pumpdown visits.
 */
export function computePlannedServiceTypes(
  totalVisits: number,
  dryVisits: number | null | undefined,
  jetVisits: number | null | undefined,
  pumpdownVisits: number | null | undefined
): PlannedServiceType[] {
  // If no allocation configured (legacy contract), retain existing alternating fallback
  if (dryVisits == null && jetVisits == null && pumpdownVisits == null) {
    return Array.from({ length: totalVisits }, (_, i) =>
      (i + 1) % 2 === 0 ? 'JET_SERVICE' : 'DRY_SERVICE'
    );
  }

  const dry = dryVisits ?? 0;
  const jet = jetVisits ?? 0;
  const pumpdown = pumpdownVisits ?? 0;

  if (dry + jet + pumpdown !== totalVisits) {
    throw new BadRequestError(
      `Service allocation sum (${dry + jet + pumpdown}) must exactly match total included visits (${totalVisits})`
    );
  }

  const remainingCounts: Record<'DRY_SERVICE' | 'JET_SERVICE' | 'PUMPDOWN_SERVICE', number> = {
    DRY_SERVICE: dry,
    JET_SERVICE: jet,
    PUMPDOWN_SERVICE: pumpdown,
  };

  const typesInOrder: Array<'DRY_SERVICE' | 'JET_SERVICE' | 'PUMPDOWN_SERVICE'> = ['DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE'];
  const result: PlannedServiceType[] = [];

  while (result.length < totalVisits) {
    let addedInRound = false;
    for (const t of typesInOrder) {
      if (remainingCounts[t] > 0 && result.length < totalVisits) {
        result.push(t);
        remainingCounts[t]--;
        addedInRound = true;
      }
    }
    if (!addedInRound) {
      break;
    }
  }

  return result;
}

export class AmcService {
  /**
   * Helper to write audit events to activity_logs
   */
  private async recordAudit(
    actorId: string,
    action: string,
    entityId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      await logActivity({
        actorProfileId: actorId || null,
        action,
        entityType: 'amc_contract',
        entityId,
        details,
      });
    } catch (err) {
      logger.error('Failed to log AMC activity', { error: err, action, entityId });
    }
  }

  /**
   * Generate collision-safe contract number (AMC-YYYY-XXXX)
   */
  private async generateContractNumber(): Promise<string> {
    const supabase = getSupabaseClient();
    const year = new Date().getFullYear();
    const prefix = `AMC-${year}-`;

    const { data, error } = await supabase
      .from('amc_contracts')
      .select('contract_number')
      .ilike('contract_number', `${prefix}%`)
      .order('contract_number', { ascending: false })
      .limit(1);

    if (error) {
      logger.error('Failed to query existing AMC contract numbers', { error });
      throw new BadRequestError('Failed to generate AMC contract number');
    }

    let nextSeq = 1;
    if (data && data.length > 0 && data[0].contract_number) {
      const parts = data[0].contract_number.split('-');
      if (parts.length === 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) {
          nextSeq = parsed + 1;
        }
      }
    }

    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  /**
   * Query starting sequence for PM schedule numbers (PM-YYYY-XXXXXX)
   */
  private async getNextScheduleSequence(): Promise<{ prefix: string; nextSeq: number }> {
    const supabase = getSupabaseClient();
    const year = new Date().getFullYear();
    const prefix = `PM-${year}-`;

    const { data, error } = await supabase
      .from('service_schedules')
      .select('schedule_number')
      .ilike('schedule_number', `${prefix}%`)
      .order('schedule_number', { ascending: false })
      .limit(1);

    if (error) {
      logger.error('Failed to query existing PM schedule numbers', { error });
      throw new BadRequestError('Failed to generate PM schedule number');
    }

    let nextSeq = 1;
    if (data && data.length > 0 && data[0].schedule_number) {
      const parts = data[0].schedule_number.split('-');
      if (parts.length === 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) {
          nextSeq = parsed + 1;
        }
      }
    }

    return { prefix, nextSeq };
  }

  /**
   * Generate collision-safe PM schedule number (PM-YYYY-XXXXXX)
   */
  private async generateScheduleNumber(): Promise<string> {
    const { prefix, nextSeq } = await this.getNextScheduleSequence();
    return `${prefix}${String(nextSeq).padStart(6, '0')}`;
  }

  /**
   * List reusable AMC plans
   */
  async listPlans(includeInactive: boolean = false): Promise<AmcPlanResponse[]> {
    const supabase = getSupabaseClient();
    let query = supabase.from('amc_plans').select('*');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('default_visits_per_year', { ascending: true });

    if (error) {
      logger.error('Failed to list AMC plans', { error });
      throw new BadRequestError('Failed to retrieve AMC plans');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      planCode: row.plan_code,
      name: row.name,
      category: row.category || 'ORDINARY',
      description: row.description,
      coverageSummary: row.coverage_summary,
      defaultFrequency: row.default_frequency as AmcFrequency,
      defaultVisitsPerYear: row.default_visits_per_year,
      pricingModel: row.pricing_model || 'TIERED_TONNAGE',
      rateSplitSmall: row.rate_split_small != null ? Number(row.rate_split_small) : null,
      rateSplitLarge: row.rate_split_large != null ? Number(row.rate_split_large) : null,
      rateWindowSmall: row.rate_window_small != null ? Number(row.rate_window_small) : null,
      rateWindowLarge: row.rate_window_large != null ? Number(row.rate_window_large) : null,
      rateFlat: row.rate_flat != null ? Number(row.rate_flat) : null,
      gstRatePercent: row.gst_rate_percent != null ? Number(row.gst_rate_percent) : 0,
      maxEquipmentAgeYears: row.max_equipment_age_years != null ? Number(row.max_equipment_age_years) : null,
      hasGasCharging: Boolean(row.has_gas_charging),
      hasSpareParts: Boolean(row.has_spare_parts),
      hasUnlimitedComplaints: Boolean(row.has_unlimited_complaints),
      rateMetadata: row.rate_metadata || null,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get single AMC plan by ID
   */
  async getPlanById(id: string): Promise<AmcPlanResponse> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('amc_plans')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundError(`AMC plan with ID '${id}' not found`);
    }

    return {
      id: data.id,
      planCode: data.plan_code,
      name: data.name,
      category: data.category || 'ORDINARY',
      description: data.description,
      coverageSummary: data.coverage_summary,
      defaultFrequency: data.default_frequency as AmcFrequency,
      defaultVisitsPerYear: data.default_visits_per_year,
      pricingModel: data.pricing_model || 'TIERED_TONNAGE',
      rateSplitSmall: data.rate_split_small != null ? Number(data.rate_split_small) : null,
      rateSplitLarge: data.rate_split_large != null ? Number(data.rate_split_large) : null,
      rateWindowSmall: data.rate_window_small != null ? Number(data.rate_window_small) : null,
      rateWindowLarge: data.rate_window_large != null ? Number(data.rate_window_large) : null,
      rateFlat: data.rate_flat != null ? Number(data.rate_flat) : null,
      gstRatePercent: data.gst_rate_percent != null ? Number(data.gst_rate_percent) : 0,
      maxEquipmentAgeYears: data.max_equipment_age_years != null ? Number(data.max_equipment_age_years) : null,
      hasGasCharging: Boolean(data.has_gas_charging),
      hasSpareParts: Boolean(data.has_spare_parts),
      hasUnlimitedComplaints: Boolean(data.has_unlimited_complaints),
      rateMetadata: data.rate_metadata || null,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Admin Create AMC Plan
   */
  async createPlan(payload: any): Promise<AmcPlanResponse> {
    const supabase = getSupabaseClient();
    const cleanCode = (payload.planCode || '').trim().toUpperCase();

    // Check duplicate code
    const { data: duplicate } = await supabase
      .from('amc_plans')
      .select('id, plan_code')
      .eq('plan_code', cleanCode)
      .maybeSingle();

    if (duplicate) {
      throw new ConflictError(`AMC Plan with code '${cleanCode}' already exists.`);
    }

    const insertData = {
      plan_code: cleanCode,
      name: payload.name.trim(),
      category: payload.category || 'ORDINARY',
      description: payload.description ? payload.description.trim() : null,
      coverage_summary: payload.coverageSummary ? payload.coverageSummary.trim() : null,
      default_frequency: payload.defaultFrequency,
      default_visits_per_year: payload.defaultVisitsPerYear,
      pricing_model: payload.pricingModel || 'TIERED_TONNAGE',
      rate_split_small: payload.rateSplitSmall != null ? Number(payload.rateSplitSmall) : null,
      rate_split_large: payload.rateSplitLarge != null ? Number(payload.rateSplitLarge) : null,
      rate_window_small: payload.rateWindowSmall != null ? Number(payload.rateWindowSmall) : null,
      rate_window_large: payload.rateWindowLarge != null ? Number(payload.rateWindowLarge) : null,
      rate_flat: payload.rateFlat != null ? Number(payload.rateFlat) : null,
      gst_rate_percent: payload.gstRatePercent != null ? Number(payload.gstRatePercent) : 0,
      max_equipment_age_years: payload.maxEquipmentAgeYears != null ? Number(payload.maxEquipmentAgeYears) : null,
      has_gas_charging: Boolean(payload.hasGasCharging),
      has_spare_parts: Boolean(payload.hasSpareParts),
      has_unlimited_complaints: payload.hasUnlimitedComplaints !== false,
      rate_metadata: payload.rateMetadata || null,
      is_active: payload.isActive !== false,
    };

    const { data: inserted, error } = await supabase
      .from('amc_plans')
      .insert(insertData)
      .select('*')
      .single();

    if (error || !inserted) {
      logger.error('Failed to create AMC plan', { error });
      throw new BadRequestError(`Failed to create AMC plan: ${error?.message || 'Database error'}`);
    }

    return this.getPlanById(inserted.id);
  }

  /**
   * Admin Update AMC Plan
   */
  async updatePlan(id: string, payload: any): Promise<AmcPlanResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getPlanById(id);

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.name !== undefined) updateData.name = payload.name.trim();
    if (payload.category !== undefined) updateData.category = payload.category;
    if (payload.description !== undefined) updateData.description = payload.description ? payload.description.trim() : null;
    if (payload.coverageSummary !== undefined) updateData.coverage_summary = payload.coverageSummary ? payload.coverageSummary.trim() : null;
    if (payload.defaultFrequency !== undefined) updateData.default_frequency = payload.defaultFrequency;
    if (payload.defaultVisitsPerYear !== undefined) updateData.default_visits_per_year = payload.defaultVisitsPerYear;
    if (payload.pricingModel !== undefined) updateData.pricing_model = payload.pricingModel;
    if (payload.rateSplitSmall !== undefined) updateData.rate_split_small = payload.rateSplitSmall != null ? Number(payload.rateSplitSmall) : null;
    if (payload.rateSplitLarge !== undefined) updateData.rate_split_large = payload.rateSplitLarge != null ? Number(payload.rateSplitLarge) : null;
    if (payload.rateWindowSmall !== undefined) updateData.rate_window_small = payload.rateWindowSmall != null ? Number(payload.rateWindowSmall) : null;
    if (payload.rateWindowLarge !== undefined) updateData.rate_window_large = payload.rateWindowLarge != null ? Number(payload.rateWindowLarge) : null;
    if (payload.rateFlat !== undefined) updateData.rate_flat = payload.rateFlat != null ? Number(payload.rateFlat) : null;
    if (payload.gstRatePercent !== undefined) updateData.gst_rate_percent = payload.gstRatePercent != null ? Number(payload.gstRatePercent) : 0;
    if (payload.maxEquipmentAgeYears !== undefined) updateData.max_equipment_age_years = payload.maxEquipmentAgeYears != null ? Number(payload.maxEquipmentAgeYears) : null;
    if (payload.hasGasCharging !== undefined) updateData.has_gas_charging = Boolean(payload.hasGasCharging);
    if (payload.hasSpareParts !== undefined) updateData.has_spare_parts = Boolean(payload.hasSpareParts);
    if (payload.hasUnlimitedComplaints !== undefined) updateData.has_unlimited_complaints = Boolean(payload.hasUnlimitedComplaints);
    if (payload.rateMetadata !== undefined) updateData.rate_metadata = payload.rateMetadata;
    if (payload.isActive !== undefined) updateData.is_active = Boolean(payload.isActive);

    const { error } = await supabase
      .from('amc_plans')
      .update(updateData)
      .eq('id', id);

    if (error) {
      logger.error('Failed to update AMC plan', { id, error });
      throw new BadRequestError(`Failed to update AMC plan: ${error.message}`);
    }

    return this.getPlanById(id);
  }

  /**
   * Admin Delete or Safe Archive AMC Plan
   */
  async deleteOrArchivePlan(id: string): Promise<{ message: string; archived: boolean; deleted: boolean }> {
    const supabase = getSupabaseClient();
    const existing = await this.getPlanById(id);

    // Check if referenced by active or historical contracts
    const { count, error: countErr } = await supabase
      .from('amc_contracts')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', id);

    if (countErr) {
      logger.error('Failed to check contract references for AMC plan', { id, error: countErr });
      throw new BadRequestError('Failed to inspect contract references');
    }

    if (count && count > 0) {
      // Safely archive (deactivate)
      const { error: archErr } = await supabase
        .from('amc_plans')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (archErr) {
        throw new BadRequestError(`Failed to archive plan: ${archErr.message}`);
      }

      logger.info('Plan is referenced by contracts and was safely archived', { planId: id, contractsCount: count });
      return {
        message: `Plan '${existing.name}' is referenced by ${count} contract(s). It has been safely archived (deactivated) to protect contract integrity.`,
        archived: true,
        deleted: false,
      };
    }

    // No references: hard delete
    const { error: delErr } = await supabase
      .from('amc_plans')
      .delete()
      .eq('id', id);

    if (delErr) {
      throw new BadRequestError(`Failed to delete plan: ${delErr.message}`);
    }

    logger.info('Plan deleted successfully', { planId: id, planCode: existing.planCode });
    return {
      message: `Plan '${existing.name}' (${existing.planCode}) was permanently deleted.`,
      archived: false,
      deleted: true,
    };
  }

  /**
   * Active contract and covered asset totals shared with the overall analytics endpoint.
   */
  async getActiveCoverageMetrics(): Promise<Pick<AmcDashboardMetrics, 'activeContracts' | 'expiringSoonContracts' | 'expiredContracts' | 'coveredAssetsCount'>> {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Contracts
    const { data: contracts, error: cErr } = await supabase
      .from('amc_contracts')
      .select('id, status, start_date, end_date');

    if (cErr) {
      logger.error('Failed to fetch contracts for AMC metrics', { error: cErr });
      throw new BadRequestError('Failed to compute AMC metrics');
    }

    let activeContracts = 0;
    let expiringSoonContracts = 0;
    let expiredContracts = 0;

    const activeContractIds: string[] = [];

    (contracts || []).forEach((c: any) => {
      if (c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON') {
        if (c.end_date < today) {
          expiredContracts++;
        } else if (c.end_date <= thirtyDaysLater) {
          expiringSoonContracts++;
          activeContracts++;
          activeContractIds.push(c.id);
        } else {
          activeContracts++;
          activeContractIds.push(c.id);
        }
      } else if (c.status === 'EXPIRED') {
        expiredContracts++;
      }
    });

    // Covered assets in active contracts
    let coveredAssetsCount = 0;
    if (activeContractIds.length > 0) {
      const { data: amcAssets } = await supabase
        .from('amc_assets')
        .select('asset_id')
        .in('amc_id', activeContractIds);

      if (amcAssets) {
        const uniqueAssetIds = new Set(amcAssets.map((a: any) => a.asset_id));
        coveredAssetsCount = uniqueAssetIds.size;
      }
    }

    return { activeContracts, expiringSoonContracts, expiredContracts, coveredAssetsCount };
  }

  /**
   * Current AMC portfolio and per-contract maintenance schedule metrics.
   */
  async getDashboardMetrics(): Promise<AmcDashboardMetrics> {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0];
    const coverageMetrics = await this.getActiveCoverageMetrics();

    // Only active AMC obligations belong to the AMC due-visit KPI.
    const { data: schedules, error: scheduleError } = await supabase
      .from('service_schedules')
      .select('id, scheduled_date, status')
      .not('amc_id', 'is', null)
      .not('status', 'in', '(COMPLETED,RESOLVED,CANCELLED,SKIPPED,RESCHEDULED)');

    if (scheduleError) {
      logger.error('Failed to fetch AMC schedules for metrics', { error: scheduleError });
      throw new BadRequestError('Failed to compute AMC metrics');
    }

    let upcomingPmCount = 0;
    let overduePmCount = 0;

    (schedules || []).forEach((s: any) => {
      const isCompleted = ['COMPLETED', 'RESOLVED', 'CANCELLED', 'SKIPPED', 'RESCHEDULED'].includes(s.status);
      if (!isCompleted) {
        if (s.scheduled_date < today) {
          overduePmCount++;
        } else {
          upcomingPmCount++;
        }
      }
    });

    return {
      ...coverageMetrics,
      upcomingPmCount,
      overduePmCount,
    };
  }

  /**
   * List AMC contracts with server-side search, filtering, and pagination
   */
  async listContracts(
    query: AmcContractListQuery
  ): Promise<{ contracts: AmcContractResponse[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const supabase = getSupabaseClient();
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let dbQuery = supabase
      .from('amc_contracts')
      .select(
        `
        id, contract_number, customer_id, plan_id, start_date, end_date, frequency,
        total_amount, total_visits, dry_service_visits, jet_service_visits, pumpdown_service_visits,
        status, notes, cancellation_reason, cancelled_at,
        cancelled_by, previous_contract_id, created_by, updated_by, created_at, updated_at,
        customers (id, name, customer_code, phone),
        amc_plans (id, name, plan_code)
      `,
        { count: 'exact' }
      );

    if (query.status === 'HISTORY') {
      dbQuery = dbQuery.in('status', ['RENEWED', 'EXPIRED', 'CANCELLED']);
    } else if (query.status && query.status !== 'ALL') {
      dbQuery = dbQuery.eq('status', query.status);
    }

    if (query.frequency && query.frequency !== 'ALL') {
      dbQuery = dbQuery.eq('frequency', query.frequency);
    }

    if (query.planId) {
      dbQuery = dbQuery.eq('plan_id', query.planId);
    }

    if (query.customerId) {
      dbQuery = dbQuery.eq('customer_id', query.customerId);
    }

    if (query.search) {
      const s = `%${query.search.trim()}%`;
      dbQuery = dbQuery.or(`contract_number.ilike.${s},notes.ilike.${s}`);
    }

    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (query.isExpiringSoon) {
      dbQuery = dbQuery.gte('end_date', today).lte('end_date', thirtyDaysLater).eq('status', 'ACTIVE');
    }

    dbQuery = dbQuery.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      logger.error('Failed to list AMC contracts', { error });
      throw new BadRequestError('Failed to retrieve AMC contracts');
    }

    const contractIds = (data || []).map((row: any) => row.id);

    // Fetch covered assets count & schedule counts
    let assetCountsMap: Record<string, number> = {};
    let scheduleStatsMap: Record<
      string,
      { total: number; completed: number; nextDate: string | null }
    > = {};

    if (contractIds.length > 0) {
      const { data: assetsData } = await supabase
        .from('amc_assets')
        .select('amc_id')
        .in('amc_id', contractIds);

      if (assetsData) {
        assetCountsMap = assetsData.reduce((acc: Record<string, number>, curr: any) => {
          acc[curr.amc_id] = (acc[curr.amc_id] || 0) + 1;
          return acc;
        }, {});
      }

      const { data: schedulesData } = await supabase
        .from('service_schedules')
        .select(`
          amc_id, scheduled_date, status, rescheduled_from_id,
          service_reports:service_reports!service_reports_service_schedule_id_fkey (id, primary_outcome, resolution_status)
        `)
        .in('amc_id', contractIds)
        .order('scheduled_date', { ascending: true });

      if (schedulesData) {
        scheduleStatsMap = schedulesData.reduce((acc: Record<string, any>, curr: any) => {
          if (!curr.amc_id) return acc;
          if (!acc[curr.amc_id]) {
            acc[curr.amc_id] = { total: 0, completed: 0, nextDate: null };
          }
          const isFollowUp = Boolean(curr.rescheduled_from_id);
          if (!isFollowUp) {
            acc[curr.amc_id].total++;
          }

          const reportList = Array.isArray(curr.service_reports)
            ? curr.service_reports
            : curr.service_reports
              ? [curr.service_reports]
              : [];
          const hasUnresolvedPendingReport = reportList.some(
            (r: any) =>
              (r.primary_outcome === 'PENDING_PARTS' || r.primary_outcome === 'PENDING_REPAIRS') &&
              r.resolution_status !== 'RESOLVED'
          );

          if (!isFollowUp && ['COMPLETED', 'RESOLVED'].includes(curr.status) && !hasUnresolvedPendingReport) {
            acc[curr.amc_id].completed++;
          } else if (!acc[curr.amc_id].nextDate && curr.scheduled_date >= today && curr.status !== 'CANCELLED') {
            acc[curr.amc_id].nextDate = curr.scheduled_date;
          }
          return acc;
        }, {});
      }
    }

    const paymentMap: Record<string, { id: string; paymentNumber: string; status: string; totalPaid: number; balance: number }> = {};
    if (contractIds.length > 0) {
      try {
        const payQuery = supabase.from('payments');
        if (payQuery && typeof payQuery.select === 'function') {
          const { data: payRows } = await payQuery
            .select('id, payment_number, amc_id, total_amount_due, total_amount_paid, status')
            .in('amc_id', contractIds);

          (payRows || []).forEach((p: any) => {
            const paid = Number(p.total_amount_paid || 0);
            const due = Number(p.total_amount_due || 0);
            paymentMap[p.amc_id] = {
              id: p.id,
              paymentNumber: p.payment_number,
              status: p.status,
              totalPaid: paid,
              balance: Math.max(0, due - paid),
            };
          });
        }
      } catch {
        // Safely ignore if mock environment does not support payments
      }
    }

    const contracts: AmcContractResponse[] = (data || []).map((row: any) => {
      const customer = row.customers as { id: string; name: string; customer_code: string; phone: string } | null;
      const plan = row.amc_plans as { id: string; name: string; plan_code: string } | null;

      const coveredAssetsCount = assetCountsMap[row.id] || 0;
      const scheduleStats = scheduleStatsMap[row.id] || { total: 0, completed: 0, nextDate: null };
      const isExpiringSoon =
        row.status === 'ACTIVE' && row.end_date >= today && row.end_date <= thirtyDaysLater;

      const completedCycles = coveredAssetsCount > 0
        ? Math.min(row.total_visits, Math.floor(scheduleStats.completed / coveredAssetsCount))
        : Math.min(row.total_visits, scheduleStats.completed);
      const remainingCycles = Math.max(0, row.total_visits - completedCycles);

      return {
        id: row.id,
        contractNumber: row.contract_number,
        customerId: row.customer_id,
        customerName: customer?.name || null,
        customerCode: customer?.customer_code || null,
        customerPhone: customer?.phone || null,
        planId: row.plan_id,
        planName: plan?.name || null,
        planCode: plan?.plan_code || null,
        startDate: row.start_date,
        endDate: row.end_date,
        frequency: row.frequency as AmcFrequency,
        totalAmount: Number(row.total_amount),
        totalVisits: row.total_visits,
        dryServiceVisits: row.dry_service_visits != null ? Number(row.dry_service_visits) : null,
        jetServiceVisits: row.jet_service_visits != null ? Number(row.jet_service_visits) : null,
        pumpdownServiceVisits: row.pumpdown_service_visits != null ? Number(row.pumpdown_service_visits) : null,
        status: row.status as AmcStatus,
        notes: row.notes,
        cancellationReason: row.cancellation_reason,
        cancelledAt: row.cancelled_at,
        cancelledBy: row.cancelled_by,
        previousContractId: row.previous_contract_id,
        coveredAssetsCount,
        schedulesCount: scheduleStats.total,
        completedVisitsCount: completedCycles,
        remainingVisitsCount: remainingCycles,
        nextPmDate: scheduleStats.nextDate,
        isExpiringSoon,
        paymentId: paymentMap[row.id]?.id || null,
        paymentNumber: paymentMap[row.id]?.paymentNumber || null,
        paymentStatus: paymentMap[row.id]?.status || 'PENDING',
        totalAmountPaid: paymentMap[row.id]?.totalPaid ?? 0,
        paymentBalanceDue: paymentMap[row.id] ? paymentMap[row.id].balance : Number(row.total_amount || 0),
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    const total = count || 0;
    return {
      contracts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Retrieve a single AMC contract by ID with covered assets and schedules
   */
  async getContractById(id: string): Promise<AmcContractResponse> {
    const supabase = getSupabaseClient();
    const { data: row, error } = await supabase
      .from('amc_contracts')
      .select(
        `
        id, contract_number, customer_id, plan_id, start_date, end_date, frequency,
        total_amount, total_visits, dry_service_visits, jet_service_visits, pumpdown_service_visits,
        status, notes, cancellation_reason, cancelled_at,
        cancelled_by, previous_contract_id, created_by, updated_by, created_at, updated_at,
        customers (id, name, customer_code, phone),
        amc_plans (id, name, plan_code)
      `
      )
      .eq('id', id)
      .single();

    if (error || !row) {
      throw new NotFoundError(`AMC contract with ID '${id}' was not found`);
    }

    const customer = row.customers as unknown as { id: string; name: string; customer_code: string; phone: string } | null;
    const plan = row.amc_plans as unknown as { id: string; name: string; plan_code: string } | null;

    // Fetch covered assets with unit details
    const { data: assetsRows } = await supabase
      .from('amc_assets')
      .select(
        `
        id, amc_id, asset_id, notes, created_at,
        ac_assets (
          id, asset_tag, site_id, brand, model_number, serial_number, ac_type,
          capacity_tons, room_location, floor_location,
          customer_sites (site_name)
        )
      `
      )
      .eq('amc_id', id);

    const coveredAssets: AmcCoveredAssetResponse[] = (assetsRows || []).map((ar: any) => {
      const ac = ar.ac_assets;

      return {
        id: ar.id,
        amcId: ar.amc_id,
        assetId: ar.asset_id,
        assetTag: ac?.asset_tag || 'UNKNOWN',
        siteId: ac?.site_id || '',
        siteName: ac?.customer_sites?.site_name || null,
        brand: ac?.brand || '',
        modelNumber: ac?.model_number || null,
        serialNumber: ac?.serial_number || null,
        acType: ac?.ac_type || 'OTHER',
        capacityTons: ac?.capacity_tons || null,
        roomLocation: ac?.room_location || null,
        floorLocation: ac?.floor_location || null,
        notes: ar.notes,
        createdAt: ar.created_at,
      };
    });

    // Fetch schedules
    const { data: schedulesRows } = await supabase
      .from('service_schedules')
      .select(`
        id, status, scheduled_date, rescheduled_from_id,
        service_reports:service_reports!service_reports_service_schedule_id_fkey (id, primary_outcome, resolution_status)
      `)
      .eq('amc_id', id);

    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let completedVisitsCount = 0;
    let nextPmDate: string | null = null;

    (schedulesRows || []).forEach((s: any) => {
      const isFollowUp = Boolean(s.rescheduled_from_id);
      const reportList = Array.isArray(s.service_reports)
        ? s.service_reports
        : s.service_reports
          ? [s.service_reports]
          : [];
      const hasUnresolvedPendingReport = reportList.some(
        (r: any) =>
          (r.primary_outcome === 'PENDING_PARTS' || r.primary_outcome === 'PENDING_REPAIRS') &&
          r.resolution_status !== 'RESOLVED'
      );

      if (!isFollowUp && ['COMPLETED', 'RESOLVED'].includes(s.status) && !hasUnresolvedPendingReport) {
        completedVisitsCount++;
      } else if (!nextPmDate && s.scheduled_date >= today && s.status !== 'CANCELLED') {
        nextPmDate = s.scheduled_date;
      }
    });

    const isExpiringSoon =
      row.status === 'ACTIVE' && row.end_date >= today && row.end_date <= thirtyDaysLater;

    // Fetch linked payment record safely
    let paymentRow: any = null;
    try {
      const payQuery = supabase.from('payments');
      if (payQuery && typeof payQuery.select === 'function') {
        const { data } = await payQuery
          .select('id, payment_number, total_amount_due, total_amount_paid, status')
          .eq('amc_id', id)
          .maybeSingle();
        paymentRow = data;
      }
    } catch {
      // Safely ignore if mock environment does not support payments
    }

    const totalPaid = paymentRow ? Number(paymentRow.total_amount_paid || 0) : 0;
    const balanceDue = paymentRow
      ? Math.max(0, Number(paymentRow.total_amount_due || 0) - totalPaid)
      : Number(row.total_amount || 0);

    return {
      id: row.id,
      contractNumber: row.contract_number,
      customerId: row.customer_id,
      customerName: customer?.name || null,
      customerCode: customer?.customer_code || null,
      customerPhone: customer?.phone || null,
      planId: row.plan_id,
      planName: plan?.name || null,
      planCode: plan?.plan_code || null,
      startDate: row.start_date,
      endDate: row.end_date,
      frequency: row.frequency as AmcFrequency,
      totalAmount: Number(row.total_amount),
      totalVisits: row.total_visits,
      dryServiceVisits: row.dry_service_visits != null ? Number(row.dry_service_visits) : null,
      jetServiceVisits: row.jet_service_visits != null ? Number(row.jet_service_visits) : null,
      pumpdownServiceVisits: row.pumpdown_service_visits != null ? Number(row.pumpdown_service_visits) : null,
      status: row.status as AmcStatus,
      notes: row.notes,
      cancellationReason: row.cancellation_reason,
      cancelledAt: row.cancelled_at,
      cancelledBy: row.cancelled_by,
      previousContractId: row.previous_contract_id,
      coveredAssetsCount: coveredAssets.length,
      coveredAssets,
      schedulesCount: (schedulesRows || []).length,
      completedVisitsCount: coveredAssets.length > 0
        ? Math.min(row.total_visits, Math.floor(completedVisitsCount / coveredAssets.length))
        : Math.min(row.total_visits, completedVisitsCount),
      remainingVisitsCount: Math.max(
        0,
        row.total_visits -
          (coveredAssets.length > 0
            ? Math.min(row.total_visits, Math.floor(completedVisitsCount / coveredAssets.length))
            : Math.min(row.total_visits, completedVisitsCount))
      ),
      nextPmDate,
      isExpiringSoon,
      paymentId: paymentRow?.id || null,
      paymentNumber: paymentRow?.payment_number || null,
      paymentStatus: paymentRow?.status || 'PENDING',
      totalAmountPaid: totalPaid,
      paymentBalanceDue: balanceDue,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Validate that all target AC assets belong to customer and do not overlap with other active AMCs
   */
  private async validateAssetOwnershipAndOverlap(
    customerId: string,
    assetIds: string[],
    startDate: string,
    endDate: string,
    currentContractId?: string
  ): Promise<void> {
    if (assetIds.length === 0) return;

    const supabase = getSupabaseClient();

    // 1. Verify existence and ownership
    const { data: assets, error: aErr } = await supabase
      .from('ac_assets')
      .select('id, asset_tag, customer_sites (id, customer_id)')
      .in('id', assetIds);

    if (aErr || !assets || assets.length !== assetIds.length) {
      throw new BadRequestError('One or more selected AC assets do not exist or are invalid');
    }

    for (const a of assets) {
      const site = a.customer_sites as unknown as { id: string; customer_id: string } | null;
      if (!site || site.customer_id !== customerId) {
        throw new BadRequestError(
          `Asset '${a.asset_tag}' does not belong to the contract customer (Site-Customer mismatch)`
        );
      }
    }

    // 2. Check overlap with other active contracts:
    // (start_date <= new_end AND end_date >= new_start)
    const overlapQuery = supabase
      .from('amc_assets')
      .select(
        `
        asset_id,
        amc_contracts (
          id, contract_number, status, start_date, end_date
        )
      `
      )
      .in('asset_id', assetIds);

    const { data: activeCoverages, error: oErr } = await overlapQuery;

    if (!oErr && activeCoverages) {
      for (const cov of activeCoverages) {
        const c = cov.amc_contracts as unknown as {
          id: string;
          contract_number: string;
          status: string;
          start_date: string;
          end_date: string;
        } | null;

        if (!c) continue;
        if (currentContractId && c.id === currentContractId) continue;

        if (['ACTIVE', 'EXPIRING_SOON'].includes(c.status)) {
          // Check date overlap:
          if (c.start_date <= endDate && c.end_date >= startDate) {
            const conflictingAsset = assets.find((a: any) => a.id === cov.asset_id);
            throw new ConflictError(
              `Asset '${conflictingAsset?.asset_tag || cov.asset_id}' is already covered by active contract '${c.contract_number}' during this period`
            );
          }
        }
      }
    }
  }

  /**
   * Create an AMC contract
   */
  async createContract(
    payload: CreateAmcContractPayload,
    actorId: string
  ): Promise<AmcContractResponse> {
    const supabase = getSupabaseClient();

    // 1. Validate Customer
    const { data: customer, error: cErr } = await supabase
      .from('customers')
      .select('id, name, is_active')
      .eq('id', payload.customerId)
      .single();

    if (cErr || !customer) {
      throw new BadRequestError(`Customer with ID '${payload.customerId}' does not exist`);
    }
    if (!customer.is_active) {
      throw new BadRequestError(`Customer '${customer.name}' is inactive and cannot enter new AMC contracts`);
    }

    // 2. Validate Plan if provided
    if (payload.planId) {
      const { data: plan, error: pErr } = await supabase
        .from('amc_plans')
        .select('id, is_active')
        .eq('id', payload.planId)
        .single();

      if (pErr || !plan || !plan.is_active) {
        throw new BadRequestError('Specified AMC plan is invalid or inactive');
      }
    }

    const assetIds = payload.coveredAssetIds || [];

    // 3. Validate covered assets ownership & contract overlap
    await this.validateAssetOwnershipAndOverlap(
      payload.customerId,
      assetIds,
      payload.startDate,
      payload.endDate
    );

    const contractNumber = await this.generateContractNumber();

    const cadenceSlotCount = calculateScheduleDatesUtc(
      payload.startDate,
      payload.endDate,
      payload.frequency
    ).length;
    if (payload.totalVisits !== cadenceSlotCount) {
      throw new BadRequestError(
        `Included visits (${payload.totalVisits}) must match the ${cadenceSlotCount} cadence dates in this contract term.`
      );
    }

    // Allocation is per covered asset and must fully account for each cadence slot.
    let dryVisits = payload.dryServiceVisits != null ? Number(payload.dryServiceVisits) : null;
    let jetVisits = payload.jetServiceVisits != null ? Number(payload.jetServiceVisits) : null;
    let pumpdownVisits = payload.pumpdownServiceVisits != null ? Number(payload.pumpdownServiceVisits) : null;

    const allocationCount = (dryVisits ?? 0) + (jetVisits ?? 0) + (pumpdownVisits ?? 0);
    if (allocationCount !== cadenceSlotCount) {
      throw new BadRequestError(
        `Dry, Jet, and Pumpdown allocation (${allocationCount}) must match the ${cadenceSlotCount} cadence slots.`
      );
    }

    // 4. Insert contract
    const { data: inserted, error: iErr } = await supabase
      .from('amc_contracts')
      .insert({
        contract_number: contractNumber,
        customer_id: payload.customerId,
        plan_id: payload.planId || null,
        start_date: payload.startDate,
        end_date: payload.endDate,
        frequency: payload.frequency,
        total_amount: payload.totalAmount,
        total_visits: payload.totalVisits,
        dry_service_visits: dryVisits,
        jet_service_visits: jetVisits,
        pumpdown_service_visits: pumpdownVisits,
        status: payload.status || 'DRAFT',
        notes: payload.notes || null,
        created_by: actorId,
      })
      .select()
      .single();

    if (iErr || !inserted) {
      logger.error('Failed to insert AMC contract', { error: iErr });
      throw new BadRequestError('Failed to create AMC contract');
    }

    // Auto-register payment record for this AMC contract in payments table
    try {
      if (typeof supabase.rpc === 'function') {
        await supabase.rpc('create_payment_record', {
          p_payment_number: `PAY-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          p_customer_id: payload.customerId,
          p_service_request_id: null,
          p_amc_id: inserted.id,
          p_total_amount_due: payload.totalAmount || 0,
          p_actor_profile_id: actorId,
        });
      }
    } catch (payErr) {
      logger.warn('Failed to auto-register payment record for new AMC contract', {
        error: payErr,
        amcId: inserted.id,
      });
    }

    // 5. Attach covered assets
    if (assetIds.length > 0) {
      const assetRows = assetIds.map((aId: string) => ({
        amc_id: inserted.id,
        asset_id: aId,
      }));

      const { error: covErr } = await supabase.from('amc_assets').insert(assetRows);
      if (covErr) {
        logger.error('Failed to attach assets to new AMC contract', { error: covErr });
      }

      // Auto-generate PM obligations if active
      if (inserted.status === 'ACTIVE') {
        try {
          await this.generatePmObligations(inserted.id, {}, actorId);
        } catch (genErr) {
          logger.warn('Initial PM generation during creation returned warning', { error: genErr });
        }
      }
    }

    await this.recordAudit(actorId, 'AMC_CREATED', inserted.id, {
      contractNumber,
      customerId: payload.customerId,
      frequency: payload.frequency,
      totalAmount: payload.totalAmount,
      totalVisits: payload.totalVisits,
      assetsCount: assetIds.length,
    });

    return this.getContractById(inserted.id);
  }

  /**
   * Update AMC Contract
   */
  async updateContract(
    id: string,
    payload: UpdateAmcContractPayload,
    actorId: string
  ): Promise<AmcContractResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getContractById(id);

    if (existing.status === 'CANCELLED') {
      throw new BadRequestError('Cannot modify an already cancelled AMC contract');
    }

    const newStart = payload.startDate || existing.startDate;
    const newEnd = payload.endDate || existing.endDate;
    const newFrequency = payload.frequency || existing.frequency;
    const newTotalVisits = payload.totalVisits ?? existing.totalVisits;
    const newDryVisits = payload.dryServiceVisits !== undefined
      ? payload.dryServiceVisits
      : existing.dryServiceVisits;
    const newJetVisits = payload.jetServiceVisits !== undefined
      ? payload.jetServiceVisits
      : existing.jetServiceVisits;
    const newPumpdownVisits = payload.pumpdownServiceVisits !== undefined
      ? payload.pumpdownServiceVisits
      : existing.pumpdownServiceVisits;

    const cadenceSlotCount = calculateScheduleDatesUtc(newStart, newEnd, newFrequency).length;
    if (newTotalVisits !== cadenceSlotCount) {
      throw new BadRequestError(
        `Included visits (${newTotalVisits}) must match the ${cadenceSlotCount} cadence dates in this contract term.`
      );
    }
    const allocationCount =
      (newDryVisits ?? 0) + (newJetVisits ?? 0) + (newPumpdownVisits ?? 0);
    if (allocationCount !== cadenceSlotCount) {
      throw new BadRequestError(
        `Dry, Jet, and Pumpdown allocation (${allocationCount}) must match the ${cadenceSlotCount} cadence slots.`
      );
    }

    const cadenceTermsChanged =
      newStart !== existing.startDate ||
      newEnd !== existing.endDate ||
      newFrequency !== existing.frequency ||
      newTotalVisits !== existing.totalVisits ||
      newDryVisits !== existing.dryServiceVisits ||
      newJetVisits !== existing.jetServiceVisits ||
      newPumpdownVisits !== existing.pumpdownServiceVisits;
    if (cadenceTermsChanged) {
      const { data: existingObligations, error: obligationsError } = await supabase
        .from('service_schedules')
        .select('id')
        .eq('amc_id', id)
        .limit(1);
      if (obligationsError) {
        logger.error('Failed to check existing PM obligations before AMC amendment', {
          id,
          error: obligationsError,
        });
        throw new BadRequestError('Could not verify whether this AMC cadence can be amended');
      }
      if (existingObligations?.length) {
        throw new BadRequestError(
          'Cadence and visit allocation are locked after PM obligations exist. Renew the contract to preserve its schedule history.'
        );
      }
    }

    if (payload.startDate || payload.endDate) {
      if (newEnd < newStart) {
        throw new BadRequestError('AMC contract end date cannot precede start date');
      }

      // Re-verify overlap for existing covered assets
      const assetIds = (existing.coveredAssets || []).map((a: any) => a.assetId);
      await this.validateAssetOwnershipAndOverlap(
        existing.customerId,
        assetIds,
        newStart,
        newEnd,
        id
      );
    }

    const updatePayload: Record<string, unknown> = {
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    };

    if (payload.planId !== undefined) updatePayload.plan_id = payload.planId;
    if (payload.startDate) updatePayload.start_date = payload.startDate;
    if (payload.endDate) updatePayload.end_date = payload.endDate;
    if (payload.frequency) updatePayload.frequency = payload.frequency;
    if (payload.totalAmount !== undefined) updatePayload.total_amount = payload.totalAmount;
    if (payload.totalVisits !== undefined) updatePayload.total_visits = payload.totalVisits;
    if (payload.dryServiceVisits !== undefined) updatePayload.dry_service_visits = payload.dryServiceVisits;
    if (payload.jetServiceVisits !== undefined) updatePayload.jet_service_visits = payload.jetServiceVisits;
    if (payload.pumpdownServiceVisits !== undefined) updatePayload.pumpdown_service_visits = payload.pumpdownServiceVisits;
    if (payload.notes !== undefined) updatePayload.notes = payload.notes;

    const { error } = await supabase.from('amc_contracts').update(updatePayload).eq('id', id);

    if (error) {
      logger.error('Failed to update AMC contract', { error, id });
      throw new BadRequestError('Failed to update AMC contract');
    }

    await this.recordAudit(actorId, 'AMC_UPDATED', id, {
      updatedFields: Object.keys(payload),
    });

    return this.getContractById(id);
  }

  /**
   * Update Contract Status
   */
  async updateStatus(
    id: string,
    payload: UpdateAmcStatusPayload,
    actorId: string
  ): Promise<AmcContractResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getContractById(id);

    if (payload.status === 'CANCELLED') {
      return this.cancelContract(id, { reason: payload.reason || 'Status transitioned to CANCELLED' }, actorId);
    }

    if (existing.status === 'CANCELLED') {
      throw new BadRequestError('Cannot change status of a cancelled AMC contract');
    }

    if (existing.status === 'RENEWED') {
      throw new BadRequestError('Cannot change status of a renewed AMC contract');
    }

    // Idempotent return if already in target status
    if (existing.status === payload.status) {
      return existing;
    }

    const { error } = await supabase
      .from('amc_contracts')
      .update({
        status: payload.status,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      logger.error('Failed to update AMC status', { error, id });
      throw new BadRequestError('Failed to update AMC status');
    }

    // When transitioning to ACTIVE (e.g. from DRAFT), trigger PM obligations generation
    if (existing.status !== 'ACTIVE' && payload.status === 'ACTIVE') {
      try {
        await this.generatePmObligations(id, {}, actorId);
      } catch (genErr) {
        logger.error('Failed to generate PM obligations upon AMC activation, reverting status', {
          error: genErr,
          id,
          fromStatus: existing.status,
        });
        // Rollback status to previous state to prevent misleading partially activated state
        await supabase
          .from('amc_contracts')
          .update({
            status: existing.status,
            updated_by: actorId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        throw new BadRequestError('Failed to generate preventive maintenance obligations upon activation');
      }
    }

    await this.recordAudit(actorId, 'AMC_STATUS_CHANGED', id, {
      fromStatus: existing.status,
      toStatus: payload.status,
      reason: payload.reason,
      pmGenerated: existing.status !== 'ACTIVE' && payload.status === 'ACTIVE',
    });

    return this.getContractById(id);
  }

  /**
   * Clear Payment for AMC Contract Quotation
   */
  async clearPayment(
    id: string,
    payload: {
      paymentMethod: 'CASH' | 'ONLINE' | 'CHEQUE';
      amount: number;
      externalPaymentReference?: string | null;
      notes?: string | null;
    },
    actorId: string
  ): Promise<AmcContractResponse> {
    const supabase = getSupabaseClient();
    const contract = await this.getContractById(id);

    // 1. Locate or create payment record
    let { data: payment } = await supabase
      .from('payments')
      .select('id, total_amount_due, total_amount_paid, status')
      .eq('amc_id', id)
      .maybeSingle();

    if (!payment) {
      const paymentNumber = `PAY-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const { data: newPaymentId, error: pErr } = await supabase.rpc('create_payment_record', {
        p_payment_number: paymentNumber,
        p_customer_id: contract.customerId,
        p_service_request_id: null,
        p_amc_id: id,
        p_total_amount_due: contract.totalAmount,
        p_actor_profile_id: actorId,
      });

      if (pErr) {
        logger.error('Failed to initialize payment record for AMC in clearPayment', { error: pErr, amcId: id });
        throw new BadRequestError('Could not initialize payment record');
      }

      payment = {
        id: newPaymentId,
        total_amount_due: contract.totalAmount,
        total_amount_paid: 0,
        status: 'PENDING',
      };
    }

    // 2. Record payment transaction via RPC
    const { data: txnId, error: txnErr } = await supabase.rpc('record_payment_transaction', {
      p_payment_id: payment.id,
      p_payment_method: payload.paymentMethod === 'CHEQUE' ? 'ONLINE' : payload.paymentMethod,
      p_amount: payload.amount,
      p_external_payment_reference: payload.externalPaymentReference || null,
      p_notes: payload.notes || `Payment clearance for AMC ${contract.contractNumber}`,
      p_actor_profile_id: actorId,
    });

    if (txnErr) {
      logger.error('Failed to record payment transaction for AMC', { error: txnErr, amcId: id });
      throw new BadRequestError(txnErr.message || 'Payment transaction rejected');
    }

    await this.recordAudit(actorId, 'AMC_PAYMENT_CLEARED', id, {
      paymentId: payment.id,
      transactionId: txnId,
      amount: payload.amount,
      method: payload.paymentMethod,
      reference: payload.externalPaymentReference,
    });

    return this.getContractById(id);
  }

  /**
   * Non-destructive cancellation
   */
  async cancelContract(
    id: string,
    payload: CancelAmcContractPayload,
    actorId: string
  ): Promise<AmcContractResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getContractById(id);

    // Idempotent cancellation
    if (existing.status === 'CANCELLED') {
      return existing;
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from('amc_contracts')
      .update({
        status: 'CANCELLED',
        cancellation_reason: payload.reason,
        cancelled_at: now,
        cancelled_by: actorId,
        updated_by: actorId,
        updated_at: now,
      })
      .eq('id', id);

    if (error) {
      logger.error('Failed to cancel AMC contract', { error, id });
      throw new BadRequestError('Failed to cancel AMC contract');
    }

    // Cancel pending future schedules
    await supabase
      .from('service_schedules')
      .update({
        status: 'CANCELLED',
        notes: `Cancelled due to AMC contract cancellation: ${payload.reason}`,
        updated_by: actorId,
        updated_at: now,
      })
      .eq('amc_id', id)
      .in('status', ['SCHEDULED', 'PLANNED', 'DUE']);

    await this.recordAudit(actorId, 'AMC_CANCELLED', id, {
      reason: payload.reason,
    });

    return this.getContractById(id);
  }

  /**
   * Add covered assets to AMC contract
   */
  async addAssets(
    id: string,
    payload: AddAmcAssetsPayload,
    actorId: string
  ): Promise<AmcCoveredAssetResponse[]> {
    const supabase = getSupabaseClient();
    const contract = await this.getContractById(id);

    if (contract.status === 'CANCELLED' || contract.status === 'EXPIRED') {
      throw new BadRequestError(`Cannot add covered assets to a ${contract.status} contract`);
    }

    // Check existing in this contract
    const existingAssetIds = new Set((contract.coveredAssets || []).map((a: any) => a.assetId));
    for (const aId of payload.assetIds) {
      if (existingAssetIds.has(aId)) {
        throw new ConflictError(`Asset with ID '${aId}' is already covered by this AMC contract`);
      }
    }

    // Validate ownership & overlap
    await this.validateAssetOwnershipAndOverlap(
      contract.customerId,
      payload.assetIds,
      contract.startDate,
      contract.endDate,
      id
    );

    const rows = payload.assetIds.map((aId: string) => ({
      amc_id: id,
      asset_id: aId,
    }));

    const { error } = await supabase.from('amc_assets').insert(rows);
    if (error) {
      logger.error('Failed to add assets to AMC contract', { error, id });
      throw new BadRequestError('Failed to add covered assets');
    }

    // Generate PM obligations if contract is active
    if (contract.status === 'ACTIVE') {
      try {
        await this.generatePmObligations(id, { assetIds: payload.assetIds }, actorId);
      } catch (genErr) {
        logger.warn('PM generation for newly added assets logged warning', { error: genErr });
      }
    }

    await this.recordAudit(actorId, 'AMC_ASSET_ADDED', id, {
      addedAssetIds: payload.assetIds,
      count: payload.assetIds.length,
    });

    const refreshed = await this.getContractById(id);
    return refreshed.coveredAssets || [];
  }

  /**
   * Remove covered asset from AMC contract safely
   */
  async removeAsset(
    id: string,
    assetId: string,
    actorId: string
  ): Promise<void> {
    const supabase = getSupabaseClient();
    const contract = await this.getContractById(id);

    const exists = (contract.coveredAssets || []).some((a: any) => a.assetId === assetId);
    if (!exists) {
      throw new NotFoundError(`Asset '${assetId}' is not covered under AMC contract '${contract.contractNumber}'`);
    }

    const { error } = await supabase
      .from('amc_assets')
      .delete()
      .eq('amc_id', id)
      .eq('asset_id', assetId);

    if (error) {
      logger.error('Failed to remove asset coverage', { error, id, assetId });
      throw new BadRequestError('Failed to remove asset from AMC coverage');
    }

    // Cancel future pending schedules for this removed asset
    await supabase
      .from('service_schedules')
      .update({
        status: 'CANCELLED',
        notes: 'Cancelled due to asset removal from AMC coverage',
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      })
      .eq('amc_id', id)
      .eq('asset_id', assetId)
      .in('status', ['SCHEDULED', 'PLANNED', 'DUE']);

    await this.recordAudit(actorId, 'AMC_ASSET_REMOVED', id, {
      assetId,
    });
  }

  /**
   * Pure, idempotent PM Obligation Generator
   */
  async generatePmObligations(
    id: string,
    options: GeneratePmPayload,
    actorId: string
  ): Promise<PmGenerationResult> {
    const supabase = getSupabaseClient();
    const contract = await this.getContractById(id);

    if (contract.status === 'CANCELLED') {
      throw new BadRequestError('Cannot generate preventive maintenance obligations for a cancelled contract');
    }

    if (contract.status === 'EXPIRED') {
      throw new BadRequestError('Cannot generate preventive maintenance obligations for an expired contract');
    }

    const targetAssets = (contract.coveredAssets || []).filter((a: any) => {
      if (!options.assetIds || options.assetIds.length === 0) return true;
      return options.assetIds.includes(a.assetId);
    });

    if (targetAssets.length === 0) {
      return {
        contractId: id,
        contractNumber: contract.contractNumber,
        generatedCount: 0,
        existingCount: 0,
        skippedCount: 0,
        dateRange: {
          startDate: contract.startDate,
          endDate: contract.endDate,
        },
        generatedDates: [],
        schedules: [],
      };
    }

    // Calculate dates deterministically within contract boundaries
    const dates = calculateScheduleDatesUtc(
      contract.startDate,
      contract.endDate,
      contract.frequency
    );

    if (contract.totalVisits !== dates.length) {
      throw new BadRequestError(
        `AMC included visits (${contract.totalVisits}) do not match the ${dates.length} cadence dates for this contract.`
      );
    }
    const allocationCount =
      (contract.dryServiceVisits ?? 0) +
      (contract.jetServiceVisits ?? 0) +
      (contract.pumpdownServiceVisits ?? 0);
    if (allocationCount !== dates.length) {
      throw new BadRequestError(
        `AMC service allocation (${allocationCount}) does not match the ${dates.length} cadence slots.`
      );
    }

    // Compute planned service types matching the contract's stored allocation
    const plannedTypes = computePlannedServiceTypes(
      dates.length,
      contract.dryServiceVisits,
      contract.jetServiceVisits,
      contract.pumpdownServiceVisits
    );

    // Fetch existing schedules for this contract to guarantee idempotency
    const { data: existingSchedules, error: sErr } = await supabase
      .from('service_schedules')
      .select('id, amc_id, asset_id, scheduled_date, visit_number, schedule_number, status')
      .eq('amc_id', id);

    if (sErr) {
      logger.error('Failed to fetch existing schedules during generation', { error: sErr });
      throw new BadRequestError('Failed to evaluate existing PM obligations');
    }

    // Stable composite identity sets:
    // 1. Visit sequence key: (amc_id, asset_id, visit_number) for active/completed schedules
    // 2. Scheduled date key: (amc_id, asset_id, scheduled_date)
    const existingVisitKeySet = new Set<string>();
    const existingDateKeySet = new Set<string>();

    for (const s of (existingSchedules || [])) {
      if (s.visit_number != null && !['CANCELLED', 'RESCHEDULED'].includes(s.status)) {
        existingVisitKeySet.add(`${s.amc_id}_${s.asset_id}_visit_${s.visit_number}`);
      }
      if (s.scheduled_date && !['CANCELLED', 'RESCHEDULED'].includes(s.status)) {
        existingDateKeySet.add(`${s.amc_id}_${s.asset_id}_date_${s.scheduled_date}`);
      }
    }

    const today = new Date().toISOString().split('T')[0];

    const { prefix, nextSeq: startSeq } = await this.getNextScheduleSequence();
    let currentSeq = startSeq;

    // Verify actorId exists in profiles or set null to avoid FK violation
    let validActorId: string | null = null;
    if (actorId) {
      try {
        const query: any = supabase.from('profiles').select('id').eq('id', actorId);
        const res = typeof query.maybeSingle === 'function'
          ? await query.maybeSingle()
          : typeof query.single === 'function'
            ? await query.single()
            : { data: null };
        if (res && res.data) validActorId = res.data.id;
      } catch {
        validActorId = null;
      }
    }

    const toInsert: Array<{
      schedule_number: string;
      amc_id: string;
      asset_id: string;
      customer_id: string | null;
      site_id: string | null;
      scheduled_date: string;
      visit_number: number;
      planned_service_type: PlannedServiceType;
      status: string;
      is_system_generated: boolean;
      created_by: string | null;
    }> = [];

    let existingCount = 0;

    for (const asset of targetAssets) {
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const visitNumber = i + 1;
        const visitKey = `${id}_${asset.assetId}_visit_${visitNumber}`;
        const dateKey = `${id}_${asset.assetId}_date_${date}`;

        if (existingVisitKeySet.has(visitKey) || existingDateKeySet.has(dateKey)) {
          existingCount++;
        } else {
          const scheduleNumber = `${prefix}${String(currentSeq++).padStart(6, '0')}`;
          let status: ServiceScheduleStatus = 'SCHEDULED';
          if (date < today) {
            status = 'OVERDUE';
          } else if (date === today) {
            status = 'DUE';
          }

          toInsert.push({
            schedule_number: scheduleNumber,
            amc_id: id,
            asset_id: asset.assetId,
            customer_id: contract.customerId || null,
            site_id: asset.siteId || null,
            scheduled_date: date,
            visit_number: visitNumber,
            planned_service_type: plannedTypes[i] || 'DRY_SERVICE',
            status,
            is_system_generated: true,
            created_by: validActorId,
          });

          // Mark keys as seen for subsequent checks in this loop
          existingVisitKeySet.add(visitKey);
          existingDateKeySet.add(dateKey);
        }
      }
    }

    let actuallyInsertedCount = toInsert.length;
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('service_schedules').insert(toInsert);
      if (insErr) {
        // Concurrency safeguard: if another process inserted concurrently, suppress unique collision
        const isUniqueViolation =
          (insErr as any).code === '23505' ||
          insErr.message?.includes('duplicate key') ||
          insErr.message?.includes('unique constraint') ||
          insErr.message?.includes('uq_amc_asset_schedule') ||
          insErr.message?.includes('idx_active_schedule_per_amc_asset_visit');

        if (isUniqueViolation) {
          logger.warn('Concurrent PM obligation collision suppressed', { amcId: id, error: insErr });
          existingCount += toInsert.length;
          actuallyInsertedCount = 0;
        } else {
          logger.error('Failed to batch insert PM schedules', { error: insErr });
          throw new BadRequestError('Failed to persist generated PM obligations');
        }
      }
    }

    await this.recordAudit(actorId, 'AMC_PM_GENERATED', id, {
      generatedCount: actuallyInsertedCount,
      existingCount,
      targetAssetsCount: targetAssets.length,
      frequency: contract.frequency,
    });

    const refreshedSchedules = await this.getSchedulesForContract(id);

    return {
      contractId: id,
      contractNumber: contract.contractNumber,
      generatedCount: actuallyInsertedCount,
      existingCount,
      skippedCount: 0,
      dateRange: {
        startDate: contract.startDate,
        endDate: contract.endDate,
      },
      generatedDates: dates,
      schedules: refreshedSchedules,
    };
  }

  /**
   * Retrieve schedules for a contract
   */
  async getSchedulesForContract(amcId: string): Promise<ServiceScheduleResponse[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('service_schedules')
      .select(
        `
        id, schedule_number, amc_id, asset_id, scheduled_date, visit_number,
        planned_service_type, status, is_system_generated, notes,
        created_by, updated_by, created_at, updated_at,
        ac_assets (
          asset_tag, brand, model_number, room_location,
          customer_sites (site_name)
        )
      `
      )
      .eq('amc_id', amcId)
      .order('scheduled_date', { ascending: true });

    if (error) {
      logger.error('Failed to get schedules for AMC', { error, amcId });
      throw new BadRequestError('Failed to fetch PM schedules');
    }

    const today = new Date().toISOString().split('T')[0];

    return (data || []).map((row: any) => {
      const ac = row.ac_assets;

      let status = row.status as ServiceScheduleStatus;
      // Derive dynamic status if not resolved
      if (!['COMPLETED', 'RESOLVED', 'CANCELLED'].includes(status)) {
        if (row.scheduled_date < today) {
          status = 'OVERDUE';
        } else if (row.scheduled_date === today) {
          status = 'DUE';
        }
      }

      return {
        id: row.id,
        scheduleNumber: row.schedule_number,
        amcId: row.amc_id,
        assetId: row.asset_id,
        assetTag: ac?.asset_tag || null,
        brand: ac?.brand || null,
        modelNumber: ac?.model_number || null,
        siteName: ac?.customer_sites?.site_name || null,
        roomLocation: ac?.room_location || null,
        scheduledDate: row.scheduled_date,
        visitNumber: row.visit_number,
        plannedServiceType: row.planned_service_type || null,
        status,
        isSystemGenerated: row.is_system_generated,
        notes: row.notes,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  /**
   * Renew an existing contract safely and atomically
   */
  async renewContract(
    id: string,
    payload: RenewAmcContractPayload,
    actorId: string
  ): Promise<AmcContractResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getContractById(id);

    // 1. Validate predecessor state
    if (existing.status === 'CANCELLED') {
      throw new BadRequestError('Cannot renew a cancelled AMC contract');
    }
    if (existing.status === 'RENEWED') {
      throw new BadRequestError('This AMC contract has already been renewed');
    }

    // Check if successor contract already exists
    const { data: successors } = await supabase
      .from('amc_contracts')
      .select('id, contract_number')
      .eq('previous_contract_id', id);

    const existingSuccessor = successors && successors.length > 0 ? successors[0] : null;

    if (existingSuccessor) {
      throw new ConflictError(
        `This AMC contract has already been renewed as '${existingSuccessor.contract_number}'`
      );
    }

    // 2. Automatically carry forward covered assets from predecessor
    const predecessorAssetIds = (existing.coveredAssets || []).map((a: any) => a.assetId);
    const assetIds = (payload.coveredAssetIds && payload.coveredAssetIds.length > 0)
      ? payload.coveredAssetIds
      : predecessorAssetIds;

    if (assetIds.length === 0) {
      throw new BadRequestError('Cannot renew AMC contract: no covered AC assets are attached to carry forward');
    }

    // 3. Validate asset ownership & overlap for the new period (excluding the predecessor)
    await this.validateAssetOwnershipAndOverlap(
      existing.customerId,
      assetIds,
      payload.startDate,
      payload.endDate,
      existing.id
    );

    // 4. Generate successor contract number
    const contractNumber = await this.generateContractNumber();

    const frequency = payload.frequency || existing.frequency;
    const totalAmount = payload.totalAmount !== undefined ? payload.totalAmount : existing.totalAmount;
    const totalVisits = payload.totalVisits !== undefined ? payload.totalVisits : existing.totalVisits;
    const planId = payload.planId !== undefined ? payload.planId : existing.planId;
    const notes = payload.notes !== undefined ? payload.notes : (existing.notes || null);

    // 4b. Preserve or override visit breakdowns (Dry, Jet, Pumpdown)
    const hasBreakdownOverride =
      payload.dryServiceVisits !== undefined ||
      payload.jetServiceVisits !== undefined ||
      payload.pumpdownServiceVisits !== undefined;

    let dryVisits: number | null = null;
    let jetVisits: number | null = null;
    let pumpdownVisits: number | null = null;

    if (hasBreakdownOverride) {
      dryVisits = payload.dryServiceVisits != null ? Number(payload.dryServiceVisits) : 0;
      jetVisits = payload.jetServiceVisits != null ? Number(payload.jetServiceVisits) : 0;
      pumpdownVisits = payload.pumpdownServiceVisits != null ? Number(payload.pumpdownServiceVisits) : 0;

      if (dryVisits < 0 || jetVisits < 0 || pumpdownVisits < 0) {
        throw new BadRequestError('Visit breakdown counts cannot be negative');
      }
      if (
        !Number.isInteger(dryVisits) ||
        !Number.isInteger(jetVisits) ||
        !Number.isInteger(pumpdownVisits)
      ) {
        throw new BadRequestError('Visit breakdown counts must be whole numbers');
      }

      if (dryVisits + jetVisits + pumpdownVisits !== totalVisits) {
        throw new BadRequestError(
          `The total allocation across Dry (${dryVisits}), Jet (${jetVisits}), and Pumpdown (${pumpdownVisits}) visits must exactly equal total included visits (${totalVisits})`
        );
      }
    } else {
      // Inherit predecessor visit breakdown
      dryVisits = existing.dryServiceVisits ?? null;
      jetVisits = existing.jetServiceVisits ?? null;
      pumpdownVisits = existing.pumpdownServiceVisits ?? null;

      const hasPredecessorBreakdown =
        dryVisits != null || jetVisits != null || pumpdownVisits != null;

      if (hasPredecessorBreakdown) {
        const inheritedSum = (dryVisits ?? 0) + (jetVisits ?? 0) + (pumpdownVisits ?? 0);
        if (inheritedSum !== totalVisits) {
          throw new BadRequestError(
            `The inherited visit allocation (Dry: ${dryVisits ?? 0}, Jet: ${jetVisits ?? 0}, Pumpdown: ${pumpdownVisits ?? 0} = ${inheritedSum}) does not match the new total visits (${totalVisits}). Please specify an explicit visit breakdown.`
          );
        }
      }
    }

    const cadenceSlotCount = calculateScheduleDatesUtc(
      payload.startDate,
      payload.endDate,
      frequency
    ).length;
    if (totalVisits !== cadenceSlotCount) {
      throw new BadRequestError(
        `Included visits (${totalVisits}) must match the ${cadenceSlotCount} cadence dates in the renewal term.`
      );
    }
    const renewalAllocationCount = (dryVisits ?? 0) + (jetVisits ?? 0) + (pumpdownVisits ?? 0);
    if (renewalAllocationCount !== cadenceSlotCount) {
      throw new BadRequestError(
        `Dry, Jet, and Pumpdown allocation (${renewalAllocationCount}) must match the ${cadenceSlotCount} renewal cadence slots.`
      );
    }

    // 4c. Query eligible unperformed predecessor schedules for supersession
    const schedQuery: any = supabase
      .from('service_schedules')
      .select('id, schedule_number, status, notes, visit_number')
      .eq('amc_id', existing.id);

    const { data: eligibleRaw, error: schedQueryErr } = typeof schedQuery.in === 'function'
      ? await schedQuery.in('status', ['SCHEDULED', 'PLANNED', 'DUE', 'OVERDUE'])
      : await schedQuery;

    if (schedQueryErr) {
      logger.error('Failed to query predecessor schedules during renewal', { error: schedQueryErr });
      throw new BadRequestError('Failed to inspect predecessor service schedules');
    }

    const unperformedStatuses = ['SCHEDULED', 'PLANNED', 'DUE', 'OVERDUE'];
    const eligibleSchedules = (eligibleRaw || []).filter((s: any) =>
      unperformedStatuses.includes(s.status)
    );

    // Verify actorId exists in profiles or set null to avoid FK violation on cancelled_by
    let validActorId: string | null = null;
    if (actorId) {
      try {
        const query: any = supabase.from('profiles').select('id').eq('id', actorId);
        const res = typeof query.maybeSingle === 'function'
          ? await query.maybeSingle()
          : typeof query.single === 'function'
            ? await query.single()
            : { data: null };
        if (res && res.data) validActorId = res.data.id;
      } catch {
        validActorId = null;
      }
    }

    // 5. Atomic execution with rollback safeguard
    let createdSuccessorId: string | null = null;
    let predecessorMarkedRenewed = false;
    let supersededScheduleIds: string[] = [];
    let previousScheduleStates: Array<{ id: string; status: string; notes: string | null }> = [];

    try {
      // 5a. Insert successor contract (status ACTIVE, previous_contract_id linked, visit breakdowns populated)
      const { data: inserted, error: iErr } = await supabase
        .from('amc_contracts')
        .insert({
          contract_number: contractNumber,
          customer_id: existing.customerId,
          plan_id: planId || null,
          start_date: payload.startDate,
          end_date: payload.endDate,
          frequency,
          total_amount: totalAmount,
          total_visits: totalVisits,
          dry_service_visits: dryVisits,
          jet_service_visits: jetVisits,
          pumpdown_service_visits: pumpdownVisits,
          status: 'ACTIVE',
          notes,
          previous_contract_id: existing.id,
          created_by: actorId,
        })
        .select()
        .single();

      if (iErr || !inserted) {
        logger.error('Failed to create successor AMC contract', { error: iErr });
        throw new BadRequestError('Failed to create successor AMC contract');
      }

      createdSuccessorId = inserted.id;

      // 5b. Automatically attach all carried-forward assets
      const assetRows = assetIds.map((aId: string) => ({
        amc_id: inserted.id,
        asset_id: aId,
      }));

      const { error: covErr } = await supabase.from('amc_assets').insert(assetRows);
      if (covErr) {
        logger.error('Failed to copy covered assets into successor contract', { error: covErr });
        throw new BadRequestError('Failed to attach covered assets to renewed contract');
      }

      // 5c. Supersede eligible unperformed predecessor schedules
      if (eligibleSchedules && eligibleSchedules.length > 0) {
        supersededScheduleIds = eligibleSchedules.map((s: any) => s.id);
        previousScheduleStates = eligibleSchedules.map((s: any) => ({
          id: s.id,
          status: s.status,
          notes: s.notes,
        }));
        const now = new Date().toISOString();
        const updateQuery: any = supabase
          .from('service_schedules')
          .update({
            status: 'CANCELLED',
            cancellation_reason: 'SUPERSEDED_BY_RENEWAL',
            notes: `Superseded by renewal contract ${contractNumber}`,
            cancelled_at: now,
            cancelled_by: validActorId,
            updated_by: validActorId,
            updated_at: now,
          });

        const { error: cancelSchedErr } = typeof updateQuery.in === 'function'
          ? await updateQuery.in('id', supersededScheduleIds)
          : await updateQuery.eq('amc_id', existing.id);

        if (cancelSchedErr) {
          logger.error('Failed to supersede predecessor schedules', { error: cancelSchedErr });
          throw new BadRequestError('Failed to supersede predecessor schedules');
        }
      }

      // 5d. Mark predecessor as RENEWED
      const { error: updErr } = await supabase
        .from('amc_contracts')
        .update({
          status: 'RENEWED',
          updated_by: actorId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updErr) {
        logger.error('Failed to mark predecessor contract as RENEWED', { error: updErr });
        throw new BadRequestError('Failed to update predecessor contract status');
      }

      predecessorMarkedRenewed = true;

      // 5e. Generate successor PM obligations
      await this.generatePmObligations(inserted.id, {}, actorId);

      // 5f. Record audit log
      await this.recordAudit(actorId, 'AMC_RENEWED', existing.id, {
        predecessorContractNumber: existing.contractNumber,
        successorContractId: inserted.id,
        successorContractNumber: inserted.contract_number,
        assetsCount: assetIds.length,
        startDate: payload.startDate,
        endDate: payload.endDate,
        dryServiceVisits: dryVisits,
        jetServiceVisits: jetVisits,
        pumpdownServiceVisits: pumpdownVisits,
        supersededPredecessorSchedulesCount: supersededScheduleIds.length,
      });

      return this.getContractById(inserted.id);
    } catch (err) {
      logger.error('AMC renewal failed, rolling back changes', { error: err });
      // Clean up newly created successor contract and child records
      if (createdSuccessorId) {
        try {
          await supabase.from('service_schedules').delete().eq('amc_id', createdSuccessorId);
          await supabase.from('amc_assets').delete().eq('amc_id', createdSuccessorId);
          await supabase.from('amc_contracts').delete().eq('id', createdSuccessorId);
        } catch (cleanupErr) {
          logger.error('Rollback cleanup failed for successor contract', { error: cleanupErr });
        }
      }
      // Revert predecessor status if it was changed
      if (predecessorMarkedRenewed) {
        try {
          await supabase
            .from('amc_contracts')
            .update({
              status: existing.status,
              updated_by: actorId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } catch (revertErr) {
          logger.error('Rollback revert failed for predecessor status', { error: revertErr });
        }
      }
      // Revert superseded predecessor schedules
      if (previousScheduleStates.length > 0) {
        try {
          for (const prev of previousScheduleStates) {
            await supabase
              .from('service_schedules')
              .update({
                status: prev.status,
                notes: prev.notes,
                cancellation_reason: null,
                cancelled_at: null,
                cancelled_by: null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', prev.id);
          }
        } catch (revertSchedErr) {
          logger.error('Rollback revert failed for superseded schedules', { error: revertSchedErr });
        }
      }
      throw err;
    }
  }
}

export const amcService = new AmcService();
