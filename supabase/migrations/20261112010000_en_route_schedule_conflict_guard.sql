-- ============================================================================
-- PLACE YOUR SERVICE (PYS) — EN_ROUTE TECHNICIAN OVERLAP GUARD
-- Migration: 20261112010000_en_route_schedule_conflict_guard.sql
-- Purpose:
--   Include 'EN_ROUTE' in check_service_schedule_technician_conflict() so an
--   en-route technician cannot be double-booked into an overlapping slot.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_service_schedule_technician_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_conflict RECORD;
BEGIN
  IF NEW.status IN ('SCHEDULED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS')
    AND NEW.technician_id IS NOT NULL
    AND NEW.start_time IS NOT NULL
    AND NEW.end_time IS NOT NULL THEN
    -- Serialize concurrent schedule operations on the same technician via row lock
    PERFORM 1 FROM public.technicians WHERE id = NEW.technician_id FOR UPDATE;

    -- Overlap condition: S1 < E2 AND E1 > S2 on the same scheduled date
    SELECT id, schedule_number, start_time, end_time
    INTO v_conflict
    FROM public.service_schedules
    WHERE technician_id = NEW.technician_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND scheduled_date = NEW.scheduled_date
      AND status IN ('SCHEDULED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS')
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
$$;

