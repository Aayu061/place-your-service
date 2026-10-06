# Place Your Service — Product Requirements Document

## 1. Product Overview

**Place Your Service** is a modern internal web-based Service Management Platform for an AC sales and service business.

The product has two internal application roles:

- **Admin** — one fixed/singleton administrative account with complete system control.
- **Staff** — multiple operational users created and managed by Admin.

The product is intentionally simple in scope: it is a service-management web portal, not a collection of separate customer, technician, or vendor applications.

### Product principle

> A polished modern frontend must sit on top of a genuinely working backend and realistic service-management logic. No important workflow should be simulated with hardcoded data.

---

## 2. Locked Scope

### In scope

- Admin authentication and administration
- Staff authentication and management
- Customer management
- Temporary/permanent customer status
- Customer sites
- AC asset register
- Technician master records
- Service requests
- Planned service schedules
- AMC plans and contracts
- Automatic preventive-maintenance schedule generation
- Technician assignment and recommendation
- Service reports
- Parts and inventory
- Payment records
- Dashboard KPIs and analytics
- Notifications
- Activity/audit logs
- Search, filtering, sorting and pagination
- Responsive modern UI/UX
- Real backend persistence through Supabase/PostgreSQL
- Role-based authorization and RLS

### Explicitly out of scope for V1

- Customer-facing web portal
- Customer mobile application
- Technician mobile application
- Vendor dashboard
- Vendor application
- Vendor staff accounts
- Customer self-registration
- Technician login accounts
- Full payment-gateway implementation unless separately approved
- 24/7 technician GPS tracking
- AI chatbot or generative customer support

Technicians and customers remain operational data entities because Staff need to manage services around them. They are **not V1 application users**.

---

## 3. Users and Permissions

### Admin

Admin can:

- Manage Staff
- View and manage all operational records
- Manage system-level settings
- View reports and analytics
- Review audit logs
- Activate/deactivate Staff
- Manage permissions available to Staff
- Perform administrative corrections

There must be no public or Staff-facing "Create Admin" workflow.

### Staff

Staff can:

- Manage customers
- Manage customer sites
- Manage AC assets
- Manage technicians
- Create and process service requests
- Manage service schedules
- Manage AMC records
- Manage parts and inventory transactions
- Record/view payments according to permission
- View operational reports
- View relevant activity history

Staff cannot:

- Create another Admin
- Change their own role to Admin
- Change system security controls
- Modify protected authorization configuration
- Delete critical history without an approved administrative process

---

## 4. Core Data Model

### Customer

One customer record can be temporary or permanent.

Required information may include:

- Customer name
- Company/building name
- Address
- Contact numbers
- Email
- Site contact person
- Customer type/status
- Notes
- Created/updated timestamps

A temporary customer can later become permanent without creating a duplicate customer record or losing service history.

### Customer Site

A customer may have multiple sites/branches/buildings.

A site contains:

- Site name
- Address
- Contact information
- Site contact person
- Status
- Notes

Relationship:

`Customer → Sites → AC Assets`

### AC Asset

Each AC is independently tracked.

Fields include:

- Internal AC ID
- QR code/reference
- Brand
- Model number
- Serial number
- AC type
- Capacity
- Installation date
- Site
- Floor/room/location
- Refrigerant
- Warranty status
- Active/inactive status
- Notes

### Technician

Technicians are managed resources, not V1 login users.

Track:

- Technician ID
- Name
- Phone
- Email
- Skills/specialization
- Service area
- Availability/status
- Current workload
- Joining date
- Notes

### AMC

AMC is a contract entity, not merely a boolean customer flag.

Track:

- AMC ID
- Customer
- Plan
- Start/end dates
- Frequency
- Amount
- Number of visits
- Status
- Renewal information
- Included assets
- Notes

---

## 5. Service Management

Two concepts must remain separate:

### Service Request

Used for operational work such as:

- Breakdown
- Complaint
- Repair
- Emergency request
- Installation/service request
- Other unplanned work

### Service Schedule

Used for planned work such as AMC preventive maintenance.

This separation allows a customer's planned PM schedule to coexist with unexpected breakdown requests.

---

## 6. Service Lifecycle

Typical lifecycle:

`REQUESTED → PENDING → SCHEDULED → ASSIGNED → IN PROGRESS → RESOLVED → COMPLETED → PAYMENT → CLOSED`

Optional states:

- `AWAITING PARTS`
- `ON HOLD`
- `REVISIT REQUIRED`
- `CANCELLED`

The application must enforce valid transitions rather than allowing arbitrary status changes.

---

## 7. Dashboard Requirements

### Admin dashboard

Show real calculated data:

- Active AMC
- AMC expiring soon
- Customers
- Technicians
- Pending services
- Monthly services
- AMC revenue
- Total service revenue where applicable
- Technician performance
- Breakdown vs preventive maintenance
- Parts consumption
- Upcoming schedules
- Overdue services

### Staff dashboard

Prioritize operations:

- Today's services
- Pending requests
- Unassigned requests
- Upcoming schedules
- Overdue services
- Awaiting-parts services
- Recently completed services
- Quick actions

No KPI should be hardcoded for demonstration purposes in production.

---

## 8. Major Workflows

### Customer onboarding

`Create Customer → Create Site → Add AC Assets → Save`

### AMC workflow

`Create AMC → Select Assets → Define Frequency → Generate Schedules → Review`

### Service workflow

`Request/Schedule → Assign Technician → Start Service → Report → Parts → Payment → Complete → Close`

### Customer conversion

`Temporary Customer → AMC/qualifying relationship → Convert to Permanent`

The same customer ID and history remain intact.

---

## 9. UX/Product Principles

1. Modern SaaS-quality interface.
2. Fast and obvious workflows.
3. Minimal unnecessary navigation.
4. Real data behind every important screen.
5. Clear status communication.
6. Progressive disclosure for complex forms.
7. Strong search/filtering.
8. Excellent empty/loading/error states.
9. Smooth but purposeful animation.
10. Responsive layout.
11. Accessible keyboard/focus behavior.
12. Respect reduced-motion preferences.

---

## 10. Definition of V1 Complete

V1 is complete only when this real flow works:

`Admin creates Staff → Staff logs in → Customer → Site → AC Assets → AMC → Automatic schedules → Technician assignment → Service progress → Service report → Parts → Payment record → Completion → History → Dashboard analytics → Audit log`

A UI-only prototype does not satisfy V1.

---

## 11. Acceptance Criteria

A feature is accepted when:

- It persists valid data in Supabase.
- Unauthorized users cannot access it.
- Validation prevents invalid records.
- Loading/error/empty states are handled.
- Relevant audit activity is recorded.
- Related records remain consistent.
- Dashboard calculations update from real records.
- The workflow can be completed without manual database editing.
- Responsive behavior is usable.
- Motion does not block or confuse the workflow.

---

## 12. Product Success Criteria

The platform should make Staff able to answer quickly:

- What services need attention?
- Which services are due or overdue?
- Which technician is assigned?
- Which customer/site/AC is involved?
- What happened previously?
- What parts were used?
- What payment remains?
- Which AMCs are expiring?
- What work is scheduled today?

The UI should make these answers discoverable in seconds.
