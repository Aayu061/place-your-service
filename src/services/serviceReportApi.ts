import { apiClient } from '@/services/api/client';
import {
  ServiceVisitReport,
  CreateServiceReportPayload,
  CreateFollowUpSchedulePayload,
  ServiceReportFilterParams,
} from '@/domain/types';

export interface ServiceReportsListResponse {
  reports: ServiceVisitReport[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const serviceReportApi = {
  getReports: (params?: ServiceReportFilterParams) =>
    apiClient.get<ServiceReportsListResponse>('/service-reports', { params }),

  getReportById: (id: string) =>
    apiClient.get<{ report: ServiceVisitReport }>(`/service-reports/${id}`),

  getReportByScheduleId: (scheduleId: string) =>
    apiClient.get<{ report: ServiceVisitReport | null }>(`/service-reports/by-schedule/${scheduleId}`),

  createReport: (payload: CreateServiceReportPayload) =>
    apiClient.post<{ report: ServiceVisitReport }>('/service-reports', payload),

  updateReport: (id: string, payload: Partial<CreateServiceReportPayload>) =>
    apiClient.patch<{ report: ServiceVisitReport }>(`/service-reports/${id}`, payload),

  createFollowUp: (id: string, payload: CreateFollowUpSchedulePayload) =>
    apiClient.post<{ report: ServiceVisitReport }>(`/service-reports/${id}/follow-up`, payload),
};
