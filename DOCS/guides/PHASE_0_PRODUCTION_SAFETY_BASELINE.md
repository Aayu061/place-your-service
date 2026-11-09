# PYS Phase 0: Production Safety, Baseline Verification, and Remediation Readiness

**Date:** 11 October 2026  
**Mode:** strictly read-only  
**Evidence labels:** Repository source, Git metadata, Local migration, Live health endpoint, Test output, Inference, or NOT VERIFIED.

## 1. Executive summary

**Phase 0 decision: conditionally ready to design remediation, but not ready to apply data/schema remediation to production.**

Repository source is unchanged since the full-system re-audit revision. The public Render health and readiness endpoints are live and report a connected database, but neither the deployed Git revision nor any live Supabase schema, RLS policy, migration history, or business data was accessed. There is no local Vercel project metadata and no authorized read-only database connection available in the workspace.

Accordingly:

- The high-priority source findings from the re-audit remain **confirmed in current source** unless a live check is required to determine past data impact.
- No production-data anomaly count is available. All record-level integrity checks are **NOT VERIFIED**, not “clean.”
- Before Phase 1 changes any database constraint, RLS policy, or historic relationship, obtain a production backup/restore point, read-only metadata access, and a disposable PostgreSQL/Supabase integration environment.

## 2. Current Git and repository baseline

| Item | Result | Evidence |
|---|---|---|
| Repository path | C:\Users\aayup\Desktop\PYS | Git metadata |
| Branch | main | Git metadata |
| HEAD | 826a0b3879be3561b8faba6957953dec87c32115 | Git metadata |
| Latest commit | 2026-10-11T03:36:23+05:30 - feat(amc): add PM service allocation planner with dry/jet/pumpdown visit distribution | Git metadata |
| 4031274 ancestry | Ancestor of HEAD | Git metadata |
| 826a0b3 ancestry | Ancestor of HEAD; HEAD is 826a0b3 | Git metadata |
| Remote divergence | 0 ahead, 0 behind origin/main using existing upstream metadata | Git metadata |
| Remote | origin points to the documented GitHub repository | Git metadata |
| Prior audit revision | Current HEAD exactly matches the audited 826a0b3 revision | Git metadata |

### Working-tree protection

The worktree is **not clean**, but the uncommitted work is limited to the three prior authorized audit reports:

- DOCS/PYS_FULL_SYSTEM_REAUDIT.md
- DOCS/PYS_DEFECT_REGISTER.md
- DOCS/PYS_IMPLEMENTATION_STATUS.md

No application source, tests, migrations, configuration, deployment file, or tracked file is modified. These three untracked reports must be preserved and reviewed before any later commit/rebase/cleanup operation. This Phase 0 report is the only additional permitted file created.

### Commands and results

| Command | Result |
|---|---|
| git status --short --branch | main tracking origin/main; exactly the three audit reports untracked |
| git rev-parse HEAD | 826a0b3879be3561b8faba6957953dec87c32115 |
| git log -1 --format ... | latest commit/date/message above |
| git merge-base --is-ancestor 4031274 HEAD | exit 0 |
| git merge-base --is-ancestor 826a0b3 HEAD | exit 0 |
| git rev-list --left-right --count 'HEAD...@{upstream}' | 0 / 0 |

## 3. Documentation and phase reconciliation

All Phase 0 requested documents exist, including the three re-audit reports. The implementation is not newer than the re-audit, therefore no audit finding has been fixed in a later source commit.

| Area | Current source status | Evidence |
|---|---|---|
| Auth, Admin/Staff, customer, site, asset, technician, service request | Implemented | Repository source; Test output |
| AMC, scheduling, service reports, print view | Implemented but integrity remediation required | Repository source; prior re-audit |
| Allocation, renewal, obligation completion | Confirmed unresolved | Current HEAD equals audited revision |
| Report hierarchy, resolution scope, snapshot immutability, duplicate issuance | Confirmed unresolved | Current HEAD equals audited revision |
| Inventory, payments, notifications, activity-log workspace, live analytics | Explicit UI-only/deferred placeholders | Repository source |
| Documentation accuracy | Partially stale: phase-complete claims and ac_assets.customer_id description conflict with current migration/code | Repository source |

The previous audit reports match current files and source revision. Their reports are evidence of source behavior, not proof that a corresponding migration was deployed or that production records contain an anomaly.

## 4. Deployment baseline

### Vercel

