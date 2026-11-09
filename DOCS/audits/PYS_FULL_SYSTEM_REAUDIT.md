# PYS Full System Re-Audit

**Audit date:** 11 October 2026  
**Mode:** read-only source, migration, test, build, and configuration audit  
**Audited revision:** main at 826a0b3879be3561b8faba6957953dec87c32115  
**Scope limitation:** no live Supabase data, Render configuration, or deployed frontend state was changed or inspected with credentials. Findings marked LIKELY are based on migration/code paths whose production execution could not be confirmed.

## 1. Executive summary

PYS is a real React, Express, Supabase/PostgreSQL application, not a static prototype, and the principal customer, site, asset, technician, AMC, scheduling, and report screens are implemented. The current HEAD contains the post-4031274 AMC allocation planner commit 826a0b3. The repository was clean before report creation and main matched origin/main.

The re-audit found **20 actionable findings: 0 P0, 13 P1, 5 P2, and 2 P3**. The dominant risk is integrity, rather than an unauthenticated external breach:

1. The AMC service-allocation model is not reconciled to the contract's included-visit count or asset cardinality.
2. Report, schedule, and follow-up relationships can be created across inconsistent customer/site/asset contexts and can resolve the wrong work.
3. Issued report snapshots and resolved items are mutable through ordinary report editing; one GET path also mutates the record.
4. Authenticated users can call the exposed Supabase data API directly under broad RLS policies, bypassing server business rules and manufacturing audit-log entries.
5. Several core multi-write workflows lack database transactions or database uniqueness constraints.

The existing checks are healthy at a compilation and mocked-test level: frontend tests (139 tests), backend test suite (exit 0), both type checks, both lint commands, and both production builds passed. That does **not** prove the cross-record/database invariants because the API tests mock Supabase and do not run migrations against PostgreSQL.

## 2. Repository and architecture baseline

| Item | Observed result |
|---|---|
| Branch / remote divergence | main; 0 ahead and 0 behind origin/main |
| Working tree before reports | clean |
| Required known commit | 4031274 is an ancestor of HEAD |
| Recent HEAD | 826a0b3, AMC allocation planner |
| Frontend | React 19, Vite, TypeScript; deployed target documented as Vercel |
| Backend | Express/TypeScript; Render blueprint runs server/ |
| Persistence | Supabase/PostgreSQL migrations in supabase/migrations |
| Auth | Supabase Auth JWT verified by server middleware; Admin and Staff roles |
| Browser configuration | only public VITE_SUPABASE_* variables present; no service-role key found in frontend source |

Positive controls verified include Helmet, CORS allow-list configuration, body-size limits, a global rate limiter, server-side Zod validation on routed APIs, JWT/profile/staff activity checks, role middleware, service-role use on the server only, and secret-key redaction in the structured logger.

## 3. Documentation and implementation status

All twelve requested source-of-truth and prior-audit documents exist. The product documents correctly state the Customer → Site → physical AC asset hierarchy, backend enforcement requirement, immutable operational history expectation, and full V1 workflow. The current implementation only delivers part of that declared workflow.

DOCS/MEMORY.md still calls multiple phases “COMPLETE” and describes ac_assets.customer_id, even though the migration defines ac_assets through site_id and the current schedule service queries a nonexistent customer_id column. The prior completion reports describe the allocation, resolution, and snapshot enhancements as complete, but do not cover the invariant gaps below. These are documentation/verification contradictions, not evidence that the documented production state was actually deployed.

## 4. Feature inventory

