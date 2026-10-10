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
} from '../types/index.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';

const FREQUENCY_MONTH_INTERVALS: Record<AmcFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};

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
  const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
  const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);

  const startDate = new Date(Date.UTC(sYear, sMonth - 1, sDay));
  const endDate = new Date(Date.UTC(eYear, eMonth - 1, eDay));

  if (endDate < startDate) {
    throw new BadRequestError('AMC contract end date cannot precede start date');
  }

  const interval = FREQUENCY_MONTH_INTERVALS[frequency] || 3;
  const dates: string[] = [];

  let current = new Date(startDate.getTime());
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current = addMonthsSafeUtc(current, interval);
  }

  return dates;
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
  async listPlans(): Promise<AmcPlanResponse[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('amc_plans')
      .select('*')
      .eq('is_active', true)
      .order('default_visits_per_year', { ascending: true });

    if (error) {
      logger.error('Failed to list AMC plans', { error });
      throw new BadRequestError('Failed to retrieve AMC plans');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      planCode: row.plan_code,
      name: row.name,
      description: row.description,
      defaultFrequency: row.default_frequency as AmcFrequency,
      defaultVisitsPerYear: row.default_visits_per_year,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Real operational AMC dashboard metrics
   */
  async getDashboardMetrics(): Promise<AmcDashboardMetrics> {
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

    // Schedules
    const { data: schedules } = await supabase
      .from('service_schedules')
      .select('id, scheduled_date, status');

    let upcomingPmCount = 0;
    let overduePmCount = 0;

    (schedules || []).forEach((s: any) => {
      const isCompleted = ['COMPLETED', 'RESOLVED', 'CANCELLED'].includes(s.status);
      if (!isCompleted) {
        if (s.scheduled_date < today) {
          overduePmCount++;
        } else {
          upcomingPmCount++;
        }
      }
    });

    return {
      activeContracts,
      expiringSoonContracts,
      expiredContracts,
      coveredAssetsCount,
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
        total_amount, total_visits, status, notes, cancellation_reason, cancelled_at,
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
          service_reports:service_reports!service_reports_service_schedule_id_fkey (id, primary_outcome)
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
          const hasPendingReport = reportList.some(
            (r: any) => r.primary_outcome === 'PENDING_PARTS' || r.primary_outcome === 'PENDING_REPAIRS'
          );

          if (!isFollowUp && ['COMPLETED', 'RESOLVED'].includes(curr.status) && !hasPendingReport) {
            acc[curr.amc_id].completed++;
          } else if (!acc[curr.amc_id].nextDate && curr.scheduled_date >= today && curr.status !== 'CANCELLED') {
            acc[curr.amc_id].nextDate = curr.scheduled_date;
          }
          return acc;
        }, {});
      }
    }

    const contracts: AmcContractResponse[] = (data || []).map((row: any) => {
      const customer = row.customers as { id: string; name: string; customer_code: string; phone: string } | null;
      const plan = row.amc_plans as { id: string; name: string; plan_code: string } | null;

      const coveredAssetsCount = assetCountsMap[row.id] || 0;
      const scheduleStats = scheduleStatsMap[row.id] || { total: 0, completed: 0, nextDate: null };
      const isExpiringSoon =
        row.status === 'ACTIVE' && row.end_date >= today && row.end_date <= thirtyDaysLater;

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
        status: row.status as AmcStatus,
        notes: row.notes,
        cancellationReason: row.cancellation_reason,
        cancelledAt: row.cancelled_at,
        cancelledBy: row.cancelled_by,
        previousContractId: row.previous_contract_id,
        coveredAssetsCount,
        schedulesCount: scheduleStats.total,
        completedVisitsCount: scheduleStats.completed,
        remainingVisitsCount: Math.max(0, row.total_visits - scheduleStats.completed),
        nextPmDate: scheduleStats.nextDate,
        isExpiringSoon,
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
        total_amount, total_visits, status, notes, cancellation_reason, cancelled_at,
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
        service_reports:service_reports!service_reports_service_schedule_id_fkey (id, primary_outcome)
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
      const hasPendingReport = reportList.some(
        (r: any) => r.primary_outcome === 'PENDING_PARTS' || r.primary_outcome === 'PENDING_REPAIRS'
      );

      if (!isFollowUp && ['COMPLETED', 'RESOLVED'].includes(s.status) && !hasPendingReport) {
        completedVisitsCount++;
      } else if (!nextPmDate && s.scheduled_date >= today && s.status !== 'CANCELLED') {
        nextPmDate = s.scheduled_date;
      }
    });

    const isExpiringSoon =
      row.status === 'ACTIVE' && row.end_date >= today && row.end_date <= thirtyDaysLater;

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
      status: row.status as AmcStatus,
      notes: row.notes,
      cancellationReason: row.cancellation_reason,
      cancelledAt: row.cancelled_at,
      cancelledBy: row.cancelled_by,
      previousContractId: row.previous_contract_id,
      coveredAssetsCount: coveredAssets.length,
      coveredAssets,
      schedulesCount: (schedulesRows || []).length,
      completedVisitsCount,
      remainingVisitsCount: Math.max(0, row.total_visits - completedVisitsCount),
      nextPmDate,
      isExpiringSoon,
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
        status: payload.status || 'ACTIVE',
        notes: payload.notes || null,
        created_by: actorId,
      })
      .select()
      .single();

    if (iErr || !inserted) {
      logger.error('Failed to insert AMC contract', { error: iErr });
      throw new BadRequestError('Failed to create AMC contract');
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

    await this.recordAudit(actorId, 'AMC_STATUS_CHANGED', id, {
      fromStatus: existing.status,
      toStatus: payload.status,
      reason: payload.reason,
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

    // Fetch existing schedules for this contract to guarantee idempotency
    const { data: existingSchedules, error: sErr } = await supabase
      .from('service_schedules')
      .select('id, amc_id, asset_id, scheduled_date, schedule_number, status')
      .eq('amc_id', id);

    if (sErr) {
      logger.error('Failed to fetch existing schedules during generation', { error: sErr });
      throw new BadRequestError('Failed to evaluate existing PM obligations');
    }

    const existingKeySet = new Set(
      (existingSchedules || []).map((s: any) => `${s.amc_id}_${s.asset_id}_${s.scheduled_date}`)
    );

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
      status: string;
      is_system_generated: boolean;
      created_by: string | null;
    }> = [];

    let existingCount = 0;

    for (const asset of targetAssets) {
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const key = `${id}_${asset.assetId}_${date}`;

        if (existingKeySet.has(key)) {
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
            visit_number: i + 1,
            planned_service_type: (i + 1) % 2 === 0 ? 'JET_SERVICE' : 'DRY_SERVICE',
            status,
            is_system_generated: true,
            created_by: validActorId,
          });

          // Mark key as seen for concurrent asset loop
          existingKeySet.add(key);
        }
      }
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('service_schedules').insert(toInsert);
      if (insErr) {
        logger.error('Failed to batch insert PM schedules', { error: insErr });
        throw new BadRequestError('Failed to persist generated PM obligations');
      }
    }

    await this.recordAudit(actorId, 'AMC_PM_GENERATED', id, {
      generatedCount: toInsert.length,
      existingCount,
      targetAssetsCount: targetAssets.length,
      frequency: contract.frequency,
    });

    const refreshedSchedules = await this.getSchedulesForContract(id);

    return {
      contractId: id,
      contractNumber: contract.contractNumber,
      generatedCount: toInsert.length,
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

    // 5. Atomic execution with rollback safeguard
    let createdSuccessorId: string | null = null;
    let predecessorMarkedRenewed = false;

    try {
      // 5a. Insert successor contract (status ACTIVE, previous_contract_id linked)
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

      // 5c. Mark predecessor as RENEWED
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

      // 5d. Generate successor PM obligations
      await this.generatePmObligations(inserted.id, {}, actorId);

      // 5e. Record audit log
      await this.recordAudit(actorId, 'AMC_RENEWED', existing.id, {
        predecessorContractNumber: existing.contractNumber,
        successorContractId: inserted.id,
        successorContractNumber: inserted.contract_number,
        assetsCount: assetIds.length,
        startDate: payload.startDate,
        endDate: payload.endDate,
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
      throw err;
    }
  }
}

export const amcService = new AmcService();
