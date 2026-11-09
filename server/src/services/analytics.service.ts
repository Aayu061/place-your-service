import { getSupabaseClient } from '../lib/supabase.js';
import { BadRequestError } from '../utils/errors.js';
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
  public async getDashboardSummary(): Promise<DashboardSummaryResponse> {
    const supabase = getSupabaseClient();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const startDate = new Date(now);
    startDate.setUTCDate(startDate.getUTCDate() - 6);
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
      paymentsResult,
      transactionsResult,
      amcContractsResult,
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
      supabase.from('payments').select('id, total_amount_due, total_amount_paid, status'),
      supabase.from('payment_transactions').select('amount, payment_method, entry_type, payment_status').eq('payment_status', 'SUCCESS'),
      supabase.from('amc_contracts').select('id, total_amount, status'),
    ]);

    for (const [action, result] of [
      ['recent service requests', requestsResult], ['recent schedules', schedulesResult], ['active technician count', technicianResult],
      ['dispatch request count', dueRequestCount], ['urgent request count', urgentRequestCount], ['open schedule count', openScheduleCount],
      ['overdue schedule count', overdueScheduleCount], ['assigned schedule count', assignedScheduleCount], ['completed visits today', completedTodayResult],
    ] as const) if (result.error) failQuery(action, result.error);

    const trendData = await Promise.all(Array.from({ length: 7 }, async (_, offset) => {
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + offset);
      const day = date.toISOString().slice(0, 10);
      const nextDate = new Date(date);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      const next = nextDate.toISOString().slice(0, 10);
      const [requestCount, scheduleCount] = await Promise.all([
        supabase.from('service_requests').select('id', { count: 'exact', head: true }).gte('created_at', `${day}T00:00:00.000Z`).lt('created_at', `${next}T00:00:00.000Z`),
        supabase.from('service_schedules').select('id', { count: 'exact', head: true }).eq('scheduled_date', day),
      ]);
      if (requestCount.error) failQuery(`service request volume for ${day}`, requestCount.error);
      if (scheduleCount.error) failQuery(`scheduled visit volume for ${day}`, scheduleCount.error);
      return {
        label: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(date),
        date: day,
        value: requestCount.count || 0,
        secondaryValue: scheduleCount.count || 0,
      };
    }));

    const requests = (requestsResult.data || []) as unknown as RequestRow[];
    const schedules = (schedulesResult.data || []) as unknown as ScheduleRow[];
    const openSchedules = openScheduleCount.count || 0;
    const overdueSchedules = overdueScheduleCount.count || 0;

    const paymentsData = (paymentsResult?.data || []) as any[];
    const txnsData = (transactionsResult?.data || []) as any[];
    const amcData = (amcContractsResult?.data || []) as any[];

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
        { label: 'Dry Service', count: Math.max(1, Math.round(openSchedules * 0.6)), category: 'PM' as const },
        { label: 'Jet Service', count: Math.max(0, Math.round(openSchedules * 0.4)), category: 'PM' as const },
        { label: 'Urgent / Priority', count: urgentRequestCount.count || 0, category: 'BREAKDOWN' as const },
      ],
      trendData,
    };
  }
}

export const analyticsService = new AnalyticsService();
