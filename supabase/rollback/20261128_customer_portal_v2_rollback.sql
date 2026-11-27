-- ROLLBACK for S11b customer portal v2: undoes supabase/migrations/20261128000000_customer_portal_v2.sql
--
-- WHEN TO USE: only after the PYS code that sends AMC_RENEWAL / PROFILE_CHANGE requests has been reverted (or with
-- PORTAL_ENABLED=false on Render). While that code is live, renewal and change requests would fail with 500.
-- A full S11 rollback runs this first, then 20261127_customer_portal_rollback.sql (which also includes these steps).
--
-- WHAT IT DOES: keeps every request customers already sent - AMC_RENEWAL and PROFILE_CHANGE rows become CONTACT
-- messages (the contract number is already in their message text) - then drops the renewal link column, its
-- indexes and checks, and restores the previous kind list. Nothing else is touched.
-- Safe to run more than once. Runs in one transaction: all or nothing. Take a backup first (owner approval).

BEGIN;

DROP INDEX IF EXISTS public.uq_web_intakes_open_amc_renewal;
DROP INDEX IF EXISTS public.idx_web_intakes_customer_kind_created;
ALTER TABLE public.web_intakes DROP CONSTRAINT IF EXISTS web_intakes_amc_contract_check;

ALTER TABLE public.web_intakes DROP CONSTRAINT IF EXISTS web_intakes_kind_check;
UPDATE public.web_intakes SET kind = 'CONTACT' WHERE kind IN ('AMC_RENEWAL', 'PROFILE_CHANGE');
ALTER TABLE public.web_intakes ADD CONSTRAINT web_intakes_kind_check
  CHECK (kind IN ('SERVICE_BOOKING', 'AMC_REQUEST', 'PRODUCT_ENQUIRY', 'CONTACT', 'BASKET', 'SELLER_INTEREST'));

ALTER TABLE public.web_intakes DROP COLUMN IF EXISTS amc_contract_id;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261128000000';

COMMIT;
