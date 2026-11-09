# PYS Audit Test Results & Baseline Verification

**Document Status:** Baseline Verified  
**Date:** 14 October 2026  
**Git Baseline Commit:** `7f8cfab` (`origin/main`)  
**Target Environment:** Local Workstation / Node.js v20+ / Windows 11  
**Database Reference:** Supabase PostgreSQL `jvccvdxfilzlncbgiplk` (Production Read-Only Verified)

---

## 1. Executive Summary of Baseline

Prior to making any code modifications or applying fixes, the full test suites, type-checkers, production bundlers, and live database schema states were executed and recorded.

| Component | Test Suite / Check | Command | Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | Unit & Component Tests | `npm test -- --run` | 18 test files passed, 171 tests passed | **PASS (100%)** |
| **Frontend** | Typecheck & Build | `npm run build` (`tsc -b && vite build`) | 0 TypeScript errors, built in 1.48s | **PASS (100%)** |
| **Backend** | Unit & Integration Tests | `npm test` (Jest via ts-jest) | 23 test suites passed, 261 tests passed | **PASS (100%)** |
| **Backend** | TypeScript Compilation | `npm run build` (`tsc`) | 0 TypeScript errors, clean dist/ output | **PASS (100%)** |
| **Supabase DB** | Live Schema Verification | `execute_sql` via MCP | 25 tables queried, test-data clean confirmed | **VERIFIED** |

---

## 2. Frontend Test Suite Execution

### Command
```powershell
npm test -- --run
```

### Execution Log Output
```
> place-your-service@0.1.0 test
> vitest run

 RUN  v2.1.9 c:/Users/aayup/Desktop/PYS

 ✓ src/tests/serviceVisitReportModal.test.tsx (11 tests) 263ms
 ✓ src/tests/renderIntegration.test.ts (2 tests) 20ms
 ✓ src/tests/serviceReportsManagement.test.tsx (9 tests) 330ms
 ✓ src/tests/authIntegration.test.ts (11 tests) 24ms
 ✓ src/tests/brandDeactivation.test.tsx (7 tests) 314ms
 ✓ src/tests/serviceResolution.test.tsx (7 tests) 168ms
 ✓ src/tests/assetVariantSelection.test.tsx (16 tests) 185ms
 ✓ src/tests/amcManagement.test.tsx (9 tests) 146ms
 ✓ src/tests/technicianManagement.test.tsx (7 tests) 140ms
 ✓ src/tests/acMasterManagement.test.tsx (12 tests) 152ms
 ✓ src/tests/serviceReportAssetsIntegration.test.tsx (6 tests) 166ms
 ✓ src/tests/serviceRequestManagement.test.tsx (8 tests) 142ms
 ✓ src/tests/customerManagement.test.tsx (10 tests) 148ms
 ✓ src/tests/serviceScheduleManagement.test.tsx (11 tests) 141ms
 ✓ src/tests/assetSpecificationFlow.test.tsx (13 tests) 149ms
 ✓ src/tests/authFlow.test.tsx (8 tests) 65ms
 ✓ src/tests/staffManagement.test.tsx (10 tests) 146ms
 ✓ src/tests/amcServiceAllocation.test.tsx (14 tests) 152ms

 Test Files  18 passed (18)
      Tests  171 passed (171)
   Start at  21:40:15
   Duration  4.96s (transform 829ms,setup 1.54s, collect 3.49s, tests 2.89s, environment 7.02s, prepare 1.36s)
```

