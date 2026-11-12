import { getSupabaseClient } from '../lib/supabase.js';
import { BadRequestError } from '../utils/errors.js';
import { addDaysIstIso, getCalendarWeekdayShort, getIstTodayIso } from '../utils/date.js';
import { amcService } from './amc.service.js';

type RequestRow = {
  id: string;
  request_number: string;
  request_type: string;
  priority: string;
  status: string;
  created_at: string;
  customers?: { name: string } | null;
  customer_sites?: { site_name: string } | null;
  ac_assets?: { brand: string; model_number: string | null } | null;
};

type ScheduleRow = {
  id: string;
  schedule_number: string;
  scheduled_date: string;
  status: string;
  customers?: { name: string } | null;
  customer_sites?: { site_name: string } | null;
  ac_assets?: { brand: string } | null;
};

export interface DashboardSummaryResponse {
  kpi: {
    activeAmcCount: number;
    coveredAssetCount: number;
    servicesDueCount: number;
    overdueScheduleCount: number;
    unassignedRequestsCount: number;
    urgentRequestsCount: number;
    activeTechniciansCount: number;
    completedTodayCount: number;
    totalRevenueCollected: number;
    totalOutstandingBalance: number;
    collectionRatePercent: number;
    draftQuotationsCount: number;
    draftQuotationsValue: number;
  };
  financials: {
    totalInvoiced: number;
    totalCollected: number;
    totalOutstanding: number;
    collectionRatePercent: number;
    cashCollected: number;
    onlineCollected: number;
    pendingPaymentsCount: number;
    paidPaymentsCount: number;
  };
  amcPipeline: {
    draftCount: number;
    draftValue: number;
    activeCount: number;
    expiringSoonCount: number;
  };
  capacityPercent: number;
  /** Share of open schedules that are due today or later, relative to all open schedules. */
  compliancePercent: number;
  recentServiceRequests: Array<{
    id: string;
    requestNumber: string;
    customerName?: string;
    siteName?: string;
    assetBrand?: string;
    assetModel?: string;
    requestType: string;
    priority: string;
    status: string;
    createdAt?: string;
  }>;
  recentSchedules: Array<{
    id: string;
    scheduleNumber: string;
    customerName?: string;
    siteName?: string;
    brand?: string;
    scheduledDate?: string;
    status: string;
  }>;
  recentServiceReports: Array<{
    id: string;
    reportNumber: string;
    serviceDate: string;
    primaryOutcome: string;
    status: string;
    paymentCollected: boolean;
    paymentAmount?: number;
    paymentMethod?: string;
    customerName?: string;
    siteName?: string;
    technicianName?: string;
  }>;
  workDistribution: Array<{
    label: string;
    count: number;
    color?: string;
    category?: 'PM' | 'BREAKDOWN';
  }>;
  trendData: Array<{
    label: string;
    date: string;
    value: number;
    secondaryValue: number;
  }>;
}

function failQuery(action: string, error: { message?: string } | null): never {
  throw new BadRequestError(`${action} is unavailable.`, error?.message ? { cause: error.message } : undefined);
}

export class AnalyticsService {
  private async fetchAllRows<T>(
    fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
    action: string
  ): Promise<T[]> {
    const pageSize = 1000;
    const rows: T[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await fetchPage(from, from + pageSize - 1);
      if (error) failQuery(action, error);
      const chunk = data || [];
      rows.push(...chunk);
      if (chunk.length < pageSize) break;
    }
    return rows;
  }