| Area | Status | Audit result |
|---|---|---|
| Authentication and Admin/Staff management | Implemented; partially verified | Server auth and role guards exist; initial-admin bootstrap is publicly reachable until an admin exists (PYS-018). |
| Customers, sites, assets | Implemented; partially verified | CRUD, deactivation and ESSC sequence exist. Master relationship/update and filtering problems remain (PYS-016, PYS-017). No permanent asset-delete route was found; this is a conservative historical-data choice. |
| AC master data | Implemented; partially verified | Brand/model/variant routes and UI exist; update relationship validation is incomplete (PYS-017). |
| Service requests | Implemented; partially verified | Server routes, transitions, cancellation and UI are present. |
| Technicians / assignment | Implemented; partially verified | Eligibility/conflict checks and UI exist; rescheduling can strand work (PYS-011). |
| AMC / PM | Implemented but unsafe for critical allocation/progress cases | Core contract, coverage, PM generation and renewal exist; PYS-001 through PYS-004, PYS-013, and PYS-014 apply. |
| Service reports / print | Implemented but unsafe for critical history/resolution cases | Reports, snapshots, printable view, and follow-up UI exist; PYS-005 through PYS-010 and PYS-012 apply. |
| Inventory / parts | UI-only placeholder | Tables exist in foundation migration, but no routes/services or functional page were found. |
| Payments | UI-only placeholder | Tables exist in foundation migration, but no routes/services or functional page were found. |
| Notifications / activity-log workspace | UI-only placeholder | Notification and log tables exist; no implemented workspace/API. Top-bar notification text says shell preview. |
| Dashboard analytics | UI-only shell | Explicit “Preview”/“--” KPIs and demonstration rows; not presented as live data, so classified as deferred rather than a data-fabrication defect. |

## 5. Database and migration audit

The migration sequence is ordered from foundation through asset master data, reports, snapshots, issue resolution, and the allocation planner. It defines appropriate basic primary keys, foreign keys, enum-like checks, indexes, RLS enablement, and a collision-resistant ESSC sequence. The latest schema does not supply the business constraints required by the application:

- No database check makes dry_service_visits + jet_service_visits + pumpdown_service_visits equal total_visits.
- No database uniqueness rule prevents more than one service report for a service_schedule_id.
- No database constraint enforces a report asset belongs to the report schedule/customer/site.
- No immutable-snapshot trigger prevents changes to service_report_assets after issuance.
- The report item asset is nullable, weakening per-asset issue resolution.
- The migration backfills snapshots from current asset values and resolves old pending reports by customer/site rather than an issue/asset relationship (PYS-012).

RLS is enabled, but the foundation migration grants all public table/routine/sequence privileges to anon and authenticated and creates broad authenticated Staff insert/update policies over operational tables. RLS therefore does not enforce the intended “backend-only business operation” boundary (PYS-010). Anon users remain blocked by the lack of anon policies; this finding concerns authenticated application users.

## 6. AMC allocation, cadence, and history audit

### PYS-001 — P1 VERIFIED: allocation is generated from cadence dates, not included visits

Evidence: server/src/services/amc.service.ts:54-79 calculates dates only from start/end/frequency; lines 1162-1175 calls computePlannedServiceTypes with dates.length; lines 1229-1254 creates a schedule for every selected asset/date. The form validates allocation against totalVisits, but the generator never reconciles totalVisits with date count or covered-asset multiplicity.

Reproduce with a quarterly, 2026-01-01 to 2026-12-31 contract and totalVisits 3 allocated 1/1/1. Four dates are generated and the fourth is silently made Dry by the fallback at lines 119-122. Adding two assets multiplies schedules again. Expected: an explicit business rule maps total included visits to contract-level obligations and asset coverage, then rejects incompatible cadence/counts. Actual: the saved allocation and generated work can diverge.

### PYS-002 — P1 VERIFIED: PATCH can persist invalid allocation and rewrite the plan after generation

Evidence: server/src/validators/amc.validator.ts:137-156 validates the allocation sum only when totalVisits and an allocation field are supplied in the same request. service amc.service.ts:863-921 writes fields directly; migration 20261011010000_amc_service_allocation_planner.sql:4-36 has only non-negative checks. Existing schedules are skipped rather than reconciled by the generator.

Expected: validate the merged persisted state; lock or version allocation/visit changes once PM work exists; preserve completed/historical planned types. Actual: PATCH of just dryServiceVisits can make a contract internally invalid and changes do not reconcile existing schedules.

