-- =============================================================================
-- Harden RLS SELECT policies on profiles, staff, and amc_plans
-- Prevents self-registered or non-staff authenticated users from enumerating
-- staff profiles, roles, or internal AMC plan catalogs via direct Supabase REST.
-- Uses (SELECT auth.uid()) to preserve InitPlan performance.
-- =============================================================================

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_authenticated
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.get_user_role((SELECT auth.uid())) IN ('ADMIN', 'STAFF')
  );

DROP POLICY IF EXISTS staff_select_authenticated ON public.staff;
CREATE POLICY staff_select_authenticated
  ON public.staff
  FOR SELECT
  TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR public.get_user_role((SELECT auth.uid())) = 'ADMIN'
  );

DROP POLICY IF EXISTS amc_plans_select_authorized ON public.amc_plans;
CREATE POLICY amc_plans_select_authorized
  ON public.amc_plans
  FOR SELECT
  TO authenticated
  USING (public.get_user_role((SELECT auth.uid())) IN ('ADMIN', 'STAFF'));

