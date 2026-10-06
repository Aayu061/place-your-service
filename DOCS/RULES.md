# Place Your Service — Business Rules & Algorithms

## 1. Rule Philosophy

Business logic must be explicit, deterministic, auditable and enforceable.

The frontend should not be the only place where an important rule exists.

---

## 2. Role Rules

### Admin

- Exactly one active Admin business account.
- Admin can manage Staff.
- Admin has full operational visibility.
- Admin can perform protected administrative actions.
- Admin cannot be created through ordinary Staff UI.

### Staff

- Staff can perform operational service-management work.
- Staff cannot grant themselves Admin privileges.
- Staff cannot modify authorization/security configuration.
- Staff actions are attributable through audit logs.

---

## 3. Customer Rules

A customer has one record.

Customer status/type may be:

- TEMPORARY
- PERMANENT

Conversion:

`TEMPORARY → PERMANENT`

must update the existing record.

Never create a second customer simply because the customer became permanent.

History must remain linked to the same customer.

---

## 4. Site Rules

A customer may have multiple sites.

An AC asset belongs to a site.

A site belongs to one customer.

Moving an AC to another site must be an explicit auditable operation.

---

## 5. AC Asset Rules

Each AC should have a unique internal asset ID.

QR references should resolve to the correct AC asset.

Important identifying fields:

- serial number
- model
- brand
- type
- capacity

Do not silently overwrite historical service information.

Warranty state should be derived or updated using documented rules.

---

## 6. AMC Rules

AMC is a contract.

Required:

- customer
- start date
- end date
- plan/frequency
- amount
- included assets
- status

Contract date rule:

`end_date >= start_date`

AMC status can be derived from dates and cancellation state.

---

## 7. AMC Schedule Algorithm

### Input

- start date
- end date
- frequency
- selected AC assets

### Frequency interval

```text
MONTHLY       = 1 month
QUARTERLY     = 3 months
HALF_YEARLY   = 6 months
YEARLY        = 12 months
```

### Algorithm

1. Validate contract.
2. Establish first schedule date.
3. Generate next date using calendar-aware month arithmetic.
4. Stop after the contract end date.
5. For each asset, check whether an equivalent schedule already exists.
6. Insert only missing schedules.
7. Mark records as generated from AMC.
8. Record generation activity.
9. Re-generation must be idempotent.

The system must not create duplicate schedules if the generation action is run twice.

---

## 8. Service Priority

Suggested priority levels:

- EMERGENCY
- HIGH
- MEDIUM
- LOW

Priority can consider:

- emergency flag
- breakdown severity
- customer/asset impact
- overdue duration
- AMC commitment
- requested date

The exact scoring should be configurable rather than hidden in UI code.

---

## 9. Technician Recommendation

Technicians are resources, not application users.

Recommendation inputs:

- service area
- technician availability
- current workload
- required skill
- existing schedule conflicts
- optional distance/proximity data

Example scoring:

```text
Area compatibility   40
Availability         20
Proximity            20
Workload             10
Skill match          10
------------------------
Total                100
```

Higher score = stronger recommendation.

Rules:

- unavailable technicians are excluded.
- conflicting assignments are excluded or heavily penalized.
- Staff can override the recommendation.
- Manual override must be logged.
- Assignment must not silently change because a recommendation later changes.

---

## 10. Scheduling Conflict Rules

Before assignment:

1. Check technician availability.
2. Check overlapping assignments.
3. Check service duration if available.
4. Warn/block depending on conflict severity.
5. Require explicit override for protected conflicts.

---

## 11. Service State Machine

Allowed normal flow:

```text
REQUESTED
  ↓
PENDING
  ↓
SCHEDULED
  ↓
ASSIGNED
  ↓
IN_PROGRESS
  ↓
RESOLVED
  ↓
COMPLETED
  ↓
PAYMENT
  ↓
CLOSED
```

Alternative paths:

```text
IN_PROGRESS → AWAITING_PARTS
AWAITING_PARTS → IN_PROGRESS

IN_PROGRESS → REVISIT_REQUIRED
REVISIT_REQUIRED → SCHEDULED

Any suitable pre-completion state → ON_HOLD
ON_HOLD → previous operational state

Eligible states → CANCELLED
```

A user must not arbitrarily jump between incompatible states.

---

## 12. Service Completion Rules

A service should not become `COMPLETED` unless required completion information exists.

Depending on service type, this may include:

- technician
- service date
- service report
- work summary
- parts information
- payment status/decision

The exact mandatory fields should be configurable by service type.

---

## 13. Parts Rules

When parts are consumed:

- quantity must be positive
- stock availability must be checked
- service-part record must be created
- inventory transaction must be created
- stock must remain consistent
- low-stock threshold must be evaluated

Never directly edit stock without an auditable transaction unless the action is an explicit inventory adjustment.

---

## 14. Payment Rules

Payment status should reflect actual transactions.

For an amount due:

`Outstanding = Total Due - Confirmed Payments + Refund Adjustments`

Statuses:

- PENDING
- PARTIALLY_PAID
- PAID
- FAILED
- REFUNDED

Online payment becomes `PAID` only after trusted verification.

Cash requires an auditable staff record.

---

## 15. Dashboard Rules

Examples:

### Active AMC

Count valid active contracts that are not cancelled/expired.

### Expiring AMC

Contracts whose end date falls within the configured warning period.

### Pending services

Services whose operational status is still awaiting action.

### Overdue

Scheduled service where:

`scheduled_date < current_date`

and it is not completed/cancelled.

### Monthly services

Services completed or scheduled in the selected calendar month according to the dashboard metric definition.

Every metric must have a written definition.

---

## 16. Audit Rules

Log at minimum:

- login/security events where available
- customer creation/update
- AMC creation/update/cancellation
- service creation/status changes
- assignment/override
- parts usage
- inventory adjustments
- payment changes
- staff activation/deactivation
- administrative changes

Audit logs should not be casually editable or deletable by Staff.

---

## 17. Notification Rules

Trigger notifications for important operational events.

Examples:

- AMC expiring soon
- overdue service
- newly assigned service
- low stock
- payment failure
- service awaiting parts

Notifications should avoid unnecessary spam.

---

## 18. Data Deletion Rules

Do not hard-delete operational history merely to remove it from normal views.

Prefer:

- inactive
- archived
- cancelled
- soft-deleted where appropriate

Permanent deletion should be restricted to appropriate administrative/data-governance workflows.

---

## 19. Idempotency

Operations that may be retried must be safe.

Especially:

- AMC schedule generation
- payment webhook processing
- inventory transaction creation
- notification creation

Repeated execution must not duplicate business records.

---

## 20. Error Philosophy

Reject invalid operations early.

Never silently:

- duplicate customers
- duplicate schedules
- create negative stock
- complete invalid services
- overwrite protected history
- elevate permissions
