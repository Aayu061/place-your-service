# PYS Full System Audit, Logic Reconciliation & Architecture Report

**Audit Date:** 14 October 2026  
**Repository:** `Aayu061/place-your-service`  
**Git Baseline Commit:** `7f8cfab` on `main` (Verified Clean Working Tree)  
**Production Stack:**  
- **Frontend Deployment:** Vercel (React 19 + TypeScript + Vite)  
- **Backend API Deployment:** Render (Node.js 20+ / Express + TypeScript)  
- **Database:** Supabase Managed PostgreSQL (Project Reference `jvccvdxfilzlncbgiplk`)  
**Audit Mode:** Strict Read-Only Investigation (Zero Unverified Mutations or Production Disruption)

---

## 1. Executive Summary

A comprehensive, evidence-based system audit was conducted across the entire Place Your Service (PYS) platform. The investigation evaluated frontend client applications, Express backend services, REST API contracts, database schema migrations, and the live production Supabase PostgreSQL instance.

### Key Audit Conclusions

1. **System Foundation & Build Health:**
   - The codebase has 100% passing tests on its established baseline: **18 frontend test files (171 tests passed)** and **23 backend test suites (261 tests passed)**.
   - Frontend and backend production compilation (`tsc -b && vite build` and `tsc`) both complete with 0 errors.
   - Clean state-based routing and role-based access control (`ADMIN` and `STAFF`) are correctly wired.

2. **Critical Schema Drift Detected (Root Cause of Defect C2):**
   - Migration `20261014000000_ac_asset_warranty_services.sql` was committed to the repository, and backend/frontend code was modified to read/write `total_warranty_services`, `dry_warranty_visits`, `jet_warranty_visits`, `pumpdown_warranty_visits`.
   - **However, this migration was NEVER executed on the live Supabase database.**
   - Live database inspection confirmed these columns are missing from `public.ac_assets`. Attempting to register an AC asset with warranty service allocations causes PostgreSQL to throw: `column "total_warranty_services" of relation "ac_assets" does not exist`.

3. **Core Defect Diagnoses & Evidence:**
   - **A1 (Customer Email):** No transactional email provider or library (`nodemailer`, Resend, etc.) is installed or called. `customers.email` is not even included in the service report detail query.
   - **A2 (Technician Phone Disclosure):** Customer-facing report drawer explicitly displays `Phone: {detailedReport.technicianPhone}` in line 1188 of `ServiceReportsManagement.tsx`. Must be redacted from customer-facing views while retained in technician management.
   - **A3 (Technician & Assistant Names):** Neither `service_reports` nor `service_schedules` has an `assistant_name` column in database, preventing assistant tracking.
   - **B (Excel Export):** Completely absent from both frontend and backend. Zero `.xlsx` generation libraries installed.
   - **C1 (Refrigerant Selection):** `AcMasterManagement.tsx` modal handlers hardcoded `'R32'` fallback even when null was intended, and `asset.service.ts` failed to fall back to model-level refrigerant when variant was omitted.
   - **D1 & D2 (AMC Renewal Duplication & Quotation Activation):** Renewal omitted breakdown visit fields, failed to cancel unfulfilled predecessor visits, and used a fragile idempotency key `${id}_${asset.assetId}_${date}`. Additionally, activating a draft quotation (`updateStatus` to `'ACTIVE'`) failed to generate PM obligations altogether.

---

## 2. Baseline & Environment Inventory

### 2.1 Git Repository & Working Tree
- **Local Branch:** `main`
- **HEAD Commit:** `7f8cfab`
- **Remote:** `origin/main` (Up to date)
- **Pre-existing Working Tree:** Clean. No untracked code changes or unfinished experiments were overwritten.

### 2.2 Environment & Deployment Topology

| Component | Target Platform | Runtime / Framework | Configuration Source |
| :--- | :--- | :--- | :--- |
| **Frontend** | Vercel CDN | React 19 / TypeScript 5.7 / Vite 5.4 | `vite.config.ts`, `src/config/env.ts` (`VITE_API_BASE_URL`) |
| **Backend API** | Render Web Service | Node.js 20+ / Express 4 / TypeScript | `render.yaml`, `server/src/config/env.ts` (`PORT`, `CORS_ORIGIN`, `SUPABASE_URL`) |
| **Database** | Supabase Cloud | PostgreSQL 15+ (pgvector, RLS, triggers) | `supabase/migrations/` (Target: `jvccvdxfilzlncbgiplk`) |

### 2.3 Production Database Baseline (Read-Only Verified)
Direct read-only inspection via Supabase MCP `execute_sql` on `jvccvdxfilzlncbgiplk` confirmed:
- **Total Tables in Public Schema:** 25 tables.
- **Operational Data Status:** Cleaned baseline (0 customers, 0 customer_sites, 0 ac_assets, 0 amc_contracts, 0 amc_plans, 0 service_requests, 0 service_schedules, 0 service_reports, 0 technicians).
- **Preserved Core Data:** 2 Staff accounts, 2 Auth profiles, 14 AC brands, 110 AC models, 106 AC model variants, 202 system audit activity logs.

