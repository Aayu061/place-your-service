-- ============================================================================
-- PLACE YOUR SERVICE (PYS) — MIGRATION 20261015000000
-- Service Visit Report Schedule Concurrency Hardening & Integrity
-- ============================================================================

-- 1. Enforce unique active service report per service schedule
-- Prevents duplicate concurrent service report submissions for the same appointment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_reports_active_schedule
  ON public.service_reports(service_schedule_id)
  WHERE status != 'CANCELLED';

COMMENT ON INDEX public.uq_service_reports_active_schedule IS
  'Ensures at most one active service visit report exists per scheduled appointment, eliminating concurrent submission race conditions.';
