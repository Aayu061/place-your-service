-- ============================================================================
-- PLACE YOUR SERVICE (PYS) — PHASE 9: SCHEDULING & TECHNICIAN ASSIGNMENT
-- Migration: 20261008020000_phase9_scheduling_and_assignment.sql
-- Description: Enhances service_schedules and service_assignments for unified
--              operational scheduling (Service Requests + AMC PM obligations)
-- ============================================================================

-- 1. Add missing relational and scheduling columns to service_schedules
ALTER TABLE public.service_schedules
  ADD COLUMN IF NOT EXISTS service_request_id UUID REFERENCES public.service_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.customer_sites(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_time TEXT DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS end_time TEXT DEFAULT '11:00',
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 120,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_from_id UUID REFERENCES public.service_schedules(id) ON DELETE SET NULL;

-- 2. Allow asset_id to be nullable for site-level general service requests
ALTER TABLE public.service_schedules
  ALTER COLUMN asset_id DROP NOT NULL;

-- 3. Update status constraint to include RESCHEDULED
ALTER TABLE public.service_schedules
  DROP CONSTRAINT IF EXISTS service_schedules_status_check;

ALTER TABLE public.service_schedules
  ADD CONSTRAINT service_schedules_status_check
  CHECK (status IN ('SCHEDULED', 'PLANNED', 'DUE', 'OVERDUE', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'COMPLETED', 'SKIPPED', 'CANCELLED', 'RESCHEDULED'));

-- 4. Prevent duplicate active schedules for the same service request
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_schedule_per_request
  ON public.service_schedules(service_request_id)
  WHERE service_request_id IS NOT NULL AND status NOT IN ('CANCELLED');

-- 5. Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_service_schedules_request ON public.service_schedules(service_request_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_customer ON public.service_schedules(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_site ON public.service_schedules(site_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_technician ON public.service_schedules(technician_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_date_status ON public.service_schedules(scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_service_assignments_tech_date ON public.service_assignments(technician_id, scheduled_start_time, scheduled_end_time);