### PYS-003 — P1 VERIFIED: renewal discards service allocation

Evidence: renewAmcContractSchema at server/src/validators/amc.validator.ts:179-198 has no allocation fields. renewContract at service lines 1417-1444 inserts no allocation values. Null values invoke the legacy Dry/Jet alternation at lines 90-94.

Expected: explicit successor allocation input or validated carry-forward of the predecessor allocation. Actual: a renewed contract silently falls back to legacy sequencing.

### PYS-004 — P1 VERIFIED: AMC progress does not recognize a successfully resolved revisit

Evidence: AMC list/detail counts at server/src/services/amc.service.ts:427-460 and 586-617 exclude pending original reports and exclude schedules with rescheduled_from_id. A completed follow-up preserves the original PENDING outcome, as it should, but therefore cannot make the original obligation count complete. Asset current-AMC aggregation counts completed schedules differently at server/src/services/asset.service.ts:166-198.

Expected: authoritative obligation completion should reflect a valid linked resolution once, without counting the follow-up as another included visit. Actual: contract and asset screens can disagree and the contract can remain incomplete forever.

### PYS-013 — P1 VERIFIED: removing coverage deletes the historical AMC-asset association

Evidence: server/src/services/amc.service.ts:1080 onward deletes the amc_assets row after cancelling future work. Contract/asset AMC history queries use amc_assets. Expected: end-date/reason/archive the association while preserving contract membership history. Actual: historical coverage can disappear from views.

## 7. Reports, snapshots, and issue-resolution audit

### PYS-005 — P1 VERIFIED: schedule/report hierarchy is not enforced

Evidence: createReport, server/src/services/serviceReport.service.ts:102-167 and 283-338, accepts supplied report assets without proving they equal the schedule asset or belong to the schedule customer/site. schedule.service.ts:497-535 and 731-784 similarly does not consistently reconcile service-request, customer, site, and asset payload values.

Reproduction: an authenticated staff user who knows another asset UUID can submit it in a report for a different scheduled customer/site. Expected: server and DB reject any hierarchy mismatch. Actual: report header and asset snapshot can describe different entities, corrupting service history.

### PYS-006 — P1 VERIFIED: issue resolution can target an arbitrary source and is too broad

Evidence: serviceReport.service.ts:185-225 checks only the proposed original report’s customer/site; it does not require unresolved state, linked follow-up schedule, or matching affected asset. Lines 378-470 can set a source as resolved without an unresolved guard and can update all source items. Header outcome need only avoid COMPLETED with a pending asset (lines 146-157), so it is not derived from per-asset facts.

Expected: a follow-up must be linked to a specific unresolved source issue/asset and resolve only that scope, atomically once. Actual: unrelated same-site report data can close an issue; multi-asset or generic items can be closed without proof of their work.

### PYS-007 — P1 VERIFIED: issued report history is mutable and a GET mutates state

Evidence: updateReport at serviceReport.service.ts:1073-1163 deletes/rebuilds every service_report_assets snapshot from current ac_assets and deletes/recreates items with is_resolved false. getReportById at lines 621-641 clears a cancelled/missing follow-up ID through an UPDATE during a read.

Expected: issued snapshots, findings, resolution links, and reads are immutable except for controlled audited corrections/versioning. Actual: an edit can change historical equipment identity or reopen resolved items; a GET changes state without actor/audit.

### PYS-008 — P1 VERIFIED: report issuance has terminal-state, uniqueness, and transaction gaps

Evidence: createReport at serviceReport.service.ts:102-144 does not reject a cancelled schedule; lines 118-129 perform a check-then-insert and migration 20261010000000_service_visit_reports.sql has only a non-unique schedule index. Header/assets/items/status updates are separate writes at lines 240-483.

Expected: a DB unique constraint/idempotency key and one transaction; only valid reportable appointment states allowed. Actual: concurrent requests may create two reports for one appointment, and a cancelled schedule can be marked completed by reporting.

