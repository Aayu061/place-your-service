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
 * AC Master Data & Asset Register Types (Phase 5 / Upgrade)
 * -------------------------------------------------- */

export type AcType =
  | 'SPLIT'
  | 'WINDOW'
  | 'CASSETTE'
  | 'PACKAGE'
  | 'TOWER'
  | 'DUCTABLE'
  | 'VRV_VRF'
  | 'FLOOR_STANDING'
  | 'CEILING_SUSPENDED'
  | 'PORTABLE'
  | 'CENTRAL'
  | 'OTHER'
  | string;

export type WarrantyStatus =
  | 'UNDER_WARRANTY'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'AMC_COVERED'
  | 'OUT_OF_WARRANTY';

export type AssetStatus =
  | 'Active'
  | 'Under Service'
  | 'Under Repair'
  | 'Temporarily Inactive'
  | 'Decommissioned'
  | 'Replaced'
  | 'Scrapped';

export type AssetCondition =
  | 'Excellent'
  | 'Good'
  | 'Fair'
  | 'Needs Maintenance'
  | 'Poor'
  | 'Critical';

export interface AcBrandResponse {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  modelCount?: number;
}

export interface CreateAcBrandPayload {
  name: string;
  code?: string;
  isActive?: boolean;
}

export interface UpdateAcBrandPayload {
  name?: string;
  code?: string;
  isActive?: boolean;
}

