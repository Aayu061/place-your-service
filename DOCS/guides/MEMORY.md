# Place Your Service — Project Memory

> This file is the compact source of truth for future AI coding sessions.

## Project

**Name:** Place Your Service

**Type:** Internal AC Service Management Web Platform

**Primary goal:** Manage customers, AC assets, AMC contracts, service requests/schedules, technicians, inventory, payments, reports and operational activity from one modern web application.

---

## Locked Scope

### Current application users

1. Admin
2. Staff

### Admin

- One fixed/singleton account
- Full system control
- Creates/manages Staff
- Cannot be created from Staff UI

### Staff

- Multiple operational users
- Created/managed by Admin
- Handles day-to-day service management

### Important

Technicians and customers exist as business entities/data records, but they are **not V1 web application login roles**.

Do not introduce:

- customer portal
- customer app
- technician app
- vendor portal
- vendor app

into the current build.

---

## Product Direction

The product is intentionally a **simple service-management web platform**, but it should feel production-grade.

Three pillars:

1. **Modern frontend UI/UX**
2. **Real working backend**
3. **Real-world business logic and algorithms**

Do not build a static CRUD demo.

---

## UX Direction

Use:

- modern SaaS layout
- premium but practical visual hierarchy
- responsive design
- polished tables/forms
- dashboard cards/charts
- customer 360 workspace
- service workspace
- smooth page/modal/drawer transitions
- micro-interactions
- skeleton loading
- empty/error/success states
- toast notifications
- subtle status animations
- accessible focus states
- reduced-motion support

Avoid:

- excessive animation
- gimmicky effects
- generic admin-template appearance
- decorative UI that slows operations

---

## Backend

Preferred foundation:

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage where needed
- RLS
- server-side/edge functions where privileged logic requires them

Never expose service-role secrets in the frontend.

---

## Main Entities

```text
profiles
staff

customers
customer_sites
ac_assets

technicians

amc_plans
amc_contracts
amc_assets

service_requests
service_schedules
service_assignments
service_reports

parts
inventory_transactions
service_parts

payments
payment_transactions

notifications
activity_logs
```

Refine schema before final migrations.

---

## Customer Model

One customer record can be:

- TEMPORARY
- PERMANENT

Temporary → Permanent must preserve:

- same customer identity
- sites
- AC assets
- AMC/service history
- payments
- activity history

Do not duplicate the customer.

---

## Asset Model

Relationship:

`Customer → Site → AC Asset`

Each AC can contain:

- AC ID / QR reference
- brand
- model
- serial number
- type
- capacity
- installation date
- floor/room/location
- refrigerant
- warranty status

---

## AMC

AMC is a contract entity.

Supported frequencies:

- monthly
- quarterly
- half-yearly
- yearly

AMC should automatically generate preventive-maintenance schedules.

Schedule generation must be:

- date-aware
- contract-bound
- duplicate-safe
- auditable
- idempotent

---

## Services

Keep these separate:

### Service Request

Unplanned/operational request such as:

- breakdown
- complaint
- repair
- emergency

### Service Schedule

Planned work such as AMC preventive maintenance.

---

## Service Lifecycle

Normal:

`REQUESTED → PENDING → SCHEDULED → ASSIGNED → IN PROGRESS → RESOLVED → COMPLETED → PAYMENT → CLOSED`

Optional:

- AWAITING PARTS
- ON HOLD
- REVISIT REQUIRED
- CANCELLED

Enforce valid transitions.

---

## Technician Logic

Technicians are resources, not login users.

Recommendation can consider:

```text
Area compatibility 40%
Availability        20%
Proximity           20%
Workload            10%
Skill match         10%
```

Staff can override recommendations.

Overrides must be auditable.

---

## Inventory Logic

Use transaction-based stock.

Conceptually:

`Incoming + Adjustments + Returns - Usage`

Service parts must create auditable inventory transactions.

Prevent negative stock unless an explicitly approved rule exists.

---

## Payment Logic

Methods:

- CASH
- ONLINE

