import { apiClient } from './api/client';

export interface TechUser {
  id: string;
  technicianCode: string;
  name: string;
  phone: string;
  email: string | null;
  status: 'AVAILABLE' | 'BUSY' | 'ON_DUTY' | 'OFF_DUTY';
  specializations?: string[];
}

export interface TechJob {
  id: string;
  schedule_number: string;
  status: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  planned_service_type?: string | null;
  notes?: string | null;
  amc_id?: string | null;
  service_request_id?: string | null;
  customers?: {
    id: string;
    name: string;
    phone: string;
    customer_code?: string;
  } | null;
  sites?: {
    id: string;
    site_name: string;
    address: string;
    city?: string;
    landmark?: string;
    pincode?: string;
  } | null;
  ac_assets?: {
    id: string;
    brand?: string;
    model_number?: string;
    room_location?: string;
    asset_tag?: string;
    serial_number?: string;
    tonnage?: number;
    refrigerant_type?: string;
  } | null;
}

const TECH_TOKEN_KEY = 'pys_tech_token';
const TECH_USER_KEY = 'pys_tech_user';

export const technicianApi = {
  getToken(): string | null {
    return localStorage.getItem(TECH_TOKEN_KEY);
  },

  getStoredTech(): TechUser | null {
    const raw = localStorage.getItem(TECH_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TechUser;
    } catch {
      return null;
    }
  },

  setSession(token: string, tech: TechUser) {
    localStorage.setItem(TECH_TOKEN_KEY, token);
    localStorage.setItem(TECH_USER_KEY, JSON.stringify(tech));
  },

  clearSession() {
    localStorage.removeItem(TECH_TOKEN_KEY);
    localStorage.removeItem(TECH_USER_KEY);
  },

  async login(identifier: string, pin: string): Promise<{ token: string; technician: TechUser }> {
    const response = await apiClient.post<{ token: string; technician: TechUser }>(
      '/api/v1/tech/login',
      { identifier, pin }
    );
    this.setSession(response.token, response.technician);
    return response;
  },

  async getProfile(): Promise<TechUser & { metrics: { assignedToday: number; completedToday: number; pendingToday: number } }> {
    const token = this.getToken();
    const response = await apiClient.get<TechUser & { metrics: { assignedToday: number; completedToday: number; pendingToday: number } }>(
      '/api/v1/tech/me',
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response;
  },

  async updateStatus(status: 'AVAILABLE' | 'BUSY' | 'OFF_DUTY'): Promise<{ status: string }> {
    const token = this.getToken();
    const response = await apiClient.patch<{ status: string }>('/api/v1/tech/status', { status }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const current = this.getStoredTech();
    if (current) {
      current.status = status;
      localStorage.setItem(TECH_USER_KEY, JSON.stringify(current));
    }
    return response;
  },

  async getJobs(date?: string): Promise<TechJob[]> {
    const token = this.getToken();
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const response = await apiClient.get<TechJob[]>(`/api/v1/tech/jobs${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response || [];
  },

  async getJobDetail(scheduleId: string): Promise<{ schedule: TechJob; existingReport: any | null }> {
    const token = this.getToken();
    const response = await apiClient.get<{ schedule: TechJob; existingReport: any | null }>(
      `/api/v1/tech/jobs/${scheduleId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response;
  },

  async submitFieldReport(payload: any): Promise<any> {
    const token = this.getToken();
    const response = await apiClient.post<any>('/api/v1/tech/service-reports', payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response;
  },
};
