-- M5: web_intakes — the approval inbox for website requests.
-- Bookings, AMC requests, product enquiries and contact messages from the ESS website land here
-- first and wait for a staff member to approve them. Only approval creates the customer, site and
-- service request (approve_web_intake), so spam and duplicates never reach the operational tables.
-- * web_intakes table (+ tracking code generator, phone matching, RECEIVED outbox event)
-- * approve_web_intake / reject_web_intake RPCs (atomic, row-locked)
-- * email_deliveries.entity_type gains the intake / status / OTP email kinds
-- * existing contact_enquiries are copied in as CONTACT intakes (no events fired for copies)
-- RLS on, service role only. Idempotent; safe to re-run.

-- 1. Tracking code: ESS-XXXX-XXXX from an alphabet without look-alikes (no 0/O, 1/I/L) -----
CREATE OR REPLACE FUNCTION public.generate_tracking_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_bytes    bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  v_out      text := '';
  i          integer;
BEGIN
  FOR i IN 0..7 LOOP
    v_out := v_out || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % length(v_alphabet)), 1);
  END LOOP;
  RETURN 'ESS-' || substr(v_out, 1, 4) || '-' || substr(v_out, 5, 4);
END;
$function$;

-- 2. Table ----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.web_intakes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_number          text NOT NULL UNIQUE DEFAULT public.generate_business_number('WEB_INTAKE'),
  tracking_code          text NOT NULL UNIQUE DEFAULT public.generate_tracking_code()
                         CHECK (tracking_code ~ '^ESS-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$'),
  kind                   text NOT NULL
                         CHECK (kind IN ('SERVICE_BOOKING', 'AMC_REQUEST', 'PRODUCT_ENQUIRY', 'CONTACT')),
  status                 text NOT NULL DEFAULT 'PENDING_REVIEW'
                         CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'DUPLICATE', 'SPAM',
                                           'WITHDRAWN', 'IMPORTED_ARCHIVE')),
  source_channel         text NOT NULL DEFAULT 'EXTREME_SALES_SERVICES',
  external_reference_id  text CHECK (external_reference_id IS NULL OR length(external_reference_id) BETWEEN 1 AND 200),

  contact_name           text NOT NULL CHECK (length(btrim(contact_name)) BETWEEN 1 AND 120),
  contact_phone          text NOT NULL CHECK (length(contact_phone) BETWEEN 6 AND 20),
  phone_normalized       text GENERATED ALWAYS AS (
                           CASE WHEN length(regexp_replace(coalesce(contact_phone, ''), '[^0-9]', '', 'g')) >= 10
                                THEN right(regexp_replace(contact_phone, '[^0-9]', '', 'g'), 10) END
                         ) STORED,
  contact_email          text CHECK (contact_email IS NULL OR length(contact_email) <= 254),

  address_line           text CHECK (address_line IS NULL OR length(address_line) <= 300),
  area                   text CHECK (area IS NULL OR length(area) <= 120),
  landmark               text CHECK (landmark IS NULL OR length(landmark) <= 120),
  city                   text CHECK (city IS NULL OR length(city) <= 80),
  pincode                text CHECK (pincode IS NULL OR pincode ~ '^[0-9]{6}$'),

  ac_type                text CHECK (ac_type IS NULL OR ac_type IN
                           ('SPLIT', 'WINDOW', 'CASSETTE', 'TOWER', 'DUCTABLE', 'VRF', 'UNKNOWN')),
  ac_brand               text CHECK (ac_brand IS NULL OR length(ac_brand) <= 60),
  ac_tonnage             numeric(4,2) CHECK (ac_tonnage IS NULL OR (ac_tonnage > 0 AND ac_tonnage <= 50)),
  ac_inverter            text CHECK (ac_inverter IS NULL OR ac_inverter IN ('YES', 'NO', 'UNKNOWN')),
  ac_age_years           integer CHECK (ac_age_years IS NULL OR ac_age_years BETWEEN 0 AND 60),
  ac_units               integer NOT NULL DEFAULT 1 CHECK (ac_units BETWEEN 1 AND 100),

  catalog_service_code   text REFERENCES public.service_catalog_items(code) ON UPDATE CASCADE ON DELETE SET NULL,
  amc_plan_code          text CHECK (amc_plan_code IS NULL OR length(amc_plan_code) <= 60),
  message                text CHECK (message IS NULL OR length(message) <= 2000),
  preferred_date         date,
  preferred_slot         text CHECK (preferred_slot IS NULL OR preferred_slot IN ('MORNING', 'AFTERNOON', 'EVENING')),

  consent_privacy        boolean NOT NULL,
  consent_marketing      boolean NOT NULL DEFAULT false,
  privacy_notice_version text CHECK (privacy_notice_version IS NULL OR length(privacy_notice_version) <= 40),

  spam_score             integer NOT NULL DEFAULT 0 CHECK (spam_score >= 0),
  client_ip_hash         text CHECK (client_ip_hash IS NULL OR length(client_ip_hash) <= 128),

  matched_customer_id    uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_id            uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  site_id                uuid REFERENCES public.customer_sites(id) ON DELETE SET NULL,
  service_request_id     uuid REFERENCES public.service_requests(id) ON DELETE SET NULL,
  reviewed_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at            timestamptz,
  rejection_reason       text CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 500),

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_web_intakes_source_extref
  ON public.web_intakes (source_channel, external_reference_id)
  WHERE external_reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_intakes_status_created ON public.web_intakes (status, created_at);