Statuses:

- PENDING
- PARTIALLY_PAID
- PAID
- FAILED
- REFUNDED

Online payment must only become confirmed/paid after trusted backend/provider verification.

Cash must be attributable to the Staff member who recorded it.

---

## Dashboard

Admin:

- active AMC
- expiring AMC
- customers
- technicians
- pending services
- monthly services
- revenue
- AMC revenue
- technician performance
- breakdown vs preventive maintenance
- parts consumption
- overdue/upcoming work

Staff:

- today's services
- pending requests
- unassigned services
- upcoming schedules
- overdue services
- awaiting parts
- completed services

Dashboard metrics must come from real data.

---

## Critical Product Rule

> No fake functionality, no hardcoded operational KPIs, no placeholder business logic in production workflows, and no UI-only workflow where a real backend operation is expected.

---

## Implementation Priority

1. Foundation/auth/RLS
2. Application shell/design system
3. Customers/sites
4. AC assets
5. Technicians
6. Service requests/schedules
7. AMC + schedule generation
8. Assignment
9. Reports/service history
10. Parts/inventory
11. Payments
12. Dashboards/analytics
13. Notifications/audit
14. Testing/security/performance polish

---

## AI Agent Rules

Before implementing a feature:

1. Check this memory.
2. Check PRD.
3. Check RULES.
4. Check TRD.
5. Check ARCHITECTURE.
6. Check DESIGN.

Do not introduce excluded product surfaces.

Do not invent business requirements without marking them as proposed.

Do not replace real backend behavior with mock data unless explicitly working on an isolated UI prototype.

---

## Definition of Done

A complete core workflow must work:

`Admin → Staff → Customer → Site → AC → AMC → Schedule → Technician → Service → Report → Parts → Payment → Completion → Dashboard → Audit`

All critical steps must persist and calculate correctly in the backend.

---

## Phase 3 Status — Admin & Staff Authentication & Authorization (COMPLETE)

- **Authentication Architecture:** Vercel Frontend → Supabase Auth (Identity/JWT) → Render Express API (`requireAuth`) → PostgreSQL RLS.
- **Roles:** Strictly two application roles: `ADMIN` and `STAFF`. Customers and Technicians are business entities, not login users.
- **Admin Account:** Enforced singleton via database constraint (`idx_staff_singleton_admin`). Bootstrap endpoint provisions initial Admin only when 0 admins exist (409 Conflict otherwise). Deactivation of Admin is forbidden.
- **Staff Account Management:** Full Admin management suite (`GET /api/v1/staff`, `POST /api/v1/staff`, `PATCH /api/v1/staff/:id`, `PATCH /api/v1/staff/:id/status`). Inactive staff are rejected by backend authorization (HTTP 403) and denied operational UI access.
- **Frontend UX:** Branded Login page with accessible form, error alerts, zero-flicker session restoration (`isLoading`), centralized `AuthContext`, and Admin `StaffManagement` workspace.
- **Audit Logging:** Auditable operational events recorded in `activity_logs` (`ADMIN_BOOTSTRAP`, `STAFF_CREATED`, `STAFF_ACTIVATED`, `STAFF_DEACTIVATED`, `USER_LOGOUT`) with strict credential redaction.
- **Verification:** 81/81 tests passing (37 frontend + 44 backend). Zero lint warnings. Production builds clean.

---

## Phase 4 Status — Customer Management (COMPLETE)

