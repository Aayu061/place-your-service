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

export interface StaffMember {
  id: string;
  profileId: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  fullName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
}

export interface UserProfileResponse {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  profileId: string;
  staffId?: string;
  isActive: boolean;
  phone?: string | null;
  avatarUrl?: string | null;
}

