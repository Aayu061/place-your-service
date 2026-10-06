/**
 * Place Your Service — Server Type Definitions
 */

export type UserRole = 'ADMIN' | 'STAFF';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  profileId: string;
  staffId?: string;
  isActive: boolean;
}

export interface ApiResponseMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  [key: string]: unknown;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: ApiResponseMeta;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface HealthCheckData {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  database?: {
    connected: boolean;
    latencyMs?: number;
    error?: string;
  };
}