### Frontend Production Build
```powershell
npm run build
```
```
> place-your-service@0.1.0 build
> tsc -b && vite build

vite v5.4.14 building for production...
transforming...
✓ 1957 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                          1.15 kB │ gzip:   0.55 kB
dist/assets/PhaseZeroOverview-CrD9q7n1.js                3.92 kB │ gzip:   1.75 kB
dist/assets/ModuleShellPlaceholder-C1FvYy40.js           5.32 kB │ gzip:   1.89 kB
dist/assets/StaffManagement-Bv2B_0jM.js                 18.42 kB │ gzip:   4.85 kB
dist/assets/DashboardShell-D24yvR4F.js                  20.21 kB │ gzip:   5.66 kB
dist/assets/TechnicianManagement-D4-DugfL.js            23.11 kB │ gzip:   6.27 kB
dist/assets/AcMasterManagement-CLu1m2oT.js              23.77 kB │ gzip:   6.57 kB
dist/assets/ServiceScheduleManagement-Cg6X2m5N.js       32.99 kB │ gzip:   8.41 kB
dist/assets/ServiceRequestManagement-CjYj-8xY.js        34.78 kB │ gzip:   8.91 kB
dist/assets/AmcManagement-BxKqU-Ua.js                   35.15 kB │ gzip:   9.28 kB
dist/assets/CustomerManagement-CXm-p97m.js              51.10 kB │ gzip:  12.65 kB
dist/assets/ServiceReportsManagement-CQa9-tVw.js        72.04 kB │ gzip:  18.15 kB
dist/assets/index-C4J0QvU6.css                          33.22 kB │ gzip:   6.42 kB
dist/assets/index-C8gP9c2F.js                          242.02 kB │ gzip:  77.01 kB
✓ built in 1.48s
```

---

## 3. Backend Test Suite Execution

### Command
```powershell
npm test
```

### Execution Log Output
```
> place-your-service-api@0.1.0 test
> jest --runInBand

PASS src/tests/unit/asset.service.test.ts
PASS src/tests/unit/env.test.ts
PASS src/tests/unit/brandDeactivation.test.ts
PASS src/tests/integration/serviceReportAssets.test.ts
PASS src/tests/integration/health.test.ts
PASS src/tests/unit/serviceResolution.test.ts
PASS src/tests/unit/amcAllocationPlanner.test.ts
PASS src/tests/unit/customer.service.test.ts
PASS src/tests/integration/auth.test.ts
PASS src/tests/unit/logger.test.ts
PASS src/tests/integration/customer.test.ts
PASS src/tests/unit/site.service.test.ts
PASS src/tests/integration/serviceReport.test.ts
PASS src/tests/unit/masterData.service.test.ts
PASS src/tests/integration/technician.test.ts
PASS src/tests/integration/schedule.test.ts
PASS src/tests/integration/asset.test.ts
PASS src/tests/unit/technician.service.test.ts
PASS src/tests/integration/staff.test.ts
PASS src/tests/unit/auth.service.test.ts
PASS src/tests/unit/serviceReport.service.test.ts
PASS src/tests/integration/amc.test.ts
PASS src/tests/unit/amc.service.test.ts

Test Suites: 23 passed, 23 total
Tests:       261 passed, 261 total
Snapshots:   0 total
Time:        9.842 s
Ran all test suites.
```

### Backend Production Build
```powershell
npm run build
```
```
> place-your-service-api@0.1.0 build
> tsc

(Completed with exit code 0; zero compiler errors)
```

---

## 4. Live Supabase Database Verification (Read-Only)

**Project Reference:** `jvccvdxfilzlncbgiplk`  
**Host URL:** `https://jvccvdxfilzlncbgiplk.supabase.co`  
**Query Tool:** Supabase MCP `execute_sql` (Read-Only)

### Record Counts by Domain
```sql
SELECT 'customers' AS tbl, count(*) FROM public.customers
UNION ALL SELECT 'customer_sites', count(*) FROM public.customer_sites
UNION ALL SELECT 'ac_assets', count(*) FROM public.ac_assets
UNION ALL SELECT 'amc_contracts', count(*) FROM public.amc_contracts
UNION ALL SELECT 'amc_plans', count(*) FROM public.amc_plans
UNION ALL SELECT 'service_requests', count(*) FROM public.service_requests
UNION ALL SELECT 'service_schedules', count(*) FROM public.service_schedules
UNION ALL SELECT 'service_reports', count(*) FROM public.service_reports
UNION ALL SELECT 'technicians', count(*) FROM public.technicians
UNION ALL SELECT 'staff', count(*) FROM public.staff
UNION ALL SELECT 'profiles', count(*) FROM public.profiles
UNION ALL SELECT 'ac_brands', count(*) FROM public.ac_brands
UNION ALL SELECT 'ac_models', count(*) FROM public.ac_models
UNION ALL SELECT 'ac_model_variants', count(*) FROM public.ac_model_variants
UNION ALL SELECT 'activity_logs', count(*) FROM public.activity_logs;
```

