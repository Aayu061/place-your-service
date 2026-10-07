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
  | 'OTHER';

export type WarrantyStatus =
  | 'UNDER_WARRANTY'
  | 'EXPIRED'
  | 'AMC_COVERED'
  | 'OUT_OF_WARRANTY';

export interface AcAsset {
  id: string;
  assetTag: string;
  internalCode?: string; // Compatibility alias
  qrCodeRef?: string;
  siteId: string;
  customerId?: string;
  brand: string;
  modelNumber?: string | null;
  serialNumber?: string | null;
  acType: AcType;
  capacityTons?: number | null;
  tonnageCapacity?: number; // Compatibility alias
  refrigerantType?: string | null;
  installationDate?: string | null;
  floorLocation?: string | null;
  roomLocation?: string | null;
  locationDetails?: string; // Compatibility alias
  warrantyStatus: WarrantyStatus;
  isUnderWarranty?: boolean; // Compatibility alias
  warrantyValidUntil?: string;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  siteName?: string | null;
  customerName?: string | null;
  customerCode?: string | null;
}

/* --------------------------------------------------
 * 4. Technicians (Managed Operational Resources)
 * -------------------------------------------------- */
export type TechnicianStatus = 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';

export interface Technician {
  id: string;
  technicianCode: string; // TECH-001
  name: string;
  phone: string;
  email?: string;
  skills: string[];
  serviceArea: string;
  status: TechnicianStatus;
  currentWorkload: number; // Active assignment count
  joiningDate: string;
  notes?: string;
  createdAt: string;
}

/* --------------------------------------------------
 * 5. AMC Plans & Contracts
 * -------------------------------------------------- */
export type AmcFrequency = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
export type AmcStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'CANCELLED';

export interface AmcContract {
  id: string;
  contractCode: string; // AMC-2026-001
  customerId: string;
  planName: string;
  startDate: string;
  endDate: string;
  frequency: AmcFrequency;
  totalVisits: number;
  contractAmount: number;
  status: AmcStatus;
  coveredAssetIds: string[];
  notes?: string;
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
  | 'PREVENTIVE_MAINTENANCE';

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

export type ServicePriority = 'EMERGENCY' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ServiceRequest {
  id: string;
  requestCode: string; // SR-2026-001
  customerId: string;
  siteId: string;
  acAssetId?: string;
  serviceType: ServiceType;
  priority: ServicePriority;
  status: ServiceStatus;
  issueDescription: string;
  requestedDate: string;
  assignedTechnicianId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceSchedule {
  id: string;
  scheduleCode: string; // SCH-2026-001
  amcContractId?: string;
  customerId: string;
  siteId: string;
  acAssetId: string;
  scheduledDate: string;
  assignedTechnicianId?: string;
  status: ServiceStatus;
  isSystemGenerated: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
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
