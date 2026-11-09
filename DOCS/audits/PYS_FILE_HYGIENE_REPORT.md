# PYS Repository File Hygiene & Inventory Report

**Audit Date:** 14 October 2026  
**Git Baseline:** `7f8cfab` (`origin/main`)  
**Workspace:** `C:\Users\aayup\Desktop\PYS`  
**Purpose:** Establish an evidence-based classification of repository files to prevent accidental deletion of critical configs, migrations, deployment descriptors, or audit records.

---

## 1. Classification Guidelines & Safeguards

In accordance with PYS project safety rules:
1. **Never delete a file solely because it appears unused in a naive text search.** (Files may be dynamically imported, required by bundlers, or used by external CI/CD pipelines).
2. **Never delete migrations, lockfiles, deployment configs, or source-of-truth documentation.**
3. **Do not remove historical reset transaction scripts or completion reports.** They provide legal and operational proof of database state transitions.
4. **Separate actions into three strict categories:**
   - **Category 1: Safe to Remove** (Zero operational, build, or historical value).
   - **Category 2: Retain** (Essential operational source, active test suites, migrations, documentation).
   - **Category 3: Needs Review / User Decision** (Potentially redundant or uncommitted local files requiring explicit user approval).

---

## 2. File Inventory by Category

### Category 1: Safe to Remove (Zero Impact)
*Currently, no tracked source code files are verified as dead code or obsolete. The working tree is exceptionally lean.*

| File Path | Type | Evidence & Rationale | Action |
| :--- | :--- | :--- | :--- |
| *None at this stage* | N/A | All current source files in `src/` and `server/src/` are actively imported or part of the passing 18 frontend / 23 backend test suites. | **No destructive deletions executed** |

---

### Category 2: Retain (Critical & Source of Truth)

#### A. Core Configuration & Deployment Descriptors
- [`package.json`](file:///c:/Users/aayup/Desktop/PYS/package.json) & [`package-lock.json`](file:///c:/Users/aayup/Desktop/PYS/package-lock.json): Frontend dependencies and lockfile.
- [`vite.config.ts`](file:///c:/Users/aayup/Desktop/PYS/vite.config.ts), [`tsconfig.json`](file:///c:/Users/aayup/Desktop/PYS/tsconfig.json), [`tsconfig.app.json`](file:///c:/Users/aayup/Desktop/PYS/tsconfig.app.json), [`tsconfig.node.json`](file:///c:/Users/aayup/Desktop/PYS/tsconfig.node.json): Vite and TypeScript configuration.
- [`render.yaml`](file:///c:/Users/aayup/Desktop/PYS/render.yaml): Render infrastructure specification for web service API.
- [`server/package.json`](file:///c:/Users/aayup/Desktop/PYS/server/package.json) & [`server/package-lock.json`](file:///c:/Users/aayup/Desktop/PYS/server/package-lock.json): Backend Express API dependencies and lockfile.
- [`server/tsconfig.json`](file:///c:/Users/aayup/Desktop/PYS/server/tsconfig.json): Backend TypeScript compiler options.
- [`server/vitest.config.ts`](file:///c:/Users/aayup/Desktop/PYS/server/vitest.config.ts): Vitest configuration used for backend test runner (`npm test`).

#### B. Database Migrations (`supabase/migrations/`)
All 18 SQL migration files must be strictly preserved to maintain reproducible schema evolution:
1. `20261007000000_foundation_schema.sql`
2. `20261007010000_site_asset_management.sql`
3. `20261007020000_service_request_management.sql`
4. `20261007030000_technician_management.sql`
5. `20261007040000_amc_management.sql`
6. `20261008000000_ac_master_and_asset_upgrade.sql`
7. `20261008010000_amc_renewal_and_asset_performance.sql`
8. `20261008020000_phase9_scheduling_and_assignment.sql`
9. `20261008030000_phase9_hardening_concurrency_and_pm.sql`
10. `20261009000000_parent_model_and_variants.sql`
11. `20261009010000_seed_softwear_ac_models_and_variants.sql`
12. `20261010000000_service_visit_reports.sql`
13. `20261010020000_allow_followup_schedules_after_completion.sql`
14. `20261010030000_admin_master_data_rls_and_brand_deactivation.sql`
15. `20261010040000_service_report_assets_snapshot_integrity.sql`
16. `20261011000000_amc_service_types_and_issue_resolution.sql`
17. `20261011010000_amc_service_allocation_planner.sql`
18. `20261014000000_ac_asset_warranty_services.sql`
19. `20261014010000_service_schedule_and_report_assistant_name.sql`

#### C. Source of Truth & Historical Audit Documentation (`DOCS/`)
- Core governance docs: `PRD.md`, `TRD.md`, `RULES.md`, `ARCHITECTURE.md`, `MEMORY.md`, `POLICY.md`, `PRIVACY.md`.
- Historical reset verification records:
  - `DOCS/EXECUTE_RESET_TRANSACTION_20261014.sql`
  - `DOCS/EXECUTE_TECHNICIANS_AND_PLANS_CLEANUP_20261014.sql`
  - `DOCS/PRODUCTION_TEST_DATA_RESET_PREVIEW.md`
  - `DOCS/PRODUCTION_TEST_DATA_RESET_EXECUTION_REPORT_20261014.md`
- System Audit deliverables (October 2026):
  - `DOCS/PYS_FULL_SYSTEM_AUDIT_20261014.md`
  - `DOCS/PYS_ARCHITECTURE_MAP.md`
  - `DOCS/PYS_API_DATABASE_CONTRACT_MATRIX.md`
  - `DOCS/PYS_DEFECT_REGISTER.md`
  - `DOCS/PYS_FILE_HYGIENE_REPORT.md`
  - `DOCS/PYS_NEXT_PHASE_ROADMAP.md`
  - `DOCS/PYS_AUDIT_TEST_RESULTS.md`

---

### Category 3: Needs Review / User Decision (Local Files)

| File Path | Type | Current Status | Risk Assessment | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| `Softwear Data.xlsx` | Root binary | Uncommitted / Untracked | Contains initial Softwear AC master data imported in migration `20261009010000`. | **Retain in root or move to `DOCS/seed_assets/`**. Do not delete without user confirmation. |
| `DATABSE pass.txt` | Root text file | Git-ignored by `.gitignore` | Contains local development credentials. | **Retain locally for developer setup**, never commit to Git. |

---

## 3. Verification & Build Suite Status

Following file hygiene review:
- No tracked project files were unlinked or orphaned.
- `npm test -- --run` in frontend: **18 test files passed (171 tests)**.
- `npm test` in backend: **23 test suites passed (261 tests)**.
- `npm run build` in frontend: **Passed in 1.48s**.
- `npm run build` in backend: **Passed cleanly**.
