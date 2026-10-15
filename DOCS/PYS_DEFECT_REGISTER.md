# PYS Defect Register — Comprehensive System Audit

**Audit Date:** 14 October 2026  
**Git Baseline:** `7f8cfab` (`main`)  
**Database Target:** `place-your-service` (Supabase `jvccvdxfilzlncbgiplk`)  
**Defect Counts:** P0: 2 | P1: 6 | P2: 4 | P3: 2  
**Total Tracked Defects:** 14

---

## Index of Defects

| Defect ID | Priority | Feature Module | Title | Status |
| :--- | :--- | :--- | :--- | :--- |
| **PYS-A1** | **P1** | Service Reports | Automatic Customer Email Delivery Missing | **CONFIRMED DEFECT** |
| **PYS-A2** | **P2** | Service Reports | Technician Contact Phone Number Exposed on Customer Views | **RESOLVED IN BATCH 3** |
| **PYS-A3** | **P1** | Service Reports | Assistant Name Missing from Schema and Service Report Entry | **BATCH 3 CODE & TESTS COMPLETE (PENDING PROD MIGRATION)** |
| **PYS-B1** | **P1** | Excel Export | Missing `.xlsx` Exports for Customers, Schedules, Reports & Expiry | **CONFIRMED DEFECT** |
| **PYS-C1** | **P2** | AC Master / Assets | Refrigerant Default Selection Cascade and Override Flaws | **RESOLVED IN BATCH 2** |
| **PYS-C2** | **P0** | AC Assets | Critical Schema Drift: Warranty Service Entry Fails on Live DB | **BATCH 2 CODE & TESTS COMPLETE (PENDING PROD MIGRATION)** |
| **PYS-D1** | **P0** | AMC Contracts | Duplicate PM Obligations & Orphaned Visits on Renewal | **RESOLVED IN BATCH 4** |
| **PYS-D2** | **P1** | AMC Quotations | Quotation Activation (`DRAFT` → `ACTIVE`) Skips PM Obligation Generation | **RESOLVED IN BATCH 4** |
| **PYS-D3** | **P1** | AMC Contracts | Renewal Discards Breakdown Visits (`dry`, `jet`, `pumpdown`) | **RESOLVED IN BATCH 4** |
| **PYS-004**| **P2** | Service Resolution | Revisit Resolution Leaves Discrepancy in Completion Aggregations | **CONFIRMED DEFECT** |
| **PYS-005**| **P1** | Service Reports | Cross-Entity Asset/Site Validation Missing in Service Report Payload | **CONFIRMED DEFECT** |
| **PYS-006**| **P2** | Master Data | Model Creation Dialog Hardcodes 'R32' Default When Null Intended | **RESOLVED IN BATCH 2** |
| **PYS-007**| **P3** | Frontend Types | `ServiceSchedule` Assistant Field Missing in Frontend Typings | **RESOLVED IN BATCH 1** |
| **PYS-008**| **P3** | Service Reports | Customer Email Missing from Service Report Detail Query | **CONFIRMED DEFECT** |

---

## Detailed Defect Specifications

### PYS-C2 — Critical Schema Drift: Warranty Service Entry Fails on Live DB (P0)
- **Severity / Priority:** P0 — Critical Blocker.
- **Affected Feature:** AC Asset Registration & Warranty Entitlement Management.
- **Reproduction Steps:**
  1. Open Staff/Admin UI → Customers → Select Customer → Select Site.
  2. Click "Add AC Asset".
  3. Enter Brand, Model, Serial Numbers, and enter Warranty Services: Total: 3 (1 Dry, 1 Jet, 1 Pumpdown).
  4. Click "Register AC Asset".
