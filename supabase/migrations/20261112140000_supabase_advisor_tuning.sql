-- Phase 4: Supabase Security & Performance Advisor Tuning
-- Addresses:
--   1. function_search_path_mutable (6 functions) + anon EXECUTE hardening
--   2. rls_disabled_in_public (amc_quotation_email_deliveries) & rls_enabled_no_policy (4 service_report_* tables)
--   3. multiple_permissive_policies (amc_plans SELECT, staff SELECT)
--   4. auth_rls_initplan (wraps auth.uid() in (SELECT auth.uid()) across public policies)
--   5. unindexed_foreign_keys (26 covering indexes)

-- =============================================================================
-- 1. Function search_path hardening
-- =============================================================================
DO $$
DECLARE
  v_fn record;
BEGIN
  FOR v_fn IN
    SELECT
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'set_updated_at',
        'get_user_role',
        'generate_next_essc_code',
        'get_next_essc_code',
        'check_technician_assignment_conflict',
        'pys_maintenance_ping'
      ])
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
      v_fn.proname,
      v_fn.args
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_user_role'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role';
  END IF;
END
$$;

-- =============================================================================
-- 2. Missing RLS policies & RLS enablement (rls_disabled_in_public / rls_enabled_no_policy)
-- =============================================================================
ALTER TABLE IF EXISTS public.amc_quotation_email_deliveries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'amc_quotation_email_deliveries',
    'service_report_email_deliveries',
    'service_report_email_delivery_attempts',
    'service_report_follow_up_scopes',
    'service_report_header_history'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_authorized', v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
        'USING (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY[''ADMIN''::text, ''STAFF''::text])) '
        'WITH CHECK (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY[''ADMIN''::text, ''STAFF''::text]))',
        v_table || '_authorized',
        v_table
      );
    END IF;
  END LOOP;
END
$$;

-- Clean up service_role policy on amc_quotation_email_deliveries if created earlier (service_role bypasses RLS)
DO $$
BEGIN
  IF to_regclass('public.amc_quotation_email_deliveries') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS amc_quotation_email_deliveries_service_role ON public.amc_quotation_email_deliveries';
    EXECUTE 'DROP POLICY IF EXISTS amc_quotation_email_deliveries_select_authorized ON public.amc_quotation_email_deliveries';
    EXECUTE 'DROP POLICY IF EXISTS amc_quotation_email_deliveries_modify_authorized ON public.amc_quotation_email_deliveries';
  END IF;
END
$$;

-- =============================================================================
-- 3. Consolidate multiple permissive SELECT policies (amc_plans, staff)
-- =============================================================================
DROP POLICY IF EXISTS amc_plans_read_all ON public.amc_plans;
DROP POLICY IF EXISTS amc_plans_select_authorized ON public.amc_plans;
CREATE POLICY amc_plans_select_authorized
  ON public.amc_plans
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS staff_manage_admin_only ON public.staff;
DROP POLICY IF EXISTS staff_insert_admin_only ON public.staff;
CREATE POLICY staff_insert_admin_only
  ON public.staff
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role((SELECT auth.uid())) = 'ADMIN'::text);

DROP POLICY IF EXISTS staff_update_admin_only ON public.staff;
CREATE POLICY staff_update_admin_only
  ON public.staff
  FOR UPDATE
  TO authenticated
  USING (public.get_user_role((SELECT auth.uid())) = 'ADMIN'::text)
  WITH CHECK (public.get_user_role((SELECT auth.uid())) = 'ADMIN'::text);

DROP POLICY IF EXISTS staff_delete_admin_only ON public.staff;
CREATE POLICY staff_delete_admin_only
  ON public.staff
  FOR DELETE
  TO authenticated
  USING (public.get_user_role((SELECT auth.uid())) = 'ADMIN'::text);

-- =============================================================================
-- 4. auth_rls_initplan remediation: wrap auth.uid() in (SELECT auth.uid())
-- =============================================================================

