# PYS Full V1 Enhancement Specification

**Status: FINALIZED**  
**Date:** 5 November 2026  
**Baseline:** `main` at `ab4f82b`; current user-approved audit and enhancement plan.

## Goal

Complete the internal Admin/Staff V1 in the PRD with a secure server-side data boundary, correct auditable business workflows, real backend-backed operational modules, improved accessible UI, and empirical verification against isolated staging only.

## Users and scope

- Users: Admin and Staff. Technicians and customers remain managed records, not application users.
- Deliver all V1 operational scope in `DOCS/PRD.md`, including customers/sites/assets, service requests, AMC/PM, schedules/assignments, service reports, inventory, payment records, dashboards/analytics, notifications, activity logs, search, filters, sorting, pagination, and exports.
- Deliver service-report email with Resend as the initial production transport, a development log transport, and durable retry/status handling.
- Payment records are internal accounting records and may retain trusted external references. Do not implement a payment gateway.
- Do not build customer/technician portals, customer self-registration, technician login, vendor access, GPS tracking, or AI support.

## Accepted domain and architecture decisions

- The existing React/Vite → Express API → Supabase/PostgreSQL architecture remains. Express is the only business-data API; browser Supabase use is limited to Auth identity/session.
- AMC included visits are per covered asset. Cadence defines the number and dates of obligations in the contract term. Reject a contract if its visit count or service-type allocation does not equal those slots.
- Mutating workflows spanning multiple records must be atomic. Use PostgreSQL transactional functions or an equivalent transactional server boundary; keep issued service report snapshots and audit events immutable, using correction/reversal records for changes.
- Inventory stock is an immutable transaction ledger; available quantity may never go negative. Service consumption links to a service report.
- Posted payments and refunds/corrections are immutable ledger entries. Balances are derived from authoritative charges and posted ledger events; failed or pending payments do not reduce the amount due.
- Use Resend for production email delivery behind a replaceable adapter. Queue delivery durably, use idempotent dispatch and retries, and do not roll back a saved service report because email delivery failed.
- Keep `/api/v1` versioned contracts typed and validated. Avoid breaking existing routes unless a compatibility migration is included.
- Keep the existing design system and reduced-motion support. Improve accessible labels, focus/keyboard behavior, mobile layouts, loading/error/empty states, and URL-addressable navigation/search.
- Verification uses isolated local/staging data only. Do not access production for tests, apply production migrations, change production records, or deploy/promote to production under this goal.

## Security requirements

- Remove production-directed E2E requests and hard-coded credentials from tracked source. A credential embedded in a test must be treated as exposed and rotated/revoked before any reuse; the test suite must never contain or use it.
- Bootstrap Admin provisioning must not be publicly claimable and must be one-time and race-safe.
- Revoke unnecessary `anon` and `authenticated` database grants to business tables, sequences, and functions. Preserve the service-role grants needed by the private backend. Explicitly scope function privileges and default grants. RLS remains enabled as defense in depth.
- Keep secrets out of client bundles, logs, test fixtures, and Git. Use environment/secret-store configuration for staging, Resend, and test identities.
- Resolve high-severity production dependency advisories, including a tested Zod upgrade path.

## Acceptance criteria

1. No tracked production credentials or tests pointed at production remain; no production-targeted test is runnable through package scripts.
2. Browser users cannot read or mutate operational tables directly through Supabase Data API; authorized API flows continue to work for Admin/Staff, while unauthorized roles and anonymous callers are denied.
3. Database constraints and transaction boundaries enforce entity hierarchy, AMC obligation uniqueness/count/allocation, report/follow-up scope/history, schedule/assignment consistency, inventory non-negative balance, payment reversals, and audit immutability.
4. Every V1 navigation module performs real authorized API-backed work; no V1 navigation path resolves to a feature placeholder.
5. Email dispatch is durable and observable; exports are authenticated, filtered, correctly formatted workbooks.
6. The full PRD flow completes against staging without manual database edits and the automated checks pass. No high-severity production dependency advisories remain.
7. Production deployment/migrations remain a separate action after the implementation is reviewed.

## Known external prerequisites

- The workspace has no confirmed staging credentials or local Postgres/Docker tools. A Supabase development branch can be created if the connected account permits it; any platform cost prompt must be surfaced and honored.
- The exposed Admin credential cannot be declared rotated by repository changes alone. Do not use it; report rotation as an owner action if no safe authorized account-management path is available.
- Resend API key and verified sender domain must be supplied via staging/runtime secret configuration before a live staging delivery can be verified. Do not create keys or send customer emails without explicit provider authorization.
