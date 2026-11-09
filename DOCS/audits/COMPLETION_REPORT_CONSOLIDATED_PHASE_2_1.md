# PYS — Consolidated Phase 2.1 Completion Report: Service Lifecycle Synchronization, AC Master Data Integrity & Brand Filter Fix

**Project:** Place Your Service (PYS)  
**Repository:** `https://github.com/Aayu061/place-your-service.git`  
**Branch:** `main`  
**Execution Date:** October 10, 2026  
**Status:** Completed & Verified  

---

## 1. Executive Summary

This phase addressed three interconnected production workstreams focused on service lifecycle reliability, AC equipment master data integrity, and inventory status filtering:

1. **Service Report & Schedule State Synchronization**: Resolved stale revisit schedule references that previously blocked follow-up appointment creation on reports where a revisit was cancelled. Corrected the service request transition state machine to permit valid rollbacks from `SCHEDULED`/`ASSIGNED` to `AWAITING_PARTS` or `REVISIT_REQUIRED` upon appointment cancellation without resetting completed/resolved work.
2. **AC Master Data Duplicate Brand Handling & Safe Inactive Brand Management**: Hardened brand registration against duplicate creation under case-insensitive collision. Distinctly detects existing inactive brands, returning actionable `409 Conflict` payloads with the existing brand reference and an immediate one-click Admin reactivation flow, avoiding duplicate rows while safeguarding the 6 designated inactive brands (`General`, `Haier`, `Hitachi`, `Panasonic`, `Samsung`, `TCL`).
3. **AC Brand Status Filter Correction**: Fixed the confirmed UI defect where selecting "Inactive Brands Only" continued to render active brands. Implemented unified three-state status querying (`ALL`, `ACTIVE`, `INACTIVE`) across backend validator, controller, service layer, and frontend filtering/badge counters.
4. **Rescheduling & Operational Controls**: Exposed the "Reschedule" action for active appointments directly in Daily View cards and List View table rows, while strictly forbidding rescheduling or reassignment on completed and cancelled visits.

---

## 2. Root Cause Analysis (RCA)

### 2.1 Service Report & Schedule State Synchronization
* **Defect**: When an appointment linked as a report's follow-up revisit was cancelled, the parent report's `follow_up_schedule_id` remained populated in `service_reports`. The frontend hid the "Revisit" button (`!report.followUpScheduleId` evaluated to false), and the API's `createFollowUp` method threw an unhandled `409 Conflict` because it assumed any non-null `followUpScheduleId` was an active appointment.
* **Service Request Transition Inconsistency**: In `server/src/services/serviceRequest.service.ts`, `ALLOWED_SERVICE_TRANSITIONS` for `SCHEDULED` and `ASSIGNED` only permitted moving to `IN_PROGRESS`, `SCHEDULED`, `PENDING`, `CANCELLED`, or `ON_HOLD`. When a schedule cancellation occurred on a request that required revisit or was awaiting parts, attempting to set status to `AWAITING_PARTS` or `REVISIT_REQUIRED` failed validation.

### 2.2 AC Master Data Duplicate Brand Handling
* **Defect**: Duplicate brand creation relied on a generic database error or unguided conflict. If an Admin attempted to re-create an existing brand that was deactivated (e.g., `General`, `Samsung`), the system did not guide the Admin to reactivate the existing record, risking accidental duplicate creation or confusion.

### 2.3 AC Brand Status Filter Defect
* **Defect**: In `server/src/validators/masterData.validator.ts`, `activeOnly` defaulted to `true`. When the frontend requested inactive brands by omitting `activeOnly` or passing `activeOnly=false`, the backend service checked `if (query.activeOnly !== false) { q.eq('is_active', true) }`, which did nothing when `activeOnly === false`, returning ALL brands. In `src/pages/AcMasterManagement.tsx`, the component directly rendered `brands.map(...)` without client-side status filtering, causing active brands to be rendered even when "Inactive Brands Only" was selected.

---

## 3. Targeted Implementation & Fix Details

