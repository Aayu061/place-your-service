# PHASE 1 AUDIT REPORT: AMC SCHEDULED SERVICE TYPES, ISSUE RESOLUTION ENGINE & REGISTER INTELLIGENCE

**Project:** Place Your Service (PYS)  
**Modules Affected:** AMC Contract Management, Service Scheduling & Assignments, Service Visit Reports, Operational Register  
**Audit Date:** 2026-10-10  
**Status:** Audit Complete — Ready for Migration & Implementation  

---

## 1. Executive Summary

This audit establishes the baseline architecture, existing schema, lifecycle flows, and root causes for:
1. Enabling each scheduled AMC visit to specify its planned service type (`DRY_SERVICE`, `JET_SERVICE`, `PUMPDOWN_SERVICE`), and capturing the actually performed service type (with deviation justifications when they differ).
2. Tracing pending parts and pending repairs across original visits and follow-up appointments without rewriting historical visit outcomes.
3. Enabling the Service Visit Reports Register to accurately distinguish historical visit outcomes from active outstanding work, correcting KPI cards and introducing bidirectional resolution links.
4. Protecting AMC preventive maintenance (PM) visit counts and contract obligations against premature incrementing from unresolved visits or duplicate follow-up counts.

---

## 2. Actual Schema & Relationship Audit

### 2.1 Table: `public.service_schedules`
- **Current Columns:** `id`, `schedule_number`, `amc_id`, `asset_id`, `service_request_id`, `customer_id`, `site_id`, `technician_id`, `scheduled_date`, `start_time`, `end_time`, `duration_minutes`, `visit_number`, `status`, `is_system_generated`, `notes`, `cancellation_reason`, `cancelled_at`, `cancelled_by`, `rescheduled_from_id`, `pm_obligation_id`, `created_by`, `updated_by`, `created_at`, `updated_at`.
- **Finding:** Currently has **no service type column**. When AMC PM obligations are generated or scheduled, there is no field to store whether a visit is intended as a Dry Service, Jet Service, or Pumpdown Service.
- **Required Data Model Addition:**
  - `planned_service_type TEXT NULL CHECK (planned_service_type IN ('DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE'))`

### 2.2 Table: `public.service_reports`
- **Current Columns:** `id`, `report_number`, `visit_type`, `service_schedule_id`, `service_request_id`, `amc_id`, `pm_obligation_id`, `customer_id`, `site_id`, `technician_id`, `service_date`, `start_time`, `end_time`, `primary_outcome`, `work_description`, `observations`, `action_taken`, `recommendation`, `customer_feedback`, `customer_signature_url`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `technician_remarks`, `customer_representative`, `customer_acknowledgement`, `follow_up_schedule_id`.
- **Finding 1 (Missing Service Type Distinction):** Does not store `planned_service_type` (from appointment), `performed_service_type`, or `service_type_deviation_reason`.
- **Finding 2 (Issue Resolution Linkage Gap):**
  - Only stores `follow_up_schedule_id` (a forward pointer to the next *appointment*).
  - Does NOT store `originating_report_id` (a backward pointer from a follow-up report to the original report that had pending issues).
  - Does NOT store `resolving_report_id` (a forward pointer from the original report to the specific report that completed the work).
  - Does NOT store `resolved_at` or `resolution_status`.
- **Required Data Model Addition:**
  - `planned_service_type TEXT NULL CHECK (planned_service_type IN ('DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE'))`
  - `performed_service_type TEXT NULL CHECK (performed_service_type IN ('DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE'))`
  - `service_type_deviation_reason TEXT NULL`
  - `originating_report_id UUID REFERENCES public.service_reports(id) ON DELETE SET NULL`
  - `resolving_report_id UUID REFERENCES public.service_reports(id) ON DELETE SET NULL`
  - `resolved_at TIMESTAMPTZ NULL`
  - `resolution_status TEXT NOT NULL DEFAULT 'OPEN' CHECK (resolution_status IN ('OPEN', 'AWAITING_PARTS', 'AWAITING_REPAIR', 'RESOLVED', 'CANCELLED'))`

### 2.3 Table: `public.service_report_assets`
- Stores immutable equipment snapshots and per-asset findings (`asset_outcome`: `COMPLETED`, `PENDING_PARTS`, `PENDING_REPAIRS`).
- Retains existing multi-asset capabilities.

### 2.4 Table: `public.service_report_items`
- Stores individual parts required (`item_type = 'PART'`) and repairs required (`item_type = 'REPAIR'`).
- Contains `is_resolved BOOLEAN NOT NULL DEFAULT FALSE`.

---

## 3. Verified Root Causes

### 3.1 Why Historical Pending Outcomes Continue Appearing as Current Outstanding Work
- **Root Cause:** In `server/src/services/serviceReport.service.ts` (`listReports`), the KPI summary counts are calculated directly as:
  ```typescript
  supabase.from('service_reports').select('id', { count: 'exact', head: true }).eq('primary_outcome', 'PENDING_PARTS')
  supabase.from('service_reports').select('id', { count: 'exact', head: true }).eq('primary_outcome', 'PENDING_REPAIRS')
  ```
  Because `primary_outcome` records the historical outcome of that specific visit (`PENDING_PARTS` or `PENDING_REPAIRS`), even when a follow-up visit successfully resolves the repair and is marked `COMPLETED`, the original report's `primary_outcome` is never changed (which is correct—a visit outcome must remain historical evidence).
  However, because there was no separate current resolution state, the KPI metric forever counts that historical report as pending work.