### PYS-009 — P1 VERIFIED: follow-up scope collapses multi-asset work into one asset

Evidence: createFollowUp at serviceReport.service.ts:1246-1290 assigns report.assets[0] to the new schedule, while resolution code can mark all original pending items/assets resolved. Expected: selected unresolved items/assets are persisted as follow-up scope. Actual: the first asset may not be pending and a single revisit may close unrelated work.

## 8. Scheduling, asset, and metric audit

### PYS-011 — P1 VERIFIED: rescheduling without a technician strands work

Evidence: server/src/services/schedule.service.ts:1421-1530 changes a schedule to RESCHEDULED when targetTechId is absent but does not create a successor. The unscheduled-work query at lines 424-432 does not include RESCHEDULED. Expected: leave an actionable SCHEDULED/UNASSIGNED work item or create a successor atomically. Actual: operational work falls out of the dispatch queue.

### PYS-014 — P2 VERIFIED: multi-write workflow failures are not atomic

Evidence: AMC creation logs and continues if coverage/PM generation fail (amc.service.ts:799-846); renewal uses manual compensations (1417-1525); schedule assignment updates a schedule before assignment insert (schedule.service.ts:621-711); reports use manual cleanup rather than a transaction (serviceReport.service.ts:240-372).

Impact: users can receive success or observe partial state with missing coverage, obligations, assignments, report items, or audit events. Use PostgreSQL RPC/functions or explicit transactional server operations and prove fault rollback.

### PYS-015 — P2 VERIFIED: KPI definitions and summary filters do not consistently match the UI labels

Evidence: AMC dashboard schedules query at amc.service.ts:311-328 does not restrict amc_id, so ordinary schedules can enter PM metrics. Service report summary at serviceReport.service.ts:949-1004 counts report headers, despite UI copy “Distinct active unresolved parts/repairs”, and applies customer/site but not the current outcome, resolution, date, visit-type, or search filters.

Expected: a defined source of truth for contract obligations and distinct unresolved items; cards say whether they are global or filtered. Actual: metrics can be inflated, disagree across screens, or appear unrelated to applied filters.

### PYS-016 — P2 VERIFIED: schedule validation/schema mapping are incomplete

Evidence: schedule.service.ts:765-779 queries ac_assets.customer_id, but foundation migration 20261007000000_foundation_schema.sql:139-156 defines no such column. schedule.validator.ts accepts independent start/end times and updateSchedule does not validate their ordering; database conflict handling is not returned consistently as a conflict.

Expected: resolve customer through customer_sites; require endTime > startTime and return consistent conflict errors. Actual: generic AMC/asset resolution can fail and invalid/inverted appointment ranges can pass business validation.

### PYS-017 — P2 VERIFIED: asset master/filter/warranty invariants are incomplete

Evidence: asset.service.ts update flow accepts brandId/modelId writes without revalidating their relationship; listGlobalAssets accepts customerId in asset.validator.ts:73-84 but listAssets does not apply it; warranty display is calculated while filtering reads a stored warranty_status value. Expected: relational master validation on every write and one authoritative warranty/filter calculation. Actual: catalogue relationships and filter results can become inconsistent.

## 9. Security and operational reliability

### PYS-010 — P1 VERIFIED: authenticated direct-Supabase access bypasses server rules

Evidence: src/services/supabase.ts creates an anon-key browser client. Foundation migration lines 544-586 gives Admin and Staff broad RLS insert/update access for operational tables; lines 624-630 grant all schema objects to anon/authenticated. The same migration permits all Staff to insert activity_logs at lines 603-610.

Expected: browser operations use the backend for rule-enforced writes, and audit events are server/trigger generated. Actual: an authenticated Staff user can use Supabase REST directly to bypass API validation/state transitions and insert plausible audit rows. This is not anonymous access; it is an integrity and authorization-boundary bypass by a legitimate user.