  public async getDashboardSummary(): Promise<DashboardSummaryResponse> {
    const supabase = getSupabaseClient();
    const today = getIstTodayIso();

    const { data: rpcSummary, error: rpcError } =
      typeof (supabase as { rpc?: unknown }).rpc === 'function'
        ? await supabase.rpc('get_dashboard_summary', { p_today: today })
        : { data: null, error: { message: 'RPC unavailable' } };
    if (!rpcError && rpcSummary && typeof rpcSummary === 'object') {
      return rpcSummary as DashboardSummaryResponse;
    }

    const startDateIso = addDaysIstIso(today, -6);
    const openStatuses = ['REQUESTED', 'PENDING', 'SCHEDULED', 'PLANNED', 'DUE', 'OVERDUE', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_PARTS', 'REVISIT_REQUIRED', 'ON_HOLD'];
    const dispatchStatuses = ['REQUESTED', 'PENDING', 'AWAITING_PARTS', 'REVISIT_REQUIRED'];

    const [
      coverageMetrics,
      requestsResult,
      schedulesResult,
      reportsResult,
      technicianResult,
      dueRequestCount,
      urgentRequestCount,
      openScheduleCount,
      overdueScheduleCount,
      assignedScheduleCount,
      completedTodayResult,
      dryServiceCount,
      jetServiceCount,
      paymentsData,
      txnsData,
      amcData,
    ] = await Promise.all([
      amcService.getActiveCoverageMetrics(),
      supabase.from('service_requests')
        .select('id,request_number,request_type,priority,status,created_at,customers(name),customer_sites(site_name),ac_assets(brand,model_number)')
        .in('status', openStatuses).order('created_at', { ascending: false }).limit(10),
      supabase.from('service_schedules')
        .select('id,schedule_number,scheduled_date,status,customers(name),customer_sites(site_name),ac_assets(brand)')
        .in('status', openStatuses).order('scheduled_date', { ascending: true }).limit(10),
      supabase.from('service_reports')
        .select('id,report_number,service_date,primary_outcome,status,payment_collected,payment_amount,payment_method,customers(name),customer_sites(site_name),technicians(name)')
        .order('service_date', { ascending: false }).limit(8),
      supabase.from('technicians').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('service_requests').select('id', { count: 'exact', head: true }).in('status', dispatchStatuses),
      supabase.from('service_requests').select('id', { count: 'exact', head: true }).in('priority', ['URGENT', 'EMERGENCY']).in('status', openStatuses),
      supabase.from('service_schedules').select('id', { count: 'exact', head: true }).in('status', openStatuses),
      supabase.from('service_schedules').select('id', { count: 'exact', head: true }).in('status', openStatuses).lt('scheduled_date', today),
      supabase.from('service_schedules').select('id', { count: 'exact', head: true }).in('status', openStatuses).not('technician_id', 'is', null),
      supabase.from('service_schedules').select('id', { count: 'exact', head: true }).eq('scheduled_date', today).eq('status', 'COMPLETED'),
      supabase.from('service_schedules').select('id', { count: 'exact', head: true }).in('status', openStatuses).eq('planned_service_type', 'DRY_SERVICE'),
      supabase.from('service_schedules').select('id', { count: 'exact', head: true }).in('status', openStatuses).eq('planned_service_type', 'JET_SERVICE'),
      this.fetchAllRows<any>(
        (from, to) => supabase.from('payments').select('id, total_amount_due, total_amount_paid, status').range(from, to),
        'payments summary'
      ),
      this.fetchAllRows<any>(
        (from, to) => supabase.from('payment_transactions').select('amount, payment_method, entry_type, payment_status').eq('payment_status', 'SUCCESS').range(from, to),
        'payment transactions summary'
      ),
      this.fetchAllRows<any>(
        (from, to) => supabase.from('amc_contracts').select('id, total_amount, status').range(from, to),
        'amc contracts summary'
      ),
    ]);

    for (const [action, result] of [
      ['recent service requests', requestsResult], ['recent schedules', schedulesResult], ['active technician count', technicianResult],
      ['dispatch request count', dueRequestCount], ['urgent request count', urgentRequestCount], ['open schedule count', openScheduleCount],
      ['overdue schedule count', overdueScheduleCount], ['assigned schedule count', assignedScheduleCount], ['completed visits today', completedTodayResult],
      ['dry service count', dryServiceCount], ['jet service count', jetServiceCount],
    ] as const) if (result.error) failQuery(action, result.error);

    const trendData = await Promise.all(Array.from({ length: 7 }, async (_, offset) => {
      const day = addDaysIstIso(startDateIso, offset);
      const next = addDaysIstIso(day, 1);
      const dayStartUtc = new Date(`${day}T00:00:00+05:30`).toISOString();
      const dayEndUtc = new Date(`${next}T00:00:00+05:30`).toISOString();
      const [requestCount, scheduleCount] = await Promise.all([
        supabase.from('service_requests').select('id', { count: 'exact', head: true }).gte('created_at', dayStartUtc).lt('created_at', dayEndUtc),
        supabase.from('service_schedules').select('id', { count: 'exact', head: true }).eq('scheduled_date', day),
      ]);
      if (requestCount.error) failQuery(`service request volume for ${day}`, requestCount.error);
      if (scheduleCount.error) failQuery(`scheduled visit volume for ${day}`, scheduleCount.error);
      return {
        label: getCalendarWeekdayShort(day),
        date: day,
        value: requestCount.count || 0,
        secondaryValue: scheduleCount.count || 0,
      };
    }));

    const requests = (requestsResult.data || []) as unknown as RequestRow[];
    const schedules = (schedulesResult.data || []) as unknown as ScheduleRow[];
    const openSchedules = openScheduleCount.count || 0;
    const overdueSchedules = overdueScheduleCount.count || 0;

    const totalInvoiced = paymentsData.reduce((acc, p) => acc + Number(p.total_amount_due || 0), 0);
    const totalCollected = paymentsData.reduce((acc, p) => acc + Number(p.total_amount_paid || 0), 0);
    const totalOutstanding = paymentsData.reduce((acc, p) => {
      if (p.status === 'PAID') return acc;
      const due = Number(p.total_amount_due || 0);
      const paid = Number(p.total_amount_paid || 0);
      return acc + Math.max(0, due - paid);
    }, 0);
    const collectionRatePercent = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;

    let cashCollected = 0;
    let onlineCollected = 0;
    for (const t of txnsData) {
      const amt = Number(t.amount || 0);
      const signedAmt = t.entry_type === 'REVERSAL' ? -amt : amt;
      if (t.payment_method === 'CASH') cashCollected += signedAmt;
      else if (t.payment_method === 'ONLINE') onlineCollected += signedAmt;
    }

    const pendingPaymentsCount = paymentsData.filter((p) => p.status === 'PENDING' || p.status === 'PARTIALLY_PAID').length;
    const paidPaymentsCount = paymentsData.filter((p) => p.status === 'PAID').length;

    const draftContracts = amcData.filter((c) => c.status === 'DRAFT');
    const draftCount = draftContracts.length;
    const draftValue = draftContracts.reduce((acc, c) => acc + Number(c.total_amount || 0), 0);

    return {
      kpi: {
        activeAmcCount: coverageMetrics.activeContracts,
        coveredAssetCount: coverageMetrics.coveredAssetsCount,
        servicesDueCount: openSchedules,
        overdueScheduleCount: overdueSchedules,
        unassignedRequestsCount: dueRequestCount.count || 0,
        urgentRequestsCount: urgentRequestCount.count || 0,
        activeTechniciansCount: technicianResult.count || 0,
        completedTodayCount: completedTodayResult.count || 0,
        totalRevenueCollected: totalCollected,
        totalOutstandingBalance: totalOutstanding,
        collectionRatePercent,
        draftQuotationsCount: draftCount,
        draftQuotationsValue: draftValue,
      },
      financials: {
        totalInvoiced,
        totalCollected,
        totalOutstanding,
        collectionRatePercent,
        cashCollected: Math.max(0, cashCollected),
        onlineCollected: Math.max(0, onlineCollected),
        pendingPaymentsCount,
        paidPaymentsCount,
      },
      amcPipeline: {
        draftCount,
        draftValue,
        activeCount: coverageMetrics.activeContracts,
        expiringSoonCount: coverageMetrics.expiringSoonContracts,
      },
      capacityPercent: openSchedules > 0 ? Math.round(((assignedScheduleCount.count || 0) / openSchedules) * 100) : 0,
      compliancePercent: openSchedules > 0 ? Math.max(0, Math.round(((openSchedules - overdueSchedules) / openSchedules) * 100)) : 0,
      recentServiceRequests: requests.map((request) => ({
        id: request.id,
        requestNumber: request.request_number,
        customerName: request.customers?.name,
        siteName: request.customer_sites?.site_name,
        assetBrand: request.ac_assets?.brand,
        assetModel: request.ac_assets?.model_number || undefined,
        requestType: request.request_type,
        priority: request.priority,
        status: request.status,
        createdAt: request.created_at,
      })),
      recentSchedules: schedules.map((schedule) => ({
        id: schedule.id,
        scheduleNumber: schedule.schedule_number,
        customerName: schedule.customers?.name,
        siteName: schedule.customer_sites?.site_name,
        brand: schedule.ac_assets?.brand,
        scheduledDate: schedule.scheduled_date,
        status: schedule.status,
      })),
      recentServiceReports: (reportsResult.data || []).map((report: any) => ({
        id: report.id,
        reportNumber: report.report_number,
        serviceDate: report.service_date,
        primaryOutcome: report.primary_outcome,
        status: report.status,
        paymentCollected: Boolean(report.payment_collected),
        paymentAmount: report.payment_amount != null ? Number(report.payment_amount) : undefined,
        paymentMethod: report.payment_method || undefined,
        customerName: report.customers?.name,
        siteName: report.customer_sites?.site_name,
        technicianName: report.technicians?.name,
      })),
      workDistribution: [
        { label: 'Preventive Maint', count: openSchedules, category: 'PM' as const },
        { label: 'Breakdown / Repair', count: dueRequestCount.count || requests.length || 0, category: 'BREAKDOWN' as const },
        { label: 'Dry Service', count: dryServiceCount.count || 0, category: 'PM' as const },
        { label: 'Jet Service', count: jetServiceCount.count || 0, category: 'PM' as const },
        { label: 'Urgent / Priority', count: urgentRequestCount.count || 0, category: 'BREAKDOWN' as const },
      ],
      trendData,
    };
  }

  public async getOverallAnalytics() {
    const summary = await this.getDashboardSummary();
    const supabase = getSupabaseClient();
    const today = getIstTodayIso();
    const monthStart = `${today.slice(0, 7)}-01`;

    const [customersCountRes, assetsCountRes, monthReportsRes, openRequestsRes, techniciansRes] =
      await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('ac_assets').select('id', { count: 'exact', head: true }),
        supabase
          .from('service_reports')
          .select('id,primary_outcome,performed_service_type,service_date,technician_id,technicians(name)')
          .gte('service_date', monthStart),
        supabase
          .from('service_requests')
          .select('id,issue_category,request_type,priority')
          .in('status', ['NEW', 'TRIAGED', 'SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD']),
        supabase
          .from('technicians')
          .select('id,name,status')
          .eq('is_active', true),
      ]);