- **Domain Model:** Customer entity (`id` UUID, `customer_code`, `name`, `company_name`, `customer_type`, `phone`, `alternate_phone`, `email`, `address`, `city`, `state`, `postal_code`, `notes`, `is_active`, `created_at`, `updated_at`).
- **Classification:** Strictly `TEMPORARY` and `PERMANENT`.
- **Conversion Workflow:** `POST /api/v1/customers/:id/convert-to-permanent`. Idempotent in-place update modifying only `customer_type = 'PERMANENT'`. Strict preservation of customer UUID ID, customer code, operational history, notes, site links, and audit trail. Returns 409 Conflict if already permanent.
- **Duplicate Prevention:** Server-side duplicate detection based on phone number and email. Returns 409 Conflict with structured duplicate metadata if a matching customer already exists.
- **CRUD Operations:**
  - `GET /api/v1/customers` (paginated listing, server-side search by name/company/phone/email/code, filter by type and active status)
  - `GET /api/v1/customers/:id` (detailed customer view including linked sites summary)
  - `POST /api/v1/customers` (atomic customer creation with primary site record)
  - `PATCH /api/v1/customers/:id` (safe partial update)
  - `PATCH /api/v1/customers/:id/status` (safe activation/deactivation toggle, soft-delete preference)
  - `POST /api/v1/customers/:id/convert-to-permanent` (safe idempotent conversion)
- **Authorization:** All endpoints guarded by `requireAuth` + `requireRole('ADMIN', 'STAFF')`. No public or customer login access.
- **Audit Logging:** Audits `CUSTOMER_CREATED`, `CUSTOMER_UPDATED`, `CUSTOMER_STATUS_CHANGED`, and `CUSTOMER_CONVERTED_TO_PERMANENT` in `activity_logs`.
- **Frontend Workspace:** `CustomerManagement.tsx` component mounted in `AppShell` with search, filter tabs, responsive data table, Add/Edit modals, detail drawer with Phase 5-7 module roadmap indications, conversion confirmation dialogs, and robust loading/error/empty states.
- **Verification:** 109/109 tests passing (44 frontend + 65 backend). Zero lint errors. Zero TypeS---

## Phase 5 Status — Site & AC Asset Management (COMPLETE)

- **Relationship Hierarchy:** Customer → Customer Sites (1..N) → AC Assets (1..N).
- **Site Domain Model:** `customer_sites` (`id` UUID, `customer_id`, `site_name`, `address`, `city`, `state`, `postal_code`, `contact_person`, `contact_phone`, `contact_email`, `is_primary`, `is_active`, `notes`, `created_at`, `updated_at`).
- **Atomic Primary Site Enforcement:**
  - Partial unique index `idx_customer_sites_single_primary ON customer_sites (customer_id) WHERE (is_primary = true)` ensures strictly at most 1 primary site per customer at the PostgreSQL engine level.
  - Promoting any site to primary atomically demotes any previous primary site for that customer.
- **Non-Destructive Deactivation & Safety:**
  - Deactivation of a site is guarded and blocked (HTTP 400 `ACTIVE_ASSETS_EXIST`) if active AC assets are installed at that location.
  - Soft-deactivation pattern preserved across both sites and assets to safeguard historical references for future service requests and AMC contracts.
- **AC Asset Domain Model:** `ac_assets` (`id` UUID, `asset_tag`, `site_id`, `customer_id`, `brand`, `model_number`, `serial_number`, `ac_type`, `capacity_tons`, `refrigerant_type`, `installation_date`, `floor_location`, `room_location`, `warranty_status`, `is_active`, `notes`, `created_at`, `updated_at`).
- **Asset Identification & Duplicate Protection:**
  - Autogenerated collision-resistant asset tags (`AC-######`) when tag is not provided.
  - 409 Conflict returned if an asset with the same tag or identical brand + serial number already exists.
- **Warranty Tracking:** Real domain statuses (`UNDER_WARRANTY`, `AMC_COVERED`, `EXPIRED`, `OUT_OF_WARRANTY`) without simulated automated notification side-effects.
- **Backend APIs:**
  - Sites: `GET /customers/:id/sites`, `GET /sites/:id`, `POST /customers/:id/sites`, `PATCH /sites/:id`, `POST /sites/:id/set-primary`, `PATCH /sites/:id/status`.
  - Assets: `GET /sites/:id/assets`, `GET /assets/:id`, `POST /sites/:id/assets`, `PATCH /assets/:id`, `PATCH /assets/:id/status`.