CREATE INDEX IF NOT EXISTS idx_web_intakes_phone_normalized
  ON public.web_intakes (phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_intakes_service_request
  ON public.web_intakes (service_request_id) WHERE service_request_id IS NOT NULL;

-- 3. Triggers ---------------------------------------------------------------------------------
-- Before insert: link a likely existing customer (same last-10-digit phone) for the reviewer.
-- Before update: keep updated_at current.
CREATE OR REPLACE FUNCTION public.web_intakes_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_digits text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.matched_customer_id IS NULL THEN
      v_digits := regexp_replace(coalesce(NEW.contact_phone, ''), '[^0-9]', '', 'g');
      IF length(v_digits) >= 10 THEN
        SELECT c.id INTO NEW.matched_customer_id
          FROM public.customers c
         WHERE c.phone_normalized = right(v_digits, 10) AND c.is_active
         ORDER BY (c.customer_type = 'PERMANENT') DESC, c.created_at
         LIMIT 1;
      END IF;
    END IF;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_web_intakes_before_write ON public.web_intakes;
CREATE TRIGGER trg_web_intakes_before_write BEFORE INSERT OR UPDATE ON public.web_intakes
  FOR EACH ROW EXECUTE FUNCTION public.web_intakes_before_write();

-- After insert: queue WEB_INTAKE_RECEIVED (receipt email etc.) for genuine new requests only.
-- Rows inserted as SPAM / IMPORTED_ARCHIVE / anything but PENDING_REVIEW never fire it.
CREATE OR REPLACE FUNCTION public.web_intakes_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.outbound_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  VALUES ('WEB_INTAKE_RECEIVED', 'WEB_INTAKE', NEW.id,
          jsonb_build_object('intakeId', NEW.id),
          'intake-received:' || NEW.id)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_web_intakes_received ON public.web_intakes;
CREATE TRIGGER trg_web_intakes_received AFTER INSERT ON public.web_intakes
  FOR EACH ROW WHEN (NEW.status = 'PENDING_REVIEW')
  EXECUTE FUNCTION public.web_intakes_after_insert();

-- 4. Approve ----------------------------------------------------------------------------------
-- Errors: P0002 not found, 55000 already reviewed, 22023 bad argument (mapped by the API).
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
BEGIN
  SELECT * INTO it FROM public.web_intakes WHERE id = p_intake_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Web intake not found' USING ERRCODE = 'P0002';
  END IF;
  IF it.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'Web intake has already been reviewed (status %)', it.status USING ERRCODE = '55000';
  END IF;

  SELECT id INTO v_actor FROM public.profiles WHERE id = p_actor;

  -- Messages and product enquiries: nothing to create, just close the review.
  IF it.kind IN ('CONTACT', 'PRODUCT_ENQUIRY') THEN
    UPDATE public.web_intakes
       SET status = 'APPROVED', customer_id = COALESCE(p_customer_id, customer_id),
           reviewed_by = v_actor, reviewed_at = now()
     WHERE id = it.id;
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

  -- Service request.
  v_request_type := COALESCE(
    NULLIF(btrim(p_request_type), ''),
    (SELECT request_type FROM public.service_catalog_items WHERE code = it.catalog_service_code),
    CASE WHEN it.kind = 'AMC_REQUEST' THEN 'PREVENTIVE_MAINTENANCE' ELSE 'BREAKDOWN' END);

  v_ac := NULLIF(concat_ws(', ',
            CASE WHEN it.ac_units > 1 THEN it.ac_units || ' units' END,
            NULLIF(it.ac_type, 'UNKNOWN'),
            NULLIF(btrim(it.ac_brand), ''),
            CASE WHEN it.ac_tonnage IS NOT NULL THEN trim(trailing '.' FROM trim(trailing '0' FROM it.ac_tonnage::text)) || ' ton' END,
            CASE it.ac_inverter WHEN 'YES' THEN 'inverter' WHEN 'NO' THEN 'non-inverter' END,
            CASE WHEN it.ac_age_years IS NOT NULL THEN it.ac_age_years || ' yr old' END), '');

  v_description := left(concat_ws(E'\n',
    COALESCE(NULLIF(btrim(it.message), ''),
             CASE it.kind WHEN 'AMC_REQUEST' THEN 'AMC request from website' ELSE 'Service booking from website' END),
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
     it.catalog_service_code, v_actor, v_actor)
  RETURNING id INTO v_sr_id;

  UPDATE public.web_intakes
     SET status = 'APPROVED', customer_id = v_customer_id, site_id = v_site_id,
         service_request_id = v_sr_id, reviewed_by = v_actor, reviewed_at = now()
   WHERE id = it.id;

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

-- 5. Reject / mark spam / mark duplicate ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_web_intake(
  p_intake_id uuid,
  p_actor     uuid,
  p_status    text,
  p_reason    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  it      public.web_intakes%ROWTYPE;
  v_actor uuid;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('REJECTED', 'SPAM', 'DUPLICATE') THEN
    RAISE EXCEPTION 'Status must be REJECTED, SPAM or DUPLICATE' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'REJECTED' AND NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reject a request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO it FROM public.web_intakes WHERE id = p_intake_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Web intake not found' USING ERRCODE = 'P0002';
  END IF;
  IF it.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'Web intake has already been reviewed (status %)', it.status USING ERRCODE = '55000';
  END IF;

  SELECT id INTO v_actor FROM public.profiles WHERE id = p_actor;

  UPDATE public.web_intakes
     SET status = p_status, rejection_reason = left(NULLIF(btrim(p_reason), ''), 500),
         reviewed_by = v_actor, reviewed_at = now()
   WHERE id = it.id;

  IF p_status = 'REJECTED' THEN
    INSERT INTO public.outbound_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
    VALUES ('WEB_INTAKE_REJECTED', 'WEB_INTAKE', it.id, jsonb_build_object('intakeId', it.id),
            'intake-rejected:' || it.id)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('intakeId', it.id, 'status', p_status);
END;
$function$;

-- 6. Security ---------------------------------------------------------------------------------
ALTER TABLE public.web_intakes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_intakes FROM anon, authenticated;
GRANT ALL ON public.web_intakes TO service_role;

REVOKE ALL ON FUNCTION public.generate_tracking_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.web_intakes_before_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.web_intakes_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_web_intake(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_web_intake(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tracking_code() TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_web_intake(uuid, uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_web_intake(uuid, uuid, text, text) TO service_role;

-- 7. Email kinds for intake receipts, confirmations, status updates and portal OTPs ----------
ALTER TABLE public.email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_entity_type_check;
ALTER TABLE public.email_deliveries ADD CONSTRAINT email_deliveries_entity_type_check
  CHECK (entity_type IN (
    'SERVICE_REPORT', 'AMC_QUOTATION', 'AMC_EXPIRY_REMINDER', 'PAYMENT_INVOICE', 'PAYMENT_RECEIPT',
    'DISPATCH_CONFIRMATION', 'TEST_EMAIL',
    'INTAKE_RECEIPT', 'INTAKE_CONFIRMATION', 'INTAKE_REJECTION', 'SERVICE_STATUS_UPDATE', 'PORTAL_OTP'
  ));

-- 8. Copy existing website contact enquiries in as CONTACT intakes ----------------------------
-- Inserted as IMPORTED_ARCHIVE (so the RECEIVED trigger never fires for copies), then still-open
-- ones are moved to PENDING_REVIEW and spam stays spam. Re-running skips rows already copied.
-- Consent was not recorded by the old form, so copies carry consent_privacy = false.
DO $copy$
DECLARE
  v_new_ids uuid[];
BEGIN
  IF to_regclass('public.contact_enquiries') IS NULL THEN
    RETURN;
  END IF;

  WITH ins AS (
    INSERT INTO public.web_intakes
      (kind, status, source_channel, external_reference_id, contact_name, contact_phone, contact_email,
       message, consent_privacy, consent_marketing, privacy_notice_version, created_at, updated_at)
    SELECT 'CONTACT', 'IMPORTED_ARCHIVE',
           COALESCE(NULLIF(e.source_channel, ''), 'EXTREME_SALES_SERVICES'),
           'contact_enquiry:' || e.id,
           left(COALESCE(NULLIF(btrim(e.name), ''), 'Unknown'), 120),
           left(CASE WHEN length(btrim(e.phone)) >= 6 THEN btrim(e.phone) ELSE '000000' END, 20),
           CASE WHEN e.email IS NOT NULL AND length(e.email) <= 254 THEN NULLIF(btrim(e.email), '') END,
           left(NULLIF(concat_ws(E'\n',
                  CASE WHEN NULLIF(btrim(e.subject), '') IS NOT NULL THEN 'Subject: ' || btrim(e.subject) END,
                  CASE WHEN NULLIF(btrim(e.service_type), '') IS NOT NULL THEN 'Service: ' || btrim(e.service_type) END,
                  NULLIF(btrim(e.message), ''),
                  CASE WHEN e.enquiry_number IS NOT NULL THEN 'Imported from enquiry ' || e.enquiry_number END), ''), 2000),
           false, false, 'LEGACY_IMPORT', e.created_at, e.updated_at
      FROM public.contact_enquiries e
    ON CONFLICT (source_channel, external_reference_id) WHERE external_reference_id IS NOT NULL DO NOTHING
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO v_new_ids FROM ins;

  -- Separate statement: rows inserted by a data-modifying CTE are not visible to its own query.
  UPDATE public.web_intakes w
     SET status = CASE e.status WHEN 'NEW' THEN 'PENDING_REVIEW' ELSE 'SPAM' END
    FROM public.contact_enquiries e
   WHERE w.id = ANY (v_new_ids)
     AND w.external_reference_id = 'contact_enquiry:' || e.id
     AND e.status IN ('NEW', 'SPAM');
END;
$copy$;
