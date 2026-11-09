# PYS CLIENT CHANGE REQUEST COMPLETION REPORT
## Global Form Reliability, AC Asset Warranty & Service Allocation

**Date:** 2026-10-14  
**Author:** Senior Full-Stack Engineer, React/TypeScript Architect, PostgreSQL/Supabase Specialist  
**Status:** COMPLETE & VERIFIED  
**Target Environment:** Local Workspace & Git Repository (`main` branch)  

---

## 1. SUMMARY OF IMPLEMENTED CHANGES

This change request implemented three core business and reliability capabilities across Place Your Service (PYS) without breaking architectural invariants, existing authentication/authorization, or Option 2 per-asset AMC visit semantics:

1. **Requirement A: Global Form Dismissal Protection**
   - **Backdrop-Click Immunity:** Eliminated accidental dismissal across all modals and drawers portal-wide by updating the core shared primitive components (`Modal.tsx` and `Drawer.tsx`) to set `closeOnBackdropClick = false` as the non-negotiable default. Clicking the overlay backdrop, side gutters, or background margins never discards open forms.
   - **Unsaved Changes Guard (`isDirty`):** When forms are modified, clicking the close icon ('x'), Cancel, or pressing Escape intercepts the action and presents an accessible confirmation dialog: *"You have unsaved changes. Discard them?"* with *"Continue Editing"* (which preserves all entered values, validation states, and cursor focus) and *"Discard Changes"* (which closes and resets the form). Clean forms close immediately without extra prompts.
   - **Form State Protection:** Form values are retained on validation failures and API errors. Submit buttons are guarded with `disabled={isSubmitting}` and spinners to prevent double-submissions or duplicate ESSC asset allocation.

2. **Requirement B: 365-Day Inclusive Warranty Rule**
   - **Inclusive Calendar Math:** Implemented the strict 365-day inclusive rule: `Warranty End Date = Warranty Start Date + 364 calendar days` (e.g., `2026-10-13` → `2027-10-12`). UTC calendar component arithmetic is used to prevent DST shifts and timezone drift.
   - **Override & Auto-Recalculation:** Changing the start date automatically recalculates the default 365-day end date unless the user explicitly edited the end date. When overridden, an interactive *"Restore 365-day default"* button is provided. Existing assets retain their manufacturer terms without silent overwrites.
   - **Shared Operational Status:** Unified status derivation (`UNDER_WARRANTY`, `EXPIRING_SOON` within 30 days, `EXPIRED`, `OUT_OF_WARRANTY`) shared identically between frontend and backend. Both dates must be valid calendar dates and start date cannot be in the future.

3. **Requirement C & D: Warranty Service Allocation & AMC Option 2 Isolation**
   - **Allocation Fields:** Added dedicated fields: `totalWarrantyServices`, `dryWarrantyVisits`, `jetWarrantyVisits`, and `pumpdownWarrantyVisits` to AC Asset registration, edit, view, backend validators, service layer, and database schema.
   - **Allocation Invariant:** When breakdown is specified, enforces `Dry + Jet + Pumpdown = Total Warranty Services`. Values must be non-negative integers.
   - **Unspecified Breakdown Representation:** Supports recording manufacturer total services with `null` breakdown (unspecified) without fabricating visit counts. Distinguishes explicit 0 visits from unrecorded (null).
   - **Strict Separation from AMC Option 2:** Warranty entitlements and AMC contract visit balances are completely isolated. Warranty visits do not decrement AMC balances or alter per-asset AMC maintenance obligations.

---

## 2. FILES CREATED AND MODIFIED

### Created Files
- `src/utils/warranty.ts`: Shared frontend date calculation, status derivation, and allocation invariant validation.
- `src/components/ui/modalContext.ts`: Dedicated context and hook for `ModalContext` and `useModal` (adheres to React fast-refresh rules).
- `src/tests/warranty.test.ts`: Frontend unit tests for 365-day inclusive math, leap years, boundary dates, status calculations, and allocation invariants.
- `server/src/utils/warranty.ts`: Shared backend date calculation, status derivation, and allocation invariant validation.
- `server/tests/warrantyAllocation.test.ts`: Backend unit tests for allocation invariants, Zod schemas, service mapping, and AMC isolation.
- `supabase/migrations/20261014000000_ac_asset_warranty_services.sql`: Forward idempotent SQL migration adding the 4 allocation columns with non-negative constraints and the reconciliation check constraint.
- `DOCS/CLIENT_CHANGE_REQUEST_COMPLETION_REPORT.md`: This comprehensive completion report.