- **Frontend UX Integration:**
  - Extended Customer Detail drawer in `CustomerManagement.tsx` with dedicated tab navigation (`Overview`, `Sites (N)`, `AC Assets (N)`).
  - Site cards with real calculated unit counts, PRIMARY / SECONDARY badges, active status, and inline actions (Set Primary, Add Asset, Edit, Deactivate).
  - AC Asset cards and specification detail modal with brand, model, tonnage, serial, refrigerant gas, location, and warranty badge.
  - Add Site and Register AC Asset modals with validation, conflict error reporting, and zero fake numbers.
- **Audit Logging:** Systematically records `SITE_CREATED`, `SITE_UPDATED`, `SITE_STATUS_CHANGED`, `SITE_SET_PRIMARY`, `ASSET_CREATED`, `ASSET_UPDATED`, and `ASSET_STATUS_CHANGED` in `activity_logs`.
- **Verification:** 133/133 tests passing (52 frontend + 81 backend). 0 lint errors, 0 lint warnings. 0 TypeScript errors. Frontend and backend production builds clean. Render and Vercel production verified.

---

## Phase 6 Status — Service Request Management (COMPLETE)

- **Domain Model:** `service_requests` (`id` UUID, `request_number` VARCHAR, `customer_id` UUID, `site_id` UUID, `asset_id` UUID NULL, `request_type` VARCHAR, `priority` VARCHAR, `description` TEXT, `reported_date` TIMESTAMPTZ, `preferred_date` DATE NULL, `status` VARCHAR, `notes` TEXT NULL, `cancellation_reason` TEXT NULL, `cancelled_at` TIMESTAMPTZ NULL, `cancelled_by` UUID NULL, `created_by` UUID NULL, `updated_by` UUID NULL, `created_at` TIMESTAMPTZ, `updated_at` TIMESTAMPTZ).
- **Relational Integrity Validation:**
  - Customer exists & is active.
  - Site exists, is active, and belongs to Customer (`SITE_CUSTOMER_MISMATCH` 400).
  - AC Asset (if provided) exists, is active, and belongs to Site (`ASSET_SITE_MISMATCH` 400).
- **Service Scopes:**
  - `SITE LEVEL`: When `asset_id` is null (premises-wide issues like duct leakage, power trips).
  - `AC ASSET`: When `asset_id` references a specific physical unit.
- **Controlled State Machine:**
  - Strict lifecycle foundation (`REQUESTED` → `PENDING` → `SCHEDULED` → `ASSIGNED` → `IN_PROGRESS` → `RESOLVED` → `COMPLETED` → `CLOSED` / `CANCELLED`).
  - Terminal states (`CANCELLED`, `CLOSED`) cannot transition.
  - Invalid transitions (e.g. `REQUESTED → COMPLETED`) rejected with `409 Conflict`.
- **Non-Destructive Cancellation:**
  - Controlled cancellation flow records reason, timestamp, and actor.
  - Idempotent: repeated cancellations return 200 without duplicate audit events or state corruption.
  - Deletion is prohibited to maintain immutable operational history for future phases.
- **Backend APIs:**
  - `GET /api/v1/service-requests` (search, filters by status/priority/type/customer/site/asset, pagination).
  - `GET /api/v1/service-requests/:id` (full join with customer, site, asset).
  - `POST /api/v1/service-requests` (creation with collision-resistant `SR-YYYY-XXXXXX` number).
  - `PATCH /api/v1/service-requests/:id` (updates with relational re-validation).
  - `POST /api/v1/service-requests/:id/status` (controlled status transitions).
  - `POST /api/v1/service-requests/:id/cancel` (controlled idempotent cancellation).
  - Guarded by `requireAuth` + `requireRole('ADMIN', 'STAFF')`.
