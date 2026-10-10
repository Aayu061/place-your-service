import { apiClient } from '@/services/api/client';
import {
  ServiceSchedule,
  CreateServiceSchedulePayload,
  UpdateServiceSchedulePayload,
  AssignTechnicianPayload,
  ReassignTechnicianPayload,
  ReschedulePayload,
  CancelSchedulePayload,
  ScheduleFilterParams,
  TechnicianRecommendationItem,
  UnscheduledWorkItem,
} from '@/domain/types';

export interface SchedulesListResponse {
  schedules: ServiceSchedule[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const scheduleApi = {
  getSchedules: (params?: ScheduleFilterParams) =>
    apiClient.get<SchedulesListResponse>('/service-schedules', { params }),

  getCalendar: (startDate: string, endDate: string, technicianId?: string) =>
    apiClient.get<{ schedules: ServiceSchedule[] }>('/service-schedules/calendar', {
      params: { startDate, endDate, technicianId },
    }),

  getUnscheduledWork: () =>
    apiClient.get<{ items: UnscheduledWorkItem[] }>('/service-schedules/unscheduled-work'),

  getScheduleById: (id: string) =>
    apiClient.get<{ schedule: ServiceSchedule }>(`/service-schedules/${id}`),

  createSchedule: (payload: CreateServiceSchedulePayload) =>
    apiClient.post<{ schedule: ServiceSchedule }>('/service-schedules', payload),

  updateSchedule: (id: string, payload: UpdateServiceSchedulePayload) =>
    apiClient.patch<{ schedule: ServiceSchedule }>(`/service-schedules/${id}`, payload),

  getEligibleTechnicians: (scheduleId: string, date?: string, startTime?: string, endTime?: string) =>
    apiClient.get<{ recommendations: TechnicianRecommendationItem[] }>(
      `/service-schedules/${scheduleId}/eligible-technicians`,
      { params: { date, startTime, endTime } }
    ),

  assignTechnician: (scheduleId: string, payload: AssignTechnicianPayload) =>
    apiClient.post<{ schedule: ServiceSchedule }>(`/service-schedules/${scheduleId}/assign`, payload),

  reassignTechnician: (scheduleId: string, payload: ReassignTechnicianPayload) =>
    apiClient.post<{ schedule: ServiceSchedule }>(`/service-schedules/${scheduleId}/reassign`, payload),

  reschedule: (scheduleId: string, payload: ReschedulePayload) =>
    apiClient.post<{ schedule: ServiceSchedule }>(`/service-schedules/${scheduleId}/reschedule`, payload),

  cancelSchedule: (scheduleId: string, payload: CancelSchedulePayload) =>
    apiClient.post<{ schedule: ServiceSchedule }>(`/service-schedules/${scheduleId}/cancel`, payload),
};
