-- S11 (master plan M6): customer accounts on the ESS website, signed in with a one-time email code.
--
-- * customer_portal_accounts: which customers may sign in. Only ACTIVE PERMANENT customers, switched on by PYS staff;
--   switching the customer off, downgrading or deactivating them turns access off automatically.
-- * customer_login_otps: one-time 6-digit codes, stored only as an HMAC (keyed hash), 10 minutes, 5 tries.
-- * customer_portal_sessions: signed-in sessions, stored only as a SHA-256 hash of the token; 30 days at most,
--   7 days without use, revocable.
-- All three are reachable ONLY by the PYS server (service role): RLS on, no policies for anon/authenticated.

CREATE TABLE IF NOT EXISTS public.customer_portal_accounts (
  customer_id  uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  enabled      boolean NOT NULL DEFAULT true,
  enabled_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  enabled_at   timestamptz NOT NULL DEFAULT now(),
  disabled_at  timestamptz,
  last_login_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_login_otps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  code_hash    text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at   timestamptz NOT NULL,
  attempts     integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_login_otps_customer_created ON public.customer_login_otps (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_portal_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS customer_portal_sessions_customer ON public.customer_portal_sessions (customer_id);

ALTER TABLE public.customer_portal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_login_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_portal_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_portal_accounts, public.customer_login_otps, public.customer_portal_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.customer_portal_accounts, public.customer_login_otps, public.customer_portal_sessions TO service_role;

-- Only active PERMANENT customers can have access switched on.
CREATE OR REPLACE FUNCTION public.check_portal_account_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.enabled AND NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = NEW.customer_id AND c.customer_type = 'PERMANENT' AND c.is_active
  ) THEN
    RAISE EXCEPTION 'Website access is only for active permanent customers' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_portal_account_customer ON public.customer_portal_accounts;
CREATE TRIGGER trg_portal_account_customer BEFORE INSERT OR UPDATE ON public.customer_portal_accounts
  FOR EACH ROW EXECUTE FUNCTION public.check_portal_account_customer();

-- Downgrading or deactivating a customer switches website access off and ends their sessions.
CREATE OR REPLACE FUNCTION public.disable_portal_on_customer_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.customer_type <> 'PERMANENT' OR NOT NEW.is_active THEN
    UPDATE public.customer_portal_accounts
       SET enabled = false, disabled_at = now()
     WHERE customer_id = NEW.id AND enabled;
    UPDATE public.customer_portal_sessions
       SET revoked_at = now()
     WHERE customer_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS trg_customer_portal_disable ON public.customers;
CREATE TRIGGER trg_customer_portal_disable AFTER UPDATE OF customer_type, is_active ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.disable_portal_on_customer_change();

REVOKE ALL ON FUNCTION public.check_portal_account_customer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disable_portal_on_customer_change() FROM PUBLIC, anon, authenticated;

-- The ESS website's key may call the customer-account routes.
UPDATE public.integration_clients
   SET scopes = array_append(scopes, 'portal:access')
 WHERE client_code = 'ESS_WEB' AND NOT ('portal:access' = ANY (scopes));