### PYS-018 — P2 VERIFIED: first-admin bootstrap is an exposed, non-transactional provisioning path

Evidence: server/src/routes/auth.routes.ts:15-20 exposes POST /bootstrap-admin without authentication. auth.service.ts:58-199 checks for an existing admin and then creates/updates Auth and profile records. An uninitialised public deployment permits the first caller to own the Admin account; concurrent attempts are not a single transaction. Treat this as an installation-only operation, remove/disable it after provisioning, or require a deployment secret.

## 10. UI/UX audit

The implemented operational pages use coherent cards, chips, drawers, empty states, print rendering, and responsive grids. AMC allocation visibly shows the three counts, allocated/remaining feedback, and disables submit for an incorrect UI total. The service-report register provides useful original/follow-up links and print access.

The usability problem is that polished UI validation makes the deeper server/database inconsistency less visible. A Staff member can see a balanced allocation, success toast, linked revisit, and “resolved” badge even when the authoritative obligations, asset scope, or history are incorrect.

**PYS-019 — P3 VERIFIED:** ServiceReportsManagement.tsx:1357-1396 renders follow-up Date, Start Time, and End Time labels without for/htmlFor-to-input associations. Add IDs and associate labels; retain keyboard/focus behavior.  
**PYS-020 — P3 TECHNICAL DEBT:** source documentation is stale around ac_assets.customer_id and “complete” phase claims; frontend service-report test output also emits a React act(...) warning. Correct documentation and eliminate the warning so tests model observed UI state reliably.

The dashboard and unimplemented nav modules explicitly label themselves Preview, Shell, or Awaiting Backend Integration. They are a product-completeness gap against PRD scope, but are not being counted as deceptive fake production workflows.

## 11. Verification results

| Command | Result |
|---|---|
| npm test | PASS — 16 test files, 139 tests. One non-failing React act(...) warning in a service-report test. This suite made read-only health/readiness calls to the configured public Render API. |
| npm run server:test | PASS — exit 0. Tests use mocked Supabase clients for mutation paths; expected-error logs are emitted. |
| npm run typecheck | PASS |
| npm run server:typecheck | PASS |
| npm run lint | PASS |
| npm run server:lint | PASS; this script is TypeScript noEmit rather than ESLint |
| npm run build | PASS — Vite production build completed |
| npm run server:build | PASS — server TypeScript build completed |

Missing regression coverage includes allocation/cadence reconciliation for arbitrary visit counts and multiple assets; PATCH merged-state validation; renewal allocation carry-forward; one-obligation/one-completion semantics; cross-customer/site/asset negative cases; report immutability; concurrent duplicate report and PM creation; follow-up item scope; real PostgreSQL RLS/constraint tests; and transaction fault injection.

## 12. Recommended implementation order

1. Freeze risky production paths where possible: disable direct operational browser writes, restrict bootstrap, and protect report/AMC mutation endpoints.
2. Establish database invariants and transactional RPC/service boundaries: hierarchy checks, allocation sum, report-per-schedule uniqueness, immutable snapshot/version policy, and follow-up item scope.
3. Repair AMC domain semantics: define contract-level included visits versus per-asset obligations, reconcile cadence, lock/version changes, preserve renewal allocation, and compute completion from an authoritative obligation-resolution model.
4. Repair report resolution and scheduling state transitions: terminal gates, exact source issue linkage, idempotency, reschedule successor/queue behavior, and atomic operations.
5. Correct metrics and asset/master mapping; then add end-to-end PostgreSQL integration tests.
6. Implement deferred inventory, payments, notifications, audit-log workspace, and live dashboard analytics only after the core integrity work is proven.

## 13. Risks and unknowns

No database connection, migration application history, production records, deployed environment variables, backups, Render dashboard, or Vercel dashboard were accessed. Therefore this report cannot state whether the unsafe migrations have already affected historical records, whether direct Supabase routes are reachable in the deployed project, or whether production CORS/bootstrap configuration mitigates the source risk. No destructive or data-writing test was performed.