- **Frontend Workspace:**
  - `ServiceRequestManagement.tsx` mounted in `AppShell` operational navigation (`activeItem === 'service-requests'`).
  - Cascading dependent selectors (Customer → Site → AC Asset) with automatic dependent resets.
  - Search and filter controls (Status, Priority, Request Type).
  - Responsive table with scope badges (`AC ASSET` vs `SITE LEVEL`) and semantic status/priority badges.
  - Detail Drawer with problem description, notes, scope card, and visual Lifecycle Timeline.
  - Edit modal, Status transition modal, and Cancellation confirmation dialog.
  - Contextual Quick-Create actions from Customer Detail drawer.
- **Audit Logging:** Systematically logs `SERVICE_REQUEST_CREATED`, `SERVICE_REQUEST_UPDATED`, `SERVICE_REQUEST_STATUS_CHANGED`, and `SERVICE_REQUEST_CANCELLED` to `activity_logs`.
- **Verification:** 160/160 tests passing (60 frontend + 100 backend). 0 lint errors, 0 lint warnings, 0 TypeScript errors. Production builds clean. Render and Vercel verified.

---

## Phase 7 Status — Technician Management (COMPLETE)

- **Core Architectural Principle:** Technicians are operational resources, **NOT** application login users. Zero passwords, zero Supabase Auth accounts, zero technician login/JWT/portal. Only `ADMIN` and `STAFF` manage technicians. Inactive staff accounts are strictly forbidden (403).
- **Domain Model:** `technicians` (`id` UUID, `technician_code` VARCHAR, `name` VARCHAR, `phone` VARCHAR, `email` VARCHAR NULL, `specializations` / `skills` TEXT[], `service_areas` TEXT[], `status` VARCHAR, `is_active` BOOLEAN, `working_days` TEXT[], `working_hours` JSONB, `availability` JSONB, `joined_date` DATE, `notes` TEXT NULL, `created_by` UUID NULL, `updated_by` UUID NULL, `created_at` TIMESTAMPTZ, `updated_at` TIMESTAMPTZ).
- **Status & Lifecycle Separation:**
  - Administrative lifecycle: `is_active` (`true` / `false`). Inactive technicians cannot be marked `AVAILABLE` or `BUSY`.
  - Operational status: `AVAILABLE`, `BUSY`, `ON_LEAVE`, `OFF_DUTY`, `INACTIVE`.
- **Workload Tracking:** Derived dynamically from real operational records in `service_assignments` (`activeAssignmentsCount`). Never fabricated or manually entered.
- **Skills & Service Areas:** Structured arrays with case-insensitive normalization and deduplication. Backward compatible aliases (`specializations` / `skills`, `service_areas` / `serviceArea`).
- **Structured Availability:** Weekly schedule with day-by-day active flags and start/end time validation (`start < end`).
- **Duplicate Protection:** Collision-safe `TECH-XXXX` code generator; duplicate phone/email detection returning 409 Conflict.
- **Deactivation Safety:** Guarded deactivation checking active assigned requests in `service_assignments`; returns 409 Conflict (`TECHNICIAN_HAS_ACTIVE_ASSIGNMENTS`) if active work exists.
- **Backend APIs:**
  - `GET /api/v1/technicians` (search by code/name/phone/email/skills/areas, filter by status/skills/areas/active, pagination)
  - `GET /api/v1/technicians/:id` (detailed technician record with workload derivation)
  - `POST /api/v1/technicians` (collision-safe creation with default availability)
  - `PATCH /api/v1/technicians/:id` (safe partial update)
  - `PATCH /api/v1/technicians/:id/status` (operational status transition)
  - `PATCH /api/v1/technicians/:id/lifecycle` (administrative active/inactive toggle with assignment safety)
  - Guarded by `requireAuth` + `requireRole('ADMIN', 'STAFF')`.
- **Frontend Workspace:**
  - `TechnicianManagement.tsx` mounted in `AppShell` operational navigation (`activeItem === 'technicians'`).
  - Search and filter bar (Search query, Operational Status, Skill filter, Service Area filter, Active status toggle).
  - Responsive table with semantic status badges (`AVAILABLE` green, `BUSY` blue, `ON_LEAVE` amber, `OFF_DUTY` neutral, `INACTIVE` red).
  - Detail Drawer showing Profile, Contact, Skills tags, Service Areas tags, Weekly Availability Schedule, Operational Capacity, Employment, Notes, and quick action buttons.
  - Add/Edit Technician modal with controlled skill and service area tag selectors, employment joining date, and interactive weekly working hours editor.
  - Status Change modal and Deactivation safety modal with active conflict feedback.
