-- ============================================================================
-- PLACE YOUR SERVICE (PYS) — PHASE 9 HARDENING: CONCURRENCY & PM DUPLICATE
-- Migration: 20261008030000_phase9_hardening_concurrency_and_pm.sql
-- Description: 
--   1. Adds pm_obligation_id to service_schedules
--   2. Enforces unique partial index on service_request_id (excluding CANCELLED, RESCHEDULED)
--   3. Enforces unique partial index on pm_obligation_id (excluding CANCELLED, RESCHEDULED)
--   4. Enforces unique partial index on (amc_id, asset_id, visit_number) (excluding CANCELLED, RESCHEDULED)
--   5. Implements PostgreSQL-level technician assignment overlap serialization & validation
-- ============================================================================

-- 1. Add pm_obligation_id column to service_schedules
ALTER TABLE public.service_schedules
  ADD COLUMN IF NOT EXISTS pm_obligation_id UUID REFERENCES public.service_schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_schedules_pm_obligation
  ON public.service_schedules(pm_obligation_id);

-- 2. Drop and recreate unique active schedule index on service_requests to exclude RESCHEDULED
DROP INDEX IF EXISTS public.idx_active_schedule_per_request;
CREATE UNIQUE INDEX idx_active_schedule_per_request
  ON public.service_schedules(service_request_id)
  WHERE service_request_id IS NOT NULL AND status NOT IN ('CANCELLED', 'RESCHEDULED');

-- 3. Enforce unique active schedule per PM obligation
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_schedule_per_pm_obligation
  ON public.service_schedules(pm_obligation_id)
  WHERE pm_obligation_id IS NOT NULL AND status NOT IN ('CANCELLED', 'RESCHEDULED');

-- 4. Enforce unique active schedule per AMC contract asset visit
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_schedule_per_amc_asset_visit
  ON public.service_schedules(amc_id, asset_id, visit_number)
  WHERE amc_id IS NOT NULL AND asset_id IS NOT NULL AND visit_number IS NOT NULL AND status NOT IN ('CANCELLED', 'RESCHEDULED');

-- 5. PostgreSQL-level Technician Overlap Conflict Function & Trigger on service_assignments
CREATE OR REPLACE FUNCTION public.check_technician_assignment_conflict()
RETURNS TRIGGER AS $$
DECLARE
  v_conflict RECORD;
BEGIN
  IF NEW.status IN ('ASSIGNED', 'IN_PROGRESS') AND NEW.technician_id IS NOT NULL AND NEW.scheduled_start_time IS NOT NULL AND NEW.scheduled_end_time IS NOT NULL THEN
    -- Serialize concurrent assignment operations on the same technician via row lock
    PERFORM 1 FROM public.technicians WHERE id = NEW.technician_id FOR UPDATE;

    -- Overlap condition: S1 < E2 AND E1 > S2
    SELECT id, service_schedule_id, scheduled_start_time, scheduled_end_time
    INTO v_conflict
    FROM public.service_assignments
    WHERE technician_id = NEW.technician_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status IN ('ASSIGNED', 'IN_PROGRESS')
      AND scheduled_start_time < NEW.scheduled_end_time
      AND scheduled_end_time > NEW.scheduled_start_time
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'TECHNICIAN_OVERLAP_CONFLICT: Technician is already booked for another service from % to %',
        to_char(v_conflict.scheduled_start_time, 'HH24:MI'),
        to_char(v_conflict.scheduled_end_time, 'HH24:MI')
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_check_technician_assignment_conflict
  BEFORE INSERT OR UPDATE ON public.service_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_technician_assignment_conflict();

-- 6. PostgreSQL-level Technician Overlap Conflict Function & Trigger on service_schedules
CREATE OR REPLACE FUNCTION public.check_service_schedule_technician_conflict()
RETURNS TRIGGER AS $$
DECLARE
  v_conflict RECORD;
BEGIN
  IF NEW.status IN ('SCHEDULED', 'ASSIGNED', 'IN_PROGRESS') AND NEW.technician_id IS NOT NULL AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    -- Serialize concurrent schedule operations on the same technician via row lock
    PERFORM 1 FROM public.technicians WHERE id = NEW.technician_id FOR UPDATE;

    -- Overlap condition: S1 < E2 AND E1 > S2 on the same scheduled date
    SELECT id, schedule_number, start_time, end_time
    INTO v_conflict
    FROM public.service_schedules
    WHERE technician_id = NEW.technician_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND scheduled_date = NEW.scheduled_date
      AND status IN ('SCHEDULED', 'ASSIGNED', 'IN_PROGRESS')
      AND start_time < NEW.end_time
      AND end_time > NEW.start_time
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'TECHNICIAN_OVERLAP_CONFLICT: Technician is already booked for another service (% from % to %)',
        v_conflict.schedule_number,
        v_conflict.start_time,
        v_conflict.end_time
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_check_service_schedule_technician_conflict
  BEFORE INSERT OR UPDATE ON public.service_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.check_service_schedule_technician_conflict();
