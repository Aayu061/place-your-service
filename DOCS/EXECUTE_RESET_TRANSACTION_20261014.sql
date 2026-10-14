-- =====================================================================================
-- PYS Production Demo Customer Reset Transaction
-- Target Project: place-your-service (jvccvdxfilzlncbgiplk)
-- Target Scope: All 9 demo customers & 102 customer-owned operational records
-- Preserved Scope: Staff (2), Profiles (2), Technicians (4), Master Data (234), Activity Logs (200), ESSC Sequence (17)
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

  SELECT count(*) INTO v_count FROM public.technicians;
  IF v_count != 4 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 4 technician rows, found %', v_count;
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

  SELECT count(*) INTO v_count FROM public.amc_plans;
  IF v_count != 4 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 4 plan rows, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.activity_logs;
  IF v_count < 200 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected at least 200 activity_logs rows, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.payments;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 payments rows, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.payment_transactions;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 0 payment_transactions rows, found %', v_count;
  END IF;

  SELECT last_value, is_called INTO v_seq_val, v_seq_called FROM public.ac_asset_code_seq;
  IF v_seq_val != 17 THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: Expected ac_asset_code_seq last_value = 17, found %', v_seq_val;
  END IF;

  -- Starting candidate counts
  SELECT count(*) INTO v_count FROM public.service_report_items;
  IF v_count != 1 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 1 service_report_items, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_report_assets;
  IF v_count != 3 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 3 service_report_assets, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_reports;
  IF v_count != 3 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 3 service_reports, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_assignments;
  IF v_count != 7 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 7 service_assignments, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_schedules;
  IF v_count != 38 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 38 service_schedules, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_requests;
  IF v_count != 2 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 2 service_requests, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.amc_assets;
  IF v_count != 10 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 10 amc_assets, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.amc_contracts;
  IF v_count != 9 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 9 amc_contracts, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.ac_assets;
  IF v_count != 10 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 10 ac_assets, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.customer_sites;
  IF v_count != 10 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 10 customer_sites, found %', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.customers;
  IF v_count != 9 THEN RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 9 customers, found %', v_count; END IF;


  -- 2. BREAK CYCLIC & SELF-REFERENCING CONSTRAINTS
  
  -- Service schedules self-references
  UPDATE public.service_schedules
  SET rescheduled_from_id = NULL, pm_obligation_id = NULL
  WHERE rescheduled_from_id IS NOT NULL OR pm_obligation_id IS NOT NULL;

  -- Service reports self & schedule references
  UPDATE public.service_reports
  SET originating_report_id = NULL,
      resolving_report_id = NULL,
      follow_up_schedule_id = NULL,
      service_schedule_id = NULL,
      pm_obligation_id = NULL
  WHERE originating_report_id IS NOT NULL 
     OR resolving_report_id IS NOT NULL 
     OR follow_up_schedule_id IS NOT NULL 
     OR service_schedule_id IS NOT NULL 
     OR pm_obligation_id IS NOT NULL;

  -- AMC contracts self-references
  UPDATE public.amc_contracts
  SET previous_contract_id = NULL
  WHERE previous_contract_id IS NOT NULL;


  -- 3. REVERSE-DEPENDENCY TARGETED DELETIONS WITH EXACT ROW-COUNT ASSERTIONS

  -- 3.1 Delete service_report_items (1 row)
  DELETE FROM public.service_report_items
  WHERE id IN (
    '9dc3c7be-b415-4428-83f7-afde841ac246'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 1 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 1 service_report_items, deleted %', v_deleted;
  END IF;

  -- 3.2 Delete service_report_assets (3 rows)
  DELETE FROM public.service_report_assets
  WHERE id IN (
    'db6a5c20-506e-4f7d-82af-5dac6555d1b8',
    '4198fb04-ee23-4077-8646-efc3be199ded',
    'd384690b-cc9e-4c68-bab2-83a6cdbcbaaf'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 3 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 3 service_report_assets, deleted %', v_deleted;
  END IF;

  -- 3.3 Delete service_reports (3 rows)
  DELETE FROM public.service_reports
  WHERE id IN (
    'b429cab4-a754-41a3-b312-611c99736940',
    'f67f8a06-c151-4ddb-8e2d-0c3e051926b6',
    '6f092e7f-4d0a-4e97-8cc4-97e94eb2771d'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 3 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 3 service_reports, deleted %', v_deleted;
  END IF;

  -- 3.4 Delete service_assignments (7 rows)
  DELETE FROM public.service_assignments
  WHERE id IN (
    '4704015b-1dfd-450d-8218-5caf378df191',
    '4c7b4121-5473-47e3-bfde-7c8751db366e',
    '5cf92ece-b83f-4a1e-84ae-21df70f72d8d',
    '74d57053-03ba-4cfe-aac3-ae6a9f4e4a11',
    '2fdc69a0-4fb0-437c-965e-9860abbb03e2',
    '95f5ac69-991b-4beb-b85d-8f4ce1f79d9e',
    '256e505f-8d4f-4c6f-95e4-d993f1575e62'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 7 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 7 service_assignments, deleted %', v_deleted;
  END IF;

  -- 3.5 Delete service_schedules (38 rows)
  DELETE FROM public.service_schedules
  WHERE id IN (
    '10f45cfa-5ea2-42c6-9941-cfea0708d205',
    '137eda90-6ef7-4e9b-9a6b-30cc4bd1288d',
    '140e108a-baf6-4309-bda2-2a3740d2a676',
    '158148a9-4c8e-4398-bedc-e75327096174',
    '1d72a21d-56f0-49ca-92a8-03eeefe422da',
    '25146e86-3295-4a3d-bc7c-d234fcf82a33',
    '2756b9cf-e171-481c-bf7a-fece454e94ad',
    '2c92485e-9b9c-45a7-9d56-84839f20442a',
    '32260980-f575-429f-9a14-abdf70fc3fd4',
    '373928c5-cdb3-4f21-a28b-0ab3e09f6af8',
    '3862cb7c-9473-428e-bbfd-ceeae4e178cd',
    '39903087-1f60-47e8-af25-36234ae07e10',
    '3e287b81-1a6b-4948-818e-20e014759aa4',
    '51fd2366-a5d7-4ba0-9e94-62cd29e6316a',
    '57e337ec-0866-409f-9312-1df494b79a9b',
    '5812ddf1-39cd-40f2-9a29-7b7778605ebc',
    '5a7068f2-8bb0-4ee8-8060-4ed376799c95',
    '5b1b2a10-7c16-4b34-90c7-1b388e667e40',
    '6011734a-e398-4736-9ca3-8fe7d8e241bd',
    '64daca99-5217-41ee-b7cb-b2cd886c6302',
    '67f0b9ff-b634-46a9-9796-84916c05d17b',
    '6a93bb51-84b1-4bb9-849f-9e3e01a87bd4',
    '7987a356-8150-4a6b-9823-2e06fa458918',
    '7d4ddefb-594b-45f9-8cdb-466c4681f8d0',
    '8d682b40-4779-4914-9b88-e4efa4c087bd',
    '96849eea-c58b-4cce-a96c-bc2571b15f0a',
    '9fd4d67e-7e08-46a0-84ce-8e4761d2d454',
    'b198d539-802c-4caa-9807-dd9d5295bff5',
    'b61b5dbc-13ae-4684-9c1c-8ced20a3350f',
    'c381ab24-1046-468c-8c61-be6e6d0551df',
    'd247f81c-e84c-4859-b48b-c9b71f34ac88',
    'd3e9f076-d57b-4d66-88d4-d3ccf1a179ae',
    'd4f2032c-1565-41e2-9648-78edb313c357',
    'e32f8821-6f9b-4a9f-85cb-b4cd77b40e32',
    'f7473aef-c696-4b08-8b6e-c5044e843027',
    'f7cecd8c-a524-401c-a559-08067c22b3e9',
    'f99739c8-bcde-4cac-a838-4829f93e59d2',
    'ff7fb041-fb0f-45c9-864a-e77eb8d87512'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 38 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 38 service_schedules, deleted %', v_deleted;
  END IF;

  -- 3.6 Delete service_requests (2 rows)
  DELETE FROM public.service_requests
  WHERE id IN (
    '83839ac0-8ac8-4163-95a0-4506ab2126e6',
    'eab112a7-07b8-405c-8920-fca2ebc05547'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 2 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 2 service_requests, deleted %', v_deleted;
  END IF;

  -- 3.7 Delete amc_assets (10 rows)
  DELETE FROM public.amc_assets
  WHERE id IN (
    '5e351889-3bea-4340-be35-2db11c0c7392',
    'faa26a30-3636-4c3d-bafd-583e7197ae4d',
    'a8982019-02ae-4099-afe9-fdb9f0e6fbf3',
    'ebb16aa3-ce94-4d30-b969-6cb9f61e1dfd',
    '7c92c6dd-490b-49c6-8ba0-d15d86dc2ec8',
    'dfd1b6c7-0676-4257-bc59-19ab397ec131',
    '6449e42a-947a-4879-add3-e0b0c3f6d78d',
    '35c2caa3-7776-4753-beee-770c428bc789',
    '2a876498-004c-45e3-8ea9-2259a988b4ca',
    '8f40ee1d-e4bc-4799-a305-9bb25bd715dd'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 10 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 10 amc_assets, deleted %', v_deleted;
  END IF;

  -- 3.8 Delete amc_contracts (9 rows)
  DELETE FROM public.amc_contracts
  WHERE id IN (
    '12d3a286-83fc-4b57-a978-6f72cea6ba57',
    'da19fea1-7383-4b5a-b446-a8480974ba5f',
    'b8f83f52-abcb-475e-80d2-d800125b45d1',
    '93d6b34f-f9b4-4d57-8898-e73f0d393e55',
    'bb8649b8-8c84-44f4-acd0-965a6afb24d1',
    '4954bcdd-c9fe-4de3-ad0f-c5e42763bc5f',
    '51ac3c46-3c90-46f7-9b19-5dce0a8a07cf',
    'b5a65fa0-77c3-4f80-8bf3-0133c6d4d4a6',
    'e294b210-1e65-49fe-ac81-c42c418e0ef9'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 9 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 9 amc_contracts, deleted %', v_deleted;
  END IF;

  -- 3.9 Delete ac_assets (10 rows)
  DELETE FROM public.ac_assets
  WHERE id IN (
    'f39eea67-342d-43ac-aaab-2f0d9b832e26',
    'b5b54cd1-b3cd-4238-a342-9b3b960d8c43',
    'fc5823a0-d5c1-4cd3-91ec-88f55527f044',
    '889e1cdd-363f-4a1e-a0f5-59c5cb4d6903',
    '6c783919-828f-428e-94d7-08fc17a07b5f',
    'fdaccc03-3ced-48ac-813d-e77a2e3df2e9',
    '4740f55c-4e98-4c8c-9915-8b598410d95a',
    '65190e50-70e1-4b80-a004-5cc7f8c480eb',
    '7deaf529-3a43-480b-b8c2-3a6bd5b75ef8',
    '59fef313-a3ad-433b-b013-285713307e5e'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 10 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 10 ac_assets, deleted %', v_deleted;
  END IF;

  -- 3.10 Delete customer_sites (10 rows)
  DELETE FROM public.customer_sites
  WHERE id IN (
    '8dd50208-0fa7-49d4-bc92-cb4244b901f6',
    'd1edfbb4-0806-482e-89f8-e5b34bb2ea9f',
    'abe24715-0b68-413c-af8c-db47461dfd22',
    'd19eed11-0a73-4446-8874-b75087ab931e',
    'd93a9de2-6c09-4655-b741-9b96604f0a22',
    '761423b7-fafd-4a9f-ad62-d37c1a8bc099',
    '6dc93141-d1e9-4459-a35a-d55cabfd7b08',
    '2dc5bc68-f995-4126-ac2f-a098fb02ea12',
    '1e904459-95f6-43e1-8d74-6bfb5d1678aa',
    'da2d8488-4a35-4b5d-87aa-a315e0c5c7dd'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 10 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 10 customer_sites, deleted %', v_deleted;
  END IF;

  -- 3.11 Delete customers (9 rows)
  DELETE FROM public.customers
  WHERE id IN (
    '513e4b83-937c-4fe2-83dc-ed0689dc0387',
    '4ea00c4e-3ba0-4d76-9743-8469ca567d37',
    '31ef07c9-dca0-4aaf-acb4-9da1c5dc170f',
    '45b51f0c-5261-4094-b256-27fdaf64b948',
    'd2030dcb-535f-4bc1-a46b-e7a6fe2eddef',
    '51134d24-79cb-41e8-8b1d-ed35d90b6795',
    '94a33f3f-67b7-40e3-9054-71f193df63c0',
    '5a3dc1c9-e4f0-481e-b6b9-efc71cf3635f',
    'dddee4a7-1b28-43d0-bd91-5398d457f4b1'
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted != 9 THEN
    RAISE EXCEPTION 'DELETION ABORTED: Expected to delete 9 customers, deleted %', v_deleted;
  END IF;


  -- 4. POST-FLIGHT ASSERTIONS (ZERO OPERATIONAL RECORDS REMAINING)

  SELECT count(*) INTO v_count FROM public.service_report_items;
  IF v_count != 0 THEN RAISE EXCEPTION 'POST-CHECK FAILED: service_report_items is not 0 (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_report_assets;
  IF v_count != 0 THEN RAISE EXCEPTION 'POST-CHECK FAILED: service_report_assets is not 0 (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_reports;
  IF v_count != 0 THEN RAISE EXCEPTION 'POST-CHECK FAILED: service_reports is not 0 (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_assignments;
  IF v_count != 0 THEN RAISE EXCEPTION 'POST-CHECK FAILED: service_assignments is not 0 (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_schedules;
  IF v_count != 0 THEN RAISE EXCEPTION 'POST-CHECK FAILED: service_schedules is not 0 (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.service_requests;
  IF v_count != 0 THEN RAISE EXCEPTION 'POST-CHECK FAILED: service_requests is not 0 (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.amc_assets;
  IF v_count != 0 THEN RAISE EXCEPTION 'POST-CHECK FAILED: amc_assets is not 0 (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.amc_contracts;
  IF v_count != 0 THEN RAISE EXCEPTION 'POST-CHECK FAILED: amc_contracts is not 0 (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.ac_assets;
  IF v_count != 0 THEN RAISE EXCEPTION 'POST-CHECK FAILED: ac_assets is not 0 (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.customer_sites;
  IF v_count != 0 THEN RAISE EXCEPTION 'POST-CHECK FAILED: customer_sites is not 0 (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.customers;
  IF v_count != 0 THEN RAISE EXCEPTION 'POST-CHECK FAILED: customers is not 0 (count: %)', v_count; END IF;


  -- 5. POST-FLIGHT PRESERVED INTEGRITY VERIFICATION

  SELECT count(*) INTO v_count FROM public.staff;
  IF v_count != 2 THEN RAISE EXCEPTION 'POST-CHECK FAILED: staff count altered (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.profiles;
  IF v_count != 2 THEN RAISE EXCEPTION 'POST-CHECK FAILED: profiles count altered (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.technicians;
  IF v_count != 4 THEN RAISE EXCEPTION 'POST-CHECK FAILED: technicians count altered (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.ac_brands;
  IF v_count != 14 THEN RAISE EXCEPTION 'POST-CHECK FAILED: ac_brands count altered (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.ac_models;
  IF v_count != 110 THEN RAISE EXCEPTION 'POST-CHECK FAILED: ac_models count altered (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.ac_model_variants;
  IF v_count != 106 THEN RAISE EXCEPTION 'POST-CHECK FAILED: ac_model_variants count altered (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.amc_plans;
  IF v_count != 4 THEN RAISE EXCEPTION 'POST-CHECK FAILED: amc_plans count altered (count: %)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.activity_logs;
  IF v_count < 200 THEN RAISE EXCEPTION 'POST-CHECK FAILED: activity_logs rows deleted (count: %)', v_count; END IF;

  SELECT last_value, is_called INTO v_seq_val, v_seq_called FROM public.ac_asset_code_seq;
  IF v_seq_val != 17 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: ac_asset_code_seq altered, current value: %', v_seq_val;
  END IF;

  RAISE NOTICE 'SUCCESS: All 9 demo customers and 102 operational records deleted atomically. All post-check assertions passed!';
END $$;