---

## 3. Comprehensive Defect Diagnoses & Root Causes

### 3.1 Defect Group A: Service Report Management

#### A1. Automatic Customer Email
- **Requirement:** After a service report is successfully saved, automatically email the report to the customer's registered email address.
- **Root Cause:**
  - `server/package.json` contains no email packages (neither `nodemailer`, `@sendgrid/mail`, `resend`, nor AWS SES).
  - `server/src/services/serviceReport.service.ts` contains only database operations; zero email dispatch logic exists.
  - In `getReportById`, the query selects `customers (id, name, customer_code, phone)` but omits `email`.
- **Architectural Solution:**
  1. Add `customers.email` to report queries.
  2. Implement an asynchronous email dispatch service (`server/src/services/email.service.ts`) with pluggable transport (console/test transport in dev, API/SMTP provider in production).
  3. Fire email asynchronously after database commit in `createReport`.
  4. Ensure email delivery errors are caught, logged to `activity_logs`, and **do not rollback or invalidate the saved report**.

#### A2. Technician Contact Number Removal
- **Requirement:** Remove technician contact phone number from customer-facing views, print layouts, and email templates without removing it from internal technician management.
- **Root Cause:**
  - Line 1188 of [`src/pages/ServiceReportsManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/ServiceReportsManagement.tsx) explicitly renders:
    ```tsx
    <div className="text-slate-500 text-[11px] mt-0.5">Phone: {detailedReport.technicianPhone}</div>
    ```
- **Architectural Solution:**
  - Remove `detailedReport.technicianPhone` from customer-facing report detail drawer and [`src/components/serviceReports/ServiceReportPrintView.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/components/serviceReports/ServiceReportPrintView.tsx).
  - Retain `phone` in [`src/pages/TechnicianManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/TechnicianManagement.tsx).

#### A3. Technician and Assistant Names
- **Requirement:** The service report entry form must display both the assigned technician's name and the assistant's name.
- **Root Cause:**
  - Neither `public.service_reports` nor `public.service_schedules` has an `assistant_name` column.
  - [`src/components/serviceReports/ServiceVisitReportModal.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/components/serviceReports/ServiceVisitReportModal.tsx) only displays `schedule.technicianName`.
- **Architectural Solution:**
  1. Create additive migration `20261014020000_service_assistant_name.sql` adding `assistant_name TEXT NULL` to `service_schedules` and `service_reports`.
  2. Add `assistant_name` to validators and DTOs.
  3. In `ServiceVisitReportModal.tsx`, prefill assistant name from schedule, allow manual entry/override, and persist with report.
  4. Display both names in report table, detail view, print view, and email templates.

---

### 3.2 Defect Group B: Excel Export

- **Requirement:** Provide accurate `.xlsx` exports for Customers, Service Schedules, Service Reports, and AMC Expiry details.
- **Root Cause:**
  - Zero `.xlsx` generation code exists in the repository. Neither `exceljs` nor `xlsx` library is installed.
- **Architectural Solution:**
  1. Install `exceljs` in `server/package.json`.
  2. Create `server/src/services/export.service.ts` to stream native `.xlsx` workbooks with proper styling, headers, and formatted dates.
  3. Expose protected routes:
     - `GET /api/v1/customers/export`
     - `GET /api/v1/service-schedules/export`
     - `GET /api/v1/service-reports/export`
     - `GET /api/v1/amc-contracts/export/expiry`
  4. Add "Export to Excel" action buttons in the corresponding Staff/Admin management pages.

---

### 3.3 Defect Group C: AC Asset Management

#### C1. Refrigerant Default Selection
- **Root Cause:**
  - In `AcMasterManagement.tsx`, `openCreateModelModal` and `openEditModelModal` hardcoded `'R32'` as the fallback: `setModelRefrigerant(model.refrigerant || 'R32')`.
  - In `asset.service.ts`, `createAcAsset` checked `variant.refrigerant` but skipped `model.refrigerant` when variant was omitted.
- **Architectural Solution:**
  - Establish authoritative cascade: Variant Refrigerant → Model Refrigerant → Manual Entry.
  - Remove hardcoded `'R32'` from modal handlers.
  - Reset dependent fields cleanly in form state when brand/model changes.

#### C2. Warranty Service Entry
- **Root Cause:**
  - Migration `20261014000000_ac_asset_warranty_services.sql` was unapplied on the live database.
  - Live query confirmed columns `total_warranty_services`, `dry_warranty_visits`, `jet_warranty_visits`, `pumpdown_warranty_visits` do not exist on `public.ac_assets`.
