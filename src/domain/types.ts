/**
 * Place Your Service — Domain Types & Data Contracts
 * Derived strictly from DOCS/PRD.md, DOCS/TRD.md, DOCS/ARCHITECTURE.md, DOCS/RULES.md.
 */

/* --------------------------------------------------
 * 1. Identity & Application Roles
 * -------------------------------------------------- */
export type UserRole = 'ADMIN' | 'STAFF';

export interface UserProfile {
  id: string; // Supabase auth user UUID
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  phone?: string | null;
  avatarUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffMember {
  id: string;
  profileId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role?: UserRole;
  isActive: boolean;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
}


/* --------------------------------------------------
 * 2. Customer & Site Management
 * -------------------------------------------------- */
export type CustomerType = 'TEMPORARY' | 'PERMANENT';

export interface Customer {
  id: string;
  customerCode: string; // Human-readable business identifier (e.g., CUST-001)
  name: string;
  companyName?: string | null;
  customerType: CustomerType;
  type?: CustomerType; // Compatibility alias
  phone: string;
  primaryPhone?: string; // Compatibility alias
  alternatePhone?: string | null;
  secondaryPhone?: string | null; // Compatibility alias
  email?: string | null;
  address: string;
  billingAddress?: string; // Compatibility alias
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  isActive: boolean;
  siteName?: string | null;
  siteContactPerson?: string | null;
  siteContactPhone?: string | null;
  sitesCount?: number;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  primarySite?: CustomerSite | null;
}

export interface CustomerSite {
  id: string;
  customerId: string;
  siteName: string;
  address: string;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  isPrimary: boolean;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  customerName?: string | null;
  customerCode?: string | null;
  assetCount?: number;
}

/* --------------------------------------------------
 * 3. AC Asset Register
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

export interface AcBrand {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  modelCount?: number;
}

export interface AcModel {
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

export interface AcAsset {
  id: string;
  assetTag: string; // ESSC-XXXX
  assetCode?: string; // Compatibility alias
  internalCode?: string; // Compatibility alias
  qrCodeRef?: string;
  siteId: string;
  customerId?: string;
  brand: string;
  brandId?: string | null;
  modelNumber?: string | null;
  modelId?: string | null;
  serialNumber?: string | null;
  indoorSerialNumber?: string | null;
  outdoorSerialNumber?: string | null;
  acType: AcType;
  technology?: string | null;
  capacityTons?: number | null;
  tonnageCapacity?: number; // Compatibility alias
  starRating?: string | null;
  refrigerantType?: string | null;
  installationDate?: string | null;
  purchaseDate?: string | null;
  warrantyStartDate?: string | null;
  warrantyEndDate?: string | null;
  floorLocation?: string | null;
  roomLocation?: string | null;
  locationDetails?: string; // Compatibility alias
  warrantyStatus: WarrantyStatus;
  assetStatus?: string;
  assetCondition?: string;
  isUnderWarranty?: boolean; // Compatibility alias
  warrantyValidUntil?: string;
  isActive: boolean;
  notes?: string | null;
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

export interface AssetAmcHistoryItem {
  id: string;
  contractNumber: string;
  status: string;
  startDate: string;
  endDate: string;
  planName?: string | null;
  billingFrequency: string;
  totalAmount?: number | null;
  totalVisits: number;
  completedVisits: number;
  previousContractId?: string | null;
}

export interface AssetAmcHistoryResponse {
  assetId: string;
  assetTag: string;
  currentAmc: AssetCurrentAmcSummary | null;
  history: AssetAmcHistoryItem[];
}

/* --------------------------------------------------
 * 4. Technicians (Managed Operational Resources)
 * -------------------------------------------------- */
export type TechnicianStatus =
  | 'AVAILABLE'
  | 'BUSY'
  | 'ON_LEAVE'
  | 'OFF_DUTY'
  | 'INACTIVE'
  | 'ACTIVE'; // Compatibility alias

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

export interface Technician {
  id: string;
  technicianCode: string; // TECH-0001
  name: string;
  phone: string;
  email?: string | null;
  specializations: string[];
  skills: string[]; // Compatibility alias
  serviceAreas: string[];
  serviceArea?: string; // Compatibility alias
  status: TechnicianStatus;
  isActive: boolean;
  maxDailyWorkload: number;
  currentWorkload: number; // Derived active assignment count
  joiningDate?: string | null;
  notes?: string | null;
  workingDays?: WeekDay[];
  workingHours?: TechnicianWorkingHours;
  availability?: TechnicianAvailability;
  activeAssignmentsCount?: number;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt?: string;
}

/* --------------------------------------------------
 * 5. AMC Plans & Contracts
 * -------------------------------------------------- */
export type AmcFrequency = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
export type AmcStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'RENEWED';

export interface AmcPlan {
  id: string;
  planCode: string;
  name: string;
  planName?: string; // Compatibility alias
  description?: string | null;
  defaultFrequency: AmcFrequency;
  frequency?: AmcFrequency; // Compatibility alias
  defaultVisitsPerYear: number;
  totalVisits?: number; // Compatibility alias
  includedVisits?: number; // Compatibility alias
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AmcCoveredAsset {
  id: string;
  amcId: string;
  assetId: string;
  assetTag: string;
  siteId?: string;
  siteName?: string | null;
  brand: string;
  modelNumber?: string | null;
  serialNumber?: string | null;
  acType?: AcType;
  capacityTons?: number | null;
  roomLocation?: string | null;
  floorLocation?: string | null;
  notes?: string | null;
  createdAt: string;
  asset?: AcAsset;
}

export interface AmcContract {
  id: string;
  contractNumber: string; // AMC-2026-0001
  contractCode: string; // Compatibility alias
  customerId: string;
  customerName?: string | null;
  customerCode?: string | null;
  customerPhone?: string | null;
  planId?: string | null;
  planName?: string | null;
  planCode?: string | null;
  startDate: string;
  endDate: string;
  frequency: AmcFrequency;
  totalVisits: number;
  includedVisits?: number; // Compatibility alias
  totalAmount: number;
  contractAmount: number; // Compatibility alias
  status: AmcStatus;
  coveredAssetIds?: string[];
  coveredAssetsCount?: number;
  coveredAssets?: AmcCoveredAsset[];
  schedulesCount?: number;
  completedVisitsCount?: number;
  remainingVisitsCount?: number;
  nextPmDate?: string | null;
  isExpiringSoon?: boolean;
  notes?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  previousContractId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}


/* --------------------------------------------------
 * 6. Service Management (Requests vs Schedules)
 * -------------------------------------------------- */
export type ServiceType =
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

export type ServiceStatus =
  | 'REQUESTED'
  | 'PENDING'
  | 'SCHEDULED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'AWAITING_PARTS'
  | 'RESOLVED'
  | 'COMPLETED'
  | 'PAYMENT'
  | 'CLOSED'
  | 'CANCELLED'
  | 'ON_HOLD'
  | 'REVISIT_REQUIRED';

export type ServicePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'EMERGENCY';

export interface ServiceRequest {
  id: string;
  requestNumber: string; // SR-2026-000001
  requestCode?: string; // Compatibility alias
  customerId: string;
  siteId: string;
  assetId?: string | null;
  acAssetId?: string; // Compatibility alias
  requestType: ServiceType;
  serviceType?: ServiceType; // Compatibility alias
  priority: ServicePriority;
  status: ServiceStatus;
  description: string;
  issueDescription?: string; // Compatibility alias
  reportedDate?: string;
  preferredDate?: string | null;
  requestedDate?: string; // Compatibility alias
  notes?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  customerName?: string | null;
  customerCode?: string | null;
  customerPhone?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  assetTag?: string | null;
  assetBrand?: string | null;
  assetModel?: string | null;
  assignedTechnicianId?: string;
}

/* --------------------------------------------------
 * 7. Service Reports & Inventory
 * -------------------------------------------------- */
export interface ServiceReport {
  id: string;
  serviceId: string;
  technicianId: string;
  diagnosisNotes: string;
  actionTaken: string;
  refrigerantAddedGrams?: number;
  customerSignatureTimestamp?: string;
  completionDate: string;
  createdAt: string;
}

export interface Part {
  id: string;
  partCode: string; // PRT-001
  name: string;
  category: string;
  unitPrice: number;
  currentStock: number;
  lowStockThreshold: number;
  isActive: boolean;
}

export type InventoryTransactionType =
  | 'OPENING'
  | 'PURCHASE'
  | 'ADJUSTMENT'
  | 'SERVICE_USAGE'
  | 'RETURN';

export interface InventoryTransaction {
  id: string;
  partId: string;
  transactionType: InventoryTransactionType;
  quantityDelta: number;
  serviceId?: string;
  reason: string;
  performedBy: string;
  createdAt: string;
}

/* --------------------------------------------------
 * 8. Payments
 * -------------------------------------------------- */
export type PaymentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'FAILED' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'ONLINE';

export interface PaymentRecord {
  id: string;
  paymentCode: string; // PAY-2026-001
  customerId: string;
  serviceId?: string;
  amcContractId?: string;
  totalAmount: number;
  paidAmount: number;
  outstandingBalance: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  transactionReference?: string;
  recordedBy: string;
  createdAt: string;
}

/* --------------------------------------------------
 * 9. Activity / Audit Logging & Notifications
 * -------------------------------------------------- */
export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  timestamp: string;
}

export interface Notification {
  id: string;
  recipientRole?: UserRole;
  recipientId?: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

/* --------------------------------------------------
 * 10. Scheduling & Technician Assignment (Phase 9)
 * -------------------------------------------------- */

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

export interface ServiceSchedule {
  id: string;
  scheduleNumber: string;
  scheduleCode?: string; // Compatibility alias
  amcId?: string | null;
  amcContractId?: string | null; // Compatibility alias
  amcContractNumber?: string | null;
  serviceRequestId?: string | null;
  serviceRequestNumber?: string | null;
  serviceRequestType?: ServiceType | null;
  serviceRequestPriority?: ServicePriority | null;
  customerId?: string | null;
  customerName?: string | null;
  customerCode?: string | null;
  customerPhone?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  assetId: string | null;
  acAssetId?: string | null; // Compatibility alias
  assetTag?: string | null;
  brand?: string | null;
  modelNumber?: string | null;
  acType?: string | null;
  roomLocation?: string | null;
  scheduledDate: string; // YYYY-MM-DD
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  visitNumber?: number | null;
  status: ServiceScheduleStatus;
  isSystemGenerated: boolean;
  technicianId?: string | null;
  assignedTechnicianId?: string | null; // Compatibility alias
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
  notes?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceSchedulePayload {
  serviceRequestId?: string;
  pmObligationId?: string;
  amcId?: string;
  assetId?: string;
  visitNumber?: number;
  customerId?: string;
  siteId?: string;
  scheduledDate: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  notes?: string;
  technicianId?: string;
  isOverride?: boolean;
  overrideReason?: string;
}

export interface AssignTechnicianPayload {
  technicianId: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
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
  scheduledDate: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  technicianId?: string;
  reason?: string;
  isOverride?: boolean;
  overrideReason?: string;
}

export interface CancelSchedulePayload {
  reason: string;
}

export interface ScoreBreakdown {
  areaScore: number;
  availabilityScore: number;
  proximityScore: number;
  workloadScore: number;
  skillScore: number;
}

export interface TechnicianRecommendationItem {
  technicianId: string;
  technicianCode: string;
  name: string;
  phone: string;
  specializations: string[];
  serviceAreas: string[];
  status: string;
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
  identifier: string;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  siteId: string;
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

export interface ScheduleFilterParams {
  [key: string]: string | number | boolean | undefined;
  search?: string;
  status?: 'ALL' | ServiceScheduleStatus;
  date?: string;
  startDate?: string;
  endDate?: string;
  technicianId?: string;
  customerId?: string;
  siteId?: string;
  serviceRequestId?: string;
  amcId?: string;
  page?: number;
  pageSize?: number;
}

