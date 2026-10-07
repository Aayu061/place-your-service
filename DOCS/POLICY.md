# Place Your Service — Operational & Security Policy

## 1. Purpose

This policy defines operational controls for running the Place Your Service platform safely and consistently.

---

## 2. Account Policy

- Admin is a singleton business account.
- Staff accounts are created by Admin.
- Shared Staff accounts should be avoided.
- Inactive Staff accounts must lose application access.
- Credentials must never be shared through code or documentation.
- Password reset must use the approved authentication flow.

---

## 3. Role Policy

Only authorized administrative processes may modify role assignments.

Staff must never be able to:

- grant Admin access
- edit RLS policies
- access service-role credentials
- change production secrets
- bypass application authorization

---

## 4. Session Policy

- Use secure authentication sessions.
- Logout must invalidate the application session appropriately.
- Sensitive administrative actions may require re-authentication where supported.
- Do not persist authentication secrets in unsafe custom storage.

---

## 5. Secret Management Policy

Never commit secrets to source control.

Examples:

- Supabase service-role key
- payment secrets
- API keys
- SMTP credentials
- production tokens

Use environment variables or an approved secret-management system.

---

## 6. RLS Policy

RLS is mandatory for exposed operational tables.

Every migration that introduces a table must include:

1. RLS enablement.
2. Intended policies.
3. Role/access review.
4. Negative authorization testing.

---

## 7. Data Quality Policy

Staff must maintain accurate:

- customer records
- site information
- AC identifiers
- service statuses
- technician assignments
- inventory transactions
- payment records

Do not use fake records to make dashboards appear populated in production.

---

## 8. Service Operations Policy

Every service must have a traceable lifecycle.

Important status changes should identify:

- who performed the action
- when
- what changed

Manual overrides must be auditable.

---

## 9. Inventory Policy

Inventory adjustments require a reason.

Service usage should originate from service records.

Negative stock should be prevented unless an explicitly approved business rule permits it.

Low-stock thresholds should be defined per part where useful.

---

## 10. Payment Policy

Payment records must be auditable.

Online payment confirmation must come from a trusted backend/provider mechanism.

Cash entries must identify the Staff member who recorded them.

Refunds and corrections must not silently rewrite the original transaction history.

---

## 11. Backup & Recovery Policy

The production database must use an appropriate backup/recovery strategy provided by the hosting architecture.

Recovery procedures should be documented and periodically tested.

Do not assume that having a database provider automatically means the application has a tested recovery plan.

---

## 12. Change Management

Changes to:

- database schema
- RLS policies
- authentication
- payment logic
- service state machine
- inventory logic

must be reviewed and tested before production deployment.

---

## 13. Environment Policy

Separate:

- development
- staging/testing where available
- production

Production credentials must not be used in local development.

---

## 14. Frontend Quality Policy

Before release, verify:

- responsive layout
- keyboard navigation
- loading states
- error states
- empty states
- animations
- reduced-motion behavior
- browser compatibility
- no console errors caused by the application
- no leaked secrets

---

## 15. Animation Policy

Animation must:

- communicate state
- preserve usability
- remain performant
- respect reduced motion
- not delay critical actions unnecessarily

Avoid animation for animation's sake.

---

## 16. Audit Policy

Audit logs should be protected from Staff tampering.

Critical administrative actions should always be traceable.

---

## 17. Data Retention Policy

Until formal business/legal retention periods are approved:

- retain records necessary for operational continuity
- archive inactive records instead of deleting useful history
- restrict access to archived data
- review long-term retention periodically

---

## 18. Incident Response

For suspected security incidents:

1. Restrict affected access.
2. Rotate exposed credentials.
3. Preserve logs.
4. Investigate.
5. Patch the root cause.
6. Verify access controls.
7. Document the incident.
8. Complete any required follow-up.

---

## 19. Release Gate

A release should not be considered production-ready if:

- critical business logic is mocked
- RLS is incomplete
- secrets are exposed
- important workflows bypass the backend
- inventory/payment calculations are unreliable
- status transitions are unrestricted
- auditability is missing for critical actions

---

## 20. Technician Operational Resource Policy

- **No User Credentials Policy:** Technicians are operational workers and never system users. Technicians must not be granted application accounts, credentials, or login access.
- **Deactivation Safety Policy:** Technicians cannot be deactivated if they have active assignments (`TECHNICIAN_HAS_ACTIVE_ASSIGNMENTS`). Operations must reassign or close active work first.
- **Historical Preservation Policy:** Technician records must not be hard-deleted. Administrative deactivation preserves foreign-key integrity for historical service assignments, reports, and audit trails.