- **Architectural Solution:**
  - Apply the migration to the live Supabase instance with all non-negative and sum invariant check constraints.

---

### 3.4 Defect Group D: AMC Quotations, Renewal & PM Obligation Engine

#### D1. Duplicate PM Generation on Renewal
- **Root Cause:**
  - In `amc.service.ts`:
    - `renewContract` creates a successor contract but leaves unperformed predecessor schedules in `SCHEDULED` status.
    - Idempotency key `${id}_${asset.assetId}_${date}` is fragile; modifying dates causes new duplicate rows to be created without cleaning up prior rows.
    - `renewContract` omitted `dry_service_visits`, `jet_service_visits`, `pumpdown_service_visits` during insert of successor contract, causing successor PM generation to fall back to generic alternating types or fail.
- **Architectural Solution:**
  1. Carry forward breakdown visit counts in `renewContract`.
  2. Cancel unperformed predecessor schedules with `status = 'CANCELLED'` and cancellation reason `'SUPERSEDED_BY_RENEWAL'`.
  3. Construct deterministic obligation keys: `${contractId}_${assetId}_${visitNumber}`.

#### D2. Quotation Editing & Status Transition
- **Root Cause:**
  - In `amc.service.ts` `updateStatus`, transitioning a draft quotation from `DRAFT` to `ACTIVE` never calls `generatePmObligations`.
  - As a result, activated contracts have 0 scheduled PM visits.
- **Architectural Solution:**
  - In `updateStatus`, when `newStatus === 'ACTIVE'`, trigger `generatePmObligations` within the same transaction.

---

## 4. Cross-Cutting System Logic Mismatches

1. **Profiles vs Staff Roles:**
   `public.profiles` stores user identity (name, email, phone). Roles (`ADMIN` / `STAFF`) are strictly stored in `public.staff`. Frontend auth correctly syncs from `/api/v1/auth/me`.
2. **Date Boundaries & Invariant Consistency:**
   - AMC contract end date must be strictly greater than start date.
   - Warranty end date must be strictly greater than or equal to start date.
   - Sum of breakdown visits (`dry + jet + pumpdown`) must equal total visits for both AMC contracts and AC asset warranty entitlements.

---

## 5. Audit Documentation Suite Summary

The following authoritative documents have been authored and placed in `DOCS/`:
1. [`DOCS/PYS_FULL_SYSTEM_AUDIT_20261014.md`](file:///c:/Users/aayup/Desktop/PYS/DOCS/PYS_FULL_SYSTEM_AUDIT_20261014.md) (This Document)
2. [`DOCS/PYS_ARCHITECTURE_MAP.md`](file:///c:/Users/aayup/Desktop/PYS/DOCS/PYS_ARCHITECTURE_MAP.md) (System Topology, ER Diagrams, Operational Lifecycles)
3. [`DOCS/PYS_API_DATABASE_CONTRACT_MATRIX.md`](file:///c:/Users/aayup/Desktop/PYS/DOCS/PYS_API_DATABASE_CONTRACT_MATRIX.md) (All Endpoints, Roles, Schemas, Tables, Side Effects)
4. [`DOCS/PYS_DEFECT_REGISTER.md`](file:///c:/Users/aayup/Desktop/PYS/DOCS/PYS_DEFECT_REGISTER.md) (14 Prioritized Defects with Repro Steps and Proposed Fixes)
5. [`DOCS/PYS_FILE_HYGIENE_REPORT.md`](file:///c:/Users/aayup/Desktop/PYS/DOCS/PYS_FILE_HYGIENE_REPORT.md) (File Inventory and Categorization)
6. [`DOCS/PYS_NEXT_PHASE_ROADMAP.md`](file:///c:/Users/aayup/Desktop/PYS/DOCS/PYS_NEXT_PHASE_ROADMAP.md) (6-Batch Testable Execution Roadmap)
7. [`DOCS/PYS_AUDIT_TEST_RESULTS.md`](file:///c:/Users/aayup/Desktop/PYS/DOCS/PYS_AUDIT_TEST_RESULTS.md) (Verified Baseline Test Logs)

---

## 6. Next Steps & Recommended Execution Order

With the baseline architecture and defect register fully documented and verified:
1. **Batch 1:** Execute database schema alignment (apply pending warranty migration and add assistant name migration).
2. **Batch 2:** Fix AC Asset Refrigerant selection and warranty service entry.
3. **Batch 3:** Implement assistant name tracking and remove technician phone from customer-facing views.
4. **Batch 4:** Reconcile AMC quotation editing, activation, renewal, and PM generation.
5. **Batch 5:** Implement asynchronous customer service report email delivery.
6. **Batch 6:** Implement authoritative `.xlsx` exports.
7. **Batch 7:** Run full regression suite and generate implementation completion report.
