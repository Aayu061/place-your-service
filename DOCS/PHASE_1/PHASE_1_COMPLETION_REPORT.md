# PYS Phase 1 — Evidence Collection, Data-Integrity Baseline & Business-Rule Decisions Completion Report

**Report Date:** 14 October 2026  
**Phase:** Phase 1 — Evidence Collection, Data-Integrity Baseline & Business-Rule Decisions  
**Execution Standard:** Strictly Read-Only Evidence Collection, Non-Mutating Verification  
**Phase 2 Readiness Gate:** `CONDITIONALLY READY`

---

## 1. Executive Summary

Phase 1 of the Place Your Service (PYS) remediation roadmap has successfully concluded in strict compliance with the Phase 1 specification.

This phase was strictly dedicated to **evidence collection, live production database baselining, and business-rule formalization**, not application remediation. In accordance with project instructions, **zero production database records, application code, tests, migrations, or deployment configurations were modified**.

### Key Deliverables & Accomplishments:
1. **Live Supabase Baseline Established:** Through authorized read-only Supabase MCP tools, the production database (`jvccvdxfilzlncbgiplk` on PostgreSQL 17.11) was comprehensively inspected. All 25 public tables, live RLS policies, table grants, constraint definitions, and aggregate counts were recorded.
2. **Production Data Anomalies Catalogued:** Rather than assuming production data is "clean", read-only aggregate checks proved the real existence of the architectural defects identified in the re-audit:
   - Schedule multiplier anomaly confirmed in `AMC-2026-0003` (4 visits x 2 assets = 8 schedules).
   - Silent allocation loss confirmed across renewals (`AMC-2026-0006` -> `AMC-2026-0007`).
   - Premature completion without qualifying report confirmed (`SCH-2026-32553`).
   - Retroactive snapshot backfills confirmed across all 3 production service reports.
3. **Core AMC Business Semantic Identified:** Forensic audit of PRD, TRD, RULES, MEMORY, and code confirmed that existing documentation **never settled** whether included visits are contract-level site visits or per-asset service obligations. This is formally classified as `BUSINESS DECISION REQUIRED`, with both options analyzed across seven concrete dimensions.
4. **Service-Report & Resolution Policy Formalized:** A binding ten-point policy for immutable historical reports, item-level issue resolution, multi-asset isolation, and an append-only amendment ledger was documented.
5. **Phase 2 Security Hardening Plan Prepared:** An operational mutation inventory, target authorization boundary mapping, and isolated disposable-environment test matrix were established to remediate direct browser write access (`PYS-010`) and public admin bootstrap (`PYS-018`).

---

## 2. Exact Repository Revision & Working Tree Baseline

| Parameter | Verified Value | Evidence Method |
|---|---|---|
| Working Directory | `C:\Users\aayup\Desktop\PYS` | Local filesystem |
| Current Branch | `main` | Git metadata |
| HEAD Commit SHA | `826a0b3879be3561b8faba6957953dec87c32115` | `git rev-parse HEAD` |
| HEAD Commit Date | `2026-10-11T03:36:23+05:30` | Git log |
| HEAD Commit Subject | `feat(amc): add PM service allocation planner with dry/jet/pumpdown visit distribution` | Git log |
| Upstream Remote | `origin` (`https://github.com/Aayu061/place-your-service.git`) | `git remote -v` |
| Remote Divergence | `0 ahead, 0 behind origin/main` | `git status --branch` |
| Working Tree Protection | 4 pre-existing untracked audit/baseline files preserved; zero tracked modifications | `git status --short` |

### Pre-Existing Untracked Files Preserved
The following four pre-existing untracked files were preserved untouched:
- `DOCS/PHASE_0_PRODUCTION_SAFETY_BASELINE.md`
- `DOCS/PYS_DEFECT_REGISTER.md`
- `DOCS/PYS_FULL_SYSTEM_REAUDIT.md`
- `DOCS/PYS_IMPLEMENTATION_STATUS.md`

---

## 3. Files Inspected and Files Created

