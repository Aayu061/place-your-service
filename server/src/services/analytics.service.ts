import { getSupabaseClient } from '../lib/supabase.js';
import { logger } from '../utils/logger.js';

export interface DashboardSummaryResponse {
  kpi: {
    activeAmcCount: number;
    servicesDueCount: number;
    overduePmCount: number;
    unassignedRequestsCount: number;
    urgentRequestsCount: number;
    activeTechniciansCount: number;
    completedTodayCount: number;
  };
  workDistribution: Array<{
    label: string;
    count: number;
    category: 'PM' | 'BREAKDOWN';
  }>;
  capacityPercent: number;
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
    value: number;
    secondaryValue: number;
  }>;
}

export class AnalyticsService {
  public async getDashboardSummary(): Promise<DashboardSummaryResponse> {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0];

    try {
      // 1. Parallel foundational queries
      const [
        amcResult,
        srResult,
        schedResult,
        techResult,
        todaySchedResult,
      ] = await Promise.all([
        // Active AMC contracts
        supabase
          .from('amc_contracts')
          .select('id, status, end_date'),

        // All non-closed service requests for aggregated metrics
        supabase
          .from('service_requests')
          .select('id, request_number, customer_id, site_id, asset_id, request_type, priority, status, created_at, customers(name), customer_sites(site_name), ac_assets(brand, model_number)')
          .order('created_at', { ascending: false }),

        // Schedules for due/overdue and recent activities
        supabase
          .from('service_schedules')
          .select('id, schedule_number, customer_id, site_id, asset_id, amc_id, scheduled_date, status, customers(name), customer_sites(site_name), ac_assets(brand)')
          .order('scheduled_date', { ascending: true }),

        // Active technicians count
        supabase
          .from('technicians')
          .select('id, is_active, status')
          .eq('is_active', true)
          .eq('status', 'ACTIVE'),

        // Today's completed schedules
        supabase
          .from('service_schedules')
          .select('id', { count: 'exact', head: true })
          .eq('scheduled_date', today)
          .eq('status', 'COMPLETED'),
      ]);

      // 2. Compute AMC metrics
      const contracts = amcResult.data || [];
      const activeAmcCount = contracts.filter((c: any) =>
        c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON'
      ).length;

      // 3. Compute Schedule metrics
      const schedules = schedResult.data || [];
      let overduePmCount = 0;
      let upcomingPmCount = 0;

      for (const s of schedules as any[]) {
        const isClosed = ['COMPLETED', 'RESOLVED', 'CANCELLED'].includes(s.status);
        if (!isClosed) {
          if (s.scheduled_date < today) {
            overduePmCount++;
          } else {
            upcomingPmCount++;
          }
        }
      }

      const servicesDueCount = upcomingPmCount + overduePmCount;
      const completedTodayCount = todaySchedResult.count || 0;

      // 4. Compute Service Request metrics & Distribution
      const requests = srResult.data || [];
      let pmCount = 0;
      let breakdownCount = 0;
      let repairCount = 0;
      let installationCount = 0;
      let unassignedRequestsCount = 0;
      let urgentRequestsCount = 0;

      const recentServiceRequests: DashboardSummaryResponse['recentServiceRequests'] = [];

      for (let i = 0; i < requests.length; i++) {
        const r: any = requests[i];

        if (['PREVENTIVE_MAINTENANCE', 'GENERAL_SERVICE', 'INSPECTION'].includes(r.request_type)) {
          pmCount++;
        } else if (['BREAKDOWN', 'EMERGENCY'].includes(r.request_type)) {
          breakdownCount++;
        } else if (r.request_type === 'REPAIR') {
          repairCount++;
        } else if (r.request_type === 'INSTALLATION') {
          installationCount++;
        }

        if (['REQUESTED', 'PENDING', 'AWAITING_PARTS', 'REVISIT_REQUIRED'].includes(r.status)) {
          unassignedRequestsCount++;
        }

        if (['URGENT', 'EMERGENCY'].includes(r.priority) && !['COMPLETED', 'RESOLVED', 'CLOSED', 'CANCELLED'].includes(r.status)) {
          urgentRequestsCount++;
        }

        if (i < 10) {
          recentServiceRequests.push({
            id: r.id,
            requestNumber: r.request_number,
            customerName: r.customers?.name || undefined,
            siteName: r.customer_sites?.site_name || undefined,
            assetBrand: r.ac_assets?.brand || undefined,
            assetModel: r.ac_assets?.model_number || undefined,
            requestType: r.request_type,
            priority: r.priority,
            status: r.status,
            createdAt: r.created_at,
          });
        }
      }

      // 5. Recent Schedules (first 10 upcoming/active)
      const recentSchedules: DashboardSummaryResponse['recentSchedules'] = schedules
        .slice(0, 10)
        .map((s: any) => ({
          id: s.id,
          scheduleNumber: s.schedule_number,
          customerName: s.customers?.name || undefined,
          siteName: s.customer_sites?.site_name || undefined,
          brand: s.ac_assets?.brand || undefined,
          scheduledDate: s.scheduled_date,
          status: s.status,
        }));

      // 6. Active Technicians Count
      const activeTechniciansCount = (techResult.data || []).length;

      // 7. Work distribution
      const workDistribution: DashboardSummaryResponse['workDistribution'] = [
        { label: 'General / PM', count: pmCount, category: 'PM' },
        { label: 'Breakdown', count: breakdownCount, category: 'BREAKDOWN' },
        { label: 'Repairs', count: repairCount, category: 'BREAKDOWN' },
        { label: 'Installations', count: installationCount, category: 'PM' },
      ];

      // 8. Capacity & Compliance calculation
      const totalWork = schedules.length + requests.length;
      const completedWork =
        schedules.filter((s: any) => s.status === 'COMPLETED').length +
        requests.filter((r: any) => ['COMPLETED', 'RESOLVED', 'CLOSED'].includes(r.status)).length;

      const capacityPercent = totalWork > 0 ? Math.min(100, Math.round((completedWork / totalWork) * 100)) : 0;
      const compliancePercent = totalWork > 0 ? Math.max(0, 100 - Math.round((overduePmCount / totalWork) * 100)) : 100;

      // 9. 7-day Operational Volume Trend (Past 7 days)
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const trendData: DashboardSummaryResponse['trendData'] = [];
      const now = new Date();

      for (let offset = 6; offset >= 0; offset--) {
        const targetDay = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
        const dayStr = targetDay.toISOString().split('T')[0];
        const dayLabel = dayNames[targetDay.getUTCDay()];

        const reqCount = requests.filter((r: any) => r.created_at && r.created_at.startsWith(dayStr)).length;
        const schedCount = schedules.filter((s: any) => s.scheduled_date === dayStr).length;

        trendData.push({
          label: dayLabel,
          value: reqCount,
          secondaryValue: schedCount,
        });
      }

      return {
        kpi: {
          activeAmcCount,
          servicesDueCount,
          overduePmCount,
          unassignedRequestsCount,
          urgentRequestsCount,
          activeTechniciansCount,
          completedTodayCount,
        },
        workDistribution,
        capacityPercent,
        compliancePercent,
        recentServiceRequests,
        recentSchedules,
        trendData,
      };
    } catch (err: any) {
      logger.error('Failed to generate dashboard summary', { error: err.message });
      throw err;
    }
  }
}

export const analyticsService = new AnalyticsService();
