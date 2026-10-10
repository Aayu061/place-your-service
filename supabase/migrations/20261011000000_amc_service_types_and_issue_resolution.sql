-- Migration: 20261011000000_amc_service_types_and_issue_resolution.sql
-- Description: AMC Planned Service Types, Performed Service Types, Issue Resolution Tracking, and Service Report Linking Engine

-- 1. Add planned_service_type to service_schedules
ALTER TABLE public.service_schedules
  ADD COLUMN IF NOT EXISTS planned_service_type TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_schedules_planned_service_type_check'
  ) THEN
    ALTER TABLE public.service_schedules
      ADD CONSTRAINT service_schedules_planned_service_type_check
      CHECK (planned_service_type IS NULL OR planned_service_type IN ('DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_schedules_planned_service_type
  ON public.service_schedules (planned_service_type)
  WHERE planned_service_type IS NOT NULL;

-- 2. Add service type columns and resolution linking to service_reports
ALTER TABLE public.service_reports
  ADD COLUMN IF NOT EXISTS planned_service_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS performed_service_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS service_type_deviation_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS originating_report_id UUID NULL REFERENCES public.service_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolving_report_id UUID NULL REFERENCES public.service_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS resolution_status TEXT NOT NULL DEFAULT 'OPEN';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_reports_planned_service_type_check'
  ) THEN
    ALTER TABLE public.service_reports
      ADD CONSTRAINT service_reports_planned_service_type_check
      CHECK (planned_service_type IS NULL OR planned_service_type IN ('DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_reports_performed_service_type_check'
  ) THEN
    ALTER TABLE public.service_reports
      ADD CONSTRAINT service_reports_performed_service_type_check
      CHECK (performed_service_type IS NULL OR performed_service_type IN ('DRY_SERVICE', 'JET_SERVICE', 'PUMPDOWN_SERVICE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_reports_resolution_status_check'
  ) THEN
    ALTER TABLE public.service_reports
      ADD CONSTRAINT service_reports_resolution_status_check
      CHECK (resolution_status IN ('OPEN', 'AWAITING_PARTS', 'AWAITING_REPAIR', 'RESOLVED', 'CANCELLED'));
  END IF;
END $$;

-- Indexes for performance & bidirectional linking
CREATE INDEX IF NOT EXISTS idx_service_reports_originating_report_id
  ON public.service_reports (originating_report_id)
  WHERE originating_report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_reports_resolving_report_id
  ON public.service_reports (resolving_report_id)
  WHERE resolving_report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_reports_resolution_status
  ON public.service_reports (resolution_status);

CREATE INDEX IF NOT EXISTS idx_service_reports_planned_service_type
  ON public.service_reports (planned_service_type)
  WHERE planned_service_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_reports_performed_service_type
  ON public.service_reports (performed_service_type)
  WHERE performed_service_type IS NOT NULL;

-- 3. Idempotent Data Backfill for Historical Service Reports
-- All existing COMPLETED reports are historically resolved
UPDATE public.service_reports
SET resolution_status = 'RESOLVED',
    resolved_at = COALESCE(resolved_at, updated_at, created_at)
WHERE primary_outcome = 'COMPLETED'
  AND resolution_status = 'OPEN';

-- Existing PENDING_PARTS reports set to AWAITING_PARTS if still unresolved
UPDATE public.service_reports
SET resolution_status = 'AWAITING_PARTS'
WHERE primary_outcome = 'PENDING_PARTS'
  AND resolving_report_id IS NULL
  AND resolution_status = 'OPEN';

-- Existing PENDING_REPAIRS reports set to AWAITING_REPAIR if still unresolved
UPDATE public.service_reports
SET resolution_status = 'AWAITING_REPAIR'
WHERE primary_outcome = 'PENDING_REPAIRS'
  AND resolving_report_id IS NULL
  AND resolution_status = 'OPEN';