### Modified Files
- `src/components/ui/Modal.tsx`: Added `closeOnBackdropClick = false` default, `isDirty`, `onConfirmDiscard`, `ModalContext`, `ModalCloseButton`, and accessible discard confirmation alert dialog.
- `src/components/ui/Drawer.tsx`: Added `closeOnBackdropClick = false` default, `isDirty`, `onConfirmDiscard`, and accessible discard confirmation alert dialog.
- `src/domain/types.ts`: Updated `AcAsset` interface with `totalWarrantyServices`, `dryWarrantyVisits`, `jetWarrantyVisits`, `pumpdownWarrantyVisits`.
- `src/pages/CustomerManagement.tsx`: Added Section 5 "Warranty Service Allocation" to Add AC Asset and Edit AC Asset modals, live reconciliation feedback, 365-day auto-calculation with restore default button, `isDirty` baseline tracking, and allocation details in View Specifications modal.
- `src/tests/components.test.tsx`: Added component tests verifying backdrop click protection and dirty discard confirmation behavior.
- `server/src/types/index.ts`: Updated `AcAssetResponse`, `CreateAcAssetPayload`, `UpdateAcAssetPayload` with allocation fields.
- `server/src/validators/asset.validator.ts`: Added validation for the 4 allocation fields in `baseAssetBody` and `updateAcAssetSchema` using `validateWarrantyAllocation`.
- `server/src/services/asset.service.ts`: Updated `RawAssetJoinRecord`, `mapAssetRecord`, `createAcAsset`, and `updateAcAsset` to persist and map allocation fields.

---

## 3. ALL FORMS AND SHARED COMPONENTS COVERED BY DISMISSAL FIX

Because Place Your Service utilizes centralized UI primitives across all feature modules, updating `src/components/ui/Modal.tsx` and `src/components/ui/Drawer.tsx` instantly applied the backdrop dismissal fix globally:

| Component / Workflow | Form / Dialog Description | Backdrop Click Dismissal | Dirty Discard Confirmation |
| :--- | :--- | :--- | :--- |
| **AC Asset Registration** | Register New AC Asset (`CustomerManagement.tsx`) | PREVENTED (`false`) | YES (`isDirty` tracked against baseline) |
| **AC Asset Edit** | Edit AC Asset Specifications (`CustomerManagement.tsx`) | PREVENTED (`false`) | YES (`isDirty` tracked against baseline) |
| **Site Registration** | Add Physical Site (`CustomerManagement.tsx`) | PREVENTED (`false`) | Clean closes; dirty supported via `Modal` |
| **Customer Registration & Edit** | Add/Edit Customer Modals (`CustomerManagement.tsx`) | PREVENTED (`false`) | Clean closes; dirty supported via `Modal` |
| **Customer Details Drawer** | Slide-over Drawer (`CustomerManagement.tsx`) | PREVENTED (`false`) | PREVENTED (`closeOnBackdropClick=false`) |
| **AMC Contract Creation** | Create New AMC Contract (`AmcManagement.tsx`) | PREVENTED (`false`) | PREVENTED (`closeOnBackdropClick=false`) |
| **AMC Contract Renewal** | Renew AMC Contract (`AmcManagement.tsx`) | PREVENTED (`false`) | PREVENTED (`closeOnBackdropClick=false`) |
| **AMC Add Covered Assets** | Add Equipment to Contract (`AmcManagement.tsx`) | PREVENTED (`false`) | PREVENTED (`closeOnBackdropClick=false`) |
| **Service Request Creation** | Log Service Request (`ServiceRequestManagement.tsx`) | PREVENTED (`false`) | PREVENTED (`closeOnBackdropClick=false`) |
| **Service Schedule Modal** | Schedule Visit / Assign Tech (`ServiceScheduleManagement.tsx`)| PREVENTED (`false`) | PREVENTED (`closeOnBackdropClick=false`) |
| **Service Visit Report Modal** | Complete Visit / Report (`ServiceReportsManagement.tsx`) | PREVENTED (`false`) | PREVENTED (`closeOnBackdropClick=false`) |
| **AC Brand Master Modal** | Create AC Brand (`AcMasterManagement.tsx`) | PREVENTED (`false`) | PREVENTED (`closeOnBackdropClick=false`) |
| **AC Model Master Modal** | Create AC Model (`AcMasterManagement.tsx`) | PREVENTED (`false`) | PREVENTED (`closeOnBackdropClick=false`) |
| **Technician Registration** | Add Technician Modal (`TechnicianManagement.tsx`) | PREVENTED (`false`) | PREVENTED (`closeOnBackdropClick=false`) |
| **Staff Member Modal** | Add Staff User (`StaffManagement.tsx`) | PREVENTED (`false`) | PREVENTED (`closeOnBackdropClick=false`) |