### 3.1 Files Inspected
- **Documentation:** `DOCS/PRD.md`, `DOCS/TRD.md`, `DOCS/RULES.md`, `DOCS/POLICY.md`, `DOCS/ARCHITECTURE.md`, `DOCS/MEMORY.md`.
- **Database Migrations:** All 17 migration files in `supabase/migrations/` from `20261007000000_foundation_schema.sql` to `20261011010000_amc_service_allocation_planner.sql`.
- **Backend Source Code:** `server/src/services/amc.service.ts`, `server/src/services/serviceReport.service.ts`, `server/src/services/schedule.service.ts`, `server/src/services/asset.service.ts`, `server/src/services/auth.service.ts`, `server/src/validators/amc.validator.ts`, `server/src/routes/*.ts`.
- **Frontend Source Code:** `src/App.tsx`, `src/context/AuthContext.tsx`, `src/services/supabase.ts`, `src/services/api/client.ts`, `src/pages/ServiceReportsManagement.tsx`.
- **Infrastructure Configurations:** `render.yaml`, `.env.example`, `server/.env.example`, `.env`.

### 3.2 Files Created Under `DOCS/PHASE_1/`
1. `DOCS/PHASE_1/DEPLOYMENT_AND_DATABASE_EVIDENCE.md`
   - Verified deployment revisions, live Supabase schema comparison, role grants, RLS policies, and read-only aggregate check results.
2. `DOCS/PHASE_1/AMC_BUSINESS_RULE_DECISIONS.md`
   - Included-visit semantic analysis, Option 1 vs Option 2 comparison, allocation invariants, renewal carry-forward, follow-up accounting, and decision register.
3. `DOCS/PHASE_1/SERVICE_REPORT_HISTORY_AND_RESOLUTION_POLICY.md`
   - Ten mandatory report tenets, state separation, multi-asset issue resolution, amendment ledger, and atomic transaction boundaries.
4. `DOCS/PHASE_1/PHASE_2_SECURITY_READINESS.md`
   - Mutation inventory, target authorization architecture, RLS privilege revocation plan, disposable environment test matrix, and rollback criteria.
5. `DOCS/PHASE_1/PHASE_1_COMPLETION_REPORT.md`
   - This comprehensive Phase 1 executive completion report and readiness assessment.

---

## 4. Evidence Collected vs. `NOT VERIFIED` Inventory

| Domain | Verified Live Evidence | `NOT VERIFIED` Items | Prerequisite for Unverified Items |
|---|---|---|---|
| **Vercel Frontend** | Frontend runtime configuration in `src/config/env.ts` reads `VITE_API_BASE_URL` with local fallback. | Deployed Git commit SHA, branch, deployment timestamp, and production environment variables. | Read-only Vercel Project and Deployments API access (`GET /v6/deployments`). |
| **Render Backend** | Service `place-your-service-api` is healthy; `/api/v1/health` returned HTTP 200 (`v0.1.0`); `/api/v1/health/ready` confirmed database connected (`latencyMs: 2453`). Blueprint in `render.yaml` verified. | Exact deployed Git commit SHA running on Render. | Read-only Render API access (`GET /v1/services/{id}/deploys`). |
| **Supabase Database** | Project `jvccvdxfilzlncbgiplk` in `ap-south-1` (Postgres 17.11); all 25 tables, live columns, RLS policies, grants, and row counts verified via Supabase MCP. | None. Live database metadata and aggregate data fully accessible. | None. |
| **Direct RLS Exploit** | Schema grants and permissive Staff policies confirmed in catalog (`information_schema.role_table_grants` & `pg_policies`). | Live exploitation test from external client. | Skipped intentionally in Phase 1 to prevent mutating writes; will test in isolated clone. |

---

## 5. Summary of Read-Only Aggregate Integrity Checks

All checks were executed via non-mutating SELECT queries on the live production database:

