-- ============================================================================
-- PLACE YOUR SERVICE (PYS) — FOLLOW-UP REVISIT CONCURRENCY & INDEX REFINEMENT
-- Migration: 20261010020000_allow_followup_schedules_after_completion.sql
-- Description:
--   1. Recreates idx_active_schedule_per_request to exclude COMPLETED and SKIPPED
--      schedules so follow-up appointments can be scheduled for Service Requests.
--   2. Recreates idx_active_schedule_per_pm_obligation to exclude COMPLETED and SKIPPED
--      schedules so follow-up revisit appointments can be scheduled for PM obligations.
--   3. Recreates idx_active_schedule_per_amc_asset_visit to exclude COMPLETED and SKIPPED.
-- ============================================================================

-- 1. Active schedule per service request (only non-terminal active visits)
DROP INDEX IF EXISTS public.idx_active_schedule_per_request;
CREATE UNIQUE INDEX idx_active_schedule_per_request
  ON public.service_schedules(service_request_id)
  WHERE service_request_id IS NOT NULL AND status NOT IN ('CANCELLED', 'RESCHEDULED', 'COMPLETED', 'SKIPPED');

-- 2. Active schedule per PM obligation (only non-terminal active visits)
DROP INDEX IF EXISTS public.idx_active_schedule_per_pm_obligation;
CREATE UNIQUE INDEX idx_active_schedule_per_pm_obligation
  ON public.service_schedules(pm_obligation_id)
  WHERE pm_obligation_id IS NOT NULL AND status NOT IN ('CANCELLED', 'RESCHEDULED', 'COMPLETED', 'SKIPPED');

-- 3. Active schedule per AMC asset visit (only non-terminal active visits)
DROP INDEX IF EXISTS public.idx_active_schedule_per_amc_asset_visit;
CREATE UNIQUE INDEX idx_active_schedule_per_amc_asset_visit
  ON public.service_schedules(amc_id, asset_id, visit_number)
  WHERE amc_id IS NOT NULL AND asset_id IS NOT NULL AND visit_number IS NOT NULL AND status NOT IN ('CANCELLED', 'RESCHEDULED', 'COMPLETED', 'SKIPPED');
