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

/* --------------------------------------------------
 * Customer Site Management Types (Phase 5)
 * -------------------------------------------------- */

export interface SiteResponse {
  id: string;
  customerId: string;
  siteName: string;
  address: string;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  isPrimary: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  customerName?: string | null;
  customerCode?: string | null;
  assetCount?: number;
}

export interface CreateSitePayload {
  siteName: string;
  address: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  isPrimary?: boolean;
  notes?: string;
}

export interface UpdateSitePayload {
  siteName?: string;
  address?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  isPrimary?: boolean;
  notes?: string;
}

export interface SiteListQuery {
  search?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  page?: number;
  pageSize?: number;
}

/* --------------------------------------------------
 * AC Asset Register Types (Phase 5)
 * -------------------------------------------------- */

export type AcType =
  | 'SPLIT'
  | 'WINDOW'
  | 'CASSETTE'
  | 'PACKAGE'
  | 'TOWER'
  | 'DUCTABLE'
  | 'VRV_VRF'
  | 'OTHER';

export type WarrantyStatus =
  | 'UNDER_WARRANTY'
  | 'EXPIRED'
  | 'AMC_COVERED'
  | 'OUT_OF_WARRANTY';

export interface AcAssetResponse {
  id: string;
  assetTag: string;
  siteId: string;
  customerId: string;
  brand: string;
  modelNumber: string | null;
  serialNumber: string | null;
  acType: AcType;
  capacityTons: number | null;
  installationDate: string | null;
  floorLocation: string | null;
  roomLocation: string | null;
  refrigerantType: string | null;
  warrantyStatus: WarrantyStatus;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  siteName?: string | null;
  customerName?: string | null;
  customerCode?: string | null;
}

export interface CreateAcAssetPayload {
  assetTag?: string;
  brand: string;
  modelNumber?: string;
  serialNumber?: string;
  acType: AcType;
  capacityTons?: number;
  installationDate?: string;
  floorLocation?: string;
  roomLocation?: string;
  refrigerantType?: string;
  warrantyStatus?: WarrantyStatus;
  notes?: string;
}

export interface UpdateAcAssetPayload {
  brand?: string;
  modelNumber?: string;
  serialNumber?: string;
  acType?: AcType;
  capacityTons?: number;
  installationDate?: string;
  floorLocation?: string;
  roomLocation?: string;
  refrigerantType?: string;
  warrantyStatus?: WarrantyStatus;
  notes?: string;
}

export interface AcAssetListQuery {
  search?: string;
  acType?: 'ALL' | AcType;
  warrantyStatus?: 'ALL' | WarrantyStatus;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  page?: number;
  pageSize?: number;
}

/* --------------------------------------------------
 * Service Request Management Types (Phase 6)
 * -------------------------------------------------- */

export type ServiceRequestType =
  | 'BREAKDOWN'
  | 'COMPLAINT'
  | 'REPAIR'
  | 'EMERGENCY'
  | 'INSTALLATION'
  | 'GENERAL_SERVICE'
  | 'INSPECTION'
  | 'PREVENTIVE_MAINTENANCE'
  | 'UNPLANNED_OTHER'
  | 'OTHER';

export type ServiceRequestPriority =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'URGENT'
  | 'EMERGENCY';

export type ServiceRequestStatus =
  | 'REQUESTED'
  | 'PENDING'
  | 'SCHEDULED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'AWAITING_PARTS'
  | 'ON_HOLD'
  | 'REVISIT_REQUIRED'
  | 'RESOLVED'
  | 'COMPLETED'
  | 'PAYMENT'
  | 'CLOSED'
  | 'CANCELLED';

export interface ServiceRequestResponse {
  id: string;
  requestNumber: string;
  customerId: string;
  siteId: string;
  assetId: string | null;
  requestType: ServiceRequestType;
  priority: ServiceRequestPriority;
  description: string;
  reportedDate: string;
  preferredDate: string | null;
  status: ServiceRequestStatus;
  notes: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Relational details
  customerName?: string | null;
  customerCode?: string | null;
  customerPhone?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  assetTag?: string | null;
  assetBrand?: string | null;
  assetModel?: string | null;
}

export interface CreateServiceRequestPayload {
  customerId: string;
  siteId: string;
  assetId?: string | null;
  requestType: ServiceRequestType;
  priority?: ServiceRequestPriority;
  description: string;
  preferredDate?: string | null;
  notes?: string | null;
}

export interface UpdateServiceRequestPayload {
  requestType?: ServiceRequestType;
  priority?: ServiceRequestPriority;
  description?: string;
  preferredDate?: string | null;
  notes?: string | null;
  siteId?: string;
  assetId?: string | null;
}

export interface UpdateServiceRequestStatusPayload {
  status: ServiceRequestStatus;
  reason?: string;
}

export interface CancelServiceRequestPayload {
  reason?: string;
}

export interface ServiceRequestListQuery {
  search?: string;
  status?: 'ALL' | ServiceRequestStatus;
  priority?: 'ALL' | ServiceRequestPriority;
  requestType?: 'ALL' | ServiceRequestType;
  customerId?: string;
  siteId?: string;
  assetId?: string;
  page?: number;
  pageSize?: number;
}

// ----------------------------------------------------
// Phase 7: Technician Management Types
// ----------------------------------------------------

export type TechnicianOperationalStatus =
  | 'AVAILABLE'
  | 'BUSY'
  | 'ON_LEAVE'
  | 'OFF_DUTY'
  | 'INACTIVE';

export type WeekDay =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export interface TechnicianWorkingHours {
  start: string;
  end: string;
}

export interface TechnicianAvailability {
  workingDays: WeekDay[];
  workingHours: TechnicianWorkingHours;
  notes?: string;
}

export interface TechnicianResponse {
  id: string;
  technicianCode: string;
  name: string;
  phone: string;
  email: string | null;
  specializations: string[];
  skills: string[]; // Compatibility alias for specializations
  serviceAreas: string[];
  serviceArea?: string; // Compatibility alias
  status: TechnicianOperationalStatus;
  isActive: boolean;
  maxDailyWorkload: number;
  currentWorkload: number;
  joiningDate: string | null;
  notes: string | null;
  workingDays?: WeekDay[];
  workingHours?: TechnicianWorkingHours;
  availability?: TechnicianAvailability;
  activeAssignmentsCount?: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTechnicianPayload {
  name: string;
  phone: string;
  email?: string | null;
  specializations?: string[];
  skills?: string[];
  serviceAreas?: string[];
  status?: TechnicianOperationalStatus;
  maxDailyWorkload?: number;
  joiningDate?: string | null;
  notes?: string | null;
  workingDays?: WeekDay[];
  workingHours?: TechnicianWorkingHours;
  availability?: TechnicianAvailability;
}

export interface UpdateTechnicianPayload {
  name?: string;
  phone?: string;
  email?: string | null;
  specializations?: string[];
  skills?: string[];
  serviceAreas?: string[];
  status?: TechnicianOperationalStatus;
  maxDailyWorkload?: number;
  joiningDate?: string | null;
  notes?: string | null;
  workingDays?: WeekDay[];
  workingHours?: TechnicianWorkingHours;
  availability?: TechnicianAvailability;
}

export interface UpdateTechnicianStatusPayload {
  status?: TechnicianOperationalStatus;
  isActive?: boolean;
  reason?: string;
}

export interface TechnicianListQuery {
  search?: string;
  status?: 'ALL' | TechnicianOperationalStatus;
  isActive?: boolean | 'ALL';
  skill?: string;
  serviceArea?: string;
  page?: number;
  pageSize?: number;
}