-- Standard 4-policy ADMIN/STAFF + ADMIN-delete tables
DO $$
DECLARE
  v_table text;
  v_insert_name text;
  v_std_tables text[] := ARRAY[
    'ac_assets',
    'amc_assets',
    'amc_contracts',
    'customer_sites',
    'customers',
    'inventory_transactions',
    'parts',
    'payment_transactions',
    'payments',
    'service_assignments',
    'service_parts',
    'service_reports',
    'service_requests',
    'service_schedules',
    'technicians'
  ];
  v_report_tables text[] := ARRAY[
    'service_report_assets',
    'service_report_items'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_std_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_select_authorized', v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
        'USING (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY[''ADMIN''::text, ''STAFF''::text]))',
        v_table || '_select_authorized',
        v_table
      );

      v_insert_name := v_table || '_modify_authorized';
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_insert_name, v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
        'WITH CHECK (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY[''ADMIN''::text, ''STAFF''::text]))',
        v_insert_name,
        v_table
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_update_authorized', v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
        'USING (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY[''ADMIN''::text, ''STAFF''::text])) '
        'WITH CHECK (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY[''ADMIN''::text, ''STAFF''::text]))',
        v_table || '_update_authorized',
        v_table
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_delete_admin_only', v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated '
        'USING (public.get_user_role((SELECT auth.uid())) = ''ADMIN''::text)',
        v_table || '_delete_admin_only',
        v_table
      );
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY v_report_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_select_authorized', v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
        'USING (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY[''ADMIN''::text, ''STAFF''::text]))',
        v_table || '_select_authorized',
        v_table
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_insert_authorized', v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
        'WITH CHECK (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY[''ADMIN''::text, ''STAFF''::text]))',
        v_table || '_insert_authorized',
        v_table
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_update_authorized', v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
        'USING (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY[''ADMIN''::text, ''STAFF''::text])) '
        'WITH CHECK (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY[''ADMIN''::text, ''STAFF''::text]))',
        v_table || '_update_authorized',
        v_table
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_delete_admin_only', v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated '
        'USING (public.get_user_role((SELECT auth.uid())) = ''ADMIN''::text)',
        v_table || '_delete_admin_only',
        v_table
      );
    END IF;
  END LOOP;
END
$$;

-- amc_plans write policies (SELECT already consolidated above)
DROP POLICY IF EXISTS amc_plans_modify_authorized ON public.amc_plans;
CREATE POLICY amc_plans_modify_authorized
  ON public.amc_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY['ADMIN'::text, 'STAFF'::text]));

DROP POLICY IF EXISTS amc_plans_update_authorized ON public.amc_plans;
CREATE POLICY amc_plans_update_authorized
  ON public.amc_plans
  FOR UPDATE
  TO authenticated
  USING (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY['ADMIN'::text, 'STAFF'::text]))
  WITH CHECK (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY['ADMIN'::text, 'STAFF'::text]));

DROP POLICY IF EXISTS amc_plans_delete_admin_only ON public.amc_plans;
CREATE POLICY amc_plans_delete_admin_only
  ON public.amc_plans
  FOR DELETE
  TO authenticated
  USING (public.get_user_role((SELECT auth.uid())) = 'ADMIN'::text);

-- AC brand/model catalog admin write policies
DO $$
DECLARE
  v_table text;
  v_catalog_tables text[] := ARRAY['ac_brands', 'ac_models', 'ac_model_variants'];
BEGIN
  FOREACH v_table IN ARRAY v_catalog_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow admin insert ' || v_table, v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
        'WITH CHECK (public.get_user_role((SELECT auth.uid())) = ''ADMIN''::text)',
        'Allow admin insert ' || v_table,
        v_table
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow admin update ' || v_table, v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
        'USING (public.get_user_role((SELECT auth.uid())) = ''ADMIN''::text) '
        'WITH CHECK (public.get_user_role((SELECT auth.uid())) = ''ADMIN''::text)',
        'Allow admin update ' || v_table,
        v_table
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow admin delete ' || v_table, v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated '
        'USING (public.get_user_role((SELECT auth.uid())) = ''ADMIN''::text)',
        'Allow admin delete ' || v_table,
        v_table
      );
    END IF;
  END LOOP;
END
$$;

-- activity_logs
DROP POLICY IF EXISTS activity_logs_select_authorized ON public.activity_logs;
CREATE POLICY activity_logs_select_authorized
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY['ADMIN'::text, 'STAFF'::text]));