- **Audit Logging:** Logs `TECHNICIAN_CREATED`, `TECHNICIAN_UPDATED`, `TECHNICIAN_STATUS_CHANGED`, `TECHNICIAN_ACTIVATED`, `TECHNICIAN_DEACTIVATED`, `TECHNICIAN_SKILLS_UPDATED`, and `TECHNICIAN_SERVICE_AREAS_UPDATED` in `activity_logs`.
- **Verification:** 193/193 tests passing (68 frontend + 125 backend). 0 lint errors, 0 lint warnings, 0 TypeScript errors. Frontend and backend production builds clean. Render and Vercel verified.

---

## Phase 8 Status — AMC & Preventive Maintenance (COMPLETE)

- **Domain Model:**
  - `amc_plans` (`id` UUID, `plan_code` VARCHAR, `name` VARCHAR, `description` TEXT, `default_frequency` VARCHAR, `default_visits_per_year` INT, `is_active` BOOLEAN, `created_at`, `updated_at`). Seeded standard plans: `PLAN-BASIC`, `PLAN-COMPREHENSIVE`, `PLAN-SEMI-ANNUAL`, `PLAN-ANNUAL`.
  - `amc_contracts` (`id` UUID, `contract_number` VARCHAR, `customer_id` UUID, `plan_id` UUID NULL, `start_date` DATE, `end_date` DATE, `frequency` VARCHAR, `total_visits` INT, `total_amount` NUMERIC, `status` VARCHAR, `notes` TEXT NULL, `cancellation_reason` TEXT NULL, `cancelled_at` TIMESTAMPTZ NULL, `cancelled_by` UUID NULL, `previous_contract_id` UUID NULL, `created_by` UUID NULL, `updated_by` UUID NULL, `created_at`, `updated_at`).
  - `amc_assets` (`id` UUID, `amc_id` UUID, `asset_id` UUID, `notes` TEXT NULL, `created_at`). Enforced by unique constraint `uq_amc_asset (amc_id, asset_id)`.
  - `service_schedules` (`id` UUID, `schedule_number` VARCHAR, `amc_id` UUID, `asset_id` UUID, `site_id` UUID NULL, `scheduled_date` DATE, `visit_number` INT, `status` VARCHAR, `is_system_generated` BOOLEAN, `notes` TEXT NULL, `created_by` UUID NULL, `updated_by` UUID NULL, `created_at`, `updated_at`).
- **Relational Integrity & Validation:**
  - Customer exists and is active.
  - Plan exists and is active (if plan_id specified).
  - Date Validation: `start_date` < `end_date`. Negative or inverted contract periods rejected (`INVALID_CONTRACT_DATES`).
  - Covered Asset Ownership: Every covered asset must belong to the customer through `asset -> site -> customer` hierarchy. Foreign assets rejected with 400 (`ASSET_CUSTOMER_MISMATCH`).
  - Contract Overlap Protection: Active contracts for the same customer cannot cover the same AC asset during overlapping date ranges (`start_date <= new_end AND end_date >= new_start`). Violations return structured 409 Conflict (`ASSET_ALREADY_COVERED` / `CONTRACT_OVERLAP`).
- **Preventive Maintenance Generation Algorithm:**
  - Deterministic date step calculation (`calculateScheduleDatesUtc`) using pure UTC arithmetic and safe calendar month boundaries (`addMonthsSafeUtc`, preserving month-end dates e.g. Jan 31 -> Feb 28, Feb 29 on leap years).
  - Supported Frequencies: `MONTHLY` (+1 mo), `QUARTERLY` (+3 mo), `HALF_YEARLY` (+6 mo), `YEARLY` (+12 mo).
  - Contract Boundary: All generated PM obligations strictly satisfy `scheduled_date >= start_date AND scheduled_date <= end_date`. Zero obligations generated outside contract range.
  - Idempotency & Concurrency: Deterministic deduplication in service logic reinforced by PostgreSQL database unique constraint `uq_amc_asset_schedule (amc_id, asset_id, scheduled_date)` on `service_schedules`. Calling PM generation repeatedly produces identical results without duplicates.
