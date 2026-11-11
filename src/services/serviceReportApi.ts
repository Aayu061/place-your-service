import { apiClient } from '@/services/api/client';
import {
  ServiceVisitReport,
  CreateServiceReportPayload,
  UpdateServiceReportPayload,
  CreateFollowUpSchedulePayload,
  ServiceReportFilterParams,
  ServiceReportSummaryCounts,
} from '@/domain/types';

export interface ServiceReportsListResponse {
  reports: ServiceVisitReport[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary?: ServiceReportSummaryCounts;
}

export interface ServiceReportEmailDelivery {
  id: string;
  recipient_email: string;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  transport: string | null;
  provider_message_id: string | null;
  created_at: string;
  sent_at: string | null;
}

export const serviceReportApi = {
  getReports: (params?: ServiceReportFilterParams) =>
    apiClient.get<ServiceReportsListResponse>('/service-reports', { params }),

  getReportById: (id: string) =>
    apiClient.get<{ report: ServiceVisitReport }>(`/service-reports/${id}`),

  getReportByScheduleId: (scheduleId: string) =>
    apiClient.get<{ report: ServiceVisitReport | null }>(`/service-reports/by-schedule/${scheduleId}`),

  getNextReportNumber: () =>
    apiClient.get<{ nextReportNumber: string }>('/service-reports/next-number'),

  createReport: (payload: CreateServiceReportPayload) =>
    apiClient.post<{ report: ServiceVisitReport }>('/service-reports', payload),

  updateReport: (id: string, payload: UpdateServiceReportPayload) =>
    apiClient.patch<{ report: ServiceVisitReport }>(`/service-reports/${id}`, payload),

  verifyReport: (id: string) =>
    apiClient.patch<{ report: ServiceVisitReport }>(`/service-reports/${id}/verify`, {}),

  sendReportEmail: (id: string) =>
    apiClient.post<{ delivery: ServiceReportEmailDelivery; processed: number }>(`/service-reports/${id}/email`),

  listEmailDeliveries: (id: string) =>
    apiClient.get<{ deliveries: ServiceReportEmailDelivery[] }>(`/service-reports/${id}/email-deliveries`),

  retryEmailDelivery: (reportId: string, deliveryId: string) =>
    apiClient.post<{ delivery: ServiceReportEmailDelivery; processed: number }>(`/service-reports/${reportId}/email-deliveries/${deliveryId}/retry`),

  createFollowUp: (id: string, payload: CreateFollowUpSchedulePayload) =>
    apiClient.post<{ report: ServiceVisitReport }>(`/service-reports/${id}/follow-up`, payload),
};
