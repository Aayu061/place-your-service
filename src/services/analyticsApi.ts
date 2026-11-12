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
    totalRevenueCollected?: number;
    totalOutstandingBalance?: number;
    collectionRatePercent?: number;
    draftQuotationsCount?: number;
    draftQuotationsValue?: number;
  };
  financials?: {
    totalInvoiced: number;
    totalCollected: number;
    totalOutstanding: number;
    collectionRatePercent: number;
    cashCollected: number;
    onlineCollected: number;
    pendingPaymentsCount: number;
    paidPaymentsCount: number;
  };
  amcPipeline?: {
    draftCount: number;
    draftValue: number;
    activeCount: number;
    expiringSoonCount: number;
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
  recentServiceReports?: Array<{
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
  workDistribution?: Array<{
    label: string;
    count: number;
    color?: string;
    category?: 'PM' | 'BREAKDOWN';
  }>;
  trendData: Array<{ label: string; date: string; value: number; secondaryValue: number }>;
}

export interface OverallAnalytics {
  summary: DashboardSummary;
  totals: {
    activeCustomers: number;
    totalAssets: number;
    reportsThisMonth: number;
  };
  issueCategoryBreakdown: Array<{ category: string; count: number }>;
  technicianPerformance: Array<{ technicianId: string; name: string; completedThisMonth: number }>;
}

export const analyticsApi = {
  getDashboardSummary: () => apiClient.get<DashboardSummary>('/analytics/dashboard-summary'),
  getOverallAnalytics: () => apiClient.get<OverallAnalytics>('/analytics/overall'),
};
