-- S11 hardening (release-readiness review F2, F3, F4) on top of 20261125030000_customer_portal_auth.sql.
--
-- * F2 slow brute force: an account's sign-in locks for 24 hours after 10 wrong codes within 24 hours (counted across
--   all of that customer's codes). customer_portal_accounts.signin_locked_until holds the lock.
--   portal_claim_code_attempt() takes one try of the newest live code ATOMICALLY (no more parallel guesses than the
--   5-per-code limit) and refuses while the account is locked; portal_record_wrong_code() sets the lock.
-- * F3 per-visitor limit: customer_portal_visitor_limits counts code requests and wrong codes per visitor per hour.
--   The key is a SHA-256 of a hash the ESS server sends (never a raw network address).
-- * F4: changing a customer's email (case-insensitive) ends their website sessions and voids unused codes, so a code
--   sent to the old address cannot be used with the new one.
-- Everything is reachable ONLY by the PYS server (service role): RLS on, no policies for anon/authenticated.

ALTER TABLE public.customer_portal_accounts ADD COLUMN IF NOT EXISTS signin_locked_until timestamptz;

CREATE TABLE IF NOT EXISTS public.customer_portal_visitor_limits (
  key_hash          text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  hits              integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_portal_visitor_limits_updated ON public.customer_portal_visitor_limits (updated_at);

ALTER TABLE public.customer_portal_visitor_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_portal_visitor_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.customer_portal_visitor_limits TO service_role;

-- F2: take one try of the customer's newest live code. Returns no row when the account is locked, there is no live
-- code, or the code has used up its tries. The row lock makes concurrent tries count one by one.
CREATE OR REPLACE FUNCTION public.portal_claim_code_attempt(p_customer_id uuid, p_max_attempts integer)
RETURNS TABLE (otp_id uuid, code_hash text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_id   uuid;
  v_hash text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.customer_portal_accounts a
     WHERE a.customer_id = p_customer_id AND a.signin_locked_until > now()
  ) THEN
    RETURN;
  END IF;

  SELECT o.id, o.code_hash INTO v_id, v_hash
    FROM public.customer_login_otps o
   WHERE o.customer_id = p_customer_id AND o.consumed_at IS NULL AND o.expires_at > now()
   ORDER BY o.created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.customer_login_otps o SET attempts = o.attempts + 1 WHERE o.id = v_id AND o.attempts < p_max_attempts;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  otp_id := v_id;
  code_hash := v_hash;
  RETURN NEXT;
END;
$function$;

-- F2: after a wrong code. Wrong codes = tries on codes created in the window, minus the one right try of each used
-- code. Locks the account when they reach p_max_wrong; returns true only for the call that set the lock.
CREATE OR REPLACE FUNCTION public.portal_record_wrong_code(
  p_customer_id uuid, p_max_wrong integer, p_window_hours integer, p_lock_hours integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_wrong integer;
BEGIN
  PERFORM 1 FROM public.customer_portal_accounts WHERE customer_id = p_customer_id FOR UPDATE;

  SELECT COALESCE(SUM(GREATEST(o.attempts - CASE WHEN o.consumed_at IS NOT NULL THEN 1 ELSE 0 END, 0)), 0)
    INTO v_wrong
    FROM public.customer_login_otps o
   WHERE o.customer_id = p_customer_id AND o.created_at > now() - make_interval(hours => p_window_hours);
  IF v_wrong < p_max_wrong THEN
    RETURN false;
  END IF;

  UPDATE public.customer_portal_accounts
     SET signin_locked_until = now() + make_interval(hours => p_lock_hours)
   WHERE customer_id = p_customer_id AND (signin_locked_until IS NULL OR signin_locked_until <= now());
  RETURN FOUND;
END;
$function$;

-- F3: count one hit for a visitor key in a fixed window that starts at its first hit; returns the hits in the
-- current window (the caller compares with its limit). Rows idle for 2 days are tidied away.
CREATE OR REPLACE FUNCTION public.record_portal_visitor_hit(p_key_hash text, p_window_minutes integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO public.customer_portal_visitor_limits AS t (key_hash, hits, window_started_at, updated_at)
  VALUES (p_key_hash, 1, now(), now())
  ON CONFLICT (key_hash) DO UPDATE
    SET hits = CASE WHEN t.window_started_at <= now() - make_interval(mins => p_window_minutes) THEN 1 ELSE t.hits + 1 END,
        window_started_at = CASE WHEN t.window_started_at <= now() - make_interval(mins => p_window_minutes)
                                 THEN now() ELSE t.window_started_at END,
        updated_at = now()
  RETURNING t.hits INTO v_hits;

  DELETE FROM public.customer_portal_visitor_limits WHERE updated_at < now() - interval '2 days';
  RETURN v_hits;
END;
$function$;

-- F4: a changed email (ignoring letter case) ends the customer's sessions and voids their unused codes.
CREATE OR REPLACE FUNCTION public.end_portal_access_on_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF lower(COALESCE(NEW.email, '')) IS DISTINCT FROM lower(COALESCE(OLD.email, '')) THEN
    UPDATE public.customer_portal_sessions
       SET revoked_at = now()
     WHERE customer_id = NEW.id AND revoked_at IS NULL;
    UPDATE public.customer_login_otps
       SET expires_at = now()
     WHERE customer_id = NEW.id AND consumed_at IS NULL AND expires_at > now();
  END IF;
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS trg_customer_portal_email_change ON public.customers;
CREATE TRIGGER trg_customer_portal_email_change AFTER UPDATE OF email ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.end_portal_access_on_email_change();

REVOKE ALL ON FUNCTION public.portal_claim_code_attempt(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_record_wrong_code(uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_portal_visitor_hit(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.end_portal_access_on_email_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_claim_code_attempt(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_record_wrong_code(uuid, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_portal_visitor_hit(text, integer) TO service_role;
