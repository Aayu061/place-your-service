# PYS Full V1 Enhancement Roadmap

**Status:** In progress  
**Spec:** `.gsd/SPEC.md` (FINALIZED)  
**Verification boundary:** local and isolated staging only; no production access or writes.

## Phase 1 — Test credential containment and access boundary

Remove production credentials/targets from the current live test, replace it with a staging-only harness, close the public Admin bootstrap path, tighten Data API grants/default privileges and RLS, consolidate fallback auth token handling, and remediate production dependency advisories. **Exit:** source scans show no credential or production E2E target; tests prove public/browser operational access is denied; build and dependency audit are clean.

## Phase 2 — Transactional domain integrity

Repair the prior AMC, report, schedule, asset, and KPI defects. Add versioned additive migrations, transactional mutation boundaries, and regression tests. Enforce per-asset AMC cadence slots and allocation equality, hierarchy and follow-up integrity, immutable report/audit history, actionable reschedules, and consistent server-side KPI definitions. **Exit:** migrations apply to an isolated database; PostgreSQL and API tests cover rejection, concurrency, rollback, and history preservation.

## Phase 3 — Backend V1 modules and integrations

Complete inventory, payment records, notifications, immutable activity logs, durable Resend outbox/retry, global search, and filtered XLSX export endpoints. Add typed request/response contracts and role enforcement. **Exit:** each module has real database-backed API behavior and route/permission/validation tests.

## Phase 4 — Frontend integration and UX

Replace V1 placeholders with connected screens; consolidate typed API/query/mutation handling; add URL-addressable navigation, global search, actionable loading/empty/error/stale states, accessible forms/tables, responsive layouts, and exports/email status UI. **Exit:** each V1 module is wired end-to-end and keyboard/mobile review has no known blockers.

## Phase 5 — Staging verification and release readiness

Run unit/API/PostgreSQL/browser E2E checks against staging, lint/typecheck/builds, dependency and database security checks, and the complete Admin-to-Staff operational workflow. Prepare a migration and rollback handoff; do not apply it to production. **Exit:** every SPEC acceptance criterion is evidenced; unresolved gaps are listed rather than marked complete.

## Dependency order

`Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5`

## Current blocker inventory

- No staging Supabase branch exists; the connected Supabase account has one healthy project and zero branches. Creating a development branch may incur charges and will be handled through the connector’s cost check.
- No local `psql`, Docker, Supabase CLI, or backend `.env` was detected. A database-backed migration verification path must be established before Phase 2 can be declared verified.
- Production credential rotation and Resend sender/key setup require owner-controlled external access. Repository cleanup and staging-only code can proceed without those credentials.
