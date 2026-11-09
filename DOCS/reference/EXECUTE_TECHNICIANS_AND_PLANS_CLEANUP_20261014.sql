-- =====================================================================================
-- PYS Production Test-Data Cleanup: Technicians (4) & AMC Plans (4)
-- Target Project: place-your-service (jvccvdxfilzlncbgiplk)
-- Target Scope: All 4 demo technicians & all 4 demo AMC plans (8 rows total)
-- Preserved Scope: Staff (2), Profiles (2), Master AC Equipment (230), Logs (>=200), Sequence (17)
-- =====================================================================================

DO $$
DECLARE
  v_count integer;
  v_deleted integer;
  v_seq_val bigint;
  v_seq_called boolean;
BEGIN
  -- 1. PRE-FLIGHT IDENTITY & PRESERVATION CHECKS
  
  -- Target database check
  IF current_database() != 'postgres' THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Unexpected database %', current_database();
  END IF;

  -- Preserved master tables
  SELECT count(*) INTO v_count FROM public.staff;
  IF v_count != 2 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 2 staff rows, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.profiles;
  IF v_count != 2 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 2 profile rows, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.ac_brands;
  IF v_count != 14 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 14 brand rows, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.ac_models;
  IF v_count != 110 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 110 model rows, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.ac_model_variants;
  IF v_count != 106 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 106 variant rows, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.activity_logs;
  IF v_count < 200 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected at least 200 activity_logs rows, found %', v_count;
  END IF;

  -- Sequence check
  SELECT last_value, is_called INTO v_seq_val, v_seq_called FROM public.ac_asset_code_seq;
  IF v_seq_val != 17 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected ac_asset_code_seq last_value = 17, found %', v_seq_val;
  END IF;

  -- Verify operational tables are already clean (0 rows)
  SELECT count(*) INTO v_count FROM public.customers;
  IF v_count != 0 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 customers, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.customer_sites;
  IF v_count != 0 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 customer_sites, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.ac_assets;
  IF v_count != 0 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 ac_assets, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.amc_contracts;
  IF v_count != 0 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 amc_contracts, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.amc_assets;
  IF v_count != 0 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 amc_assets, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_schedules;
  IF v_count != 0 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 service_schedules, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_requests;
  IF v_count != 0 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 service_requests, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_assignments;
  IF v_count != 0 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 service_assignments, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_reports;
  IF v_count != 0 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 service_reports, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_report_assets;
  IF v_count != 0 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 service_report_assets, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_report_items;
  IF v_count != 0 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 service_report_items, found %', v_count; END IF;

  -- Verify target starting counts
  SELECT count(*) INTO v_count FROM public.technicians;
  IF v_count != 4 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 4 technicians, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.amc_plans;
  IF v_count != 4 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 4 amc_plans, found %', v_count;
  END IF;


  -- 2. TARGETED EXACT-ID DELETIONS WITH ROW-COUNT ASSERTIONS

  -- 2.1 Delete 4 technicians
  DELETE FROM public.technicians
  WHERE id IN (
    'd6b28759-53a4-4db6-8167-11814555d37c', -- TECH-0001 (Santosh Bhardwaj)
    'e709ffad-30cc-4fb9-852b-e4ccaf851ed4', -- TECH-0002 (Deepak Panchal)
    '153a2ec8-3013-4d65-b89d-4ceecb230143', -- TECH-0003 (Mohammad)
    '08f24748-db38-47f5-a286-ec176beb35cf'  -- TECH-0004 (Hafeez Chudhry)
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 4 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 4 technicians, deleted %', v_deleted;
  END IF;

  -- 2.2 Delete 4 AMC plans
  DELETE FROM public.amc_plans
  WHERE id IN (
    '39800239-b2c6-440b-b62b-d560bd3c7276', -- PLAN-SEMI-ANNUAL (Semi-Annual AMC)
    'c967211c-b002-40cf-a1f7-d28db8da098d', -- PLAN-BASIC (Basic AMC)
    'f93b7702-bad8-401d-84a1-a3e8c602a9d9', -- PLAN-ANNUAL (Annual Maintenance)
    'fd697154-ecf9-41c8-aee9-8f580b53dabf'  -- PLAN-COMPREHENSIVE (Comprehensive AMC)
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 4 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 4 amc_plans, deleted %', v_deleted;
  END IF;


  -- 3. POST-FLIGHT ASSERTIONS (ZERO TECHNICIANS AND ZERO AMC PLANS)

  SELECT count(*) INTO v_count FROM public.technicians;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: technicians count is not 0 (count: %)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.amc_plans;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: amc_plans count is not 0 (count: %)', v_count;
  END IF;


  -- 4. POST-FLIGHT PRESERVED INTEGRITY VERIFICATION

  SELECT count(*) INTO v_count FROM public.staff;
  IF v_count != 2 THEN RAISE EXCEPTION 'POST-CHECK FAILED: staff count altered (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.profiles;
  IF v_count != 2 THEN RAISE EXCEPTION 'POST-CHECK FAILED: profiles count altered (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.ac_brands;
  IF v_count != 14 THEN RAISE EXCEPTION 'POST-CHECK FAILED: ac_brands count altered (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.ac_models;
  IF v_count != 110 THEN RAISE EXCEPTION 'POST-CHECK FAILED: ac_models count altered (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.ac_model_variants;
  IF v_count != 106 THEN RAISE EXCEPTION 'POST-CHECK FAILED: ac_model_variants count altered (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.activity_logs;
  IF v_count < 200 THEN RAISE EXCEPTION 'POST-CHECK FAILED: activity_logs rows deleted (count: %)', v_count; END IF;

  SELECT last_value, is_called INTO v_seq_val, v_seq_called FROM public.ac_asset_code_seq;
  IF v_seq_val != 17 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: ac_asset_code_seq altered, current value: %', v_seq_val;
  END IF;

  RAISE NOTICE 'SUCCESS: All 4 demo technicians and all 4 demo AMC plans deleted atomically. All post-check assertions passed!';
END $$;
