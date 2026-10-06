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
