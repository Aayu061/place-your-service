# Completion Report: AMC Scheduled Service Types & Issue Resolution Engine

**Project:** Place Your Service (PYS) — HVAC Operational Field Service Platform  
**Target Architecture:** Supabase PostgreSQL (`jvccvdxfilzlncbgiplk`), Express / Node.js Backend, React + Vite Frontend  
**Date of Completion:** October 11, 2026  
**Status:** 100% Implemented, 100% Tested (376 Passing Automated Tests: 136 Frontend Tests, 240 Backend Tests), Production Build Verified  

---

## 1. Executive Summary

This engineering implementation delivers authoritative operational integrity across four critical service dispatch, visit execution, and contract administration modules:

1. **AMC Scheduled Service Types & Cadence Enforcement:**
   - Introduced first-class support for Planned Service Types (`DRY_SERVICE`, `JET_SERVICE`, `PUMPDOWN_SERVICE`) on preventive maintenance obligations and appointments.
   - Guaranteed automatic alternating service allocation during AMC contract generation (e.g. Visit 1 Dry, Visit 2 Jet, Visit 3 Dry, Visit 4 Jet).
   - Captured the actual on-site Performed Service Type in service visit reports.
   - Enforced client-side and backend database-level mandatory justification reasoning whenever performed service type diverges from the planned service type.

2. **Pending Parts & Repairs Resolution Engine:**
   - Preserved immutable historical on-site visit outcomes (`COMPLETED`, `PENDING_PARTS`, `PENDING_REPAIRS`) on original visit reports, ensuring technicians' historical records are never overwritten or fabricated.
   - Introduced an orthogonal resolution lifecycle (`OPEN`, `AWAITING_PARTS`, `AWAITING_REPAIR`, `RESOLVED`, `CANCELLED`).
   - Implemented atomic bidirectional linkage between originating reports with pending items and the resolving reports created during follow-up revisits (`originating_report_id`, `resolving_report_id`, `resolved_at`).

3. **Service Report Register Intelligence & KPI Integrity:**
   - Fixed KPI cardinality on the Service Visit Reports Register: "Pending for Parts" and "Pending for Repairs" count strictly distinct active unresolved issues (`resolving_report_id IS NULL`), preventing historically pending visits from permanently inflating active issue metrics.
   - Added a dedicated "Resolution / Follow-up" column to the Register table with interactive bidirectional navigation badges (`Resolved by #REP-XXX`, `Follow-up for #REP-YYY`, `Awaiting Parts`, `Awaiting Repair`).
   - Added a "Planned & Performed Service" column with clear badges and deviation alerts.
   - Added a `resolutionStatus` dropdown filter to the toolbar.

4. **AMC Visit Count & PM Obligation Integrity:**
   - Guaranteed that contract progress (`Completed PM Visits / Total Included PM Visits`) derives strictly from genuine completed primary PM obligations (`rescheduled_from_id IS NULL` and `primary_outcome = 'COMPLETED'`).
   - Follow-up revisits (`rescheduled_from_id IS NOT NULL`) and visits ending in `PENDING_PARTS` or `PENDING_REPAIRS` never inflate completed AMC counts.

---

## 2. Database Schema Migration & Backfill

