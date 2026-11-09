-- Reassert service report child-table policies for databases where the
-- original migration was already recorded as applied before its format call
-- was corrected. This is safe to rerun and keeps the policy names stable.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['service_report_assets', 'service_report_items'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_authorized', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (get_user_role(auth.uid()) IN (''ADMIN'', ''STAFF''))',
      tbl || '_select_authorized', tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert_authorized', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (get_user_role(auth.uid()) IN (''ADMIN'', ''STAFF''))',
      tbl || '_insert_authorized', tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update_authorized', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (get_user_role(auth.uid()) IN (''ADMIN'', ''STAFF'')) WITH CHECK (get_user_role(auth.uid()) IN (''ADMIN'', ''STAFF''))',
      tbl || '_update_authorized', tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete_admin_only', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (get_user_role(auth.uid()) = ''ADMIN'')',
      tbl || '_delete_admin_only', tbl
    );
  END LOOP;
END $$;
