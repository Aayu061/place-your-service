-- M2: safe business numbers + service-request integrity.
-- * One atomic counter per number type (and per year where the number carries the year),
--   replacing random numbers that can collide. Counters start after the highest number
--   already in use, so existing numbers keep their meaning and new ones never clash.
-- * customers.phone_normalized for duplicate matching (last 10 digits).
-- * service_requests.source_channel required + limited to known channels.
-- * UNINSTALLATION request type; catalog_service_code (linked to the catalog in M3).
-- * One PYS request per external booking: unique (source_channel, external_reference_id).
-- Idempotent where possible; safe to re-run.

-- 1. Number series ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_number_series (
  kind        text PRIMARY KEY,
  prefix      text NOT NULL,
  per_year    boolean NOT NULL,
  pad         integer NOT NULL CHECK (pad BETWEEN 1 AND 12),
  description text
);

CREATE TABLE IF NOT EXISTS public.business_number_counters (
  kind       text NOT NULL REFERENCES public.business_number_series(kind) ON DELETE CASCADE,
  year       integer NOT NULL,             -- 0 for series that do not carry a year
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, year)
);

ALTER TABLE public.business_number_series   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_number_series, public.business_number_counters FROM anon, authenticated;
GRANT ALL ON public.business_number_series, public.business_number_counters TO service_role;

INSERT INTO public.business_number_series (kind, prefix, per_year, pad, description) VALUES
  ('SERVICE_REQUEST', 'SR-',   true,  6, 'Service request, e.g. SR-2026-000123'),
  ('CUSTOMER',        'CUST-', false, 6, 'Customer code, e.g. CUST-000123'),
  ('AMC_CONTRACT',    'AMC-',  true,  4, 'AMC contract, e.g. AMC-2026-0004'),
  ('SCHEDULE',        'SCH-',  true,  6, 'Service visit, e.g. SCH-2026-000123'),
  ('PM_SCHEDULE',     'PM-',   true,  6, 'AMC preventive visit, e.g. PM-2026-000025'),
  ('SERVICE_REPORT',  'REP-',  true,  4, 'Service report, e.g. REP-2026-0005'),
  ('PAYMENT',         'PAY-',  true,  6, 'Payment receipt, e.g. PAY-2026-000001'),
  ('ENQUIRY',         'ENQ-',  false, 6, 'Website enquiry, e.g. ENQ-000123'),
  ('TECHNICIAN',      'TECH-', false, 4, 'Technician code, e.g. TECH-0003'),
  ('WEB_INTAKE',      'WEB-',  true,  6, 'Website request awaiting approval, e.g. WEB-2026-000001')
ON CONFLICT (kind) DO UPDATE
  SET prefix = EXCLUDED.prefix, per_year = EXCLUDED.per_year,
      pad = EXCLUDED.pad, description = EXCLUDED.description;

-- Reserves p_count consecutive numbers in one atomic step and returns them in order.
-- Year in India time, so numbers roll over at midnight IST on 1 January.
CREATE OR REPLACE FUNCTION public.generate_business_numbers(p_kind text, p_count integer)
RETURNS text[]
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  s      public.business_number_series%ROWTYPE;
  v_year integer;
  v_last bigint;
