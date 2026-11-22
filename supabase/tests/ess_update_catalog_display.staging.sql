-- STAGING ONLY (eqhnaarawjbnjikajfpz). Never run on live.
-- Checks public.ess_update_catalog_display (migration 20261121000000_ess_catalog_display_atomic.sql)
-- after the migration has been applied to staging. Run as the `postgres` role.
--
-- Leaves no changes: every test runs inside its own BEGIN ... EXCEPTION block that always ends with
-- a forced error, so Postgres rolls that test's changes back (rows, version bumps, queued events,
-- SET ROLE). The whole run is also wrapped in BEGIN ... ROLLBACK. The last result row re-checks that
-- the catalogue and catalog_meta.version are exactly as they were at the start.
--
-- Output: one row per check (n, test, result PASS / FAIL / SKIP, detail). Every row should be PASS
-- (SKIP only if staging has no suitable AMC plan for that check).
--
-- How to run:
--   psql:  psql "<staging connection string>" -f supabase/tests/ess_update_catalog_display.staging.sql
--   Supabase SQL editor / MCP execute_sql (they show only the LAST statement's result): delete the
--   first "BEGIN;" and the last "ROLLBACK;" lines, then run. Still safe: each test undoes itself and
--   the helper is a temporary function that disappears when the session ends.
-- Concurrency (owner condition C2) is tested separately, not here.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ess_cd_staging_tests()
RETURNS TABLE (n integer, test text, result text, detail text)
LANGUAGE plpgsql
AS $tests$
DECLARE
  c_undo   constant text := 'ess_cd_test_undo';
  v_start_version bigint;
  v_start_sum     text;
  v_version  bigint;
  v_sum      text;
  v_err      text;
  v_ok       boolean;
  v_detail   text;
  v_svc      record;
  v_svc_after record;
  v_plan     record;
  v_plan_after record;
  v_bogus    text := 'ZZ-NO-SUCH-' || upper(substr(md5(random()::text), 1, 8));
  v_role     text;
BEGIN
  SELECT version INTO v_start_version FROM public.catalog_meta WHERE id;
  SELECT md5(coalesce((SELECT string_agg(s.code || ':' || s.is_public || ':' || s.display_order, ',' ORDER BY s.code)
                         FROM public.service_catalog_items s), '') || '|' ||
             coalesce((SELECT string_agg(a.id::text || ':' || a.is_public || ':' || a.display_order, ',' ORDER BY a.id)
                         FROM public.amc_plans a), ''))
    INTO v_start_sum;

  SELECT s.code, s.is_public, s.display_order INTO v_svc
    FROM public.service_catalog_items s ORDER BY s.is_public DESC, s.display_order, s.code LIMIT 1;
  IF v_svc.code IS NULL THEN
    RAISE EXCEPTION 'staging has no service_catalog_items rows - cannot run the checks';
  END IF;

  -- 1. Function settings -------------------------------------------------------------------
  SELECT NOT p.prosecdef AND p.proconfig::text LIKE '%search_path=public, pg_temp%'
              AND pg_get_function_result(p.oid) = 'void',
         'security definer=' || p.prosecdef || ', config=' || coalesce(p.proconfig::text, 'none')
    INTO v_ok, v_detail
    FROM pg_proc p
   WHERE p.oid = 'public.ess_update_catalog_display(jsonb)'::regprocedure;
  n := 1; test := 'runs with caller rights, pinned search_path, returns void';
  result := CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END; detail := v_detail; RETURN NEXT;

  -- 2. Valid service save changes both fields and bumps the version --------------------------
  v_err := NULL;
  BEGIN
    PERFORM public.ess_update_catalog_display(jsonb_build_array(jsonb_build_object(
      'type', 'SERVICE', 'code', v_svc.code, 'isPublic', NOT v_svc.is_public, 'displayOrder', v_svc.display_order + 7)));
    SELECT s.is_public, s.display_order INTO v_svc_after FROM public.service_catalog_items s WHERE s.code = v_svc.code;
    SELECT version INTO v_version FROM public.catalog_meta WHERE id;
    v_ok := v_svc_after.is_public = NOT v_svc.is_public
        AND v_svc_after.display_order = v_svc.display_order + 7
        AND v_version > v_start_version;
    v_detail := format('code %s: is_public %s->%s, display_order %s->%s, version %s->%s',
      v_svc.code, v_svc.is_public, v_svc_after.is_public, v_svc.display_order, v_svc_after.display_order,
      v_start_version, v_version);
    RAISE EXCEPTION '%', c_undo;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> c_undo THEN v_ok := false; v_detail := 'unexpected error ' || SQLSTATE || ': ' || SQLERRM; END IF;
  END;
  n := 2; test := 'valid save changes the row and bumps catalog_meta.version';
  result := CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END; detail := v_detail; RETURN NEXT;

  -- 3. One valid + one unknown AMC code: P0002, nothing changed (row and version) -------------
  BEGIN
    v_err := NULL;
    BEGIN
      PERFORM public.ess_update_catalog_display(jsonb_build_array(
        jsonb_build_object('type', 'SERVICE', 'code', v_svc.code, 'isPublic', NOT v_svc.is_public),
        jsonb_build_object('type', 'AMC', 'code', v_bogus, 'displayOrder', 1)));
      v_err := 'no error';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLSTATE || ': ' || SQLERRM;
    END;
    SELECT s.is_public, s.display_order INTO v_svc_after FROM public.service_catalog_items s WHERE s.code = v_svc.code;
    SELECT version INTO v_version FROM public.catalog_meta WHERE id;
    v_ok := v_err = 'P0002: AMC plan ' || v_bogus || ' not found'
        AND v_svc_after.is_public = v_svc.is_public
        AND v_version = v_start_version;
    v_detail := format('error [%s]; %s is_public still %s; version %s->%s',
      v_err, v_svc.code, v_svc_after.is_public, v_start_version, v_version);
    RAISE EXCEPTION '%', c_undo;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> c_undo THEN v_ok := false; v_detail := 'unexpected error ' || SQLSTATE || ': ' || SQLERRM; END IF;
  END;
  n := 3; test := 'valid + unknown AMC code -> "AMC plan <code> not found", nothing changed';
  result := CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END; detail := v_detail; RETURN NEXT;

  -- 4. Unknown service code after a valid one: "Service <code> not found", nothing changed ----
  BEGIN
    BEGIN
      PERFORM public.ess_update_catalog_display(jsonb_build_array(
        jsonb_build_object('type', 'SERVICE', 'code', v_svc.code, 'displayOrder', v_svc.display_order + 1),
        jsonb_build_object('type', 'SERVICE', 'code', v_bogus, 'isPublic', false)));
      v_err := 'no error';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLSTATE || ': ' || SQLERRM;
    END;
    SELECT s.is_public, s.display_order INTO v_svc_after FROM public.service_catalog_items s WHERE s.code = v_svc.code;
    SELECT version INTO v_version FROM public.catalog_meta WHERE id;
    v_ok := v_err = 'P0002: Service ' || v_bogus || ' not found'
        AND v_svc_after.display_order = v_svc.display_order
        AND v_version = v_start_version;
    v_detail := format('error [%s]; %s display_order still %s; version %s->%s',
      v_err, v_svc.code, v_svc_after.display_order, v_start_version, v_version);
    RAISE EXCEPTION '%', c_undo;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> c_undo THEN v_ok := false; v_detail := 'unexpected error ' || SQLSTATE || ': ' || SQLERRM; END IF;
  END;
  n := 4; test := 'valid + unknown service code -> "Service <code> not found", nothing changed';
  result := CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END; detail := v_detail; RETURN NEXT;

  -- 5. AMC plan matched by public_code ----------------------------------------------------------
  SELECT a.id, a.public_code, a.plan_code, a.is_public, a.display_order INTO v_plan
    FROM public.amc_plans a WHERE a.public_code IS NOT NULL
   ORDER BY (a.public_code IS DISTINCT FROM a.plan_code) DESC, a.display_order, a.id LIMIT 1;
  n := 5; test := 'AMC plan matched by public_code';
  IF v_plan.id IS NULL THEN
    result := 'SKIP'; detail := 'no AMC plan with a public_code on staging'; RETURN NEXT;
  ELSE
    BEGIN
      PERFORM public.ess_update_catalog_display(jsonb_build_array(jsonb_build_object(
        'type', 'AMC', 'code', v_plan.public_code, 'displayOrder', v_plan.display_order + 3)));
      SELECT a.is_public, a.display_order INTO v_plan_after FROM public.amc_plans a WHERE a.id = v_plan.id;
      v_ok := v_plan_after.display_order = v_plan.display_order + 3 AND v_plan_after.is_public = v_plan.is_public;
      v_detail := format('public_code %s (plan_code %s): display_order %s->%s, is_public unchanged %s',
        v_plan.public_code, v_plan.plan_code, v_plan.display_order, v_plan_after.display_order, v_plan_after.is_public);
      RAISE EXCEPTION '%', c_undo;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> c_undo THEN v_ok := false; v_detail := 'unexpected error ' || SQLSTATE || ': ' || SQLERRM; END IF;
    END;
    result := CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END; detail := v_detail; RETURN NEXT;
  END IF;

  -- 6. AMC plan matched by plan_code ------------------------------------------------------------
  v_plan := NULL;
  SELECT a.id, a.public_code, a.plan_code, a.is_public, a.display_order INTO v_plan
    FROM public.amc_plans a WHERE a.plan_code IS NOT NULL
   ORDER BY (a.public_code IS DISTINCT FROM a.plan_code) DESC, a.display_order, a.id LIMIT 1;
  n := 6; test := 'AMC plan matched by plan_code';
  IF v_plan.id IS NULL THEN
    result := 'SKIP'; detail := 'no AMC plans on staging'; RETURN NEXT;
  ELSE
    BEGIN
      PERFORM public.ess_update_catalog_display(jsonb_build_array(jsonb_build_object(
        'type', 'AMC', 'code', v_plan.plan_code, 'isPublic', NOT v_plan.is_public)));
      SELECT a.is_public, a.display_order INTO v_plan_after FROM public.amc_plans a WHERE a.id = v_plan.id;
      v_ok := v_plan_after.is_public = NOT v_plan.is_public AND v_plan_after.display_order = v_plan.display_order;
      v_detail := format('plan_code %s (public_code %s): is_public %s->%s, display_order unchanged %s',
        v_plan.plan_code, coalesce(v_plan.public_code, 'none'), v_plan.is_public, v_plan_after.is_public,
        v_plan_after.display_order);
      RAISE EXCEPTION '%', c_undo;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> c_undo THEN v_ok := false; v_detail := 'unexpected error ' || SQLSTATE || ': ' || SQLERRM; END IF;
    END;
    result := CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END; detail := v_detail; RETURN NEXT;
  END IF;

  -- 7. Empty list (and an item with nothing to change) does nothing -----------------------------
  BEGIN
    PERFORM public.ess_update_catalog_display('[]'::jsonb);
    PERFORM public.ess_update_catalog_display(jsonb_build_array(jsonb_build_object('type', 'SERVICE', 'code', v_bogus)));
    SELECT version INTO v_version FROM public.catalog_meta WHERE id;
    v_ok := v_version = v_start_version;
    v_detail := format('no error; version %s->%s', v_start_version, v_version);
    RAISE EXCEPTION '%', c_undo;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> c_undo THEN v_ok := false; v_detail := 'unexpected error ' || SQLSTATE || ': ' || SQLERRM; END IF;
  END;
  n := 7; test := 'empty list / item with nothing to change -> no error, nothing changed';
  result := CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END; detail := v_detail; RETURN NEXT;

  -- 8. More than 200 items is refused ------------------------------------------------------------
  BEGIN
    BEGIN
      PERFORM public.ess_update_catalog_display(
        (SELECT jsonb_agg(jsonb_build_object('type', 'SERVICE', 'code', v_svc.code, 'displayOrder', g))
           FROM generate_series(1, 201) g));
      v_err := 'no error';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLSTATE;
    END;
    SELECT version INTO v_version FROM public.catalog_meta WHERE id;
    v_ok := v_err = '22023' AND v_version = v_start_version;
    v_detail := format('error %s; version %s->%s', v_err, v_start_version, v_version);
    RAISE EXCEPTION '%', c_undo;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> c_undo THEN v_ok := false; v_detail := 'unexpected error ' || SQLSTATE || ': ' || SQLERRM; END IF;
  END;
  n := 8; test := 'more than 200 items -> refused (22023), nothing changed';
  result := CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END; detail := v_detail; RETURN NEXT;

  -- 9-10. anon and authenticated cannot execute (owner condition C1) -----------------------------
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    v_err := NULL;
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', v_role);
      BEGIN
        PERFORM public.ess_update_catalog_display('[]'::jsonb);
        v_err := 'no error (function ran!)';
      EXCEPTION WHEN OTHERS THEN
        v_err := SQLSTATE || ': ' || SQLERRM;
      END;
      v_detail := format('as %s (current_user=%s): %s', v_role, current_user, v_err);
      v_ok := v_err LIKE '42501: permission denied for function ess_update_catalog_display%';
      RAISE EXCEPTION '%', c_undo;  -- also undoes SET LOCAL ROLE
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> c_undo THEN v_ok := false; v_detail := 'unexpected error ' || SQLSTATE || ': ' || SQLERRM; END IF;
    END;
    n := CASE v_role WHEN 'anon' THEN 9 ELSE 10 END;
    test := v_role || ' gets permission denied';
    result := CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END; detail := v_detail; RETURN NEXT;
  END LOOP;

  -- 11. Grants: only service_role (and the owner) may execute; PUBLIC has no EXECUTE ----------------
  SELECT NOT has_function_privilege('anon', 'public.ess_update_catalog_display(jsonb)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.ess_update_catalog_display(jsonb)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.ess_update_catalog_display(jsonb)', 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x
                      WHERE p.oid = 'public.ess_update_catalog_display(jsonb)'::regprocedure
                        AND x.grantee = 0 AND x.privilege_type = 'EXECUTE'),
         (SELECT coalesce(p.proacl::text, 'default (PUBLIC can execute!)') FROM pg_proc p
           WHERE p.oid = 'public.ess_update_catalog_display(jsonb)'::regprocedure)
    INTO v_ok, v_detail;
  n := 11; test := 'grants: anon/authenticated/PUBLIC no EXECUTE, service_role EXECUTE';
  result := CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END; detail := v_detail; RETURN NEXT;

  -- 12. service_role can execute a real save ----------------------------------------------------
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.ess_update_catalog_display(jsonb_build_array(jsonb_build_object(
      'type', 'SERVICE', 'code', v_svc.code, 'displayOrder', v_svc.display_order + 11)));
    SELECT s.display_order INTO v_svc_after FROM public.service_catalog_items s WHERE s.code = v_svc.code;
    v_ok := v_svc_after.display_order = v_svc.display_order + 11;
    v_detail := format('as %s: %s display_order %s->%s', current_user, v_svc.code, v_svc.display_order, v_svc_after.display_order);
    RAISE EXCEPTION '%', c_undo;  -- also undoes SET LOCAL ROLE
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> c_undo THEN v_ok := false; v_detail := 'unexpected error ' || SQLSTATE || ': ' || SQLERRM; END IF;
  END;
  n := 12; test := 'service_role can execute and save';
  result := CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END; detail := v_detail; RETURN NEXT;

  -- 13. Nothing left changed by this script -------------------------------------------------------
  SELECT version INTO v_version FROM public.catalog_meta WHERE id;
  SELECT md5(coalesce((SELECT string_agg(s.code || ':' || s.is_public || ':' || s.display_order, ',' ORDER BY s.code)
                         FROM public.service_catalog_items s), '') || '|' ||
             coalesce((SELECT string_agg(a.id::text || ':' || a.is_public || ':' || a.display_order, ',' ORDER BY a.id)
                         FROM public.amc_plans a), ''))
    INTO v_sum;
  n := 13; test := 'catalogue and version exactly as at the start';
  result := CASE WHEN v_sum = v_start_sum AND v_version = v_start_version AND current_user = session_user
                 THEN 'PASS' ELSE 'FAIL' END;
  detail := format('version %s->%s, rows %s, role %s', v_start_version, v_version,
                   CASE WHEN v_sum = v_start_sum THEN 'unchanged' ELSE 'CHANGED' END, current_user);
  RETURN NEXT;
END;
$tests$;

SELECT * FROM pg_temp.ess_cd_staging_tests() ORDER BY n;

ROLLBACK;