### 3.1 Backend Service Layer (`server/src/services/`)
* **`serviceReport.service.ts`**:
  * In `getReportById`: Checks `follow_up_schedules.status`. If `CANCELLED`, returns `followUpScheduleNumber = null`, `effectiveFollowUpScheduleId = null`, and self-heals by updating `follow_up_schedule_id = null` in `service_reports`.
  * In `listReports`: Joins `follow_up_schedules (id, schedule_number, status)`; if status is `CANCELLED`, returns null for follow-up references.
  * In `createFollowUp`: Inspects existing follow-up schedule; if status is `CANCELLED`, permits creating a replacement follow-up schedule rather than aborting with 409 Conflict.
* **`serviceRequest.service.ts`**:
  * Updated `ALLOWED_SERVICE_TRANSITIONS` so `SCHEDULED` and `ASSIGNED` allow transitions back to `AWAITING_PARTS` and `REVISIT_REQUIRED`.
* **`schedule.service.ts`**:
  * Added safety checks during appointment cancellation: ensures underlying service request is not already `COMPLETED`, `CLOSED`, or `RESOLVED` before updating status to `AWAITING_PARTS` / `REVISIT_REQUIRED`.
  * Imported and typed `ServiceRequestStatus`.
* **`masterData.service.ts` & `masterData.controller.ts`**:
  * Added unified `status: 'ALL' | 'ACTIVE' | 'INACTIVE'` support to `listBrands` and `listModels`.
  * In `createBrand`: Performs case-insensitive name/code match before insert. If an existing brand is found:
    * If `is_active === false`: throws `ConflictError` with message `"An AC brand with name '<name>' (code: '<code'>) already exists but is currently INACTIVE. You can reactivate this existing brand instead of creating a duplicate."` and metadata `{ existingBrandId, isInactive: true, brandName, brandCode }`.
    * If `is_active === true`: throws `ConflictError` guiding the Admin to the existing active record.
  * Catches PostgreSQL `23505` uniqueness violations and maps them to clean user-friendly conflict errors without exposing raw SQL or schema internals.

### 3.2 Frontend UI & UX (`src/pages/`)
* **`src/pages/AcMasterManagement.tsx`**:
  * Added memoized `filteredBrands` and `filteredModels` collections that react immediately to status dropdown changes.
  * Linked tab headers `AC Brands ({filteredBrands.length})` and `AC Models ({filteredModels.length})` to the filtered collections.
  * Updated brand and model card grids to render `filteredBrands.map(...)` and `filteredModels.map(...)`.
  * Filtered brand select options in the Add Model modal to active brands only (`brands.filter(b => b.isActive)`), preventing inactive brands from being attached to new models.
  * Added an inline "Reactivate Brand" action banner in the Brand modal when attempting to register a brand that exists in inactive state.
* **`src/pages/ServiceScheduleManagement.tsx`**:
  * Exposed the "Reschedule" button directly in Daily View cards and List View table rows for all eligible appointments (`!isCancelled && !isCompleted`).
  * Restricted Reschedule and Reassign buttons so completed or cancelled appointments cannot trigger invalid workflow transitions.
* **`src/pages/ServiceReportsManagement.tsx`**:
  * Synchronized "Revisit" button visibility and "Follow-up Required" status badges when a follow-up schedule is cancelled.

---

## 4. Verification & Testing

### 4.1 Backend Automated Tests (Vitest)
* **Suite:** 20 test files, 219 tests executed.
* **Results:** **219 passed, 0 failed**.
* **Key Tests Added / Verified**:
  * `masterDataRoutes.test.ts`:
    * Brand listing filtering by `status=INACTIVE` (only inactive brands returned).
    * Brand listing filtering by `status=ALL` (both active and inactive brands returned).
    * Rejection of duplicate active brand with clear conflict message.
    * Detection of existing inactive brand returning `409 Conflict` with `isInactive: true` and `existingBrandId`.
  * `serviceReportRoutes.test.ts`:
    * Rejection of follow-up revisit creation on completed visit reports (`400 Bad Request`).
    * Rejection of duplicate follow-up creation when an active schedule exists (`409 Conflict`).
    * Permission to create a replacement follow-up revisit when previous follow-up schedule was cancelled (`201 Created`).
  * `scheduleRoutes.test.ts`:
    * Cancel schedule with reason and update status to `CANCELLED` (24 tests all passing).