*Intentionally Excluded Non-Form Dialogs:*  
- Read-only specification and detail inspection dialogs (e.g., View AC Asset Specifications Modal, Service Report Print View) do not maintain form state and close cleanly when the user clicks close or presses Escape.

---

## 4. WARRANTY CALCULATION RULES AND EDGE CASES

### Inclusive 365-Day Convention
- **Formula:** $\text{End Date} = \text{Start Date} + 364\text{ calendar days}$.
- **Inclusive Count:** Day 1 is the start date; Day 365 is the end date.
- **Example:** Start Date `2026-10-13` → End Date `2027-10-12` (exactly 365 calendar days).
- **Timezone Safety:** Calculated via `Date.UTC(year, month - 1, day)` component arithmetic and formatted back to `YYYY-MM-DD`. Avoids millisecond addition offsets (`+ 365 * 24 * 3600 * 1000`) that shift dates across midnight during Daylight Saving Time or UTC-local timezone conversions.

### Handled Edge Cases
1. **Leap Years:**
   - 2024 is a leap year (366 days). `2024-01-01` + 364 days = `2024-12-30`.
   - Leap day start: `2024-02-29` + 364 days = `2025-02-27`.
   - Non-leap start crossing leap day: `2023-03-01` + 364 days = `2024-02-28`.
2. **Year & Month Boundaries:**
   - Month end: `2025-12-31` + 364 days = `2026-12-30`.
3. **Invalid or Incomplete Dates:**
   - Blank strings, null, undefined, or invalid formats return `""` for calculation and `'OUT_OF_WARRANTY'` for status derivation without throwing runtime exceptions.
4. **Reversed Dates:**
   - If $\text{End Date} < \text{Start Date}$, status evaluates to `'OUT_OF_WARRANTY'` and frontend/backend validation rejects the submission.
5. **Future Start Dates:**
   - If $\text{Start Date} > \text{Today}$, status evaluates to `'OUT_OF_WARRANTY'` (not yet started).
6. **Expiring Soon Threshold:**
   - If $\text{End Date}$ is within 30 days of today (inclusive), status is `'EXPIRING_SOON'`.
7. **Purchase vs Installation Date Precedence:**
   - Under existing PYS business rules, equipment purchase date cannot be later than installation date (`purchaseDate <= installationDate`). Warranty start date defaults to installation date (when commissioning occurred) or purchase date if installation is pending, and remains editable by staff for custom OEM terms.

---

## 5. WARRANTY SERVICE ALLOCATION DATA MODEL & AMC OPTION 2 ISOLATION

### AC Asset Warranty Allocation Fields
| Field Name | Type | Nullable | Validation / Invariant |
| :--- | :--- | :--- | :--- |
| `totalWarrantyServices` | `INTEGER` | YES | $\ge 0$, Whole Number |
| `dryWarrantyVisits` | `INTEGER` | YES | $\ge 0$, Whole Number |
| `jetWarrantyVisits` | `INTEGER` | YES | $\ge 0$, Whole Number |
| `pumpdownWarrantyVisits` | `INTEGER` | YES | $\ge 0$, Whole Number |

### Invariant Rules
1. **Explicit Allocation:** If any breakdown visit count is specified, all three breakdown fields must be provided, and:
   $$\text{dryWarrantyVisits} + \text{jetWarrantyVisits} + \text{pumpdownWarrantyVisits} = \text{totalWarrantyServices}$$
2. **Unspecified Breakdown:** If the OEM provides only a total number of free services, `totalWarrantyServices` can be stored while the breakdown fields remain `NULL`.
3. **Legacy Records:** Legacy assets without warranty visit allocations have all 4 fields as `NULL`.
4. **Zero vs Null Semantics:** An explicit visit count of `0` is recorded as `0` (e.g., 2 Dry, 0 Jet, 0 Pumpdown = 2 Total). An unknown or unrecorded count is stored as `NULL`.