BEGIN
  IF p_count IS NULL OR p_count < 1 OR p_count > 1000 THEN
    RAISE EXCEPTION 'p_count must be between 1 and 1000' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM public.business_number_series WHERE kind = p_kind;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown business number kind: %', p_kind USING ERRCODE = '22023';
  END IF;

  v_year := CASE WHEN s.per_year
                 THEN extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::integer
                 ELSE 0 END;

  INSERT INTO public.business_number_counters AS c (kind, year, last_value)
  VALUES (p_kind, v_year, p_count)
  ON CONFLICT (kind, year)
  DO UPDATE SET last_value = c.last_value + p_count, updated_at = now()
  RETURNING c.last_value INTO v_last;

  RETURN ARRAY(
    SELECT s.prefix
           || CASE WHEN s.per_year THEN v_year::text || '-' ELSE '' END
           || CASE WHEN length(n::text) >= s.pad THEN n::text ELSE lpad(n::text, s.pad, '0') END
      FROM generate_series(v_last - p_count + 1, v_last) AS n
     ORDER BY n
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_business_number(p_kind text)
RETURNS text
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT (public.generate_business_numbers(p_kind, 1))[1]; $function$;

REVOKE ALL ON FUNCTION public.generate_business_numbers(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_business_number(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_business_numbers(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_business_number(text) TO service_role;

-- Start every counter after the highest number already used (never goes backwards).
DO $seed$
DECLARE
  t record;
  r record;
  s public.business_number_series%ROWTYPE;
BEGIN
  FOR t IN SELECT * FROM (VALUES
      ('SERVICE_REQUEST', 'service_requests',  'request_number'),
      ('CUSTOMER',        'customers',         'customer_code'),
      ('AMC_CONTRACT',    'amc_contracts',     'contract_number'),
      ('SCHEDULE',        'service_schedules', 'schedule_number'),
      ('PM_SCHEDULE',     'service_schedules', 'schedule_number'),
      ('SERVICE_REPORT',  'service_reports',   'report_number'),
      ('PAYMENT',         'payments',          'payment_number'),
      ('ENQUIRY',         'contact_enquiries', 'enquiry_number'),
      ('TECHNICIAN',      'technicians',       'technician_code')
    ) AS v(kind, tbl, col)
  LOOP
    IF to_regclass('public.' || t.tbl) IS NULL THEN CONTINUE; END IF;
    SELECT * INTO s FROM public.business_number_series WHERE kind = t.kind;
    FOR r IN EXECUTE format(
      CASE WHEN s.per_year THEN
        'SELECT (m[1])::int AS yr, max((m[2])::bigint) AS mx
           FROM (SELECT regexp_match(%1$I, %2$L) AS m FROM public.%3$I) q
          WHERE m IS NOT NULL GROUP BY 1'
      ELSE
        'SELECT 0 AS yr, max((m[1])::bigint) AS mx
           FROM (SELECT regexp_match(%1$I, %2$L) AS m FROM public.%3$I) q
          WHERE m IS NOT NULL HAVING count(*) > 0'
      END,
      t.col,
      CASE WHEN s.per_year THEN '^' || s.prefix || '([0-9]{4})-([0-9]{1,15})$'
           ELSE '^' || s.prefix || '([0-9]{1,15})$' END,
      t.tbl)
    LOOP
      INSERT INTO public.business_number_counters AS c (kind, year, last_value)
      VALUES (t.kind, r.yr, r.mx)
      ON CONFLICT (kind, year)
      DO UPDATE SET last_value = GREATEST(c.last_value, EXCLUDED.last_value), updated_at = now();
    END LOOP;
  END LOOP;
END;
$seed$;

-- 2. Normalised phone for duplicate matching ---------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_normalized text
  GENERATED ALWAYS AS (
    CASE WHEN length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) >= 10
         THEN right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) END
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_customers_phone_normalized
  ON public.customers (phone_normalized) WHERE phone_normalized IS NOT NULL;

-- 3. Service request integrity ------------------------------------------------------
UPDATE public.service_requests SET source_channel = 'PYS_DIRECT' WHERE source_channel IS NULL;
ALTER TABLE public.service_requests ALTER COLUMN source_channel SET DEFAULT 'PYS_DIRECT';
ALTER TABLE public.service_requests ALTER COLUMN source_channel SET NOT NULL;
ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_source_channel_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_source_channel_check
  CHECK (source_channel IN ('PYS_DIRECT', 'PHONE', 'EXTREME_SALES_SERVICES', 'CUSTOMER_PORTAL', 'WHATSAPP'));

ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_request_type_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_request_type_check
  CHECK (request_type IN (
    'BREAKDOWN', 'COMPLAINT', 'REPAIR', 'EMERGENCY', 'INSTALLATION', 'UNINSTALLATION',
    'GENERAL_SERVICE', 'INSPECTION', 'PREVENTIVE_MAINTENANCE', 'UNPLANNED_OTHER', 'OTHER'
  ));

ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS catalog_service_code text;
CREATE INDEX IF NOT EXISTS idx_service_requests_catalog_service_code
  ON public.service_requests (catalog_service_code) WHERE catalog_service_code IS NOT NULL;

-- Fails loudly (and rolls back this whole migration) if duplicates have come back.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sr_source_extref
  ON public.service_requests (source_channel, external_reference_id)
  WHERE external_reference_id IS NOT NULL;
