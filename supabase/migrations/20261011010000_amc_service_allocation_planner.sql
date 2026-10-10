-- Migration: 20261011010000_amc_service_allocation_planner.sql
-- Description: AMC Service Allocation Planner columns and historical follow-up resolution backfill

-- 1. Add Dry, Jet, and Pumpdown visit allocation columns to amc_contracts
ALTER TABLE public.amc_contracts
  ADD COLUMN IF NOT EXISTS dry_service_visits INTEGER NULL,
  ADD COLUMN IF NOT EXISTS jet_service_visits INTEGER NULL,
  ADD COLUMN IF NOT EXISTS pumpdown_service_visits INTEGER NULL;

-- Add check constraints ensuring non-negative integers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'amc_contracts_dry_service_visits_check'
  ) THEN
    ALTER TABLE public.amc_contracts
      ADD CONSTRAINT amc_contracts_dry_service_visits_check
      CHECK (dry_service_visits IS NULL OR dry_service_visits >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'amc_contracts_jet_service_visits_check'
  ) THEN
    ALTER TABLE public.amc_contracts
      ADD CONSTRAINT amc_contracts_jet_service_visits_check
      CHECK (jet_service_visits IS NULL OR jet_service_visits >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'amc_contracts_pumpdown_service_visits_check'
  ) THEN
    ALTER TABLE public.amc_contracts
      ADD CONSTRAINT amc_contracts_pumpdown_service_visits_check
      CHECK (pumpdown_service_visits IS NULL OR pumpdown_service_visits >= 0);
  END IF;
END $$;

-- 2. Idempotent Data Backfill for Historical Follow-Up Resolution Linkage
-- Specifically links Report #123 and Report #456 and any historical follow-up reports where:
-- Original report had pending outcome and follow_up_schedule_id set,
-- Follow-up report was COMPLETED for that schedule,
-- Matching customer and site.
UPDATE public.service_reports AS orig
SET resolving_report_id = follow.id,
    resolution_status = 'RESOLVED',
    resolved_at = COALESCE(orig.resolved_at, follow.created_at, NOW())
FROM public.service_reports AS follow
JOIN public.service_schedules AS sched ON follow.service_schedule_id = sched.id
WHERE orig.follow_up_schedule_id = sched.id
  AND follow.primary_outcome = 'COMPLETED'
  AND orig.resolving_report_id IS NULL
  AND orig.customer_id = follow.customer_id
  AND orig.site_id = follow.site_id;

UPDATE public.service_reports AS follow
SET originating_report_id = orig.id
FROM public.service_reports AS orig
JOIN public.service_schedules AS sched ON orig.follow_up_schedule_id = sched.id
WHERE follow.service_schedule_id = sched.id
  AND follow.originating_report_id IS NULL
  AND orig.customer_id = follow.customer_id
  AND orig.site_id = follow.site_id;

-- Mark items on resolved originating reports as resolved
UPDATE public.service_report_items
SET is_resolved = TRUE
WHERE report_id IN (
  SELECT id FROM public.service_reports WHERE resolution_status = 'RESOLVED' AND resolving_report_id IS NOT NULL
);