- **Contract Lifecycle & Operations:**
  - Statuses: `DRAFT`, `ACTIVE`, `EXPIRING_SOON` (end_date - current_date <= 30 days), `EXPIRED`, `CANCELLED`, `RENEWED`.
  - Non-Destructive Cancellation: Cancellation requires mandatory reason; updates `cancellation_reason`, `cancelled_at`, `cancelled_by`, sets contract to `CANCELLED`, and soft-cancels unfulfilled future schedules while preserving historical completed visits.
  - Historical Renewal: Renewal links the previous contract (`previous_contract_id`), sets old contract to `RENEWED`, and creates a new contract record with copied equipment for the subsequent period.
  - Expired/Cancelled contracts are prevented from generating new future PM obligations.
- **Backend APIs:**
  - `GET /api/v1/amc-contracts` (search, filters by status/frequency/customer/plan, pagination)
  - `GET /api/v1/amc-contracts/metrics` (real DB-derived KPI summary: active, expiring soon, expired, covered assets, due PM)
  - `GET /api/v1/amc-contracts/plans` (reusable active plan templates)
  - `GET /api/v1/amc-contracts/:id` (contract detail with covered assets and summary)
  - `POST /api/v1/amc-contracts` (creation with collision-safe `AMC-YYYY-XXXX` number)
  - `PATCH /api/v1/amc-contracts/:id` (safe updates with date validation)
  - `PATCH /api/v1/amc-contracts/:id/status` (lifecycle status changes)
  - `POST /api/v1/amc-contracts/:id/cancel` (controlled non-destructive cancellation)
  - `POST /api/v1/amc-contracts/:id/renew` (safe historical renewal)
  - `POST /api/v1/amc-contracts/:id/generate-pm` (idempotent PM schedule calculation)
  - `GET /api/v1/amc-contracts/:id/assets` (covered equipment listing)
  - `POST /api/v1/amc-contracts/:id/assets` (add covered assets with ownership checks)
  - `DELETE /api/v1/amc-contracts/:id/assets/:assetId` (remove asset from coverage, soft-cancelling pending future visits)
  - `GET /api/v1/amc-contracts/:id/schedules` (view generated PM obligations)
  - Guarded by `requireAuth` + `requireRole('ADMIN', 'STAFF')`. Inactive staff blocked (403).
- **Frontend Workspace:**
  - `AmcManagement.tsx` mounted in `AppShell` operational navigation (`activeItem === 'amc'`).
  - Real-time KPI Metric Summary Cards (Active Contracts, Expiring Soon, Covered AC Units, Upcoming PM, Overdue PM).
  - Search by contract number / customer / plan and filter by status and frequency with server-side pagination.
  - Contract Detail Drawer with Overview, Covered Equipment, and PM Obligations tabs.
  - PM Schedule tab with "Regenerate / Sync PM" action and due/overdue status display.
  - Create AMC Modal with cascading customer asset selection and plan template defaults.
  - Edit, Cancel, Renew, and Add Equipment modals with structured conflict feedback.
- **Audit Logging:** Systematically records `AMC_CREATED`, `AMC_UPDATED`, `AMC_STATUS_CHANGED`, `AMC_ASSET_ADDED`, `AMC_ASSET_REMOVED`, `AMC_PM_GENERATED`, `AMC_CANCELLED`, and `AMC_RENEWED` in `activity_logs`.
- **Verification:** 228/228 tests passing (78 frontend + 150 backend). 0 lint errors, 0 lint warnings, 0 TypeScript errors. Frontend and backend production builds clean. Render and Vercel verified.