| Check | Result | Evidence |
|---|---|---|
| Local Vercel configuration | No vercel.json or .vercel metadata found | Repository source |
| Deployment branch / latest Vercel commit / deployment state | NOT VERIFIED; no authenticated Vercel metadata is available | NOT VERIFIED |
| Frontend runtime API setting | Source reads VITE_API_BASE_URL and otherwise falls back to localhost | Repository source: src/config/env.ts |
| Local .env VITE_API_BASE_URL | Not present; local frontend would use fallback unless externally supplied | Local configuration inspection |
| Intended production API | .env.example and integration test identify the Render API URL | Repository source |
| Deployed frontend points to intended backend | NOT VERIFIED; Vercel environment values were not inspected | NOT VERIFIED |

### Render

| Check | Result | Evidence |
|---|---|---|
| Service blueprint | place-your-service-api, Node web service, rootDir server, autoDeploy true, health path /api/v1/health | Repository source: render.yaml |
| Build/start configuration | npm install --include=dev && npm run build; npm run start | Repository source: render.yaml |
| Expected runtime environment keys | NODE_ENV, PORT, CORS_ORIGIN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX; values not disclosed | Repository source: render.yaml |
| Public liveness | HTTP 200; service place-your-service-api; status healthy; production environment; version 0.1.0 | Live health endpoint |
| Public readiness | HTTP 200; database connected true; reported latency 1496 ms | Live health endpoint |
| Render deployed Git revision / deploy time / service settings | NOT VERIFIED; no authenticated Render deployment metadata was available | NOT VERIFIED |

The health response does not include a commit SHA. It cannot prove the live service runs 826a0b3, despite its reachable health endpoint and version string.

## 5. Supabase migration and expected-schema baseline

### Local migration inventory

Seventeen ordered local migrations were inspected, from 20261007000000_foundation_schema.sql through 20261011010000_amc_service_allocation_planner.sql. The latest local migrations add report snapshots, service type/resolution fields, and allocation fields.

Expected relevant local schema properties:

- Physical assets are attached to customer_sites through site_id; the foundation ac_assets definition does not define customer_id.
- amc_contracts has total_visits and later nullable Dry/Jet/Pumpdown allocation fields. The allocation migration enforces non-negative values, but no sum-equals-total constraint.
- service_schedules has planned_service_type and partial unique indexes for active request/PM/AMC-asset schedules.
- service_reports has origin/resolving report links, resolution status/timestamp, and report asset/item tables.
- service_report_assets receives nullable snapshot columns. There is no local migration trigger making issued snapshot values immutable.
- Foundation RLS enables tables, grants broad schema access to anon/authenticated, and creates authenticated Admin/Staff operational table policies.

### Live database and migration status

| Check | Result | Evidence |
|---|---|---|
| Authorized read-only database connection | Not available in the workspace | NOT VERIFIED |
| Applied migration history | NOT VERIFIED | NOT VERIFIED |
| Live column/constraint/index definitions | NOT VERIFIED | NOT VERIFIED |
| Live RLS enabled state and policy definitions | NOT VERIFIED | NOT VERIFIED |
| Live database data-integrity counts | NOT VERIFIED | NOT VERIFIED |

Local SQL files are not evidence of applied production migrations. No Supabase CLI configuration, database connection string, service-role key, database password, or JWT was read or displayed.

## 6. Live data-integrity checks

No production/data-plane query was executed. The following are the required **read-only aggregate checks** to perform after approved access is provided; they are intentionally descriptions, not executable repair SQL.

| Domain check | Executed | Result | Required review before Phase 1 |
|---|---|---|---|
| AMC total visits versus Dry/Jet/Pumpdown sum | No | NOT VERIFIED | Count contracts with any allocation and nonmatching total; distinguish legacy all-null contracts. |
| Generated obligation/schedule count versus contractual visit semantics | No | NOT VERIFIED | Agree whether visits are contract-level or per asset, then aggregate direct PM obligations excluding follow-ups. |
| Duplicate active PM/schedule relationships | No | NOT VERIFIED | Count duplicate pm_obligation_id and report-per-schedule records; identify cancelled/rescheduled exceptions. |
| AMC completion versus follow-up resolution | No | NOT VERIFIED | Compare completed original obligations, direct reports, linked completed follow-ups, and asset-level counters. |
| Report resolution links | No | NOT VERIFIED | Count resolved reports missing resolver/timestamp; report links with customer/site/asset mismatch; more than one source per resolver. |
| Report snapshots | No | NOT VERIFIED | Aggregate null/inconsistent snapshot columns by report age and identify snapshots differing from immutable issuance evidence if available. |
| Cancelled schedule reports | No | NOT VERIFIED | Count report headers whose schedule status is cancelled; investigate as potential P1. |
| Customer/site/asset hierarchy | No | NOT VERIFIED | Count schedule, report, and AMC-coverage asset relationships that do not derive to the stated customer/site. |
| Asset identity/master links | No | NOT VERIFIED | Count duplicate non-null serials, malformed ESSC codes, inactive/missing master references, and unreconstructable historic AMC membership. |

