import { apiClient } from './api/client';

export interface TechUser {
  id: string;
  technicianCode: string;
  technician_code?: string;
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
  service_requests?: {
    id: string;
    request_number?: string;
    request_type?: string;
    issue_category?: string | null;
    description?: string;
    priority?: string;
  } | null;
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

export interface TechDailyAnalytics {
  today: {
    totalAssigned: number;
    completed: number;
    inProgress: number;
    pending: number;
    completionRatePercent: number;
  };
  weekly: {
    totalCompleted: number;
    breakdownCompleted: number;
    amcCompleted: number;
    avgDurationMinutes: number;
    customerSignOffRatePercent: number;
  };
  dailyTrend: Array<{
    date: string;
    dayName: string;
    totalCompleted: number;
    breakdownCount: number;
    amcCount: number;
  }>;
}

export interface TechExistingReportRef {
  id: string;
  reportNumber: string;
  status?: string;
}

export interface TechCompletedReportSummary {
  id: string;
  report_number: string;
  service_date?: string | null;
  primary_outcome?: string | null;
  customer_signature_url?: string | null;
  customers?: { name?: string | null } | null;
}

export interface TechFieldReportPayload {
  scheduleId: string;
  manualReportNumber: string;
  assistantName?: string | null;
  reportedVisitDate: string;
  startTime: string;
  endTime: string;
  serviceExecutionType: string;
  primaryOutcome: string;
  workDescription?: string | null;
  technicianRemarks: string;
  customerRepresentative: string;
  customerAcknowledgement: string;
  signatureDataUrl?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
  paymentCollected?: boolean;
  paymentAmount?: number;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  emailToCustomer?: boolean;
  assets: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
}

export interface TechWorkSummary {
  activeSchedules: TechJob[];
  completedReports: TechCompletedReportSummary[];
  totalCompletedReports: number;
}

const TECH_TOKEN_KEY = 'pys_tech_token';
const TECH_USER_KEY = 'pys_tech_user';

export const technicianApi = {
  getToken(): string | null {
    return localStorage.getItem(TECH_TOKEN_KEY) || sessionStorage.getItem(TECH_TOKEN_KEY);
  },

  getStoredTech(): TechUser | null {
    const raw = localStorage.getItem(TECH_USER_KEY) || sessionStorage.getItem(TECH_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TechUser;
    } catch {
      return null;
    }
  },

  setSession(token: string, tech: TechUser, rememberMe = true) {
    if (rememberMe) {
      localStorage.setItem(TECH_TOKEN_KEY, token);
      localStorage.setItem(TECH_USER_KEY, JSON.stringify(tech));
      sessionStorage.removeItem(TECH_TOKEN_KEY);
      sessionStorage.removeItem(TECH_USER_KEY);
    } else {
      sessionStorage.setItem(TECH_TOKEN_KEY, token);
      sessionStorage.setItem(TECH_USER_KEY, JSON.stringify(tech));
      localStorage.removeItem(TECH_TOKEN_KEY);
      localStorage.removeItem(TECH_USER_KEY);
    }
  },

  clearSession() {
    localStorage.removeItem(TECH_TOKEN_KEY);
    localStorage.removeItem(TECH_USER_KEY);
    sessionStorage.removeItem(TECH_TOKEN_KEY);
    sessionStorage.removeItem(TECH_USER_KEY);
  },

  async login(identifier: string, pin: string, rememberMe = true): Promise<{ token: string; technician: TechUser }> {
    const response = await apiClient.post<{ token: string; technician: TechUser }>(
      '/api/v1/tech/login',
      { identifier, pin }
    );
    this.setSession(response.token, response.technician, rememberMe);
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
      if (localStorage.getItem(TECH_USER_KEY)) {
        localStorage.setItem(TECH_USER_KEY, JSON.stringify(current));
      }
      if (sessionStorage.getItem(TECH_USER_KEY)) {
        sessionStorage.setItem(TECH_USER_KEY, JSON.stringify(current));
      }
    }
    return response;
  },

  async getJobs(date?: string, includeOverdue = false): Promise<TechJob[]> {
    const token = this.getToken();
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (includeOverdue) params.set('includeOverdue', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await apiClient.get<TechJob[]>(`/api/v1/tech/jobs${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response || [];
  },

  async updateJobStatus(scheduleId: string, status: string): Promise<TechJob> {
    const token = this.getToken();
    const response = await apiClient.patch<TechJob>(
      `/api/v1/tech/jobs/${scheduleId}/status`,
      { status },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response;
  },

  async getAnalytics(date?: string): Promise<TechDailyAnalytics> {
    const token = this.getToken();
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const response = await apiClient.get<TechDailyAnalytics>(
      `/api/v1/tech/analytics${query}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response;
  },

  async getJobDetail(scheduleId: string): Promise<{
    schedule: TechJob;
    existingReport: TechExistingReportRef | null;
    suggestedReportNumber?: string;
    siteAssets?: NonNullable<TechJob['ac_assets']>[];
  }> {
    const token = this.getToken();
    const response = await apiClient.get<{
      schedule: TechJob;
      existingReport: TechExistingReportRef | null;
      suggestedReportNumber?: string;
      siteAssets?: NonNullable<TechJob['ac_assets']>[];
    }>(
      `/api/v1/tech/jobs/${scheduleId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response;
  },

  async submitFieldReport(payload: TechFieldReportPayload): Promise<TechExistingReportRef> {
    const token = this.getToken();
    const response = await apiClient.post<TechExistingReportRef>('/api/v1/tech/service-reports', payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response;
  },

  async updatePin(currentPin: string, newPin: string): Promise<{ updated: boolean }> {
    const token = this.getToken();
    return apiClient.patch<{ updated: boolean }>(
      '/api/v1/tech/pin',
      { currentPin, newPin },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  },

  async createMediaUploadUrl(body: {
    scope: 'before-photo' | 'after-photo' | 'signature';
    mimeType: 'image/jpeg' | 'image/jpg' | 'image/png' | 'image/webp';
    entityRef?: string;
  }): Promise<{ bucket: string; path: string; signedUrl: string; token: string; expiresInSeconds: number }> {
    const token = this.getToken();
    return apiClient.post('/api/v1/tech/media/upload-url', body, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  async getMediaSignedUrl(path: string): Promise<{ signedUrl: string }> {
    const token = this.getToken();
    return apiClient.get(`/api/v1/tech/media/signed-url?path=${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  async getWorkSummary(techId: string): Promise<TechWorkSummary> {
    const response = await apiClient.get<TechWorkSummary>(
      `/api/v1/technicians/${techId}/work-summary`
    );
    return response;
  },
};
