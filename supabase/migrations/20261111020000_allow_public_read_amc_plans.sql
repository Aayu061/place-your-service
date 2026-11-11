-- ============================================================================
-- Migration: 20261111020000_allow_public_read_amc_plans.sql
-- Purpose:
--   Permit public / anonymous and authenticated read access to amc_plans.
--   AMC maintenance plans and rate cards are official commercial offerings that
--   must be readable by clients, portal users, and technicians across the platform.
-- ============================================================================

-- 1. Ensure permissive SELECT policy on amc_plans for public & authenticated access
DROP POLICY IF EXISTS amc_plans_read_all ON public.amc_plans;
CREATE POLICY amc_plans_read_all ON public.amc_plans
  FOR SELECT USING (true);

-- 2. Ensure service_role full administrative access
DROP POLICY IF EXISTS amc_plans_service_role_all ON public.amc_plans;
CREATE POLICY amc_plans_service_role_all ON public.amc_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);