No data anomaly can be assigned an aggregate count at Phase 0. Any later count must avoid customer names/contact information and use aggregate totals plus internal IDs only where triage is necessary.

## 7. Security baseline

| Concern | Current source assessment | Evidence / safe next check |
|---|---|---|
| Direct browser Supabase client | Confirmed in source; browser uses public anon configuration | Repository source |
| Operational table RLS | Local policy grants authenticated Admin/Staff broad read/write access | Local migration 20261007000000:544-586 |
| Audit-log insertion | Local policy permits authenticated Admin/Staff insert, while update/delete are denied | Local migration:603-619 |
| Backend-only operation boundary | Confirmed source-policy mismatch: direct authenticated REST writes could bypass server rules | Repository source + Local migration |
| Live RLS exploitability | PENDING SAFE TEST; no authenticated write was attempted | Requires isolated project/transactional test role |
| Initial admin bootstrap | Confirmed public route in source until an admin exists | Repository source |
| JWT/role middleware | Present and covered by mocked tests | Repository source; Test output |
| Service-role key | Referenced only on server environment interface; no key value inspected | Repository source |
| CORS/rate limit | Configured server-side; health paths exempt from rate limit | Repository source; mocked tests |
| Secret exposure | No secret values were printed or inspected | Phase 0 procedure |

Urgent security dependency: do not change RLS in production until the actual live policies, frontend direct-access usage, and required operational write paths are measured in an isolated clone. A permission test requires writes and is therefore pending, not performed.

## 8. Migration-risk register

| Migration | Risk | Data/read-only checks required before application | Recovery requirement |
|---|---|---|---|
| 20261007000000_foundation_schema.sql | Broad grants and Staff operational write RLS policies can defeat backend-only invariants. Singleton-admin index behavior must be measured on existing staff rows. | Inspect live grants, policies, roles, active Admin rows, and client usage. | Verified backup and a policy rollback plan. |
| 20261008030000_phase9_hardening_concurrency_and_pm.sql and 20261010020000_allow_followup_schedules_after_completion.sql | Drop/recreate active-schedule indexes may lock tables; index predicates determine which legacy duplicates are allowed. | Count duplicate request, PM, and AMC-asset visit relationships by each proposed predicate. | Restore point; maintenance window/online-index plan where appropriate. |
| 20261009010000_seed_softwear_ac_models_and_variants.sql | Seed migration can alter master-catalogue state on an existing database. | Count existing brands/models/variants and conflicts with seed identity fields. | Backup; documented seed reconciliation and rollback strategy. |
| 20261010000000_service_visit_reports.sql | Introduces report tables/policies without a one-report-per-schedule database uniqueness invariant. | Count existing reports per schedule and cancelled schedule reports. | Backup before later uniqueness remediation; duplicate-resolution plan. |
| 20261010040000_service_report_assets_snapshot_integrity.sql | Backfills supposedly historical snapshot columns from current ac_assets values, potentially fabricating historic identity/specification. | Count candidate rows, compare asset updated_at/report date where possible, and identify already-null vs backfilled values. | Mandatory backup and report-level repair ledger; do not overwrite uncertain history. |
| 20261011000000_amc_service_types_and_issue_resolution.sql | Broad outcome-based resolution backfill can classify legacy reports without proving individual issue closure. | Aggregate primary outcome, resolution status, resolver/timestamp patterns, and exception counts. | Backup plus reversible correction mapping/append-only repair records. |
| 20261011010000_amc_service_allocation_planner.sql | Allocation fields lack sum constraint; historical follow-up backfill matches customer/site rather than exact asset/item issue and can mark all report items resolved. | Count invalid allocation sums, legacy null allocations, follow-up/source link candidates, multi-asset reports, and resolved items lacking exact linkage. | Mandatory backup, dry-run result counts, and row-level remediation ledger before any correction. |

## 9. Existing data recovery considerations

Before any production remediation:

1. Obtain a verified, tested database restore point and record the restore owner/time.
2. Export read-only aggregate baseline counts and a minimally identifying exception ledger.
3. Freeze or carefully gate report, AMC allocation, and follow-up mutations while their pre-repair state is captured.
4. Do not overwrite historical snapshots or resolution links. Use append-only correction/audit records or a separately reviewed repair mapping.
5. Rehearse every schema/data migration on a production-shaped anonymized clone, including timeout, rollback, and partial-failure recovery.
6. Add restrictive constraints only after baseline violations are either corrected or explicitly represented by a legacy exception strategy.