### 3.2 Why AMC PM Obligations Over-Count or Prematurely Count Visits
- **Root Cause 1:** In `createReport` (`serviceReport.service.ts` line 304):
  Whenever ANY service report is submitted for a schedule, `service_schedules.status` is updated to `'COMPLETED'`.
  Even if `primaryOutcome === 'PENDING_PARTS'` or `'PENDING_REPAIRS'`, the schedule was marked `'COMPLETED'`.
- **Root Cause 2:** In `amc.service.ts` (`getContractById` line 530 and `listContracts` line 391):
  `completedVisitsCount` is computed by counting all `service_schedules` records with `status IN ('COMPLETED', 'RESOLVED')`.
  Consequently:
  1. An incomplete PM visit where parts or repairs were left pending was counted as a completed PM visit immediately.
  2. If a follow-up appointment was booked for that AMC contract to resolve the issue, when that follow-up was completed, `completedVisitsCount` incremented a *second* time for the exact same PM obligation.

---

## 4. Architectural Resolution Plan

### 4.1 Canonical Service Types
- Supported enum values:
  - `DRY_SERVICE` ("Dry Service")
  - `JET_SERVICE` ("Jet Service")
  - `PUMPDOWN_SERVICE` ("Pumpdown Service")
- Dropdown available during AMC scheduling and appointment creation/edit.
- Rescheduling preserves `planned_service_type`.
- Cancellation retains `planned_service_type` for audit integrity.
- Legacy records without a service type display as `Not specified` (no fake data fabrication).

### 4.2 Planned vs. Performed Service Type
- In the Service Visit Report modal:
  - Display `planned_service_type` as scheduled context.
  - Technician selects `performed_service_type` (defaults to planned type).
  - If `performed_service_type` differs from `planned_service_type`, field-level validation requires `service_type_deviation_reason`.

### 4.3 Issue Resolution State Machine
- Historical visit outcome is locked in `primary_outcome` (`COMPLETED`, `PENDING_PARTS`, `PENDING_REPAIRS`).
- Independent current issue state is tracked in `resolution_status`:
  - `OPEN`
  - `AWAITING_PARTS` (when report is filed with `PENDING_PARTS`)
  - `AWAITING_REPAIR` (when report is filed with `PENDING_REPAIRS`)
  - `RESOLVED` (when report is filed with `COMPLETED` or resolved by follow-up)
  - `CANCELLED`
- When follow-up report is submitted with `COMPLETED`:
  - New report: `originating_report_id = originalReport.id`, `resolution_status = 'RESOLVED'`.
  - Original report: `resolving_report_id = newReport.id`, `resolved_at = NOW()`, `resolution_status = 'RESOLVED'`.
  - Original report's `primary_outcome` is **strictly preserved** as `PENDING_PARTS` / `PENDING_REPAIRS`.

### 4.4 Register KPI Intelligence & Bidirectional Links
- **Total Reports:** All recorded reports.
- **Service Completed:** Reports whose actual visit outcome is `COMPLETED`.
- **Pending for Parts:** Distinct unresolved reports awaiting parts (`resolution_status = 'AWAITING_PARTS' AND resolving_report_id IS NULL`).
- **Pending for Repairs:** Distinct unresolved reports awaiting repairs (`resolution_status = 'AWAITING_REPAIR' AND resolving_report_id IS NULL`).
- **Register Table Column:** Added "Resolution / Follow-up" column showing:
  - Original report: Badge "Resolved by Report #XXX" linking to resolving report, or "Awaiting Parts" / "Awaiting Repair".
  - Follow-up report: Badge "Follow-up for Report #YYY" linking to original report.

### 4.5 PM Progress Calculation Integrity
- In `amc.service.ts`:
  - A schedule only counts toward completed PM visits if:
    1. It is a genuine PM obligation (not a follow-up revisit where `rescheduled_from_id` is set).
    2. Its linked service report has `primary_outcome === 'COMPLETED'`.
  - Incomplete visits (`PENDING_PARTS`, `PENDING_REPAIRS`) do not count as completed PM visits.

---

## 5. Migration & Backfill Strategy

1. Add columns to `service_schedules` and `service_reports` with nullable types and check constraints.
2. Add indexes on `originating_report_id`, `resolving_report_id`, `resolution_status`, `planned_service_type`.
3. Idempotently backfill existing records:
   - Existing reports with `primary_outcome = 'COMPLETED'` get `resolution_status = 'RESOLVED'`.
   - Existing reports with `primary_outcome = 'PENDING_PARTS'` and no resolving report get `resolution_status = 'AWAITING_PARTS'`.
   - Existing reports with `primary_outcome = 'PENDING_REPAIRS'` and no resolving report get `resolution_status = 'AWAITING_REPAIR'`.
4. Zero downtime, zero data loss, fully rollback-safe.
