# Place Your Service — System Architecture

## 1. Architecture Goal

Create one coherent internal web application backed by one central Supabase/PostgreSQL system.

```text
                PLACE YOUR SERVICE
                       │
                Web Application
                Admin + Staff
                       │
              Authentication Layer
                       │
                 Supabase API
                       │
                PostgreSQL / RLS
             ┌─────────┼─────────┐
             │         │         │
          Storage   Realtime   Functions
```

---

## 2. Application Layers

### Presentation layer

Responsible for:

- pages
- components
- navigation
- forms
- tables
- charts
- animations
- user interaction

### Application/business layer

Responsible for:

- validation
- workflow orchestration
- status transitions
- calculations
- recommendation logic
- mutation coordination

### Data layer

Responsible for:

- PostgreSQL
- relationships
- constraints
- indexes
- RLS
- transactions
- views/functions

### Storage layer

Supabase Storage may hold:

- service photos
- service documents
- reports
- attachments

The database stores metadata and storage paths, not large binary files directly.

---

## 3. Authentication Architecture

Supabase Auth manages identity.

Application records connect authenticated identities to internal role data.

Conceptual structure:

```text
Auth User
   │
   └── Profile
         │
         └── Staff
               └── Role
```

Admin is a singleton business identity.

---

## 4. Core Relationships

```text
Customer
   │
   ├── Customer Sites
   │       │
   │       └── AC Assets
   │
   ├── AMC Contracts
   │       │
   │       └── AMC Assets
   │
   ├── Service Requests
   │
   ├── Service Schedules
   │
   └── Payments

Technician
   │
   └── Service Assignments

Service
   ├── Report
   ├── Parts Used
   └── Payments
```

---

## 5. Service Architecture

Keep planned and unplanned work separate.

```text
AMC
 │
 └── Service Schedule
          │
          └── Assignment
```

and:

```text
Service Request
      │
      └── Assignment
```

Both can eventually produce a service execution/report.

---

## 6. Database Design Principles

- Normalize relational data.
- Use foreign keys.
- Use indexes for common filters.
- Use unique constraints where appropriate.
- Avoid duplicated customer records.
- Preserve history.
- Prefer transactions for related mutations.
- Use soft deletion/status where history must remain.
- Avoid destructive deletion of operational records.

---

## 7. Security Boundary

```text
Browser
  │
  │ public client key only
  ▼
Supabase
  │
  ├── Auth
  ├── RLS
  ├── Database
  └── Storage policies
```

Privileged secrets must remain server-side.

RLS is the final authorization boundary, not just UI hiding.

---

## 8. RLS Strategy

Each exposed table must answer:

- Can Admin read it?
- Can Admin write it?
- Can Staff read it?
- Can Staff write it?
- Are certain fields restricted?
- Is deletion allowed?

Policies should be role-aware and deny by default.

---

## 9. Activity Logging

Important mutations should create an activity record.

Record:

- actor
- action
- entity
- entity ID
- timestamp
- relevant before/after information where appropriate
- metadata

Do not store unnecessary sensitive data.

---

## 10. Notifications

Notification triggers can include:

- AMC expiring
- Service overdue
- New assignment
- Low stock
- Failed payment
- Service awaiting parts
- Important administrative action

Notifications should be persistent records when users need an audit/history trail.

---

## 11. Reporting Architecture

For ordinary pages:

- direct filtered queries

For dashboards:

- aggregate queries/views

For heavier reporting:

- dedicated reporting queries/materialized structures if justified

Do not fetch all operational records to the browser just to calculate KPIs.

---

## 12. Performance Architecture

Use:

- indexes
- pagination
- query filters
- selective columns
- lazy loading
- caching for stable reference data
- optimized assets

Long-running operations should provide visible progress/status.

---

## 13. Future Extensibility

The database should use clean domain boundaries so additional interfaces could theoretically connect later.

However, future customer/vendor/technician applications are **not part of the current implementation** and must not drive current UI scope.

---

## 14. Deployment Boundary

Maintain separate environment configuration.

```text
Development
    ↓
Testing
    ↓
Production
```

Secrets belong in environment configuration.

Never commit credentials.

---

## 15. Reliability

Critical operations should be atomic.

Examples:

- recording service parts + inventory transaction
- recording payment + balance update
- generating schedules + duplicate checks

Use database transactions/functions where necessary.
