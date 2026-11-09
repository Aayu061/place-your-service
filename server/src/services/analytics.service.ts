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

    const [coverageMetrics, requestsResult, schedulesResult, technicianResult, dueRequestCount, urgentRequestCount, openScheduleCount, overdueScheduleCount, assignedScheduleCount, completedTodayResult] = await Promise.all([
      amcService.getActiveCoverageMetrics(),
      supabase.from('service_requests')
        .select('id,request_number,request_type,priority,status,created_at,customers(name),customer_sites(site_name),ac_assets(brand,model_number)')
        .in('status', openStatuses).order('created_at', { ascending: false }).limit(10),
      supabase.from('service_schedules')
        .select('id,schedule_number,scheduled_date,status,customers(name),customer_sites(site_name),ac_assets(brand)')
        .in('status', openStatuses).order('scheduled_date', { ascending: true }).limit(10),
      supabase.from('technicians').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('service_requests').select('id', { count: 'exact', head: true }).in('status', dispatchStatuses),
      supabase.from('service_requests').select('id', { count: 'exact', head: true }).in('priority', ['URGENT', 'EMERGENCY']).in('status', openStatuses),
      supabase.from('service_schedules').select('id', { count: 'exact', head: true }).in('status', openStatuses),
      supabase.from('service_schedules').select('id', { count: 'exact', head: true }).in('status', openStatuses).lt('scheduled_date', today),
      supabase.from('service_schedules').select('id', { count: 'exact', head: true }).in('status', openStatuses).not('technician_id', 'is', null),
      supabase.from('service_schedules').select('id', { count: 'exact', head: true }).eq('scheduled_date', today).eq('status', 'COMPLETED'),
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
      trendData,
    };
  }
}

export const analyticsService = new AnalyticsService();
