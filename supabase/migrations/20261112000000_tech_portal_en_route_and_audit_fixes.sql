-- ============================================================================
-- PLACE YOUR SERVICE (PYS) — TECHNICIAN PORTAL STATUS & AUDIT COMPATIBILITY
-- Migration: 20261112000000_tech_portal_en_route_and_audit_fixes.sql
-- Purpose:
--   1. Allow 'EN_ROUTE' status in service_schedules.status check constraint
--      so field technicians can mark "On The Way" cleanly without constraint errors.
-- ============================================================================

ALTER TABLE public.service_schedules
  DROP CONSTRAINT IF EXISTS service_schedules_status_check;

ALTER TABLE public.service_schedules
  ADD CONSTRAINT service_schedules_status_check
  CHECK (status IN (
    'SCHEDULED',
    'PLANNED',
    'DUE',
    'OVERDUE',
    'ASSIGNED',
    'EN_ROUTE',
    'IN_PROGRESS',
    'RESOLVED',
    'COMPLETED',
    'SKIPPED',
    'CANCELLED',
    'RESCHEDULED'
  ));