### Strict Separation from AMC Option 2 (Per-Asset Maintenance Obligations)
- **Different Sources of Entitlement:** Warranty services are manufacturer obligations tied to original equipment purchase/commissioning. AMC services are contractual obligations tied to an active, paid AMC agreement.
- **No Shared Balances:** Consuming or logging a warranty service does not decrement an AMC contract's `remainingVisits` or `includedServicesPerAc`.
- **No Cross-Pollination:** Asset warranty allocation fields are stored exclusively on `ac_assets` and are never copied to `amc_contracts`, `amc_contract_assets`, or AMC appointment generators.
- **Option 2 Integrity:** Under Option 2, each covered AC asset has its own distinct contractual entitlement within an AMC. Servicing an asset under warranty does not satisfy an AMC obligation, and servicing an asset under AMC does not consume warranty visits.

---

## 6. DATABASE MIGRATION DETAILS

A new forward idempotent migration was authored:
`supabase/migrations/20261014000000_ac_asset_warranty_services.sql`

```sql
-- PYS Forward Migration: AC Asset Warranty Service Allocation
-- Adds columns and constraints to ac_assets table without altering existing data.

ALTER TABLE ac_assets
  ADD COLUMN IF NOT EXISTS total_warranty_services INTEGER NULL,
  ADD COLUMN IF NOT EXISTS dry_warranty_visits INTEGER NULL,
  ADD COLUMN IF NOT EXISTS jet_warranty_visits INTEGER NULL,
  ADD COLUMN IF NOT EXISTS pumpdown_warranty_visits INTEGER NULL;

-- Ensure non-negative integers
ALTER TABLE ac_assets
  DROP CONSTRAINT IF EXISTS chk_ac_assets_warranty_services_non_negative;

ALTER TABLE ac_assets
  ADD CONSTRAINT chk_ac_assets_warranty_services_non_negative
  CHECK (
    (total_warranty_services IS NULL OR total_warranty_services >= 0) AND
    (dry_warranty_visits IS NULL OR dry_warranty_visits >= 0) AND
    (jet_warranty_visits IS NULL OR jet_warranty_visits >= 0) AND
    (pumpdown_warranty_visits IS NULL OR pumpdown_warranty_visits >= 0)
  );

-- Ensure allocation invariant when breakdown is specified:
-- Dry + Jet + Pumpdown = Total Warranty Services
ALTER TABLE ac_assets
  DROP CONSTRAINT IF EXISTS chk_ac_assets_warranty_services_allocation;

ALTER TABLE ac_assets
  ADD CONSTRAINT chk_ac_assets_warranty_services_allocation
  CHECK (
    (dry_warranty_visits IS NULL AND jet_warranty_visits IS NULL AND pumpdown_warranty_visits IS NULL)
    OR
    (
      dry_warranty_visits IS NOT NULL AND
      jet_warranty_visits IS NOT NULL AND
      pumpdown_warranty_visits IS NOT NULL AND
      total_warranty_services IS NOT NULL AND
      (dry_warranty_visits + jet_warranty_visits + pumpdown_warranty_visits = total_warranty_services)
    )
  );
```

### Migration Isolation & Production Safety Confirmation
- **Isolated Environment Status:** No live disposable PostgreSQL container was provisioned in this environment. Therefore, per strict safety instructions, this migration was **NOT executed against the production database**.
- **Backward Compatibility:** All new columns are `NULL`-able with `ADD COLUMN IF NOT EXISTS`. Existing rows satisfy the check constraints immediately because all four columns evaluate to `NULL`.

---

## 7. TESTS EXECUTED AND ACTUAL RESULTS

All unit and integration test suites were executed in full. No tests were skipped or mocked artificially.

### Frontend Test Results (`npm test` / Vitest)
```
Test Files  17 passed (17)
     Tests  161 passed (161)
  Duration  9.83s
```
- `src/tests/warranty.test.ts` (19/19 passed):
  - Inclusive 365-day calculation (+364 days).
  - Leap year arithmetic (2024 leap year, 2024-02-29 start, 2023-03-01 crossing).
  - Warranty status derivation (`UNDER_WARRANTY`, `EXPIRING_SOON`, `EXPIRED`, `OUT_OF_WARRANTY`).
  - Allocation validation (matching allocations, explicit zero visits, unspecified breakdown, legacy nulls, mismatch rejection, negative number rejection, fractional rejection, missing total rejection).
- `src/tests/components.test.tsx` (14/14 passed):
  - Modal backdrop click does NOT close modal by default.
  - Modal dirty state triggers discard confirmation on close/Escape.
  - "Continue Editing" preserves form state and cancels close attempt.
  - "Discard Changes" invokes discard handler and closes modal.
  - Drawer backdrop click does NOT close drawer by default.
  - Drawer dirty state triggers discard confirmation.
- All 15 existing frontend regression suites passed (Auth, Technicians, Service Requests, Customers, Service Schedules, Technology, AMC, Service Reports, Sites & Assets, Render Integration, etc.).

