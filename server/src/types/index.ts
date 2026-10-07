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

/* --------------------------------------------------
 * Customer Management Types (Phase 4)
 * -------------------------------------------------- */

export type CustomerType = 'TEMPORARY' | 'PERMANENT';

export interface CustomerSiteSummary {
  id: string;
  siteName: string;
  address: string;
  contactPerson?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

export interface CustomerResponse {
  id: string;
  customerCode: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string;
  alternatePhone: string | null;
  address: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  customerType: CustomerType;
  notes: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  siteName?: string | null;
  siteContactPerson?: string | null;
  siteContactPhone?: string | null;
  sitesCount?: number;
  primarySite?: CustomerSiteSummary | null;
}

export interface CreateCustomerPayload {
  name: string;
  customerType?: CustomerType;
  companyName?: string;
  email?: string;
  phone: string;
  alternatePhone?: string;
  address: string;
  city?: string;
  state?: string;
  postalCode?: string;
  notes?: string;
  siteName?: string;
  siteContactPerson?: string;
  siteContactPhone?: string;
}

export interface UpdateCustomerPayload {
  name?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  alternatePhone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  notes?: string;
  siteName?: string;
  siteContactPerson?: string;
  siteContactPhone?: string;
}

export interface CustomerListQuery {
  search?: string;
  type?: 'ALL' | CustomerType;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  page?: number;
  pageSize?: number;
  sortBy?: 'created_at' | 'name' | 'customer_code';
  sortOrder?: 'asc' | 'desc';
}