export interface AcBrandListQuery {
  search?: string;
  activeOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface AcModelResponse {
  id: string;
  brandId: string;
  brandName?: string | null;
  brandCode?: string | null;
  modelNumber: string;
  acType: string | null;
  technology: string | null;
  capacityTons: number | null;
  rating: string | null;
  refrigerant: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAcModelPayload {
  brandId: string;
  modelNumber: string;
  acType?: string;
  technology?: string;
  capacityTons?: number;
  rating?: string;
  refrigerant?: string;
  isActive?: boolean;
}

export interface UpdateAcModelPayload {
  modelNumber?: string;
  acType?: string;
  technology?: string;
  capacityTons?: number;
  rating?: string;
  refrigerant?: string;
  isActive?: boolean;
}

export interface AcModelListQuery {
  brandId?: string;
  search?: string;
  activeOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface AcModelVariantResponse {
  id: string;
  modelId: string;
  variantCode?: string | null;
  capacityTons: number;
  capacityDisplay?: string | null;
  starRating: string;
  acType: string;
  technology: string;
  refrigerant?: string | null;
  series?: string | null;
  sourceProvenance?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AcAssetResponse {
  id: string;
  assetTag: string;
  siteId: string;
  customerId: string;
  brand: string;
  brandId?: string | null;
  modelNumber: string | null;
  modelId?: string | null;
  variantId?: string | null;
  serialNumber: string | null;
  indoorSerialNumber?: string | null;
  outdoorSerialNumber?: string | null;
  acType: AcType;
  technology?: string | null;
  capacityTons: number | null;
  starRating?: string | null;
  installationDate: string | null;
  purchaseDate?: string | null;
  warrantyStartDate?: string | null;
  warrantyEndDate?: string | null;
  floorLocation: string | null;
  roomLocation: string | null;
  refrigerantType: string | null;
  warrantyStatus: WarrantyStatus;
  assetStatus?: AssetStatus;
  assetCondition?: AssetCondition;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  siteName?: string | null;
  customerName?: string | null;
  customerCode?: string | null;
  currentAmc?: AssetCurrentAmcSummary | null;
}

export interface AssetCurrentAmcSummary {
  id: string;
  contractNumber: string;
  status: string;
  startDate: string;
  endDate: string;
  frequency: string;
  totalVisits: number;
  completedVisits: number;
  remainingVisits: number;
}

export interface CreateAcAssetPayload {
  siteId?: string;
  assetTag?: string;
  brand: string;
  brandId?: string;
  modelNumber?: string;
  modelId?: string;
  variantId?: string;
  serialNumber?: string;
  indoorSerialNumber?: string;
  outdoorSerialNumber?: string;
  acType: AcType;
  technology?: string;
  capacityTons?: number;
  starRating?: string;
  installationDate?: string;
  purchaseDate?: string;
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  floorLocation?: string;
  roomLocation?: string;
  refrigerantType?: string;
  warrantyStatus?: WarrantyStatus;
  assetStatus?: AssetStatus;
  assetCondition?: AssetCondition;
  notes?: string;
}

export interface UpdateAcAssetPayload {
  brand?: string;
  brandId?: string;
  modelNumber?: string;
  modelId?: string;
  variantId?: string;
  serialNumber?: string;
  indoorSerialNumber?: string;
  outdoorSerialNumber?: string;
  acType?: AcType;
  technology?: string;
  capacityTons?: number;
  starRating?: string;
  installationDate?: string;
  purchaseDate?: string;
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  floorLocation?: string;
  roomLocation?: string;
  refrigerantType?: string;
  warrantyStatus?: WarrantyStatus;
  assetStatus?: AssetStatus;
  assetCondition?: AssetCondition;
  notes?: string;
}

export interface AcAssetListQuery {
  siteId?: string;
  customerId?: string;
  search?: string;
  acType?: 'ALL' | AcType;
  warrantyStatus?: 'ALL' | WarrantyStatus;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  assetStatus?: string;
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

/* --------------------------------------------------
 * AMC Contracts & Preventive Maintenance Types (Phase 8)
 * -------------------------------------------------- */

export type AmcFrequency = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';

export type AmcStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'RENEWED';

export type ServiceScheduleStatus =
  | 'SCHEDULED'
  | 'PLANNED'
  | 'DUE'
  | 'OVERDUE'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'CANCELLED'
  | 'RESCHEDULED';

export interface AmcPlanResponse {
  id: string;
  planCode: string;
  name: string;
  description: string | null;
  defaultFrequency: AmcFrequency;
  defaultVisitsPerYear: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AmcCoveredAssetResponse {
  id: string;
  amcId: string;
  assetId: string;
  assetTag: string;
  siteId: string;
  siteName: string | null;
  brand: string;
  modelNumber: string | null;
  serialNumber: string | null;
  acType: AcType;
  capacityTons: number | null;
  roomLocation: string | null;
  floorLocation: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ServiceAssignmentSummary {
  id: string;
  technicianId: string;
  technicianCode: string;
  technicianName: string;
  technicianPhone: string;
  assignedBy: string;
  assignedByName?: string | null;
  assignedAt: string;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  isOverride: boolean;
  overrideReason?: string | null;
  status: 'ASSIGNED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'COMPLETED' | 'REASSIGNED' | 'CANCELLED';
  createdAt: string;
}

export interface ServiceScheduleResponse {
  id: string;
  scheduleNumber: string;
  amcId: string | null;
  amcContractNumber?: string | null;
  serviceRequestId?: string | null;
  serviceRequestNumber?: string | null;
  serviceRequestType?: ServiceRequestType | null;
  serviceRequestPriority?: ServiceRequestPriority | null;
  customerId?: string | null;
  customerName?: string | null;
  customerCode?: string | null;
  customerPhone?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  assetId: string | null;
  assetTag?: string | null;
  brand?: string | null;
  modelNumber?: string | null;
  acType?: string | null;
  roomLocation?: string | null;
  scheduledDate: string;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  visitNumber: number | null;
  status: ServiceScheduleStatus;
  isSystemGenerated: boolean;
  technicianId?: string | null;
  technicianName?: string | null;
  technicianCode?: string | null;
  technicianPhone?: string | null;
  activeAssignment?: ServiceAssignmentSummary | null;
  assignmentHistory?: ServiceAssignmentSummary[];
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  rescheduledFromId?: string | null;
  pmObligationId?: string | null;
  notes: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/* --------------------------------------------------
 * Phase 9 Scheduling & Assignment Types
 * -------------------------------------------------- */

export interface CreateServiceSchedulePayload {
  serviceRequestId?: string;
  pmObligationId?: string;
  amcId?: string;
  assetId?: string;
  visitNumber?: number;
  customerId?: string;
  siteId?: string;
  scheduledDate: string; // YYYY-MM-DD
  startTime?: string;    // HH:mm (default 09:00)
  endTime?: string;      // HH:mm (default 11:00)
  durationMinutes?: number;
  notes?: string;
  technicianId?: string;
  isOverride?: boolean;
  overrideReason?: string;
}

export interface UpdateServiceSchedulePayload {
  scheduledDate?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  notes?: string;
}

export interface AssignTechnicianPayload {
  technicianId: string;
  scheduledStartTime?: string; // ISO string or HH:mm
  scheduledEndTime?: string;   // ISO string or HH:mm
  isOverride?: boolean;
  overrideReason?: string;
}

export interface ReassignTechnicianPayload {
  technicianId: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  isOverride?: boolean;
  overrideReason?: string;
}

export interface ReschedulePayload {
  scheduledDate: string;       // YYYY-MM-DD
  startTime?: string;          // HH:mm
  endTime?: string;            // HH:mm
  durationMinutes?: number;
  technicianId?: string;       // Optional re-confirmed or new technician
  reason?: string;
  isOverride?: boolean;
  overrideReason?: string;
}

export interface CancelSchedulePayload {
  reason: string;
}

export interface ScheduleListQuery {
  search?: string;
  status?: 'ALL' | ServiceScheduleStatus;
  date?: string;               // Exact date YYYY-MM-DD
  startDate?: string;          // Range start YYYY-MM-DD
  endDate?: string;            // Range end YYYY-MM-DD
  technicianId?: string;
  customerId?: string;
  siteId?: string;
  serviceRequestId?: string;
  amcId?: string;
  page?: number;
  pageSize?: number;
}

export interface CalendarScheduleQuery {
  startDate: string;           // YYYY-MM-DD
  endDate: string;             // YYYY-MM-DD
  technicianId?: string;
  status?: 'ALL' | ServiceScheduleStatus;
}

export interface ScoreBreakdown {
  areaScore: number;          // 0 or 40
  availabilityScore: number;  // 0 or 20
  proximityScore: number;     // 0 (documented as 0/N/A without live GPS)
  workloadScore: number;      // 0 to 10
  skillScore: number;         // 0 to 10
}

export interface TechnicianRecommendationItem {
  technicianId: string;
  technicianCode: string;
  name: string;
  phone: string;
  specializations: string[];
  serviceAreas: string[];
  status: TechnicianOperationalStatus;
  isActive: boolean;
  isEligible: boolean;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  areaMatch: boolean;
  isAvailable: boolean;
  skillMatch: boolean;
  hasConflict: boolean;
  dailyWorkload: number;
  maxDailyWorkload: number;
  reasons: string[];
  warnings: string[];
  conflictDetails?: {
    scheduleId: string;
    scheduleNumber: string;
    startTime: string;
    endTime: string;
  };
}

export interface UnscheduledWorkItem {
  type: 'SERVICE_REQUEST' | 'PM_OBLIGATION';
  id: string;
  identifier: string; // e.g. SR-2026-0001 or PM-2026-0002
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  siteId?: string | null;
  siteName: string;
  siteAddress: string;
  assetId: string | null;
  assetTag: string | null;
  brand: string | null;
  modelNumber: string | null;
  acType: string | null;
  dueDate: string;
  priority?: string;
  description?: string;
  amcId?: string;
  amcContractNumber?: string;
  visitNumber?: number | null;
  suggestedDurationMinutes: number;
}

export interface AmcContractResponse {
  id: string;
  contractNumber: string;
  customerId: string;
  customerName?: string | null;
  customerCode?: string | null;
  customerPhone?: string | null;
  planId: string | null;
  planName?: string | null;
  planCode?: string | null;
  startDate: string;
  endDate: string;
  frequency: AmcFrequency;
  totalAmount: number;
  totalVisits: number;
  status: AmcStatus;
  notes: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  previousContractId: string | null;
  coveredAssetsCount: number;
  coveredAssets?: AmcCoveredAssetResponse[];
  schedulesCount: number;
  completedVisitsCount: number;
  remainingVisitsCount: number;
  nextPmDate: string | null;
  isExpiringSoon: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAmcContractPayload {
  customerId: string;
  planId?: string | null;
  startDate: string;
  endDate: string;
  frequency: AmcFrequency;
  totalAmount: number;
  totalVisits: number;
  coveredAssetIds?: string[];
  status?: AmcStatus;
  notes?: string | null;
}

export interface UpdateAmcContractPayload {
  planId?: string | null;
  startDate?: string;
  endDate?: string;
  frequency?: AmcFrequency;
  totalAmount?: number;
  totalVisits?: number;
  notes?: string | null;
}

export interface UpdateAmcStatusPayload {
  status: AmcStatus;
  reason?: string;
}

export interface CancelAmcContractPayload {
  reason: string;
}

export interface AddAmcAssetsPayload {
  assetIds: string[];
}

export interface GeneratePmPayload {
  assetIds?: string[];
}

export interface PmGenerationResult {
  contractId: string;
  contractNumber: string;
  generatedCount: number;
  existingCount: number;
  skippedCount: number;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  generatedDates: string[];
  schedules: ServiceScheduleResponse[];
}

export interface RenewAmcContractPayload {
  startDate: string;
  endDate: string;
  frequency?: AmcFrequency;
  totalAmount?: number;
  totalVisits?: number;
  coveredAssetIds?: string[];
  planId?: string | null;
  notes?: string | null;
}

export interface AssetAmcHistoryItem {
  id: string;
  contractNumber: string;
  status: string;
  startDate: string;
  endDate: string;
  frequency: string;
  totalAmount: number;
  totalVisits: number;
  completedVisits: number;
  remainingVisits: number;
  previousContractId: string | null;
  customerName?: string | null;
  createdAt: string;
}

export interface AssetAmcHistoryResponse {
  assetId: string;
  assetTag: string;
  currentAmc: AssetCurrentAmcSummary | null;
  history: AssetAmcHistoryItem[];
}

export interface AmcContractListQuery {
  search?: string;
  status?: 'ALL' | AmcStatus | 'HISTORY';
  frequency?: 'ALL' | AmcFrequency;
  planId?: string;
  customerId?: string;
  isExpiringSoon?: boolean;
  page?: number;
  pageSize?: number;
}

export interface AmcDashboardMetrics {
  activeContracts: number;
  expiringSoonContracts: number;
  expiredContracts: number;
  coveredAssetsCount: number;
  upcomingPmCount: number;
  overduePmCount: number;
}

/* --------------------------------------------------
 * Service Visit Reports & Completion Types
 * -------------------------------------------------- */

export type ServiceVisitType = 'PREVENTIVE' | 'SERVICE_REQUEST';
export type ServiceVisitOutcome = 'COMPLETED' | 'PENDING_PARTS' | 'PENDING_REPAIRS';

export interface ServiceReportAssetInput {
  assetId: string;
  faultReported?: string | null;
  diagnosisFindings?: string | null;
  workPerformed?: string | null;
  assetOutcome: ServiceVisitOutcome;
  finalCondition?: string | null;
  refrigerantAdded?: boolean;
  refrigerantQtyKg?: number | null;
  notes?: string | null;
}

export interface ServiceReportAssetResponse {
  id: string;
  reportId: string;
  assetId: string;
  assetTag?: string | null;
  brand?: string | null;
  modelNumber?: string | null;
  roomLocation?: string | null;
  faultReported?: string | null;
  diagnosisFindings?: string | null;
  workPerformed?: string | null;
  assetOutcome: ServiceVisitOutcome;
  finalCondition?: string | null;
  refrigerantAdded: boolean;
  refrigerantQtyKg?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceReportItemInput {
  assetId?: string | null;
  itemType: 'PART_REQUIRED' | 'REPAIR_REQUIRED';
  itemName: string;
  partNumber?: string | null;
  quantity?: number;
  reason: string;
  diagnosis?: string | null;
  workCompleted?: string | null;
  recommendedAction?: string | null;
  isApprovalRequired?: boolean;
  isSpecialistRequired?: boolean;
  isRevisitRequired?: boolean;
  acCondition?: string | null;
  followUpNotes?: string | null;
}

export interface ServiceReportItemResponse {
  id: string;
  reportId: string;
  assetId?: string | null;
  assetTag?: string | null;
  itemType: 'PART_REQUIRED' | 'REPAIR_REQUIRED';
  itemName: string;
  partNumber?: string | null;
  quantity: number;
  reason: string;
  diagnosis?: string | null;
  workCompleted?: string | null;
  recommendedAction?: string | null;
  isApprovalRequired: boolean;
  isSpecialistRequired: boolean;
  isRevisitRequired: boolean;
  acCondition?: string | null;
  followUpNotes?: string | null;
  isResolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceReportPayload {
  reportNumber: string;
  scheduleId: string;
  visitType: ServiceVisitType;
  serviceDate: string; // YYYY-MM-DD
  startTime?: string | null;
  endTime?: string | null;
  primaryOutcome: ServiceVisitOutcome;
  workDescription?: string | null;
  technicianRemarks?: string | null;
  customerRepresentative?: string | null;
  customerAcknowledgement?: string | null;
  customerSignatureUrl?: string | null;
  assets: ServiceReportAssetInput[];
  items?: ServiceReportItemInput[];
}

export interface UpdateServiceReportPayload {
  reportNumber?: string;
  serviceDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  workDescription?: string | null;
  technicianRemarks?: string | null;
  customerRepresentative?: string | null;
  customerAcknowledgement?: string | null;
  customerSignatureUrl?: string | null;
  assets?: ServiceReportAssetInput[];
  items?: ServiceReportItemInput[];
}

export interface ServiceVisitReportResponse {
  id: string;
  reportNumber: string;
  visitType: ServiceVisitType;
  scheduleId: string;
  scheduleNumber?: string | null;
  serviceRequestId?: string | null;
  serviceRequestNumber?: string | null;
  amcId?: string | null;
  amcContractNumber?: string | null;
  pmObligationId?: string | null;
  customerId: string;
  customerName?: string | null;
  customerCode?: string | null;
  customerPhone?: string | null;
  siteId: string;
  siteName?: string | null;
  siteAddress?: string | null;
  technicianId: string;
  technicianName?: string | null;
  technicianCode?: string | null;
  technicianPhone?: string | null;
  serviceDate: string;
  startTime?: string | null;
  endTime?: string | null;
  primaryOutcome: ServiceVisitOutcome;
  workDescription?: string | null;
  technicianRemarks?: string | null;
  customerRepresentative?: string | null;
  customerAcknowledgement?: string | null;
  customerSignatureUrl?: string | null;
  status: string;
  followUpScheduleId?: string | null;
  followUpScheduleNumber?: string | null;
  assets: ServiceReportAssetResponse[];
  items: ServiceReportItemResponse[];
  createdBy?: string | null;
  createdByName?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceReportSummaryCounts {
  total: number;
  completed: number;
  pendingParts: number;
  pendingRepairs: number;
}

export interface ServiceReportListQuery {
  search?: string;
  visitType?: 'ALL' | ServiceVisitType;
  outcome?: 'ALL' | ServiceVisitOutcome;
  technicianId?: string;
  customerId?: string;
  siteId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateFollowUpSchedulePayload {
  scheduledDate: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  technicianId?: string;
  notes?: string;
}




