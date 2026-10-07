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
- **Verification:** 109/109 tests passing (44 frontend + 65 backend). Zero lint errors. Zero TypeScript errors. Frontend and backend production builds clean.
 
+---
+
+## Phase 5 Status — Site & AC Asset Management (COMPLETE)
+
+- **Relationship Hierarchy:** Customer → Customer Sites (1..N) → AC Assets (1..N).
+- **Site Domain Model:** `customer_sites` (`id` UUID, `customer_id`, `site_name`, `address`, `city`, `state`, `postal_code`, `contact_person`, `contact_phone`, `contact_email`, `is_primary`, `is_active`, `notes`, `created_at`, `updated_at`).
+- **Atomic Primary Site Enforcement:**
+  - Partial unique index `idx_customer_sites_single_primary ON customer_sites (customer_id) WHERE (is_primary = true)` ensures strictly at most 1 primary site per customer at the PostgreSQL engine level.
+  - Promoting any site to primary atomically demotes any previous primary site for that customer.
+- **Non-Destructive Deactivation & Safety:**
+  - Deactivation of a site is guarded and blocked (HTTP 400 `ACTIVE_ASSETS_EXIST`) if active AC assets are installed at that location.
+  - Soft-deactivation pattern preserved across both sites and assets to safeguard historical references for future service requests and AMC contracts.
+- **AC Asset Domain Model:** `ac_assets` (`id` UUID, `asset_tag`, `site_id`, `customer_id`, `brand`, `model_number`, `serial_number`, `ac_type`, `capacity_tons`, `refrigerant_type`, `installation_date`, `floor_location`, `room_location`, `warranty_status`, `is_active`, `notes`, `created_at`, `updated_at`).
+- **Asset Identification & Duplicate Protection:**
+  - Autogenerated collision-resistant asset tags (`AC-######`) when tag is not provided.
+  - 409 Conflict returned if an asset with the same tag or identical brand + serial number already exists.
+- **Warranty Tracking:** Real domain statuses (`UNDER_WARRANTY`, `AMC_COVERED`, `EXPIRED`, `OUT_OF_WARRANTY`) without simulated automated notification side-effects.
+- **Backend APIs:**
+  - Sites: `GET /customers/:id/sites`, `GET /sites/:id`, `POST /customers/:id/sites`, `PATCH /sites/:id`, `POST /sites/:id/set-primary`, `PATCH /sites/:id/status`.
+  - Assets: `GET /sites/:id/assets`, `GET /assets/:id`, `POST /sites/:id/assets`, `PATCH /assets/:id`, `PATCH /assets/:id/status`.
+- **Frontend UX Integration:**
+  - Extended Customer Detail drawer in `CustomerManagement.tsx` with dedicated tab navigation (`Overview`, `Sites (N)`, `AC Assets (N)`).
+  - Site cards with real calculated unit counts, PRIMARY / SECONDARY badges, active status, and inline actions (Set Primary, Add Asset, Edit, Deactivate).
+  - AC Asset cards and specification detail modal with brand, model, tonnage, serial, refrigerant gas, location, and warranty badge.
+  - Add Site and Register AC Asset modals with validation, conflict error reporting, and zero fake numbers.
+- **Audit Logging:** Systematically records `SITE_CREATED`, `SITE_UPDATED`, `SITE_STATUS_CHANGED`, `SITE_SET_PRIMARY`, `ASSET_CREATED`, `ASSET_UPDATED`, and `ASSET_STATUS_CHANGED` in `activity_logs`.
+- **Verification:** 133/133 tests passing (52 frontend + 81 backend). 0 lint errors, 0 lint warnings. 0 TypeScript errors. Frontend and backend production builds clean. Render and Vercel production verified.
+



