-- Reconcile the repository migrations with the live database (checked 2026-11-18).
-- A fresh database built from the repo matched live in every table, column, index,
-- trigger and function body except these two items. Idempotent: safe on live and staging.

-- 1. Keep-alive helper that exists on live but was created outside the repo.
CREATE OR REPLACE FUNCTION public.pys_maintenance_ping()
RETURNS text
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT 'ok'::text; $function$;

-- 2. Live does not carry this policy (the API uses the service role, which bypasses RLS).
DROP POLICY IF EXISTS amc_plans_service_role_all ON public.amc_plans;