## 10. High-priority finding disposition

| Finding group from re-audit | Phase 0 disposition | Reason |
|---|---|---|
| AMC allocation/cadence/update/renewal/completion defects | Confirmed and unresolved in source | Current HEAD is the audited HEAD. Live affected-row counts require database access. |
| Report hierarchy, resolution scope, mutable history, duplicate issuance, multi-asset follow-up | Confirmed and unresolved in source | Current HEAD is the audited HEAD. Historic data impact NOT VERIFIED. |
| Direct Supabase/RLS backend-boundary risk | Confirmed from local policy/source; live policy state NOT VERIFIED | No live metadata or write test performed. |
| Stranded reschedules and non-transactional workflows | Confirmed and unresolved in source | Current HEAD is the audited HEAD. Live partial-state count NOT VERIFIED. |
| Unsafe snapshot/resolution backfills | Local migration risk confirmed; past production impact NOT VERIFIED | Applied history/data not available. |
| Asset/master/metric/UX/documentation findings | Confirmed source issues or technical debt | Current source and docs inspected. |

## 11. Safe technical verification

Test scripts and configuration were inspected first. Frontend component tests mock API interactions except src/tests/renderIntegration.test.ts, which performs two safe GET requests to Render health endpoints. Backend tests use Supertest plus mocked Supabase clients. No migration, seed, database write, or live authenticated business mutation was run.

| Command | Result | Evidence |
|---|---|---|
| npm test -- --silent | PASS: 16 files, 139 tests | Test output |
| npm --prefix server run test -- --silent | PASS: 22 files, 243 tests | Test output |
| npm run typecheck | PASS | Test output |
| npm run server:typecheck | PASS | Test output |
| npm run lint | PASS | Test output |
| npm run server:lint | PASS; this script runs tsc --noEmit | Test output |
| npm run build | PASS; Vite production build | Test output |
| npm run server:build | PASS; backend TypeScript build | Test output |
| GET Render health and readiness endpoints | PASS: both HTTP 200, readiness reported database connected | Live health endpoint |

These checks do not constitute a migration, RLS, transaction, concurrency, or live data-integrity test.

## 12. Phase 1 readiness and dependency order

### Readiness

Phase 1 may begin only as **design and isolated-environment remediation planning**. It must not apply production schema/RLS/data changes until the prerequisites below are complete.

### Required prerequisites

1. Confirm deployed Render and Vercel revisions/settings through approved read-only dashboard/API access.
2. Obtain read-only Supabase metadata and aggregate data access, then execute the Phase 0 checks in section 6.
3. Capture a tested production backup/restore point and define a recovery owner.
4. Resolve the business definition of AMC included visits: contract-level versus per-asset, cadence behavior, retries, and follow-ups.
5. Define immutable report/snapshot correction policy and exact issue/item-to-follow-up resolution model.
6. Build a disposable integration environment that applies all migrations and tests actual RLS, constraints, concurrency, and rollback.

### Recommended remediation sequence

1. **Phase 1 - evidence and data model decisions:** live metadata/data baseline, backup, AMC obligation and report-history semantics.
2. **Phase 2 - security boundary:** staged RLS/backend-only write redesign in an isolated clone; confirm required client behavior.
3. **Phase 3 - schema invariants and migration rehearsal:** unique/report hierarchy/allocation/snapshot constraints with legacy exception strategy.
4. **Phase 4 - AMC workflow remediation:** allocation, cadence, renewal, completion, and protected historic coverage.
5. **Phase 5 - report/resolution remediation:** exact scope, immutability, idempotent issuance, atomic changes.
6. **Phase 6 - scheduling/metrics/asset consistency:** reschedule state, authoritative metrics, master-data and warranty behavior.
7. **Phase 7 - deployment and regression verification:** production-shaped integration, rollout gate, post-deploy read-only validation, then deferred modules.

## 13. Actions explicitly not performed

No source, test, existing documentation, migration, configuration, account, permission, environment variable, secret, deployment, or production record was modified. No database migration, rollback, seed, SQL write, Supabase REST write, direct RLS permission test, deployment, restart, push, pull, checkout, rebase, reset, stash, or destructive test was performed.

The only Phase 0 filesystem change was the creation of this report. The three pre-existing untracked audit reports were preserved unchanged.