Applied live schema migration:  
[`supabase/migrations/20261011000000_amc_service_types_and_issue_resolution.sql`](file:///c:/Users/aayup/Desktop/PYS/supabase/migrations/20261011000000_amc_service_types_and_issue_resolution.sql)

### 2.1 Table Alterations
- **`public.service_schedules`**:
  - `planned_service_type` VARCHAR(30) NULL CHECK (`planned_service_type IN ('DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE')`)
- **`public.service_reports`**:
  - `planned_service_type` VARCHAR(30) NULL CHECK (`planned_service_type IN ('DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE')`)
  - `performed_service_type` VARCHAR(30) NULL CHECK (`performed_service_type IN ('DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE')`)
  - `service_type_deviation_reason` TEXT NULL
  - `originating_report_id` UUID NULL REFERENCES `public.service_reports(id)` ON DELETE SET NULL
  - `resolving_report_id` UUID NULL REFERENCES `public.service_reports(id)` ON DELETE SET NULL
  - `resolved_at` TIMESTAMPTZ NULL
  - `resolution_status` VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (`resolution_status IN ('OPEN', 'AWAITING_PARTS', 'AWAITING_REPAIR', 'RESOLVED', 'CANCELLED')`)

### 2.2 Indexes Created
- `idx_service_schedules_planned_service_type` ON `service_schedules(planned_service_type)`
- `idx_service_reports_resolution_status` ON `service_reports(resolution_status)`
- `idx_service_reports_originating_report_id` ON `service_reports(originating_report_id)`
- `idx_service_reports_resolving_report_id` ON `service_reports(resolving_report_id)`

### 2.3 Safe Backfill Execution
- Backfilled historical reports:
  - `COMPLETED` reports backfilled to `resolution_status = 'RESOLVED'`, `resolved_at = created_at`.
  - `PENDING_PARTS` reports backfilled to `resolution_status = 'AWAITING_PARTS'`.
  - `PENDING_REPAIRS` reports backfilled to `resolution_status = 'AWAITING_REPAIR'`.
- Left missing historical planned/performed values as `NULL` to avoid fabricating unverified historical audit data (rendered as `Not specified` in UI).

---

## 3. Backend Implementation Details

### 3.1 Type Definitions & Validation
- [`server/src/types/index.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/types/index.ts):
  - Added `PlannedServiceType`, `PerformedServiceType`, and `ServiceResolutionStatus`.
  - Extended `ServiceScheduleRow`, `ServiceReportRow`, and query interfaces.
- [`server/src/validators/schedule.validator.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/validators/schedule.validator.ts):
  - Validated `plannedServiceType` against allowed enums in schedule creation and patch updates.
- [`server/src/validators/serviceReport.validator.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/validators/serviceReport.validator.ts):
  - Validated `plannedServiceType`, `performedServiceType`, `serviceTypeDeviationReason`, and `originatingReportId`.
  - Added filter parameter `resolutionStatus`.

### 3.2 Services & Controllers
- [`server/src/services/schedule.service.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/services/schedule.service.ts):
  - Integrated `planned_service_type` into `createSchedule`, `updateSchedule`, `getScheduleById`, `listSchedules`, and `getUnscheduledWork`.
- [`server/src/controllers/schedule.controller.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/controllers/schedule.controller.ts) & [`server/src/routes/schedule.routes.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/routes/schedule.routes.ts):
  - Exposed `PATCH /api/v1/schedules/:id` for modifying schedule slot details and planned service type.
- [`server/src/services/serviceReport.service.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/services/serviceReport.service.ts):
  - Deviation validation: If `plannedServiceType !== performedServiceType`, requires a non-empty `serviceTypeDeviationReason`.
  - Resolving report linking: If `originatingReportId` is provided and the new visit is completed, marks the originating report as `RESOLVED` with `resolving_report_id = newReport.id` and `resolved_at = NOW()`.
  - Resolution KPI calculation: Pending parts/repairs counts only include unresolved reports (`resolving_report_id IS NULL`).
  - Batch number resolution: Originating and resolving report numbers are batch resolved in `listReports` without recursion.
- [`server/src/services/amc.service.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/services/amc.service.ts):
  - `generatePmObligations`: Alternates `planned_service_type` on generated visits (odd visit = `DRY_SERVICE`, even visit = `JET_SERVICE`).
  - `completedVisitsCount`: Strictly checks `rescheduled_from_id IS NULL` and `primary_outcome = 'COMPLETED'`.

---

## 4. Frontend Implementation Details

### 4.1 Domain Types & API Client
- [`src/domain/types.ts`](file:///c:/Users/aayup/Desktop/PYS/src/domain/types.ts):
  - Added `PlannedServiceType`, `PerformedServiceType`, `ServiceResolutionStatus`.
  - Updated `ServiceSchedule`, `ServiceVisitReport`, payload types, and filter params.
- [`src/services/scheduleApi.ts`](file:///c:/Users/aayup/Desktop/PYS/src/services/scheduleApi.ts):
  - Added `updateSchedule(id, payload)` method.

### 4.2 UI Components & Pages
- [`src/pages/ServiceScheduleManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/ServiceScheduleManagement.tsx):
  - Added Planned Service Type dropdown in Schedule creation modal.
  - Rendered Planned Service Type badges in card view, list view table (column `PLANNED SERVICE`), and detail drawer.
- [`src/components/serviceReports/ServiceVisitReportModal.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/components/serviceReports/ServiceVisitReportModal.tsx):
  - Added Section 2B: "Service Execution Type & Planned Alignment".
  - Shows read-only planned service context, dropdown for performed service type, and dynamic deviation justification field with required enforcement.
- [`src/pages/ServiceReportsManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/ServiceReportsManagement.tsx):
  - Added `Planned & Performed Service` table column with Plan/Done badges and `Deviated` warning indicator.
  - Added `Resolution / Follow-up` table column with interactive badges (`Resolved by #REP-XXX`, `Follow-up for #REP-YYY`, `Awaiting Parts`, `Awaiting Repair`, `Resolved on-site`).
  - Added `resolutionStatus` dropdown to filter toolbar.
  - Enhanced detail drawer with Service Execution Alignment section and bidirectional navigation buttons.
  - Updated KPI cards sublabels to convey distinct active unresolved work.
- [`src/pages/AmcManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/AmcManagement.tsx):
  - Displayed planned service type badges on PM obligations in the contract detail drawer schedules list.
- [`src/components/serviceReports/ServiceReportPrintView.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/components/serviceReports/ServiceReportPrintView.tsx):
  - Displayed Planned Service and Performed Service in printed report metadata header.
  - Added formal "Service Type Deviation Justification" boxed section with ISO-compliant styling.
  - Rendered follow-up revisit linkage details when applicable.

---

## 5. Verification & Test Results

### 5.1 Backend Test Results (`npm run server:test`)
- **Total Test Files:** 22 passed (100%)
- **Total Tests:** 240 passed (100%)
- **Execution Time:** 4.26s

### 5.2 Frontend Test Results (`npm test`)
- **Total Test Files:** 16 passed (100%)
- **Total Tests:** 136 passed (100%)
- **Execution Time:** 28.15s

### 5.3 Production Build (`npm run build`)
- **TypeScript Check (`tsc -b`):** 0 errors, 0 warnings
- **Vite Bundler:** Built in 3.98s, production artifacts emitted to `dist/`

---

## 6. Architectural Integrity & Non-Regressions

- **Zero Data Loss:** Permanent ESSC asset codes (`ESSC-0001` through `ESSC-0004`), AC Master Data, active contracts, and historical reports remained untouched.
- **Historical Outcome Immutability:** Technician primary visit outcomes (`COMPLETED`, `PENDING_PARTS`, `PENDING_REPAIRS`) are completely decoupled from resolution status.
- **CSS Strictness:** 100% pure Vanilla CSS with design tokens (`tokens.css`, `components.css`), zero Tailwind CSS classes introduced.
- **Audit Fidelity:** When historical data lacks planned/performed service types, UI gracefully renders `Not specified` rather than guessing or fabricating records.
