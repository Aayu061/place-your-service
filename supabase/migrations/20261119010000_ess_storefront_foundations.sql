-- Phase 2 / Stage B: what the new ESS website needs from PYS.
-- * Basket: web_intakes.kind BASKET (+ SELLER_INTEREST for dealers) and web_intake_items lines.
-- * Sellers: one list of sellers with ESS as the first-party seller; every product has a seller
--   (marketplace sellers are added in Phase 4 without schema changes to products).
-- * ess_products: seller, MRP, country of origin, published flag, display order.
-- * service_areas: pincode prefixes ESS serves (longest prefix wins).
-- * site_content_blocks (+ versions): editable website text and business details (draft/publish).
-- * app_role_grants: ESS Admin / ESS Staff roles for the ESS admin area.
-- * tracking_lookup_failures: lockout for the public "track my request" page.
-- * ESS_REVALIDATE outbox events when catalog / products / content / areas change.
-- * approve_web_intake / reject handling for baskets and dealer-interest requests.
-- * ESS_WEB integration client gains the scopes for the new endpoints.
-- RLS on, service role only (the browser never reads these tables). Idempotent; safe to re-run.

-- 1. Intake kinds -------------------------------------------------------------------------------
ALTER TABLE public.web_intakes DROP CONSTRAINT IF EXISTS web_intakes_kind_check;
ALTER TABLE public.web_intakes ADD CONSTRAINT web_intakes_kind_check
  CHECK (kind IN ('SERVICE_BOOKING', 'AMC_REQUEST', 'PRODUCT_ENQUIRY', 'CONTACT', 'BASKET', 'SELLER_INTEREST'));

