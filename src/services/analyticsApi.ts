import { apiClient } from '@/services/api/client';

export interface DashboardSummary {
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
  trendData: Array<{ label: string; date: string; value: number; secondaryValue: number }>;
}

export const analyticsApi = {
  getDashboardSummary: () => apiClient.get<DashboardSummary>('/analytics/dashboard-summary'),
};
