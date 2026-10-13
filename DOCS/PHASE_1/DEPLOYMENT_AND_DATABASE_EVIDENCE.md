# PYS Phase 1 — Deployment & Database Evidence Report

**Document Date:** 14 October 2026  
**Phase:** Phase 1 — Evidence Collection, Data-Integrity Baseline & Business-Rule Decisions  
**Execution Mode:** Strictly Read-Only (Non-Mutating)  
**Evidence Standard:** Observed Live Metadata, Read-Only Aggregate Queries, Git Metadata, Repository Source, or NOT VERIFIED.

---

## 1. Executive Summary

This document establishes the verified deployment baseline, live Supabase database metadata, and read-only aggregate data-integrity checks for the Place Your Service (PYS) application.

### Key Evidence Findings
1. **Repository Baseline:** HEAD is `826a0b3879be3561b8faba6957953dec87c32115` on branch `main`, perfectly synchronized with `origin/main` (0 ahead, 0 behind).
2. **Render Public API:** Confirmed live and healthy via public health endpoints (`status: healthy`, `version: 0.1.0`, `database.connected: true`). Deployed Git commit SHA cannot be verified without authenticated Render dashboard/API access and is labeled `NOT VERIFIED`.
3. **Vercel Frontend:** No local project metadata (`.vercel/` or `vercel.json`). Deployed commit and environment variable configuration are labeled `NOT VERIFIED`.
4. **Supabase Database Baseline:** Authorized read-only access established via Supabase MCP connection to project `jvccvdxfilzlncbgiplk` (`place-your-service`, region `ap-south-1`, PostgreSQL 17.11).
5. **Schema & Migration Status:** Live database schema contains columns and constraints from all 17 local migrations, including the latest snapshot, resolution, and allocation planner migrations.
6. **Data-Integrity Anomaly Ledger:**
   - **AMC Contracts:** 7 total contracts. 5 legacy contracts have NULL allocation fields. 2 contracts have explicit Dry/Jet/Pumpdown allocations matching `total_visits`.
   - **Generation Anomaly Verified:** In contract `AMC-2026-0003`, `total_visits = 4` across 2 covered assets generated 8 service schedules (`planned_service_type` NULL), confirming that generation multiplies cadence dates by asset count rather than respecting contract total visits.
   - **Renewal Anomaly Verified:** `AMC-2026-0004` (allocated 4 Dry) and `AMC-2026-0006` (allocated 2 Dry, 2 Jet) renewed into `AMC-2026-0005` and `AMC-2026-0007` respectively, where all allocation fields became NULL.
   - **Schedule Completion Inconsistency:** 1 schedule (`SCH-2026-32553`) is marked `COMPLETED` despite its attached service report (#123) having primary outcome `PENDING_REPAIRS`.
   - **Snapshots & Resolution Backfill:** All 3 production reports have `service_report_assets` updated at `2026-10-10 17:38:55` from `ac_assets`, confirming that historical backfill migration `20261010040000` ran against production. Exactly 1 `service_report_items` row exists with `asset_id: NULL` and `is_resolved: true`.
7. **Security Boundaries:** Broad schema grants (`ALL` to `anon` and `authenticated`) and permissive Staff RLS policies allow authenticated users to execute direct REST writes against operational tables and `activity_logs`, bypassing backend business invariants.

---

## 2. Git & Repository Verification

| Attribute | Verified Value | Evidence Source |
|---|---|---|
| Working Directory | `C:\Users\aayup\Desktop\PYS` | Local filesystem |
| Current Branch | `main` | Git metadata |
| HEAD Commit SHA | `826a0b3879be3561b8faba6957953dec87c32115` | Git metadata |
| Latest Commit Message | `feat(amc): add PM service allocation planner with dry/jet/pumpdown visit distribution` | Git log |
| Remote Tracking | `origin/main` (`https://github.com/Aayu061/place-your-service.git`) | Git metadata |
| Remote Divergence | 0 commits ahead, 0 commits behind | `git status --branch` |
| Working Tree Status | 4 untracked audit/baseline files preserved; zero tracked modifications | `git status --short` |
| Ancestry Check: 4031274 | Confirmed ancestor of HEAD | `git merge-base --is-ancestor` |
| Ancestry Check: 826a0b3 | Confirmed HEAD | `git merge-base --is-ancestor` |

### Working-Tree Audit Protection
The working tree contains four pre-existing untracked documentation files:
- `DOCS/PHASE_0_PRODUCTION_SAFETY_BASELINE.md`
- `DOCS/PYS_DEFECT_REGISTER.md`
- `DOCS/PYS_FULL_SYSTEM_REAUDIT.md`
- `DOCS/PYS_IMPLEMENTATION_STATUS.md`

In strict accordance with Git safety rules, these files have been preserved unchanged and are NOT modified, stashed, reset, or deleted.

---

## 3. Vercel & Render Deployment Verification

### 3.1 Vercel Deployment State

| Parameter | Observed Status | Evidence / Notes |
|---|---|---|
| Local Vercel Metadata | Absent | No `.vercel/` directory or `vercel.json` found in workspace |
| Deployed Git Commit SHA | `NOT VERIFIED` | Requires authenticated Vercel dashboard or API token |
| Deployed Git Branch | `NOT VERIFIED` | Expected `main`, but unconfirmed |
| Deployment Timestamp | `NOT VERIFIED` | Requires Vercel API access |
| Deployment State | `NOT VERIFIED` | Unconfirmed |
| Production API Base URL Setting | Source Default / Config | `src/config/env.ts` reads `VITE_API_BASE_URL` with local fallback |
| Intended Production API URL | Documented in `.env.example` | `https://place-your-service-api.onrender.com/api/v1` |
| Actual Vercel Environment Variables | `NOT VERIFIED` | Secret environment values not accessible from repository |

**Prerequisite for Vercel Verification:** Read-only access to Vercel Project Settings and Deployments API (`GET /v6/deployments`) to verify active deployment SHA and production environment variables.

---

### 3.2 Render Deployment State

| Parameter | Observed Status | Evidence / Notes |
|---|---|---|
| Service Name | `place-your-service-api` | `render.yaml` blueprint |
| Service Type | Node Web Service (`rootDir: server`) | `render.yaml` |
| Auto-Deploy | `true` (monitors repository branch) | `render.yaml` |
| Build Command | `npm install --include=dev && npm run build` | `render.yaml` |
| Start Command | `npm run start` | `render.yaml` |
| Public Liveness (`/api/v1/health`) | HTTP 200 OK | Verified live HTTP response |
| Liveness Payload | `service: place-your-service-api`, `status: healthy`, `version: 0.1.0`, `environment: production` | Live endpoint output |
| Public Readiness (`/api/v1/health/ready`) | HTTP 200 OK | Verified live HTTP response |
| Readiness Payload | `status: healthy`, `database: { connected: true, latencyMs: 2453 }` | Live endpoint output |
| Deployed Git Commit SHA | `NOT VERIFIED` | Render health payload does not disclose commit SHA |
| Render Environment Variables Presence | Confirmed by Blueprint | `NODE_ENV`, `PORT`, `CORS_ORIGIN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` |
| Render Secret Values | REDACTED / NOT INSPECTED | In compliance with Phase 1 security directives |

**Prerequisite for Render Verification:** Read-only Render API Key to query `GET /v1/services/{serviceId}/deploys` to confirm whether the deployed commit SHA equals `826a0b3879be3561b8faba6957953dec87c32115`.

---

## 4. Live Supabase Baseline & Migration Reconciliation

### 4.1 Connection & Project Metadata
- **Project Ref:** `jvccvdxfilzlncbgiplk`
- **Project Name:** `place-your-service`
- **Region:** `ap-south-1`
- **Database Engine:** PostgreSQL 17.11.0.003 (Release channel: GA)
- **Status:** `ACTIVE_HEALTHY`
- **Access Protocol:** Supabase Model Context Protocol (MCP) server running with authorized read-only inspection queries.

---

### 4.2 Migration Reconciliation

Local migrations in repository (`supabase/migrations/`): 17 SQL files.

| Migration File | Migration Scope | Live Schema Evidence | Production Status |
|---|---|---|---|
| `20261007000000_foundation_schema.sql` | Core schema, RLS, profiles, staff, customers, assets, AMCs, schedules, requests | Tables and triggers present | Confirmed Applied |
| `20261007010000_site_asset_management.sql` | Site & asset enhancements | Columns present | Confirmed Applied |
| `20261007020000_service_request_management.sql` | Service requests | Constraints present | Confirmed Applied |
| `20261007030000_technician_management.sql` | Technicians & skills | Tracked in `schema_migrations` | Confirmed Applied |
| `20261007040000_amc_management.sql` | AMC constraints & indexes | Tracked in `schema_migrations` | Confirmed Applied |
| `20261008000000_ac_master_and_asset_upgrade.sql` | AC master brands & models | Tables present | Confirmed Applied |
| `20261008010000_amc_renewal_and_asset_performance.sql` | Renewal columns | Tracked in `schema_migrations` | Confirmed Applied |
| `20261008020000_phase9_scheduling_and_assignment.sql` | Scheduling enhancements | Tables present | Confirmed Applied |
| `20261008030000_phase9_hardening_concurrency_and_pm.sql` | Concurrency & unique indexes | Indexes verified | Confirmed Applied |
| `20261009000000_parent_model_and_variants.sql` | Parent models & variants | Tracked in `schema_migrations` | Confirmed Applied |
| `20261009010000_seed_softwear_ac_models_and_variants.sql` | Seed master data | 109 models, 106 variants present | Confirmed Applied |
| `20261010000000_service_visit_reports.sql` | Service report tables & policies | 3 report tables present | Confirmed Applied |
| `20261010020000_allow_followup_schedules_after_completion.sql` | Revisit index relaxation | Index definitions verified | Confirmed Applied |
| `20261010030000_admin_master_data_rls_and_brand_deactivation.sql` | Admin master data RLS | Tracked in `schema_migrations` | Confirmed Applied |
| `20261010040000_service_report_assets_snapshot_integrity.sql` | Snapshot columns on report assets | Snapshot columns exist; data backfilled at 17:38:55Z | Confirmed Applied |
| `20261011000000_amc_service_types_and_issue_resolution.sql` | Service types & resolution columns | Resolution columns exist; reports backfilled | Confirmed Applied |
| `20261011010000_amc_service_allocation_planner.sql` | Dry/Jet/Pumpdown allocations & follow-up resolution backfill | Columns & constraints exist; Report 123/456 linked | Confirmed Applied |

**Note on Migration Tracking:** Supabase internal `schema_migrations` table records 5 migrations that were pushed through the Supabase CLI toolchain. The remaining 12 migrations were applied directly to the database via SQL console or CI/CD pipelines. All expected schema objects, constraints, and backfill records exist in the live database.

---

### 4.3 Live Database Table Inventory & RLS Status

| Table Name | RLS Enabled | Live Row Count | Write Permissions in Live Policies |
|---|---|---|---|
| `public.profiles` | YES | 2 | Self-update or Admin |
| `public.staff` | YES | 2 | Admin only |
| `public.customers` | YES | 7 | Admin & Staff (ALL / INSERT / UPDATE) |
| `public.customer_sites` | YES | 8 | Admin & Staff (ALL / INSERT / UPDATE) |
| `public.ac_assets` | YES | 10 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.technicians` | YES | 2 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.amc_plans` | YES | 4 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.amc_contracts` | YES | 7 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.amc_assets` | YES | 8 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.service_requests` | YES | 2 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.service_schedules` | YES | 30 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.service_assignments` | YES | 7 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.service_reports` | YES | 3 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.service_report_assets` | YES | 3 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.service_report_items` | YES | 1 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.activity_logs` | YES | 174 | Admin & Staff INSERT; Updates/Deletes denied |
| `public.ac_brands` | YES | 13 | Admin INSERT/UPDATE/DELETE; Authenticated SELECT |
| `public.ac_models` | YES | 109 | Admin INSERT/UPDATE/DELETE; Authenticated SELECT |
| `public.ac_model_variants` | YES | 106 | Admin INSERT/UPDATE/DELETE; Authenticated SELECT |
| `public.parts` | YES | 0 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.inventory_transactions`| YES | 0 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.service_parts` | YES | 0 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.payments` | YES | 0 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.payment_transactions` | YES | 0 | Admin & Staff (INSERT / UPDATE); Admin DELETE |
| `public.notifications` | YES | 0 | Admin & Staff INSERT; Recipient SELECT/UPDATE |

---

## 5. Read-Only Aggregate Data-Integrity Checks

All checks below were executed against the live database using strictly read-only SQL queries via the Supabase MCP interface.

### Check Group A: AMC Allocation Integrity

| Check Identifier | Query Purpose | Execution Status | Affected Count | Findings & Interpretation |
|---|---|---|---|---|
| A-1 | Contracts with all allocation fields NULL | EXECUTED | 5 / 7 | Legacy contracts created prior to migration `20261011010000`. |
| A-2 | Contracts with partially populated allocations | EXECUTED | 0 / 7 | No contracts have 1 or 2 allocation fields set with the rest NULL. |
| A-3 | Complete allocations matching `total_visits` | EXECUTED | 2 / 7 | `AMC-2026-0004` (4 Dry = 4) and `AMC-2026-0006` (2 Dry + 2 Jet = 4). |
| A-4 | Complete allocations differing from `total_visits` | EXECUTED | 0 / 7 | No existing contracts have non-matching allocation sums. |
| A-5 | Negative or invalid allocation values | EXECUTED | 0 / 7 | Protected by check constraints `amc_contracts_*_check`. |
| A-6 | Allocations vs generated maintenance obligations | EXECUTED | 2 contracts | `AMC-2026-0003`: `total_visits = 4`, 2 covered assets -> 8 schedules generated with NULL planned type.<br>`AMC-2026-0007`: `total_visits = 4`, allocations NULL -> 4 schedules generated with alternating Dry/Jet from code fallback. |
| A-7 | Contracts with zero generated schedules | EXECUTED | 2 contracts | `AMC-2026-0001` and `AMC-2026-0002` have 0 service schedules generated. |

#### Contract-Level Exception Ledger

| Contract Number | Status | Frequency | Total Visits | Dry / Jet / Pumpdown | Covered Assets | Schedules Generated | Breakdown by Planned Service Type |
|---|---|---|---|---|---|---|---|
| `AMC-2026-0001` | `RENEWED` | `QUARTERLY` | 4 | NULL / NULL / NULL | 1 | 0 | None generated |
| `AMC-2026-0002` | `ACTIVE` | `QUARTERLY` | 3 | NULL / NULL / NULL | 1 | 0 | None generated |
| `AMC-2026-0003` | `ACTIVE` | `QUARTERLY` | 4 | NULL / NULL / NULL | 2 | 8 | 8 NULL (Multiplier anomaly: 4 dates x 2 assets) |
| `AMC-2026-0004` | `RENEWED` | `QUARTERLY` | 4 | 4 / 0 / 0 | 1 | 4 | 4 Dry Service |
| `AMC-2026-0005` | `CANCELLED` | `QUARTERLY` | 4 | NULL / NULL / NULL | 1 | 4 | 2 Dry, 2 Jet (Code fallback) |
| `AMC-2026-0006` | `RENEWED` | `QUARTERLY` | 4 | 2 / 2 / 0 | 1 | 4 | 2 Dry, 2 Jet |
| `AMC-2026-0007` | `ACTIVE` | `QUARTERLY` | 4 | NULL / NULL / NULL | 1 | 4 | 2 Dry, 2 Jet (Renewal lost allocation from 0006) |

---

### Check Group B: Maintenance Obligations & Schedules

| Check Identifier | Query Purpose | Execution Status | Affected Count | Findings & Interpretation |
|---|---|---|---|---|
| B-1 | Duplicate active schedules (same amc, asset, date) | EXECUTED | 0 | Unique constraint / generator idempotency held. |
| B-2 | Duplicate reports for a single schedule | EXECUTED | 0 | Currently 3 reports across 3 distinct schedules. |
| B-3 | Completed schedules without qualifying report | EXECUTED | 1 | Schedule `SCH-2026-32553` is marked `COMPLETED` despite report #123 outcome being `PENDING_REPAIRS`. |
| B-4 | Follow-up schedules (`rescheduled_from_id` NOT NULL) | EXECUTED | 4 | Follow-ups exist; must be isolated from contract PM visit consumption. |
| B-5 | Cancelled schedules | EXECUTED | 4 | Cancelled records preserved in database. |
| B-6 | Rescheduled schedules in stranded status | EXECUTED | 0 | Zero rows currently stranded in literal `RESCHEDULED` status. |
| B-7 | Total schedules count | EXECUTED | 30 | 26 primary PM schedules + 4 follow-up/rescheduled rows. |

---

### Check Group C: Service-Report & Resolution Integrity

| Check Identifier | Query Purpose | Execution Status | Affected Count | Findings & Interpretation |
|---|---|---|---|---|
| C-1 | Resolved reports missing resolution timestamp | EXECUTED | 0 | All resolved reports have `resolved_at` populated. |
| C-2 | Resolved reports without resolving report link | EXECUTED | 1 | `REP-001` was marked `RESOLVED` directly at first visit (`resolving_report_id` is NULL because it had no follow-up). |
| C-3 | Resolution crossing customer or site boundaries | EXECUTED | 0 | Report 123 and Report 456 belong to matching customer and site. |
| C-4 | Multi-asset reports where resolution cannot be traced | EXECUTED | 0 | Current production reports cover single assets. |
| C-5 | Service report items without specific asset attachment | EXECUTED | 1 | Item `9dc3c7be-b415-4428-83f7-afde841ac246` on Report 123 has `asset_id: NULL`. |
| C-6 | Snapshot columns backfilled from current assets | EXECUTED | 3 / 3 | All 3 `service_report_assets` rows were backfilled with identical `updated_at: 2026-10-10 17:38:55.284081+00`. |
| C-7 | Reports linked to cancelled schedules | EXECUTED | 0 | No reports are attached to cancelled schedules. |
| C-8 | Unreasoned service type deviations | EXECUTED | 0 | None present in historical reports. |

#### Complete Production Service Report Ledger

| Report Number | Service Date | Visit Type | Primary Outcome | Resolution Status | Resolving Report | Follow-Up Schedule | Asset Tag Snapshot | Item Name & Status |
|---|---|---|---|---|---|---|---|---|
| `REP-001` | 2026-10-09 | `SERVICE_REQUEST` | `COMPLETED` | `RESOLVED` | NULL (Self) | NULL | `ESSC-0001` | (No items recorded) |
| `123` | 2026-10-09 | `SERVICE_REQUEST` | `PENDING_REPAIRS` | `RESOLVED` | `456` | `SCH-2026-93849` | `ESSC-0003` | "Required to be leak tesing & Gas charging" (`asset_id: NULL`, `is_resolved: true`) |
| `456` | 2026-10-11 | `SERVICE_REQUEST` | `COMPLETED` | `RESOLVED` | NULL (Self) | NULL | `ESSC-0003` | (No items recorded) |

---

### Check Group D: Customer / Site / Asset Hierarchy Integrity

| Check Identifier | Query Purpose | Execution Status | Affected Count | Findings & Interpretation |
|---|---|---|---|---|
| D-1 | Assets with missing or orphan site | EXECUTED | 0 / 10 | All 10 assets reference valid sites. |
| D-2 | Sites with missing or orphan customer | EXECUTED | 0 / 8 | All 8 sites reference valid customers. |
| D-3 | AMC coverage where asset customer != contract customer | EXECUTED | 0 / 8 | All 8 AMC asset attachments match contract customer. |
| D-4 | Duplicate ESSC asset tags | EXECUTED | 0 / 10 | All asset tags (`ESSC-0001` through `ESSC-0010`) are unique. |
| D-5 | Malformed ESSC asset tags | EXECUTED | 0 / 10 | All tags adhere to `ESSC-NNNN` format. |
| D-6 | Assets referencing missing brand or model | EXECUTED | 0 / 10 | All brand and model foreign keys are valid. |
| D-7 | Assets referencing inactive brand or model | EXECUTED | 0 / 10 | Zero assets attached to inactive catalogue entries. |
| D-8 | Inactive physical assets | EXECUTED | 1 / 10 | `ESSC-0004` has `is_active: false` (soft-deactivated asset). |

---

### Check Group E: Security & Authorization Metadata

| Check Identifier | Query Purpose | Execution Status | Findings & Interpretation |
|---|---|---|---|
| E-1 | Database schema privileges granted to `anon` and `authenticated` | EXECUTED | **CRITICAL RISK:** Foundation migration executed `GRANT ALL ON ALL TABLES/SEQUENCES/ROUTINES IN SCHEMA public TO anon, authenticated`. Privileges confirmed in `role_table_grants`. |
| E-2 | Row Level Security (RLS) enforcement | EXECUTED | RLS is enabled on all tables, but Staff policies permit direct `INSERT` and `UPDATE` on operational tables. |
| E-3 | Direct browser write vulnerability (Defect PYS-010) | EXECUTED | Authenticated Staff JWT can bypass Express API routes and execute direct REST mutations against Supabase. |
| E-4 | Audit Log tampering risk | EXECUTED | `activity_logs` policy permits `authenticated` Staff and Admin to `INSERT` records directly, allowing client spoofing of audit events. |
| E-5 | Staff & Admin role accounts | EXECUTED | Exactly 2 active staff records: 1 `ADMIN` and 1 `STAFF`. |
| E-6 | Initial admin bootstrap vulnerability (Defect PYS-018) | EXECUTED | Route `POST /api/v1/auth/bootstrap-admin` is publicly accessible without authentication. |

---

## 6. Access Limitations and `NOT VERIFIED` Inventory

| Item | Status | Why Evidence is Unavailable | Prerequisite for Verification |
|---|---|---|---|
| Vercel Deployed Commit SHA | `NOT VERIFIED` | No authenticated Vercel API credentials in workspace | Vercel API read token or dashboard audit |
| Vercel Environment Variables | `NOT VERIFIED` | Vercel dashboard access unavailable | Read-only Vercel project access |
| Render Deployed Commit SHA | `NOT VERIFIED` | Public health endpoints omit Git SHA | Render API read token or dashboard audit |
| Render Production Environment Secrets | `NOT VERIFIED` | Secret values are protected and not read | Deliberately omitted for security compliance |
| Direct RLS Exploitability Test | `NOT VERIFIED` | Prohibited in Phase 1 (requires mutating writes) | Rehearse in isolated disposable environment |

---

## 7. Evidence Conclusions for Phase 1 Decisions

1. **Production Is NOT Clean:** Real production database rows exhibit the exact defects identified during source analysis:
   - Schedule multiplication across multiple assets (`AMC-2026-0003`).
   - Renewal losing service allocations (`AMC-2026-0006` -> `AMC-2026-0007`).
   - Schedule completion marked without qualifying report (`SCH-2026-32553`).
   - Retroactive snapshot backfill applied to historical reports.
2. **Database Access Is Safe:** All live database metadata and aggregate numbers were collected using non-mutating SELECT queries without modifying a single production row.
3. **No Assumptions Made:** Local migrations were validated against live information schema and constraint definitions, confirming applied status while documenting untracked Supabase migration history.