| Domain Check | Executed | Affected Count | Key Finding |
|---|---|---|---|
| **A. AMC Allocations** | YES | 5 unallocated / 7 total | 5 legacy contracts have NULL allocations; 2 contracts have allocations matching `total_visits`. Zero negative allocations. |
| **A. Obligation Multiplier** | YES | 1 contract (`0003`) | Contract `AMC-2026-0003` with 4 visits and 2 assets generated 8 schedules, proving the `dates x assets` generator multiplier bug. |
| **A. Renewal Allocation Loss** | YES | 2 renewals | `AMC-2026-0004` (4 Dry) and `AMC-2026-0006` (2 Dry, 2 Jet) renewed into `0005` and `0007` respectively, losing all allocation fields. |
| **B. Schedule Duplicates** | YES | 0 duplicates | Zero duplicate active PM schedules (same amc, asset, date). |
| **B. Schedule Completion** | YES | 1 schedule (`SCH-32553`)| Schedule marked `COMPLETED` despite report #123 having outcome `PENDING_REPAIRS`. |
| **B. Follow-up Appointments** | YES | 4 follow-ups | Follow-up schedules exist with `rescheduled_from_id` populated. |
| **C. Service Reports** | YES | 3 total reports | Zero customer/site boundary crossing. Zero unreasoned deviations. |
| **C. Report Resolution Link** | YES | 1 pair (123 -> 456) | Report 123 is linked to resolving report 456 via follow-up schedule `SCH-2026-93849`. |
| **C. Snapshot Backfills** | YES | 3 / 3 reports | All 3 `service_report_assets` rows backfilled with identical `updated_at: 2026-10-10 17:38:55Z` from `ac_assets`. |
| **C. Report Items** | YES | 1 item | Exactly 1 report item exists (`9dc3c7be-...`); has `asset_id: NULL` and was marked `is_resolved: true` by backfill migration. |
| **D. Asset Hierarchy** | YES | 0 anomalies / 10 assets| All 10 assets map to valid sites; all 8 sites map to valid customers; all ESSC tags are unique (`ESSC-0001` through `ESSC-0010`). |
| **D. Inactive Assets** | YES | 1 asset (`ESSC-0004`) | Soft-deactivated physical asset properly preserved. |
| **E. Security Privileges** | YES | All public tables | `GRANT ALL` active for `anon` and `authenticated`. Open RLS permits direct staff mutations and audit log insertion. |

---

## 6. Technical Verification Test Runs

To ensure the local workspace remains in a pristine, reproducible state, all standard compilation, linting, and test suites were executed:

| Verification Suite | Target | Result | Duration / Test Count |
|---|---|---|---|
| `npm run typecheck` | Frontend TypeScript | **PASS** | Exit 0 |
| `npm run server:typecheck` | Backend TypeScript | **PASS** | Exit 0 |
| `npm run lint` | Frontend ESLint | **PASS** | Exit 0 |
| `npm run server:lint` | Backend TypeScript Check | **PASS** | Exit 0 |
| `npm test -- --run --silent` | Frontend Vitest | **PASS** | 16 test files passed, 139 tests passed |
| `npm run server:test -- --run --silent` | Backend Vitest | **PASS** | 22 test files passed, 243 tests passed |

*Note: Passing test suites prove code syntax, compilation, and unit-level logic under mocked data, but do NOT prove production database integrity. Production integrity is established exclusively by the read-only SQL checks in Section 5.*

---

## 7. Production Safety Status

**Strict Adherence to Safety Rules:**
- **Zero Database Writes:** No `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `ALTER`, or `DROP` statements were executed against the live Supabase database.
- **Zero Schema Changes:** No migrations or DDL statements were applied.
- **Zero Application Code Changes:** No files in `src/`, `server/`, or `supabase/` were modified.
- **Zero Secret Disclosures:** No API keys, service-role keys, database passwords, or customer personal identifiers were exposed in logs or documentation.
- **Zero Worktree Disruption:** The four pre-existing untracked audit documents were preserved untouched.

---

## 8. Phase 2 Readiness Decision

### Readiness Rating: `CONDITIONALLY READY`

**Justification:**
- **Readiness:** The security remediation plan, operational mutation inventory, and isolated test matrix are fully developed and ready for execution.
- **Conditions & Blockers for Production Deployment:**
  1. **Disposable Environment Prerequisite:** Security boundary remediation (revoking public grants, rewriting RLS policies, restricting audit log insertion) must be rehearsed and verified in an isolated disposable PostgreSQL/Supabase clone before touching production.
  2. **Executive Approval of Business Rule:** Stakeholders must formally approve Option 1 (Contract-Level Site Visits) vs Option 2 (Per-Asset Obligations) as defined in `DOCS/PHASE_1/AMC_BUSINESS_RULE_DECISIONS.md`.
  3. **Deployment Verification Prerequisite:** Authenticated read-only access to Render and Vercel must be obtained to confirm active production commit SHAs prior to deploying new revisions.

---

## 9. Next Steps

1. Review and commit only the five newly created documents under `DOCS/PHASE_1/`.
2. Push the commit to `main` and verify remote synchronization.
3. Stop execution and await explicit user authorization before initiating Phase 2.