    const categoryMap = new Map<string, number>();
    for (const row of openRequestsRes.data || []) {
      const key = String((row as any).issue_category || (row as any).request_type || 'GENERAL');
      categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
    }

    const techMap = new Map<string, { name: string; completedThisMonth: number }>();
    for (const tech of techniciansRes.data || []) {
      techMap.set(tech.id, { name: tech.name, completedThisMonth: 0 });
    }
    for (const rep of monthReportsRes.data || []) {
      const tid = (rep as any).technician_id;
      if (tid) {
        const entry = techMap.get(tid) || {
          name: ((rep as any).technicians?.name as string) || 'Technician',
          completedThisMonth: 0,
        };
        entry.completedThisMonth += 1;
        techMap.set(tid, entry);
      }
    }

    return {
      summary,
      totals: {
        activeCustomers: customersCountRes.count || 0,
        totalAssets: assetsCountRes.count || 0,
        reportsThisMonth: monthReportsRes.data?.length || 0,
      },
      issueCategoryBreakdown: Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      technicianPerformance: Array.from(techMap.entries())
        .map(([technicianId, stats]) => ({ technicianId, ...stats }))
        .sort((a, b) => b.completedThisMonth - a.completedThisMonth),
    };
  }
}

export const analyticsService = new AnalyticsService();
