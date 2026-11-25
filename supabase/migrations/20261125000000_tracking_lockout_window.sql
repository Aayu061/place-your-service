-- S09: tracking lockout counts only RECENT misses.
--
-- Before: a counter (per tracking code and per visitor network address) only ever went up until it reached the limit,
-- then locked /track for 30 minutes. Many customers share one address (mobile networks, office Wi-Fi), so their
-- occasional typos added up over days and eventually locked everyone on that address out.
-- Now: a miss more than 60 minutes after the previous one starts a fresh count. Guessing quickly (the attack the lock
-- is for) still locks after the same number of misses.
CREATE OR REPLACE FUNCTION public.record_tracking_failure(p_key_hash text, p_max integer, p_lock_minutes integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.tracking_lookup_failures%ROWTYPE;
BEGIN
  INSERT INTO public.tracking_lookup_failures AS t (key_hash, failures, updated_at)
  VALUES (p_key_hash, 1, now())
  ON CONFLICT (key_hash) DO UPDATE
    SET failures = CASE
          WHEN t.locked_until IS NOT NULL AND t.locked_until < now() THEN 1          -- a lock has run out
          WHEN t.locked_until IS NULL AND t.updated_at < now() - interval '60 minutes' THEN 1 -- old misses expire
          ELSE t.failures + 1
        END,
        locked_until = CASE WHEN t.locked_until IS NOT NULL AND t.locked_until < now() THEN NULL ELSE t.locked_until END,
        updated_at = now()
  RETURNING * INTO v_row;
  IF v_row.failures >= p_max AND v_row.locked_until IS NULL THEN
    UPDATE public.tracking_lookup_failures
       SET locked_until = now() + make_interval(mins => p_lock_minutes)
     WHERE key_hash = p_key_hash
    RETURNING locked_until INTO v_row.locked_until;
  END IF;
  RETURN v_row.locked_until;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_tracking_failure(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tracking_failure(text, integer, integer) TO service_role;