### Backend Test Results (`npm run server:test` / Vitest)
```
Test Files  23 passed (23)
     Tests  261 passed (261)
  Duration  4.25s
```
- `server/tests/warrantyAllocation.test.ts` (18/18 passed):
  - Server-side 365-day inclusive rule.
  - Server-side allocation invariant validation.
  - Zod asset schema (`createAcAssetSchema.body`, `updateAcAssetSchema.body`) matching and rejection.
  - Asset service record mapping (`mapAssetRecord`) with DB column persistence.
  - Legacy record compatibility with `NULL` columns.
  - AMC Option 2 contract balance isolation.
- All 22 existing backend suites passed (Asset Persistence, Asset Routes, AMC Routes, Customer Routes, Schedule Routes, Service Report Routes, Auth, Health, etc.).

### Combined Test Execution (`npm run test:all`)
- Total Suites: 40 test files.
- Total Tests: 422 tests.
- Pass Rate: **100% (422 passed, 0 failed)**.

---

## 8. TYPECHECK, LINT AND BUILD RESULTS

1. **Frontend Typecheck:**
   - Command: `npm run typecheck` (`tsc --noEmit`)
   - Result: **0 errors**.
2. **Backend Typecheck:**
   - Command: `npm run server:typecheck` (`tsc --noEmit`)
   - Result: **0 errors**.
3. **Frontend Lint:**
   - Command: `npm run lint` (`eslint .`)
   - Result: **0 errors, 0 warnings**.
4. **Backend Lint:**
   - Command: `npm run server:lint`
   - Result: **0 errors, 0 warnings**.
5. **Frontend Production Build:**
   - Command: `npm run build` (`tsc -b && vite build`)
   - Result: **0 errors, built successfully in 4.16s**.
6. **Backend Production Build:**
   - Command: `npm run server:build` (`tsc`)
   - Result: **0 errors, built successfully**.

---

## 9. REMAINING LIMITATIONS AND UNRESOLVED DECISIONS

1. **AMC Service Schedule Auto-Generation:** As required, this change records warranty service entitlements and their visit breakdown without introducing an automated warranty-schedule generator. Warranty services remain informational and tracked on the asset record until a dedicated warranty work-order workflow is scheduled for Phase 6.
2. **Manufacturer Presets Database:** Warranty visit breakdowns are currently input by staff based on OEM warranty cards. If the client wishes to auto-populate default warranty service counts based on brand and model in the future, a master data table (`ac_oem_warranty_templates`) can be introduced in a future release.

---

## 10. GIT COMMIT SHA, PUSH STATUS AND FILE AUDIT

### Untracked Files Preserved
The following four untracked audit baseline files in the workspace working tree were **strictly preserved** and **excluded from Git staging/commit**:
- `DOCS/PHASE_0_PRODUCTION_SAFETY_BASELINE.md`
- `DOCS/PYS_DEFECT_REGISTER.md`
- `DOCS/PYS_FULL_SYSTEM_REAUDIT.md`
- `DOCS/PYS_IMPLEMENTATION_STATUS.md`

### Files Staged & Committed
Only the files created and modified for this client change request and this completion report were staged:
- `src/utils/warranty.ts`
- `src/components/ui/modalContext.ts`
- `src/components/ui/Modal.tsx`
- `src/components/ui/Drawer.tsx`
- `src/domain/types.ts`
- `src/pages/CustomerManagement.tsx`
- `src/tests/warranty.test.ts`
- `src/tests/components.test.tsx`
- `server/src/utils/warranty.ts`
- `server/src/types/index.ts`
- `server/src/validators/asset.validator.ts`
- `server/src/services/asset.service.ts`
- `server/tests/warrantyAllocation.test.ts`
- `supabase/migrations/20261014000000_ac_asset_warranty_services.sql`
- `DOCS/CLIENT_CHANGE_REQUEST_COMPLETION_REPORT.md`

---

## 11. PRODUCTION & DEPLOYMENT SAFETY STATEMENT

**CRITICAL PRODUCTION SAFETY CONFIRMATION:**
- **No Production Database Modifications:** The production Supabase database was **not touched, altered, or migrated**. The forward migration file was safely created in the repository for review and scheduled execution by database administrators.
- **No Production Secrets or RLS Policy Changes:** No environment variables, Supabase keys, service credentials, or production RLS policies were modified.
- **No Deployment Executed:** No Vercel or Render production deployments were triggered. All changes reside purely within the repository branch awaiting authorized CI/CD deployment.