-- 2. Sellers ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sellers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_code             text NOT NULL UNIQUE CHECK (seller_code ~ '^[A-Z0-9][A-Z0-9-]{1,30}$'),
  legal_name              text NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 2 AND 200),
  trade_name              text CHECK (trade_name IS NULL OR length(trade_name) <= 200),
  gstin                   text CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  address                 text CHECK (address IS NULL OR length(address) <= 500),
  phone                   text CHECK (phone IS NULL OR length(phone) <= 20),
  email                   text CHECK (email IS NULL OR length(email) <= 254),
  grievance_officer_name  text CHECK (grievance_officer_name IS NULL OR length(grievance_officer_name) <= 120),
  grievance_officer_email text CHECK (grievance_officer_email IS NULL OR length(grievance_officer_email) <= 254),
  grievance_officer_phone text CHECK (grievance_officer_phone IS NULL OR length(grievance_officer_phone) <= 20),
  return_policy           text CHECK (return_policy IS NULL OR length(return_policy) <= 2000),
  is_first_party          boolean NOT NULL DEFAULT false,
  status                  text NOT NULL DEFAULT 'PENDING_REVIEW'
                          CHECK (status IN ('PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sellers_single_first_party ON public.sellers (is_first_party) WHERE is_first_party;

INSERT INTO public.sellers (seller_code, legal_name, trade_name, gstin, address, phone, email, is_first_party, status)
VALUES ('ESS', 'Extreme Sales & Services', 'Extreme Sales & Services', '27ANTPP9778J1ZO',
        'Chembur, Mumbai, Maharashtra', '+91 7977805245', 'extremess0121@gmail.com', true, 'ACTIVE')
ON CONFLICT (seller_code) DO NOTHING;

-- 3. Products: seller + listing facts -------------------------------------------------------------
ALTER TABLE public.ess_products ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.sellers(id) ON DELETE RESTRICT;
ALTER TABLE public.ess_products ADD COLUMN IF NOT EXISTS mrp numeric(12,2) CHECK (mrp IS NULL OR mrp >= 0);
ALTER TABLE public.ess_products ADD COLUMN IF NOT EXISTS country_of_origin text
  CHECK (country_of_origin IS NULL OR length(country_of_origin) <= 80);
ALTER TABLE public.ess_products ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
ALTER TABLE public.ess_products ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 100;

UPDATE public.ess_products
   SET seller_id = (SELECT id FROM public.sellers WHERE seller_code = 'ESS')
 WHERE seller_id IS NULL;
ALTER TABLE public.ess_products ALTER COLUMN seller_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ess_products_seller ON public.ess_products (seller_id);

CREATE OR REPLACE FUNCTION public.ess_products_default_seller()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.seller_id IS NULL THEN
    SELECT id INTO NEW.seller_id FROM public.sellers WHERE is_first_party;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_ess_products_default_seller ON public.ess_products;
CREATE TRIGGER trg_ess_products_default_seller BEFORE INSERT OR UPDATE ON public.ess_products
  FOR EACH ROW EXECUTE FUNCTION public.ess_products_default_seller();

-- 4. Basket lines -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.web_intake_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id            uuid NOT NULL REFERENCES public.web_intakes(id) ON DELETE CASCADE,
  line_no              integer NOT NULL CHECK (line_no BETWEEN 1 AND 50),
  item_type            text NOT NULL CHECK (item_type IN ('SERVICE', 'AMC', 'PRODUCT')),
  catalog_service_code text REFERENCES public.service_catalog_items(code) ON UPDATE CASCADE ON DELETE SET NULL,
  amc_plan_code        text CHECK (amc_plan_code IS NULL OR length(amc_plan_code) <= 60),
  product_id           text REFERENCES public.ess_products(id) ON UPDATE CASCADE ON DELETE SET NULL,
  seller_id            uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  item_name            text NOT NULL CHECK (length(btrim(item_name)) BETWEEN 1 AND 200),
  quantity             integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
  ac_type              text CHECK (ac_type IS NULL OR ac_type IN
                         ('SPLIT', 'WINDOW', 'CASSETTE', 'TOWER', 'DUCTABLE', 'VRF', 'UNKNOWN')),
  ac_tonnage           numeric(4,2) CHECK (ac_tonnage IS NULL OR (ac_tonnage > 0 AND ac_tonnage <= 50)),
  ac_brand             text CHECK (ac_brand IS NULL OR length(ac_brand) <= 60),
  notes                text CHECK (notes IS NULL OR length(notes) <= 500),
  price_snapshot       jsonb,   -- {base, gstRatePercent, gst, total, label} as shown to the customer
  line_status          text NOT NULL DEFAULT 'PENDING'
                       CHECK (line_status IN ('PENDING', 'APPROVED', 'QUOTE_PENDING', 'FULFILLED', 'REJECTED', 'CANCELLED')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- The API checks that each line points at a real catalog item / plan / product when it is created.
  -- References may later become NULL (item deleted); item_name + price_snapshot keep the line readable.
  UNIQUE (intake_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_web_intake_items_intake ON public.web_intake_items (intake_id);
CREATE INDEX IF NOT EXISTS idx_web_intake_items_seller ON public.web_intake_items (seller_id) WHERE seller_id IS NOT NULL;

-- When a basket is rejected / marked spam / duplicate, its open lines close with it.
CREATE OR REPLACE FUNCTION public.web_intakes_close_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.web_intake_items
     SET line_status = 'REJECTED', updated_at = now()
   WHERE intake_id = NEW.id AND line_status = 'PENDING';
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS trg_web_intakes_close_items ON public.web_intakes;
CREATE TRIGGER trg_web_intakes_close_items AFTER UPDATE OF status ON public.web_intakes
  FOR EACH ROW WHEN (NEW.status IN ('REJECTED', 'SPAM', 'DUPLICATE', 'WITHDRAWN') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.web_intakes_close_items();

-- 5. Service areas ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_areas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pincode_prefix text NOT NULL UNIQUE CHECK (pincode_prefix ~ '^[1-9][0-9]{1,5}$'),
  label          text NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 120),
  is_active      boolean NOT NULL DEFAULT true,
  notes          text CHECK (notes IS NULL OR length(notes) <= 300),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- Default (user choice 2026-11-19): Mumbai, Thane and Navi Mumbai — all 400xxx pincodes. Editable in ESS admin.
INSERT INTO public.service_areas (pincode_prefix, label, notes)
VALUES ('400', 'Mumbai, Thane & Navi Mumbai', 'Default area set at launch; refine in ESS admin')
ON CONFLICT (pincode_prefix) DO NOTHING;

-- 6. Website content (draft / publish with history) ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_content_blocks (
  key               text PRIMARY KEY CHECK (key ~ '^[a-z0-9]+(\.[a-z0-9-]+)*$' AND length(key) <= 80),
  draft_body        jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_body    jsonb,
  published_version integer NOT NULL DEFAULT 0 CHECK (published_version >= 0),
  draft_updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  draft_updated_at  timestamptz NOT NULL DEFAULT now(),
  published_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_content_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL REFERENCES public.site_content_blocks(key) ON DELETE CASCADE,
  version      integer NOT NULL,
  body         jsonb NOT NULL,
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, version)
);

-- Publishing copies the draft, bumps the version and keeps the old text in the history.
CREATE OR REPLACE FUNCTION public.publish_site_content(p_key text, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  b       public.site_content_blocks%ROWTYPE;
  v_actor uuid;
BEGIN
  SELECT * INTO b FROM public.site_content_blocks WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Content block % not found', p_key USING ERRCODE = 'P0002';
  END IF;
  SELECT id INTO v_actor FROM public.profiles WHERE id = p_actor;
  UPDATE public.site_content_blocks
     SET published_body = b.draft_body, published_version = b.published_version + 1,
         published_by = v_actor, published_at = now()
   WHERE key = p_key;
  INSERT INTO public.site_content_versions (key, version, body, published_by)
  VALUES (p_key, b.published_version + 1, b.draft_body, v_actor);
  RETURN jsonb_build_object('key', p_key, 'version', b.published_version + 1);
END;
$function$;

-- Placeholders (user choice): real values are edited in ESS admin before launch.
INSERT INTO public.site_content_blocks (key, draft_body, published_body, published_version, published_at) VALUES
  ('business.identity',
   '{"legalName":"Extreme Sales & Services","tradeName":"Extreme Sales & Services","proprietorName":null,
     "gstin":"27ANTPP9778J1ZO","address":"Chembur, Mumbai, Maharashtra","phone":"+91 7977805245",
     "whatsapp":"+91 7977805245","email":"extremess0121@gmail.com","hours":"Mon–Sat, 9:00 am – 7:00 pm",
     "warrantyDays":30,"grievanceOfficer":{"name":null,"email":"extremess0121@gmail.com","phone":"+91 7977805245"}}'::jsonb,
   '{"legalName":"Extreme Sales & Services","tradeName":"Extreme Sales & Services","proprietorName":null,
     "gstin":"27ANTPP9778J1ZO","address":"Chembur, Mumbai, Maharashtra","phone":"+91 7977805245",
     "whatsapp":"+91 7977805245","email":"extremess0121@gmail.com","hours":"Mon–Sat, 9:00 am – 7:00 pm",
     "warrantyDays":30,"grievanceOfficer":{"name":null,"email":"extremess0121@gmail.com","phone":"+91 7977805245"}}'::jsonb,
   1, now()),
  ('home.hero',
   '{"headline":"What does your AC need?","subline":"Servicing, repairs, AMC plans and new ACs across Mumbai, Thane and Navi Mumbai."}'::jsonb,
   '{"headline":"What does your AC need?","subline":"Servicing, repairs, AMC plans and new ACs across Mumbai, Thane and Navi Mumbai."}'::jsonb,
   1, now()),
  ('home.offers', '{"items":[]}'::jsonb, '{"items":[]}'::jsonb, 1, now()),
  ('faq', '{"items":[]}'::jsonb, '{"items":[]}'::jsonb, 1, now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.site_content_versions (key, version, body)
SELECT key, 1, published_body FROM public.site_content_blocks
 WHERE published_version = 1 AND published_body IS NOT NULL
ON CONFLICT (key, version) DO NOTHING;

-- 7. ESS admin roles ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_role_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('ESS_ADMIN', 'ESS_STAFF')),
  granted_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_role_grants_active
  ON public.app_role_grants (profile_id, role) WHERE revoked_at IS NULL;

-- 8. Tracking lookup lockout ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tracking_lookup_failures (
  key_hash     text PRIMARY KEY CHECK (length(key_hash) BETWEEN 16 AND 128),
  failures     integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  locked_until timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Records one failed lookup; locks after p_max failures for p_lock_minutes. Returns the lock time (or NULL).
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
    SET failures = CASE WHEN t.locked_until IS NOT NULL AND t.locked_until < now() THEN 1 ELSE t.failures + 1 END,
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

-- 9. Tell the ESS website to refresh its cached pages ----------------------------------------------
-- One event per transaction and topic; the outbox handler POSTs it to ESS (or skips if ESS has no URL yet).
CREATE OR REPLACE FUNCTION public.queue_ess_revalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_topic text := TG_ARGV[0];
BEGIN
  INSERT INTO public.outbound_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  VALUES ('ESS_REVALIDATE', 'ESS_SITE', NULL, jsonb_build_object('topic', v_topic),
          'ess-revalidate:' || v_topic || ':' || txid_current())
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_catalog_meta_revalidate ON public.catalog_meta;
CREATE TRIGGER trg_catalog_meta_revalidate AFTER UPDATE ON public.catalog_meta
  FOR EACH STATEMENT EXECUTE FUNCTION public.queue_ess_revalidate('catalog');
DROP TRIGGER IF EXISTS trg_ess_products_revalidate ON public.ess_products;
CREATE TRIGGER trg_ess_products_revalidate AFTER INSERT OR UPDATE OR DELETE ON public.ess_products
  FOR EACH STATEMENT EXECUTE FUNCTION public.queue_ess_revalidate('products');
DROP TRIGGER IF EXISTS trg_sellers_revalidate ON public.sellers;
CREATE TRIGGER trg_sellers_revalidate AFTER INSERT OR UPDATE OR DELETE ON public.sellers
  FOR EACH STATEMENT EXECUTE FUNCTION public.queue_ess_revalidate('products');
DROP TRIGGER IF EXISTS trg_site_content_revalidate ON public.site_content_blocks;
CREATE TRIGGER trg_site_content_revalidate AFTER UPDATE OF published_version ON public.site_content_blocks
  FOR EACH STATEMENT EXECUTE FUNCTION public.queue_ess_revalidate('content');
DROP TRIGGER IF EXISTS trg_service_areas_revalidate ON public.service_areas;
CREATE TRIGGER trg_service_areas_revalidate AFTER INSERT OR UPDATE OR DELETE ON public.service_areas
  FOR EACH STATEMENT EXECUTE FUNCTION public.queue_ess_revalidate('areas');

-- 10. Approval for baskets and dealer-interest requests ------------------------------------------
-- Same contract as before (M5). New:
--  * SELLER_INTEREST behaves like CONTACT (nothing operational to create).
--  * BASKET with service/AMC lines → one service request for the visit (all lines listed in the
--    description; first service line sets the catalog code); those lines → APPROVED.
--    Product lines → QUOTE_PENDING (the seller follows up). A products-only basket creates no request.
CREATE OR REPLACE FUNCTION public.approve_web_intake(
  p_intake_id    uuid,
  p_actor        uuid,
  p_customer_id  uuid DEFAULT NULL,
  p_request_type text DEFAULT NULL,
  p_priority     text DEFAULT 'MEDIUM',
  p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  it              public.web_intakes%ROWTYPE;
  v_actor         uuid;
  v_customer_id   uuid;
  v_created_cust  boolean := false;
  v_site_id       uuid;
  v_addr          text;
  v_cust_addr     text;
  v_request_type  text;
  v_sr_id         uuid;
  v_sr_number     text;
  v_description   text;
  v_ac            text;
  v_has_visit     boolean;
  v_lines         text;
  v_service_code  text;
  v_is_amc        boolean := false;
BEGIN
  SELECT * INTO it FROM public.web_intakes WHERE id = p_intake_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Web intake not found' USING ERRCODE = 'P0002';
  END IF;
  IF it.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'Web intake has already been reviewed (status %)', it.status USING ERRCODE = '55000';
  END IF;

  SELECT id INTO v_actor FROM public.profiles WHERE id = p_actor;

  IF it.kind = 'BASKET' THEN
    v_has_visit := EXISTS (SELECT 1 FROM public.web_intake_items
                            WHERE intake_id = it.id AND item_type IN ('SERVICE', 'AMC'));
  ELSE
    v_has_visit := it.kind IN ('SERVICE_BOOKING', 'AMC_REQUEST');
  END IF;

  -- Messages, dealer interest, product enquiries and products-only baskets: just close the review.
  IF NOT v_has_visit THEN
    UPDATE public.web_intakes
       SET status = 'APPROVED', customer_id = COALESCE(p_customer_id, customer_id),
           reviewed_by = v_actor, reviewed_at = now()
     WHERE id = it.id;
    UPDATE public.web_intake_items
       SET line_status = 'QUOTE_PENDING', updated_at = now()
     WHERE intake_id = it.id AND item_type = 'PRODUCT' AND line_status = 'PENDING';
    -- No confirmation email here (as in M5): there is no visit to confirm; staff/seller follow up directly.
    RETURN jsonb_build_object('intakeId', it.id, 'status', 'APPROVED', 'customerId', p_customer_id,
                              'siteId', NULL, 'serviceRequestId', NULL, 'requestNumber', NULL,
                              'createdCustomer', false);
  END IF;

  IF p_priority IS NULL OR p_priority NOT IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'EMERGENCY') THEN
    RAISE EXCEPTION 'Invalid priority %', p_priority USING ERRCODE = '22023';
  END IF;

  -- Customer: chosen by staff, else existing by phone, else a new TEMPORARY customer.
  v_addr := NULLIF(concat_ws(', ', NULLIF(btrim(it.address_line), ''), NULLIF(btrim(it.area), ''),
                             CASE WHEN NULLIF(btrim(it.landmark), '') IS NOT NULL THEN 'Near ' || btrim(it.landmark) END,
                             NULLIF(btrim(it.city), ''), it.pincode), '');

  IF p_customer_id IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM public.customers WHERE id = p_customer_id;
    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'Customer not found' USING ERRCODE = 'P0002';
    END IF;
  ELSIF it.phone_normalized IS NOT NULL THEN
    SELECT c.id INTO v_customer_id
      FROM public.customers c
     WHERE c.phone_normalized = it.phone_normalized AND c.is_active
     ORDER BY (c.customer_type = 'PERMANENT') DESC, c.created_at
     LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers
      (customer_code, name, email, phone, address, city, postal_code, customer_type, notes, created_by, updated_by)
    VALUES
      (public.generate_business_number('CUSTOMER'), btrim(it.contact_name), NULLIF(btrim(it.contact_email), ''),
       it.contact_phone, COALESCE(v_addr, 'Address not provided'), NULLIF(btrim(it.city), ''), it.pincode,
       'TEMPORARY', 'Created from website request ' || it.intake_number, v_actor, v_actor)
    RETURNING id INTO v_customer_id;
    v_created_cust := true;
  END IF;

  -- Site: reuse one with the same address, else create (or fall back to an existing site).
  IF v_addr IS NOT NULL THEN
    SELECT s.id INTO v_site_id
      FROM public.customer_sites s
     WHERE s.customer_id = v_customer_id AND s.is_active
       AND lower(regexp_replace(btrim(s.address), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(v_addr), '\s+', ' ', 'g'))
     ORDER BY s.is_primary DESC, s.created_at
     LIMIT 1;
  ELSE
    SELECT s.id INTO v_site_id
      FROM public.customer_sites s
     WHERE s.customer_id = v_customer_id AND s.is_active
     ORDER BY s.is_primary DESC, s.created_at
     LIMIT 1;
  END IF;

  IF v_site_id IS NULL THEN
    SELECT address INTO v_cust_addr FROM public.customers WHERE id = v_customer_id;
    INSERT INTO public.customer_sites
      (customer_id, site_name, address, contact_person, contact_phone, contact_email, is_primary, notes)
    VALUES
      (v_customer_id, left(COALESCE(NULLIF(btrim(it.area), ''), NULLIF(btrim(it.city), ''), 'Website address'), 120),
       COALESCE(v_addr, v_cust_addr, 'Address not provided'), btrim(it.contact_name), it.contact_phone,
       NULLIF(btrim(it.contact_email), ''),
       NOT EXISTS (SELECT 1 FROM public.customer_sites WHERE customer_id = v_customer_id AND is_active),
       'Added from website request ' || it.intake_number)
    RETURNING id INTO v_site_id;
  END IF;

  -- Basket lines → description + catalog code.
  IF it.kind = 'BASKET' THEN
    SELECT string_agg(
             '- ' || CASE i.item_type WHEN 'SERVICE' THEN 'Service' WHEN 'AMC' THEN 'AMC plan' ELSE 'AC' END
             || ': ' || i.item_name
             || CASE WHEN i.quantity > 1 THEN ' x' || i.quantity ELSE '' END
             || COALESCE(' (' || NULLIF(concat_ws(', ', NULLIF(i.ac_type, 'UNKNOWN'), NULLIF(btrim(i.ac_brand), ''),
                   CASE WHEN i.ac_tonnage IS NOT NULL
                        THEN trim(trailing '.' FROM trim(trailing '0' FROM i.ac_tonnage::text)) || ' ton' END), '') || ')', '')
             || CASE WHEN i.item_type = 'PRODUCT' THEN ' [quote by seller]' ELSE '' END,
             E'\n' ORDER BY i.line_no)
      INTO v_lines
      FROM public.web_intake_items i
     WHERE i.intake_id = it.id;

    SELECT i.catalog_service_code INTO v_service_code
      FROM public.web_intake_items i
     WHERE i.intake_id = it.id AND i.item_type = 'SERVICE' AND i.catalog_service_code IS NOT NULL
     ORDER BY i.line_no LIMIT 1;
    v_is_amc := v_service_code IS NULL;
  ELSE
    v_service_code := it.catalog_service_code;
    v_is_amc := it.kind = 'AMC_REQUEST';
  END IF;

  v_request_type := COALESCE(
    NULLIF(btrim(p_request_type), ''),
    (SELECT request_type FROM public.service_catalog_items WHERE code = v_service_code),
    CASE WHEN v_is_amc THEN 'PREVENTIVE_MAINTENANCE' ELSE 'BREAKDOWN' END);

  v_ac := NULLIF(concat_ws(', ',
            CASE WHEN it.ac_units > 1 THEN it.ac_units || ' units' END,
            NULLIF(it.ac_type, 'UNKNOWN'),
            NULLIF(btrim(it.ac_brand), ''),
            CASE WHEN it.ac_tonnage IS NOT NULL THEN trim(trailing '.' FROM trim(trailing '0' FROM it.ac_tonnage::text)) || ' ton' END,
            CASE it.ac_inverter WHEN 'YES' THEN 'inverter' WHEN 'NO' THEN 'non-inverter' END,
            CASE WHEN it.ac_age_years IS NOT NULL THEN it.ac_age_years || ' yr old' END), '');

  v_description := left(concat_ws(E'\n',
    COALESCE(NULLIF(btrim(it.message), ''),
             CASE it.kind WHEN 'AMC_REQUEST' THEN 'AMC request from website'
                          WHEN 'BASKET' THEN 'Basket request from website'
                          ELSE 'Service booking from website' END),
    CASE WHEN v_lines IS NOT NULL THEN 'Items:' || E'\n' || v_lines END,
    CASE WHEN it.amc_plan_code IS NOT NULL THEN 'AMC plan: ' || it.amc_plan_code END,
    CASE WHEN v_ac IS NOT NULL THEN 'AC: ' || v_ac END,
    CASE WHEN it.preferred_slot IS NOT NULL THEN 'Preferred slot: ' || initcap(it.preferred_slot) END,
    'Website request ' || it.intake_number), 4000);

  v_sr_number := public.generate_business_number('SERVICE_REQUEST');
  INSERT INTO public.service_requests
    (request_number, customer_id, site_id, request_type, priority, description, preferred_date, status,
     notes, source_channel, external_reference_id, catalog_service_code, created_by, updated_by)
  VALUES
    (v_sr_number, v_customer_id, v_site_id, v_request_type, p_priority, v_description, it.preferred_date, 'PENDING',
     NULLIF(btrim(p_notes), ''), it.source_channel, COALESCE(it.external_reference_id, it.intake_number),
     v_service_code, v_actor, v_actor)
  RETURNING id INTO v_sr_id;

  UPDATE public.web_intakes
     SET status = 'APPROVED', customer_id = v_customer_id, site_id = v_site_id,
         service_request_id = v_sr_id, reviewed_by = v_actor, reviewed_at = now()
   WHERE id = it.id;

  UPDATE public.web_intake_items
     SET line_status = CASE WHEN item_type = 'PRODUCT' THEN 'QUOTE_PENDING' ELSE 'APPROVED' END,
         updated_at = now()
   WHERE intake_id = it.id AND line_status = 'PENDING';

  INSERT INTO public.outbound_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  VALUES ('WEB_INTAKE_APPROVED', 'WEB_INTAKE', it.id,
          jsonb_build_object('intakeId', it.id, 'serviceRequestId', v_sr_id),
          'intake-approved:' || it.id)
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('intakeId', it.id, 'status', 'APPROVED', 'customerId', v_customer_id,
                            'siteId', v_site_id, 'serviceRequestId', v_sr_id, 'requestNumber', v_sr_number,
                            'createdCustomer', v_created_cust);
END;
$function$;

-- 11. Integration scopes for the new ESS endpoints --------------------------------------------------
UPDATE public.integration_clients
   SET scopes = ARRAY(SELECT DISTINCT unnest(scopes || ARRAY['products:read', 'content:read', 'areas:read', 'admin:access']) ORDER BY 1)
 WHERE client_code = 'ESS_WEB';

-- 12. Security ----------------------------------------------------------------------------------
ALTER TABLE public.sellers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_intake_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_areas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_content_blocks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_content_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_role_grants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_lookup_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sellers, public.web_intake_items, public.service_areas, public.site_content_blocks,
              public.site_content_versions, public.app_role_grants, public.tracking_lookup_failures
  FROM anon, authenticated;
GRANT ALL ON public.sellers, public.web_intake_items, public.service_areas, public.site_content_blocks,
             public.site_content_versions, public.app_role_grants, public.tracking_lookup_failures
  TO service_role;

REVOKE ALL ON FUNCTION public.ess_products_default_seller() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.web_intakes_close_items() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_site_content(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_tracking_failure(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_ess_revalidate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_web_intake(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_site_content(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_tracking_failure(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_web_intake(uuid, uuid, uuid, text, text, text) TO service_role;