- **Expected Behavior:** Asset is saved with warranty dates and service visit entitlements in `ac_assets`.
- **Actual Behavior:** PostgreSQL error returned: `column "total_warranty_services" of relation "ac_assets" does not exist` (HTTP 500 / 400).
- **Frontend Files:** [`src/pages/CustomerManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/CustomerManagement.tsx)
- **Backend Files:** [`server/src/services/asset.service.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/services/asset.service.ts), [`server/src/validators/asset.validator.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/validators/asset.validator.ts)
- **Database / Schema:** Migration `supabase/migrations/20261014000000_ac_asset_warranty_services.sql` was authored and committed, but **NEVER executed on the live Supabase database**.
- **Root Cause & Evidence:** Direct SQL query via Supabase MCP `execute_sql` confirmed `public.ac_assets` has `warranty_start_date` and `warranty_end_date`, but lacks `total_warranty_services`, `dry_warranty_visits`, `jet_warranty_visits`, `pumpdown_warranty_visits`.
- **Proposed Fix:** Apply migration `20261014000000_ac_asset_warranty_services.sql` to live database with non-negative checks and sum invariant constraint.
- **Regression Tests:** Integration test executed against PostgreSQL 17 engine via transaction-isolated rollback; verified allocation check constraint `total = dry + jet + pumpdown` and non-negative constraints. Comprehensive frontend tests in `technologyAndAssetRegistration.test.tsx` and backend tests in `assetPersistence.test.ts` and `warrantyAllocation.test.ts` verify non-negative validation, sum invariant, and in-form feedback.
- **Status:** **BATCH 2 CODE & TESTS COMPLETE — PENDING PRODUCTION MIGRATION DEPLOYMENT**.

---

### PYS-D1 — Duplicate PM Obligations & Orphaned Visits on Renewal (P0)
- **Severity / Priority:** P0 — High Integrity Violation.
- **Affected Feature:** AMC Contracts, Quotation Renewal & Preventive Maintenance Generation.
- **Reproduction Steps:**
  1. Create an active AMC contract with 4 quarterly visits for Asset A.
  2. Notice visits scheduled for months 3, 6, 9, 12.
  3. Execute Renewal for the subsequent year before all visits are performed.
  4. Inspect `service_schedules`.
- **Expected Behavior:**
  - Successor contract is created with non-overlapping period.
  - Unperformed predecessor obligations are cleanly reconciled (not left hanging or re-copied).
  - Successor generates only its own cadence visits without multiplying schedules.
- **Actual Behavior:**
  - Unperformed predecessor schedules remain `SCHEDULED` indefinitely.
  - Renewal inserts new schedules with a fragile idempotency key `${id}_${asset.assetId}_${date}`. If contract dates change or renewal is re-triggered, duplicate schedules accumulate.
- **Frontend Files:** [`src/pages/AmcManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/AmcManagement.tsx)
- **Backend Files:** [`server/src/services/amc.service.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/services/amc.service.ts) lines 1160–1260, lines 1410–1460.
- **Database / Schema:** `public.service_schedules`, `public.amc_contracts`.
- **Root Cause & Evidence:**
  - `renewContract` in `amc.service.ts` creates a new contract but does not mark unperformed predecessor schedules or handle successor period boundaries cleanly.
  - Furthermore, `renewContract` omits `dry_service_visits`, `jet_service_visits`, `pumpdown_service_visits` during insert of successor contract, causing successor PM generation to fall back to generic alternating types or fail.
- **Completed Fix (Batch 4):**
  1. Replaced fragile date-only idempotency key with deterministic composite identity based on `amc_id`, `asset_id`, and `visit_number`, selecting existing schedules by visit number and date.
  2. In `generatePmObligations`, handled PostgreSQL duplicate key violation (`23505`) gracefully to ensure concurrent activation/renewal requests do not crash or corrupt state.
  3. In `renewContract`, identified all eligible unperformed predecessor schedules (`SCHEDULED`, `PLANNED`, `DUE`, `OVERDUE`) and marked them `status = 'CANCELLED'` with `cancellation_reason = 'SUPERSEDED_BY_RENEWAL'`.
  4. Strictly preserved completed visits (`COMPLETED`), in-progress visits (`IN_PROGRESS`), and service reports without modification.
  5. Implemented atomic compensation logic to roll back successor contract and restore superseded predecessor schedules if obligation generation fails.
- **Regression Tests:** Verified in `server/tests/amcBatch4Fixes.test.ts` (Scenarios 9-16 covering unperformed schedule supersession, completed schedule preservation, in-progress handling, per-asset traceability, duplicate retry prevention, concurrent collision handling, follow-up schedule isolation, and audit logging).
- **Status:** **RESOLVED IN BATCH 4**.

---

### PYS-A1 — Automatic Customer Email Delivery Missing (P1)
- **Severity / Priority:** P1 — Core Requirement.
- **Affected Feature:** Service Visit Reports & Customer Communication.
- **Reproduction Steps:**
  1. Complete a service visit report in `ServiceReportsManagement`.
  2. Save and complete the report.
  3. Check email inbox of the customer.
- **Expected Behavior:** Customer's registered email receives an automated, formatted service completion summary with work done, observations, and technician/assistant names.
- **Actual Behavior:** No email is dispatched. No email provider or transport package is installed in `server/package.json`.
- **Frontend Files:** [`src/pages/ServiceReportsManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/ServiceReportsManagement.tsx)
- **Backend Files:** [`server/src/services/serviceReport.service.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/services/serviceReport.service.ts), [`server/package.json`](file:///c:/Users/aayup/Desktop/PYS/server/package.json).
- **Database / Schema:** `public.customers` (`email`), `public.service_reports`, `public.activity_logs`.
- **Root Cause & Evidence:** `serviceReport.service.ts` only writes to PostgreSQL. There is zero email integration code, zero background email dispatch, and `customers.email` is not even queried in `getReportById`.
- **Proposed Fix:**
  1. Implement a pluggable email service in `server/src/services/email.service.ts` (supporting Resend / SMTP / Console Test Transport).
  2. Add async dispatch trigger in `createReport` after database transaction successfully commits.
  3. Query `customers.email` as authoritative recipient.
  4. Ensure failed email delivery logs an error in `activity_logs` but DOES NOT roll back the committed service report.
- **Regression Tests:** Mock email provider; verify email payload, recipient, and fallback on network error.
- **Status:** **CONFIRMED DEFECT (P1)**.

---

### PYS-A2 — Technician Contact Phone Number Exposed on Customer Views (P2)
- **Severity / Priority:** P2 — Privacy & Policy Compliance.
- **Affected Feature:** Customer-facing Service Report views, print layouts, and email templates.
- **Reproduction Steps:**
  1. Open `ServiceReportsManagement`.
  2. View any completed report detail drawer or open `ServiceReportPrintView`.
- **Expected Behavior:** Technician's name is displayed, but their private phone number is redacted from all customer-facing views, printable receipts, and email templates. Phone number must remain accessible in Admin/Staff Technician Management only.
- **Actual Behavior:** Previously, line 1188 of [`src/pages/ServiceReportsManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/ServiceReportsManagement.tsx) explicitly rendered `Phone: {detailedReport.technicianPhone}`, and the backend included technician phone in report payloads.
- **Frontend Files:** [`src/pages/ServiceReportsManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/ServiceReportsManagement.tsx), [`src/components/serviceReports/ServiceReportPrintView.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/components/serviceReports/ServiceReportPrintView.tsx).
- **Backend Files:** [`server/src/services/serviceReport.service.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/services/serviceReport.service.ts).
- **Root Cause & Evidence:** Direct code match in UI and print components, as well as database join projection of `technicians(id, name, technician_code, phone)`.
- **Completed Fix (Batch 3):**
  1. Removed `technicianPhone` line completely from the customer-facing report detail drawer in `ServiceReportsManagement.tsx`.
  2. Verified and asserted that technician phone is absent from `ServiceReportPrintView.tsx`.
  3. Hardened backend privacy by omitting `phone` from Supabase join queries (`technicians (id, name, technician_code)`) and mapping `technicianPhone: null` in all report endpoints (`getReportById` and `getReports`).
  4. Retained authoritative technician phone numbers in internal `TechnicianManagement.tsx` (directory table and detail profile drawer) and the `technicians` table.
- **Regression Tests:**
  - `src/tests/serviceReports.test.tsx` (tests 29, 30): Verified technician phone is absent from report detail drawer and print view DOM.
  - `src/tests/technicians.test.tsx` (test 9): Verified technician phone remains accessible in internal technician management table and detail drawer.
  - `server/tests/serviceReportRoutes.test.ts` (test 22): Verified backend returns `technicianPhone: null` on report endpoints.
- **Status:** **RESOLVED IN BATCH 3**.

---

### PYS-A3 — Assistant Name Missing from Schema and Service Report Entry (P1)
- **Severity / Priority:** P1 — Operational Requirement.
- **Affected Feature:** Field Technician & Assistant Name Tracking on Service Reports.
- **Reproduction Steps:**
  1. Open "New Service Report" modal.
  2. Observe technician name is displayed.
  3. Look for assistant name input or display.
- **Expected Behavior:** Both the assigned technician's name and the assistant's name are visible, editable, saved in database, and displayed on service reports and print views.
- **Actual Behavior:** Initially, there was no field, column, or API parameter for assistant name.
- **Frontend Files:** [`src/components/serviceReports/ServiceVisitReportModal.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/components/serviceReports/ServiceVisitReportModal.tsx), [`src/pages/ServiceReportsManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/ServiceReportsManagement.tsx), [`src/components/serviceReports/ServiceReportPrintView.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/components/serviceReports/ServiceReportPrintView.tsx), [`src/domain/types.ts`](file:///c:/Users/aayup/Desktop/PYS/src/domain/types.ts).
- **Backend Files:** [`server/src/services/serviceReport.service.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/services/serviceReport.service.ts), [`server/src/validators/serviceReport.validator.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/validators/serviceReport.validator.ts).
- **Database / Schema:** Migration `supabase/migrations/20261014010000_service_schedule_and_report_assistant_name.sql` adds `assistant_name TEXT NULL` to `service_schedules` and `service_reports`. Held under production change freeze.
- **Root Cause & Evidence:** Schema inspection via Supabase MCP confirmed absence of `assistant_name` column on live production database.
- **Completed Fix (Batch 1 & Batch 3):**
  1. Created migration `20261014010000_service_schedule_and_report_assistant_name.sql` adding `assistant_name` to `service_schedules` and `service_reports`.
  2. Updated backend validators (`schedule.validator.ts`, `serviceReport.validator.ts`) and TypeScript typings in Batch 1.
  3. Added editable `#assistant-name-input` in `ServiceVisitReportModal.tsx` prefilled from schedule, while allowing staff to edit or clear for the visit (Batch 3).
  4. Added `assistantName?: string | null` to `UpdateServiceReportPayload` in `src/domain/types.ts` and wired persistence in `serviceReport.service.ts` for both create and update operations (Batch 3).
  5. Safely handled blank or absent assistant names without inventing placeholder names (Batch 3).
  6. Rendered both technician and assistant names distinctly in report table, detail drawer, and print view (Batch 3).
- **Regression Tests:**
  - `server/tests/assistantNameValidation.test.ts`: 7 tests covering schedule and report validation.
  - `server/tests/serviceReportRoutes.test.ts` (tests 22, 23): Verified assistant name mapping, persistence, and safe handling of null/empty names.
  - `src/tests/serviceReports.test.tsx` (tests 27, 28, 29, 30): Verified assistant name prefill, editing, persistence, blank handling, separated rendering, and absence of technician phone.
- **Status:** **BATCH 3 CODE & TESTS COMPLETE — PENDING PRODUCTION MIGRATION DEPLOYMENT**.

---

### PYS-B1 — Missing `.xlsx` Exports for Customers, Schedules, Reports & Expiry (P1)
- **Severity / Priority:** P1 — Core Administrative Requirement.
- **Affected Feature:** Operational Data Reporting & Excel Export.
- **Reproduction Steps:**
  1. Navigate to Customers, Service Schedules, Service Reports, or AMC Expiry screens.
  2. Look for "Export to Excel" (.xlsx) functionality.
- **Expected Behavior:** Accurate, formatted `.xlsx` export files generated with authoritative database values, proper dates, headers, and Admin/Staff role protection.
- **Actual Behavior:** No `.xlsx` export endpoints or UI buttons exist. Neither `exceljs` nor `xlsx` library is present in dependencies.
- **Frontend Files:** [`src/pages/CustomerManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/CustomerManagement.tsx), [`src/pages/ServiceScheduleManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/ServiceScheduleManagement.tsx), [`src/pages/ServiceReportsManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/ServiceReportsManagement.tsx), [`src/pages/AmcManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/AmcManagement.tsx).
- **Backend Files:** Add `server/src/services/export.service.ts`, `server/src/controllers/export.controller.ts`, export routes.
- **Root Cause & Evidence:** Code search for `.xlsx` and `excel` returned zero implementations.
- **Proposed Fix:**
  1. Install `exceljs` in `server/package.json`.
  2. Implement backend streaming export endpoints with proper MIME type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
  3. Provide UI download triggers for:
     - Customer details
     - Service schedules
     - Service reports
     - AMC expiry details
- **Regression Tests:** Test API endpoints return valid `.xlsx` binary buffers with correct column headers and records.
- **Status:** **CONFIRMED DEFECT (P1)**.

---

### PYS-C1 — Refrigerant Default Selection Cascade and Override Flaws (P2)
- **Severity / Priority:** P2 — Data Entry Usability & Integrity.
- **Affected Feature:** AC Master Data & Asset Register Cascading Autofill.
- **Reproduction Steps:**
  1. Open AC Master Management → Add or Edit Model.
  2. Observe default refrigerant behavior.
  3. Open Customer Management → Add Asset → Select Model without refrigerant.
- **Expected Behavior:**
  - If model/variant defines a refrigerant, it autofills the form.
  - If user selects a different model/variant, the refrigerant updates to match the new selection.
  - If model has no default, user can manually select any valid refrigerant without getting stuck.
  - Value persists correctly upon save and reload.
- **Actual Behavior:**
  - `AcMasterManagement.tsx` forced `setModelRefrigerant(model.refrigerant || 'R32')` and `'R32'` on new models.
  - In `asset.service.ts`, if `variantId` was omitted, the server failed to look up `mData.refrigerant` from `ac_models`.
- **Frontend Files:** [`src/pages/CustomerManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/CustomerManagement.tsx), [`src/pages/AcMasterManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/AcMasterManagement.tsx).
- **Backend Files:** [`server/src/services/asset.service.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/services/asset.service.ts).
- **Root Cause & Evidence:** Hardcoded 'R32' fallback in UI modal handlers and missing model-level fallback in asset creation backend.
- **Proposed Fix:** Use clean cascade: Variant Refrigerant → Model Refrigerant → Manual Entry. Do not force hardcoded 'R32'. Clear dependent fields when brand/model changes.
- **Resolution in Batch 2:**
  - Removed hardcoded `'R32'` defaults from `AcMasterManagement.tsx` model and variant modal handlers and dropdowns.
  - Implemented full refrigerant cascade in `CustomerManagement.tsx` (`handleVariantChange` and `handleModelChange`).
  - Implemented server-side cascade in `asset.service.ts` for both `createAcAsset` and `updateAcAsset`, prefilling `variant.refrigerant` -> `model.refrigerant` -> `null` while preserving deliberate manual overrides.
  - Form state preserves manual override across unrelated field changes (serial, notes, dates).
- **Regression Tests:** Verified in `src/tests/technologyAndAssetRegistration.test.tsx` (variant precedence, model fallback, manual override persistence, model reset clearing dependent specs) and `server/tests/assetPersistence.test.ts` (tests 4, 5, 6, 7).
- **Status:** **RESOLVED IN BATCH 2**.

---

### PYS-D2 — Quotation Activation (`DRAFT` → `ACTIVE`) Skips PM Obligation Generation (P1)
- **Severity / Priority:** P1 — Contract Integrity.
- **Affected Feature:** AMC Quotation Lifecycle.
- **Reproduction Steps:**
  1. Create an AMC quotation in `DRAFT` status.
  2. Inspect `service_schedules` (0 schedules generated, as expected for drafts).
  3. Update quotation status to `ACTIVE` via `PATCH /api/v1/amc-contracts/:id/status`.
  4. Inspect `service_schedules`.
- **Expected Behavior:** On transition to `ACTIVE`, the per-asset PM obligations are automatically generated for all covered assets.
- **Actual Behavior:** `updateStatus` in `amc.service.ts` updates the status column in `amc_contracts` but never invokes `generatePmObligations`. Contract remains active with 0 PM visits.
- **Frontend Files:** [`src/pages/AmcManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/AmcManagement.tsx).
- **Backend Files:** [`server/src/services/amc.service.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/services/amc.service.ts) lines 940–990.
- **Root Cause & Evidence:** In `amc.service.ts`, `generatePmObligations` is ONLY called inside `createContract` when status is initially `ACTIVE`. In `updateStatus`, no PM generation call exists.
- **Completed Fix (Batch 4):**
  1. In `updateStatus`, when transitioning from `DRAFT` to `ACTIVE`, invoked `generatePmObligations` to generate per-asset PM schedules.
  2. Implemented transactional rollback: if obligation generation fails, the contract status is automatically reverted to `DRAFT` with an explanatory error.
  3. Ensured idempotent execution: repeated status updates or updating an already-active AMC does not regenerate obligations.
- **Regression Tests:** Verified in `server/tests/amcBatch4Fixes.test.ts` (Scenarios 1-5 covering valid draft activation, correct per-asset PM schedule creation, activation retry idempotency, atomic rollback on generation failure, and avoiding duplicate generation on already-active updates).
- **Status:** **RESOLVED IN BATCH 4**.

---

### PYS-D3 — Renewal Discards Breakdown Visits (`dry`, `jet`, `pumpdown`) (P1)
- **Severity / Priority:** P1 — Contract Integrity.
- **Affected Feature:** AMC Contract Renewal.
- **Reproduction Steps:**
  1. Create a contract with breakdown visits: 2 Dry, 1 Jet, 1 Pumpdown.
  2. Call `POST /api/v1/amc-contracts/:id/renew` without explicitly passing new breakdown numbers.
- **Expected Behavior:** Successor contract inherits or carries forward the predecessor contract's service breakdown visits.
- **Actual Behavior:** Prior to Batch 4, `renewContract` in `amc.service.ts` inserted successor with `dry_service_visits: null`, `jet_service_visits: null`, `pumpdown_service_visits: null`.
- **Backend Files:** [`server/src/services/amc.service.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/services/amc.service.ts), [`server/src/validators/amc.validator.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/validators/amc.validator.ts).
- **Frontend Files:** [`src/pages/AmcManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/AmcManagement.tsx), [`src/domain/types.ts`](file:///c:/Users/aayup/Desktop/PYS/src/domain/types.ts).
- **Root Cause & Evidence:** Code in `renewContract` only copied `plan_id`, `customer_id`, `site_id`, `frequency`, but omitted the three breakdown fields.
- **Completed Fix (Batch 4):**
  1. Updated `renewContract` to inherit `dry_service_visits`, `jet_service_visits`, and `pumpdown_service_visits` from the predecessor contract when not explicitly provided.
  2. Supported explicit valid overrides in `RenewAmcContractPayload` (`renewAmcContractSchema`), validating that counts are non-negative and their sum strictly equals `totalVisits`.
  3. Enforced allocation validation in the renewal modal in `AmcManagement.tsx` with live reconciliation indicators (`{allocated} / {total} Allocated`).
- **Regression Tests:** Verified in `server/tests/amcBatch4Fixes.test.ts` (Scenarios 6-8 covering default breakdown inheritance, explicit overrides, and 422 rejection of invalid allocation sums) and `src/tests/amc.test.tsx` (renewal modal allocation inputs and submission).
- **Status:** **RESOLVED IN BATCH 4**.