DROP POLICY IF EXISTS activity_logs_insert_authorized ON public.activity_logs;
CREATE POLICY activity_logs_insert_authorized
  ON public.activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY['ADMIN'::text, 'STAFF'::text]));

-- notifications
DROP POLICY IF EXISTS notifications_select_recipient_or_admin ON public.notifications;
CREATE POLICY notifications_select_recipient_or_admin
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING ((recipient_profile_id = (SELECT auth.uid())) OR (public.get_user_role((SELECT auth.uid())) = 'ADMIN'::text));

DROP POLICY IF EXISTS notifications_insert_authorized ON public.notifications;
CREATE POLICY notifications_insert_authorized
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY['ADMIN'::text, 'STAFF'::text]));

DROP POLICY IF EXISTS notifications_update_recipient ON public.notifications;
CREATE POLICY notifications_update_recipient
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_profile_id = (SELECT auth.uid()))
  WITH CHECK (recipient_profile_id = (SELECT auth.uid()));

-- profiles
DROP POLICY IF EXISTS profiles_update_owner_or_admin ON public.profiles;
CREATE POLICY profiles_update_owner_or_admin
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((id = (SELECT auth.uid())) OR (public.get_user_role((SELECT auth.uid())) = 'ADMIN'::text));

-- =============================================================================
-- 5. Unindexed Foreign Keys (26 covering indexes)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_amc_contracts_cancelled_by ON public.amc_contracts (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_created_by ON public.amc_contracts (created_by);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_plan_id ON public.amc_contracts (plan_id);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_updated_by ON public.amc_contracts (updated_by);

CREATE INDEX IF NOT EXISTS idx_amc_quotation_email_deliveries_sent_by ON public.amc_quotation_email_deliveries (sent_by);

CREATE INDEX IF NOT EXISTS idx_customers_created_by ON public.customers (created_by);
CREATE INDEX IF NOT EXISTS idx_customers_updated_by ON public.customers (updated_by);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_recorded_by ON public.inventory_transactions (recorded_by);

CREATE INDEX IF NOT EXISTS idx_payments_service_request_id ON public.payments (service_request_id);

CREATE INDEX IF NOT EXISTS idx_service_assignments_assigned_by ON public.service_assignments (assigned_by);

CREATE INDEX IF NOT EXISTS idx_service_report_email_deliveries_requested_by ON public.service_report_email_deliveries (requested_by);

CREATE INDEX IF NOT EXISTS idx_service_report_follow_up_scopes_created_by ON public.service_report_follow_up_scopes (created_by);
CREATE INDEX IF NOT EXISTS idx_service_report_follow_up_scopes_source_item_id ON public.service_report_follow_up_scopes (source_item_id);

CREATE INDEX IF NOT EXISTS idx_service_report_header_history_actor_profile_id ON public.service_report_header_history (actor_profile_id);

CREATE INDEX IF NOT EXISTS idx_service_reports_created_by ON public.service_reports (created_by);
CREATE INDEX IF NOT EXISTS idx_service_reports_pm_obligation_id ON public.service_reports (pm_obligation_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_updated_by ON public.service_reports (updated_by);

CREATE INDEX IF NOT EXISTS idx_service_requests_cancelled_by ON public.service_requests (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_service_requests_created_by ON public.service_requests (created_by);
CREATE INDEX IF NOT EXISTS idx_service_requests_updated_by ON public.service_requests (updated_by);

CREATE INDEX IF NOT EXISTS idx_service_schedules_cancelled_by ON public.service_schedules (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_service_schedules_created_by ON public.service_schedules (created_by);
CREATE INDEX IF NOT EXISTS idx_service_schedules_rescheduled_from_id ON public.service_schedules (rescheduled_from_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_updated_by ON public.service_schedules (updated_by);

CREATE INDEX IF NOT EXISTS idx_technicians_created_by ON public.technicians (created_by);
CREATE INDEX IF NOT EXISTS idx_technicians_updated_by ON public.technicians (updated_by);

DO $$
BEGIN
  IF to_regclass('public.email_deliveries') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_email_deliveries_requested_by ON public.email_deliveries (requested_by)';
  END IF;
END
$$;

