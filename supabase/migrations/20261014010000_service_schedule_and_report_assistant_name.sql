-- Migration: 20261014010000_service_schedule_and_report_assistant_name.sql
-- Description: Add assistant_name column to service_schedules and service_reports
-- Purpose: Records the name of the assistant/co-technician assisting the primary technician
--          during planned service visits and execution reports.

-- 1. Add assistant_name to service_schedules
ALTER TABLE public.service_schedules
  ADD COLUMN IF NOT EXISTS assistant_name TEXT NULL;

-- 2. Add assistant_name to service_reports
ALTER TABLE public.service_reports
  ADD COLUMN IF NOT EXISTS assistant_name TEXT NULL;

-- 3. Add documentation comments
COMMENT ON COLUMN public.service_schedules.assistant_name IS 'Name of the assistant technician assigned to the scheduled service visit';
COMMENT ON COLUMN public.service_reports.assistant_name IS 'Name of the assistant technician present during the service visit execution';