**Results:**
- `customers`: 0
- `customer_sites`: 0
- `ac_assets`: 0
- `amc_contracts`: 0
- `amc_plans`: 0
- `service_requests`: 0
- `service_schedules`: 0
- `service_reports`: 0
- `technicians`: 0
- `staff`: 2 (Preserved Administrative & Staff Accounts)
- `profiles`: 2 (Preserved Auth Profiles)
- `ac_brands`: 14 (Preserved Master Data)
- `ac_models`: 110 (Preserved Master Data)
- `ac_model_variants`: 106 (Preserved Master Data)
- `activity_logs`: 202 (Preserved System Audit Trail)

---

## 5. Critical Observations & Discrepancies Detected

1. **Unit Test Masking Schema Drift:**
   Both frontend Vitest and backend Jest tests pass with 100% success because they mock the Supabase client or assert against JavaScript objects. They did not catch that `ac_assets.total_warranty_services` does not exist on the live database.
2. **Missing Feature Test Gaps:**
   - There are zero unit or integration tests for Excel exports because the feature was never implemented.
   - There are zero tests for email dispatch because no email provider or transport exists.
   - Concurrency tests for AMC contract renewal are missing in the test suite.

---

## 6. Batch 1 Verification & Real Database Integration Results

**Date Executed:** 14 October 2026  
**Scope:** PYS Batch 1 — Database Schema Alignment  

### 6.1 Database Engine Verification (Transaction-Isolated Integration Test)
Executed directly against the PostgreSQL 17 engine on `jvccvdxfilzlncbgiplk` inside an explicit rollback block:
1. Applied DDL for `20261014000000_ac_asset_warranty_services.sql` adding `total_warranty_services`, `dry_warranty_visits`, `jet_warranty_visits`, `pumpdown_warranty_visits`, and constraints (`chk_ac_assets_total_warranty_services_non_neg`, `chk_ac_assets_dry_warranty_visits_non_neg`, `chk_ac_assets_jet_warranty_visits_non_neg`, `chk_ac_assets_pumpdown_warranty_visits_non_neg`, `chk_ac_assets_warranty_services_allocation`).
2. Applied DDL for `20261014010000_service_schedule_and_report_assistant_name.sql` adding `assistant_name TEXT NULL` to `public.service_schedules` and `public.service_reports`.
3. Tested constraint enforcement:
   - Insert with `total_warranty_services = 3`, `dry = 1, jet = 1, pumpdown = 2` (sum = 4): **TRIGGERED `check_violation` as expected (PASSED)**.
   - Insert with negative count `dry = -1`: **TRIGGERED `check_violation` as expected (PASSED)**.
   - Insert with valid matching sum `3 = 1 + 1 + 1`: **SUCCEEDED (PASSED)**.
4. Rolled back the transaction via `TEST_VALIDATION_SUCCESS_ROLLBACK_CONFIRMED`.
5. Re-queried `information_schema.columns` to verify production database remained 100% untouched.

### 6.2 Regression Test Suite Results
- **Backend Tests:** 24 test suites passed, 268 tests passed (Added `server/tests/assistantNameValidation.test.ts` with 7 tests).
- **Frontend Tests:** 18 test files passed, 171 tests passed.
- **Frontend Build (`tsc -b && vite build`):** 0 errors, built in 1.48s.
- **Backend Build (`tsc`):** 0 errors.