### 4.2 Frontend Automated Tests (Vitest)
* **Suite:** 15 test files, 116 tests executed.
* **Results:** **116 passed, 0 failed**.
* **Key Tests Added / Verified**:
  * `acMasterAndAssetUpgrade.test.tsx`:
    * "Inactive Brands Only" filter displays only inactive brands and updates counts without page refresh.
    * "Active Brands Only" filter displays only active brands.
    * Real frontend `apiClient` to Render production connectivity verification (`/health/liveness` and `/health/readiness` 200 OK).

### 4.3 Static Analysis & Quality Gates
* **Root TypeScript Check (`npm run typecheck`)**: 0 errors.
* **Server TypeScript Check (`npm run typecheck`)**: 0 errors.
* **Root ESLint (`npm run lint`)**: 0 errors, 0 warnings.
* **Server ESLint / Typecheck (`npm run lint`)**: 0 errors.
* **Root Vite Build (`npm run build`)**: Success in 4.41s.
* **Server Build (`npm run build`)**: Success (tsc compilation clean).

---

## 5. Production Database Safety & Integrity

* **Authoritative Data Preserved**:
  * Zero brand rows deleted or modified during audit.
  * Inactive brands (`General`, `Haier`, `Hitachi`, `Panasonic`, `Samsung`, `TCL`) remain in their authoritative inactive state.
  * Active brands (`Akabishi`, `Daikin`, `LG`, `Mitsubishi Electric`, `Mitsubishi Heavy`, `Voltas`) remain operational.
  * Report `#123` (`b429cab4-a754-41a3-b312-611c99736940`) self-heals upon inspection and permits clean follow-up revisit scheduling.
* **Architecture Maintained**:
  * Frontend: React 19 / Vite (Vercel).
  * Backend: Express API (Render).
  * Database: Supabase PostgreSQL (`jvccvdxfilzlncbgiplk`).
  * No migrations or schema alterations were required; all fixes operate through authoritative database constraints and API validation.

---

## 6. Files Modified

| File | Module | Changes |
| :--- | :--- | :--- |
| `server/src/types/index.ts` | Backend Types | Added `status?: 'ALL' \| 'ACTIVE' \| 'INACTIVE'` to `AcBrandListQuery` and `AcModelListQuery`. |
| `server/src/validators/masterData.validator.ts` | Backend Validation | Added `status` query parameter enum validation for brand and model listings. |
| `server/src/controllers/masterData.controller.ts` | Backend Controller | Resolved `status` filter parameter into service query payload. |
| `server/src/services/masterData.service.ts` | Backend Service | Implemented `status` filtering and duplicate inactive brand detection with structured conflict response. |
| `server/src/services/serviceReport.service.ts` | Backend Service | Self-healed stale cancelled follow-up schedule references and permitted replacement follow-up revisit creation. |
| `server/src/services/serviceRequest.service.ts` | Backend Service | Updated `ALLOWED_SERVICE_TRANSITIONS` for `SCHEDULED` and `ASSIGNED` to allow `AWAITING_PARTS` and `REVISIT_REQUIRED`. |
| `server/src/services/schedule.service.ts` | Backend Service | Preserved service request completion status upon schedule cancellation; imported `ServiceRequestStatus`. |
| `server/tests/masterDataRoutes.test.ts` | Backend Tests | Added tests for brand status filtering and inactive duplicate conflict responses. |
| `server/tests/scheduleRoutes.test.ts` | Backend Tests | Updated service request table mock for cancel schedule test. |
| `server/tests/serviceReportRoutes.test.ts` | Backend Tests | Added tests for follow-up revisit cancellation synchronization and replacement revisit creation. |
| `src/pages/AcMasterManagement.tsx` | Frontend Page | Corrected status filtering, badge counts, empty state, active-only model brand select, and inactive duplicate reactivation CTA. |
| `src/pages/ServiceScheduleManagement.tsx` | Frontend Page | Exposed Reschedule button in Daily View cards and List View rows for eligible appointments. |
| `src/tests/acMasterAndAssetUpgrade.test.tsx` | Frontend Tests | Added tests for AC Brand status filter switching and badge counter updates. |
