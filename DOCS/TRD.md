# Place Your Service — Technical Requirements Document

## 1. Technical Objective

Build a production-oriented internal Service Management Web Platform with a modern frontend and a real Supabase/PostgreSQL backend.

The implementation must prioritize:

- Real persistence
- Secure authorization
- Strong relational data integrity
- Explainable business logic
- Responsive UI
- High-quality transitions and micro-interactions
- Maintainability
- Testability

---

## 2. Recommended Stack

### Frontend

Use a modern web application stack supported by the implementation environment.

Preferred direction:

- HTML/CSS/JavaScript-compatible frontend architecture
- Componentized UI where useful
- Modern CSS
- Responsive layout
- Accessible semantic HTML
- Animation library only when it adds real value

If a framework is used, it must not introduce unnecessary complexity.

### Backend

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage for large files where required
- Supabase Realtime only where operationally useful
- Database functions/triggers where they improve integrity
- Edge/server-side functions for privileged operations where required

---

## 3. Authentication

Use Supabase Auth for internal authentication.

Requirements:

- Staff login
- Admin login
- Protected application routes
- Session persistence
- Logout
- Password reset flow
- Account activation/deactivation
- Secure session handling

Do not expose service-role credentials to the browser.

Authorization must not depend solely on editable client-side metadata.

---

## 4. Authorization

Use database-backed role information and RLS.

Minimum roles:

```text
ADMIN
STAFF
```

Admin is singleton by business rule.

Staff records must be linked to authenticated identities.

Every exposed table must have an intentional RLS policy.

---

## 5. Database Requirements

Use normalized relational PostgreSQL tables.

Suggested logical entities:

- profiles
- staff
- customers
- customer_sites
- ac_assets
- technicians
- amc_plans
- amc_contracts
- amc_assets
- service_requests
- service_schedules
- service_assignments
- service_reports
- parts
- inventory_transactions
- service_parts
- payments
- payment_transactions
- notifications
- activity_logs

Exact schema should be finalized before production migration.

Every operational table should normally include:

- primary key
- created_at
- updated_at where appropriate
- created_by where appropriate
- updated_by where appropriate
- status where appropriate

Use foreign keys for relationships.

---

## 6. IDs and Data Integrity

Use stable database IDs as primary keys.

Human-readable IDs may be generated separately, for example:

- Customer ID
- AC ID
- Technician ID
- AMC ID
- Service ID
- Payment ID

Do not use human-readable IDs as the only relational key.

Use unique constraints for business identifiers that must be unique.

---

## 7. Frontend Data Access

Frontend code must:

- Request only required data
- Use pagination for large lists
- Filter/search server-side where appropriate
- Avoid fetching entire tables unnecessarily
- Handle network failure
- Display loading states
- Prevent duplicate submissions
- Refresh stale data after mutations

---

## 8. Validation

Validation must exist at both:

- Frontend level for UX
- Backend/database level for integrity

Examples:

- Required customer fields
- Valid email format
- Valid phone format
- AMC end date cannot precede start date
- Service cannot be completed without required completion information
- Inventory cannot become negative unless explicitly permitted
- Invalid state transitions are rejected
- Duplicate AC serial numbers should be prevented where the business rule requires uniqueness

---

## 9. Service Assignment Algorithm

A practical recommendation score may consider:

```text
Area compatibility       40%
Availability             20%
Distance/proximity       20%
Current workload         10%
Skill match               10%
```

The exact weights should remain configurable.

The system should return recommended technicians with reasons, for example:

- Same service area
- Available at requested time
- Lowest active workload
- Required skill matched

Staff retains override authority.

The recommendation must never silently reassign an already-confirmed technician.

---

## 10. AMC Schedule Generation

Inputs:

- AMC start date
- AMC end date
- Frequency
- Included AC assets

Frequency options:

- Monthly
- Quarterly
- Half-yearly
- Yearly

Algorithm:

1. Validate contract dates.
2. Determine the frequency interval.
3. Start from the contract's schedule anchor date.
4. Generate dates until the next date exceeds contract end.
5. Check for existing schedule records.
6. Do not create duplicates.
7. Mark generated schedules as system-generated.
8. Allow authorized Staff/Admin adjustment.
9. Preserve audit history.

Date calculations must handle month lengths safely.

---

## 11. Due and Expiry Logic

AMC:

```text
ACTIVE
EXPIRING_SOON
EXPIRED
CANCELLED
```

should be derived from dates and status, not manually typed dashboard values.

Service:

```text
UPCOMING
DUE
OVERDUE
COMPLETED
CANCELLED
```

can be calculated from schedule dates and actual completion state.

---

## 12. Inventory Logic

Do not treat stock as a manually editable number only.

Use transaction records:

```text
OPENING / PURCHASE / ADJUSTMENT / SERVICE_USAGE / RETURN
```

Calculated stock:

`opening + incoming + adjustments - usage + returns`

When a service consumes a part:

1. Validate available quantity.
2. Create service-part record.
3. Create inventory transaction.
4. Update/recalculate stock.
5. Check low-stock threshold.
6. Create notification if required.
7. Audit the operation.

Use database transactions for multi-step mutations.

---

## 13. Payment Logic

Payment statuses:

- PENDING
- PAID
- FAILED
- PARTIALLY_PAID
- REFUNDED

Methods:

- CASH
- ONLINE

For online payments, `PAID` must be based on trusted backend/provider confirmation, not a browser success screen alone.

Cash payments must record:

- Amount
- Recorded by
- Date/time
- Reference/receipt where applicable

Outstanding balance must be calculated from actual payment transactions.

---

## 14. Dashboard Data

Dashboard cards and charts must use actual database queries/views/aggregations.

Avoid downloading all records to the browser merely to calculate totals.

For high-volume reporting:

- indexed queries
- database views
- aggregate queries
- materialized/reporting structures where justified

---

## 15. Performance

Requirements:

- Pagination on large tables
- Debounced search
- Indexed filter columns
- Lazy loading where useful
- Optimized images
- Avoid unnecessary re-renders
- Avoid animation-heavy rendering on large data tables
- Cache stable reference data where appropriate
- Use skeleton states instead of blocking blank screens

---

## 16. Error Handling

Every mutation should have:

- validation feedback
- loading state
- success confirmation
- failure message
- retry path where appropriate

Do not expose raw database errors to normal users.

Log technical details securely for debugging.

---

## 17. Testing

Minimum testing categories:

- Authentication
- Authorization/RLS
- CRUD operations
- Service state transitions
- AMC date generation
- Duplicate prevention
- Technician recommendation
- Inventory transactions
- Payment calculations
- Dashboard calculations
- Responsive UI
- Accessibility
- Error states

Critical business logic should have automated tests where practical.

---

## 18. Deployment

Environment-specific configuration must use environment variables.

Never commit:

- Supabase service-role keys
- API secrets
- Payment secrets
- Production credentials

Use separate development and production environments when possible.

---

## 19. Observability

Track:

- Application errors
- Failed critical operations
- Authentication failures where available
- Slow operations
- Important business events
- Audit events

Do not log unnecessary personal data.
