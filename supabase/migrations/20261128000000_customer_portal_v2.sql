-- S11b customer portal v2 (2026-11-28)
-- Two new approval-inbox kinds sent by a signed-in customer from the ESS website (PYS server code only):
--   * AMC_RENEWAL    - "Renew my AMC" on a contract page. Linked to the contract (new column amc_contract_id).
--   * PROFILE_CHANGE - "Request a change" to the customer's details (customers cannot edit them themselves).
-- approve_web_intake already treats any kind other than SERVICE_BOOKING / AMC_REQUEST / BASKET with visit lines as
-- "just close the review" (no customer, site or service request is created), so it needs no change: staff renew the
-- contract / edit the customer in PYS as today and then approve (close) the request.
-- * at most one OPEN renewal request per contract (unique partial index) - the API answers the same reference again.
-- Rollback: supabase/rollback/20261128_customer_portal_v2_rollback.sql. Idempotent; safe to re-run.

ALTER TABLE public.web_intakes DROP CONSTRAINT IF EXISTS web_intakes_kind_check;
ALTER TABLE public.web_intakes ADD CONSTRAINT web_intakes_kind_check
  CHECK (kind IN ('SERVICE_BOOKING', 'AMC_REQUEST', 'PRODUCT_ENQUIRY', 'CONTACT', 'BASKET', 'SELLER_INTEREST',
                  'AMC_RENEWAL', 'PROFILE_CHANGE'));

ALTER TABLE public.web_intakes
  ADD COLUMN IF NOT EXISTS amc_contract_id uuid REFERENCES public.amc_contracts(id) ON DELETE SET NULL;

-- Only renewal requests carry a contract (it may become NULL if the contract is ever deleted).
ALTER TABLE public.web_intakes DROP CONSTRAINT IF EXISTS web_intakes_amc_contract_check;
ALTER TABLE public.web_intakes ADD CONSTRAINT web_intakes_amc_contract_check
  CHECK (amc_contract_id IS NULL OR kind = 'AMC_RENEWAL');

CREATE UNIQUE INDEX IF NOT EXISTS uq_web_intakes_open_amc_renewal
  ON public.web_intakes (amc_contract_id)
  WHERE kind = 'AMC_RENEWAL' AND status = 'PENDING_REVIEW';

-- The 5-per-day limit on change requests counts a customer's recent rows.
CREATE INDEX IF NOT EXISTS idx_web_intakes_customer_kind_created
  ON public.web_intakes (customer_id, kind, created_at)
  WHERE customer_id IS NOT NULL;
