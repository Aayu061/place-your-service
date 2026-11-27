-- ROLLBACK for S11 customer website accounts: undoes BOTH
--   supabase/migrations/20261125030000_customer_portal_auth.sql
--   supabase/migrations/20261127000000_customer_portal_hardening.sql
--
-- WHEN TO USE: only as the last step of a FULL rollback of customer accounts (release-readiness plan section 9), after
-- the PYS and ESS code has been reverted / the previous deployments promoted. For anything less, do NOT run this:
--   * one customer: switch their website account off in PYS (their sessions end at once);
--   * everyone: set PORTAL_ENABLED=false on Render (every /ess/portal route answers 503, ESS shows "coming soon").
-- Running it while the S11 code is still deployed makes every portal route fail with 500 (its tables are gone).
--
-- WHAT IT DOES: drops everything those two migrations created (3+1 tables with their indexes, columns and table
-- triggers; 6 functions; 2 triggers on public.customers), removes the 'portal:access' scope from the ESS_WEB
-- integration client, and forgets the two migration versions so they can be applied again later.
-- WHAT IT LOSES: only S11 data - which customers had website access switched on, sign-in codes, sessions, sign-in
-- locks and visitor counters. No customer, AMC, request or other existing data is touched. (Sign-in emails already
-- logged in email_deliveries with entity_type PORTAL_OTP stay; they hold no codes after F1.)
--
-- Safe to run more than once (IF EXISTS everywhere). Runs in one transaction: all or nothing.
-- Take a backup first. Run it with the same care as a live migration (owner approval).

BEGIN;

-- Triggers on the existing customers table first (they call the functions below).
DROP TRIGGER IF EXISTS trg_customer_portal_email_change ON public.customers;   -- 20261127000000 (F4)
DROP TRIGGER IF EXISTS trg_customer_portal_disable ON public.customers;        -- 20261125030000

-- Functions (20261127000000).
DROP FUNCTION IF EXISTS public.portal_claim_code_attempt(uuid, integer);
DROP FUNCTION IF EXISTS public.portal_record_wrong_code(uuid, integer, integer, integer);
DROP FUNCTION IF EXISTS public.record_portal_visitor_hit(text, integer);
DROP FUNCTION IF EXISTS public.end_portal_access_on_email_change();

-- Tables. Their indexes, the signin_locked_until column and trigger trg_portal_account_customer go with them.
DROP TABLE IF EXISTS public.customer_portal_visitor_limits;                      -- 20261127000000
DROP TABLE IF EXISTS public.customer_portal_sessions;                            -- 20261125030000
DROP TABLE IF EXISTS public.customer_login_otps;                                 -- 20261125030000
DROP TABLE IF EXISTS public.customer_portal_accounts;                            -- 20261125030000

-- Functions (20261125030000), after the triggers that used them are gone.
DROP FUNCTION IF EXISTS public.check_portal_account_customer();
DROP FUNCTION IF EXISTS public.disable_portal_on_customer_change();

-- The ESS website's key may no longer call the customer-account routes.
UPDATE public.integration_clients
   SET scopes = array_remove(scopes, 'portal:access')
 WHERE client_code = 'ESS_WEB' AND 'portal:access' = ANY (scopes);

-- Migration bookkeeping only (so server/scripts/apply-live-migrations.cjs would apply them again later).
DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('20261125030000', '20261127000000');

COMMIT;
