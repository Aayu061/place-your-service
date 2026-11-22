-- ESS "Services shown": save what the website shows in ONE transaction (all or nothing).
-- Called by the PYS API (service role) from PATCH /api/v1/ess/admin/catalog-display.
-- * p_items: JSON array (max 200) of {"type":"SERVICE"|"AMC","code":"...","isPublic"?:bool,"displayOrder"?:int}
-- * SERVICE rows match service_catalog_items.code; AMC rows match amc_plans.public_code OR plan_code.
-- * Only is_public / display_order change; an item with neither is skipped. Items apply in array order.
-- * A code that matches no row raises P0002 "Service <code> not found" / "AMC plan <code> not found";
--   any error undoes every change of the call, including the catalog_meta version bumps made by
--   the existing statement triggers (and the ESS revalidate event they queue).
-- * Plain parameters only, no dynamic SQL; runs with the caller's rights; only service_role may execute.
--
-- Concurrency (owner condition C2): plain UPDATEs hold row locks until commit, so two saves touching
-- the same row run one after the other and the later one writes all of its values (never a mix).
-- Because every catalogue UPDATE also updates the one catalog_meta row (trigger bump_catalog_version),
-- updating rows one by one could deadlock two overlapping saves (each holding a row the other needs
-- while waiting for catalog_meta). To avoid that, the function first locks all its target rows in a
-- fixed order (services by id, then AMC plans by id) and only then catalog_meta - the same
-- "rows first, catalog_meta last" order a single-row edit in the PYS catalogue editor uses.
-- The pre-locks are FOR NO KEY UPDATE (the same lock the UPDATEs take, as only non-key columns
-- change): saves still queue behind each other, but new bookings inserting into service_requests
-- (catalog_service_code FK) or amc_contracts (plan_id FK) are not blocked (their KEY SHARE locks
-- do not conflict with NO KEY UPDATE).
--
-- Adds one function only: no table, column, data or trigger changes.

CREATE OR REPLACE FUNCTION public.ess_update_catalog_display(p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item  jsonb;
  v_type  text;
  v_code  text;
  v_count integer;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'At most 200 items per save' USING ERRCODE = '22023';
  END IF;

  -- Lock order: target rows (fixed order) first, catalog_meta last. See "Concurrency" above.
  PERFORM 1
     FROM public.service_catalog_items s
    WHERE s.code IN (SELECT e->>'code' FROM jsonb_array_elements(p_items) e WHERE e->>'type' = 'SERVICE')
    ORDER BY s.id
      FOR NO KEY UPDATE;
  PERFORM 1
     FROM public.amc_plans a
    WHERE a.public_code IN (SELECT e->>'code' FROM jsonb_array_elements(p_items) e WHERE e->>'type' = 'AMC')
       OR a.plan_code   IN (SELECT e->>'code' FROM jsonb_array_elements(p_items) e WHERE e->>'type' = 'AMC')
    ORDER BY a.id
      FOR NO KEY UPDATE;
  PERFORM 1 FROM public.catalog_meta m WHERE m.id FOR NO KEY UPDATE;

  FOR v_item IN SELECT e.value FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(value, n) ORDER BY e.n
  LOOP
    v_type := v_item->>'type';
    v_code := v_item->>'code';
    IF v_type IS NULL OR v_type NOT IN ('SERVICE', 'AMC') OR v_code IS NULL THEN
      RAISE EXCEPTION 'Each item needs type SERVICE or AMC and a code' USING ERRCODE = '22023';
    END IF;
    CONTINUE WHEN NOT (v_item ? 'isPublic' OR v_item ? 'displayOrder');

    IF v_type = 'SERVICE' THEN
      UPDATE public.service_catalog_items
         SET is_public     = COALESCE((v_item->>'isPublic')::boolean, is_public),
             display_order = COALESCE((v_item->>'displayOrder')::integer, display_order)
       WHERE code = v_code;
    ELSE
      UPDATE public.amc_plans
         SET is_public     = COALESCE((v_item->>'isPublic')::boolean, is_public),
             display_order = COALESCE((v_item->>'displayOrder')::integer, display_order)
       WHERE public_code = v_code OR plan_code = v_code;
    END IF;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = format('%s %s not found', CASE WHEN v_type = 'SERVICE' THEN 'Service' ELSE 'AMC plan' END, v_code);
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.ess_update_catalog_display(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ess_update_catalog_display(jsonb) TO service_role;
