-- M3: one service & AMC catalog shared by PYS and ESS.
-- * service_catalog_items  : one-off services (jet wash, gas charging, repairs, installation…)
-- * service_catalog_prices : optional price matrix per AC type × tonnage range
-- * amc_plans              : extra display columns (public code, order, visibility, SAC, legacy codes)
-- * catalog_meta           : version number that changes on every catalog edit (API ETag / cache key)
-- * service_requests.catalog_service_code → service_catalog_items(code)
-- Prices are stored EXCLUDING GST (the rate chart says "GST extra"); the API adds GST for display.
-- Idempotent; seed rows are upserted by code.

-- 1. Catalog items -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_catalog_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,40}$'),
  name               text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  short_description  text CHECK (short_description IS NULL OR length(short_description) <= 300),
  includes           text[] NOT NULL DEFAULT '{}',
  excludes           text[] NOT NULL DEFAULT '{}',
  category           text NOT NULL CHECK (category IN ('CLEANING', 'REPAIR', 'GAS', 'INSTALLATION', 'DIAGNOSIS')),
  request_type       text NOT NULL CHECK (request_type IN (
                       'BREAKDOWN', 'COMPLAINT', 'REPAIR', 'EMERGENCY', 'INSTALLATION', 'UNINSTALLATION',
                       'GENERAL_SERVICE', 'INSPECTION', 'PREVENTIVE_MAINTENANCE', 'UNPLANNED_OTHER', 'OTHER')),
  service_type       text NOT NULL CHECK (service_type IN (
                       'DRY_SERVICE', 'JET_SERVICE', 'JACKET_SERVICE', 'PUMPDOWN_SERVICE', 'DIAGNOSTIC_INSPECTION',
                       'GAS_RECHARGE', 'CAPACITOR_REPLACE', 'PCB_REPAIR', 'MOTOR_REPAIR', 'COMPRESSOR_REPAIR',
                       'WATER_LEAK_FIX', 'ELECTRICAL_FIX', 'COIL_BRAZING', 'GENERAL_REPAIR')),
  pricing_model      text NOT NULL CHECK (pricing_model IN ('FIXED', 'FROM', 'QUOTE_AFTER_DIAGNOSIS')),
  base_price         numeric(10,2) CHECK (base_price IS NULL OR base_price >= 0),
  gst_rate_percent   numeric(5,2) NOT NULL DEFAULT 18 CHECK (gst_rate_percent BETWEEN 0 AND 28),
  sac_code           text CHECK (sac_code IS NULL OR sac_code ~ '^[0-9]{4,8}$'),
  duration_minutes   integer CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 1440),
  warranty_days      integer CHECK (warranty_days IS NULL OR warranty_days BETWEEN 0 AND 3650),
  applies_to_ac_types text[] NOT NULL DEFAULT ARRAY['SPLIT','WINDOW']::text[],
  form_schema        jsonb NOT NULL DEFAULT '{"blocks":["contact","address","ac","request","consent"]}'::jsonb,
  legacy_codes       text[] NOT NULL DEFAULT '{}',
  is_public          boolean NOT NULL DEFAULT true,
  is_active          boolean NOT NULL DEFAULT true,
  display_order      integer NOT NULL DEFAULT 100,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_catalog_items_price_ck CHECK (
    (pricing_model = 'QUOTE_AFTER_DIAGNOSIS') OR base_price IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS idx_service_catalog_items_public
  ON public.service_catalog_items (category, display_order) WHERE is_active AND is_public;

-- 2. Price matrix (optional; overrides base_price for a given AC type / tonnage range) -----
CREATE TABLE IF NOT EXISTS public.service_catalog_prices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES public.service_catalog_items(id) ON DELETE CASCADE,
  ac_type      text NOT NULL CHECK (ac_type IN ('ANY', 'SPLIT', 'WINDOW', 'CASSETTE', 'TOWER', 'DUCTABLE', 'VRF')),
  tonnage_min  numeric(4,2) NOT NULL DEFAULT 0 CHECK (tonnage_min >= 0),
  tonnage_max  numeric(4,2) NOT NULL DEFAULT 99 CHECK (tonnage_max >= tonnage_min),
  price        numeric(10,2) NOT NULL CHECK (price >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, ac_type, tonnage_min, tonnage_max)
);
CREATE INDEX IF NOT EXISTS idx_service_catalog_prices_item ON public.service_catalog_prices (item_id);

-- 3. AMC plan display columns --------------------------------------------------------------
ALTER TABLE public.amc_plans
  ADD COLUMN IF NOT EXISTS public_code         text,
  ADD COLUMN IF NOT EXISTS is_public           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order       integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS applies_to_ac_types text[] NOT NULL DEFAULT ARRAY['SPLIT','WINDOW']::text[],
  ADD COLUMN IF NOT EXISTS sac_code            text,
  ADD COLUMN IF NOT EXISTS legacy_codes        text[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS uq_amc_plans_public_code
  ON public.amc_plans (public_code) WHERE public_code IS NOT NULL;
ALTER TABLE public.amc_plans DROP CONSTRAINT IF EXISTS amc_plans_public_code_ck;
ALTER TABLE public.amc_plans ADD CONSTRAINT amc_plans_public_code_ck
  CHECK (public_code IS NULL OR public_code ~ '^[A-Z0-9][A-Z0-9-]{1,40}$');

-- 4. Catalog version (bumped on any change) -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_meta (
  id         boolean PRIMARY KEY DEFAULT true CHECK (id),
  version    bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.catalog_meta (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bump_catalog_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.catalog_meta SET version = version + 1, updated_at = now() WHERE id;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.touch_catalog_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_service_catalog_items_touch ON public.service_catalog_items;
CREATE TRIGGER trg_service_catalog_items_touch BEFORE UPDATE ON public.service_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_catalog_updated_at();
DROP TRIGGER IF EXISTS trg_service_catalog_prices_touch ON public.service_catalog_prices;
CREATE TRIGGER trg_service_catalog_prices_touch BEFORE UPDATE ON public.service_catalog_prices
  FOR EACH ROW EXECUTE FUNCTION public.touch_catalog_updated_at();

DROP TRIGGER IF EXISTS trg_service_catalog_items_version ON public.service_catalog_items;
CREATE TRIGGER trg_service_catalog_items_version AFTER INSERT OR UPDATE OR DELETE ON public.service_catalog_items
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_version();
DROP TRIGGER IF EXISTS trg_service_catalog_prices_version ON public.service_catalog_prices;
CREATE TRIGGER trg_service_catalog_prices_version AFTER INSERT OR UPDATE OR DELETE ON public.service_catalog_prices
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_version();
DROP TRIGGER IF EXISTS trg_amc_plans_catalog_version ON public.amc_plans;
CREATE TRIGGER trg_amc_plans_catalog_version AFTER INSERT OR UPDATE OR DELETE ON public.amc_plans
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_version();

-- 5. Security: API (service role) only ----------------------------------------------------
ALTER TABLE public.service_catalog_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_catalog_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_meta           ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_catalog_items, public.service_catalog_prices, public.catalog_meta FROM anon, authenticated;
GRANT ALL ON public.service_catalog_items, public.service_catalog_prices, public.catalog_meta TO service_role;
REVOKE ALL ON FUNCTION public.bump_catalog_version(), public.touch_catalog_updated_at() FROM PUBLIC, anon, authenticated;

-- 6. Link service requests to the catalog -------------------------------------------------
ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_catalog_service_code_fkey;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_catalog_service_code_fkey
  FOREIGN KEY (catalog_service_code) REFERENCES public.service_catalog_items(code)
  ON UPDATE CASCADE ON DELETE SET NULL;

-- 7. Seed: one-off services (prices excl. GST; rate chart first, current site where silent) --
INSERT INTO public.service_catalog_items
  (code, name, short_description, includes, excludes, category, request_type, service_type,
   pricing_model, base_price, sac_code, duration_minutes, legacy_codes, display_order)
VALUES
  ('SVC-DRY', 'Dry service', 'Filter and coil cleaning without water wash.',
   ARRAY['Filter cleaning','Indoor coil dry cleaning','Cooling check'], ARRAY['Gas top-up','Spare parts'],
   'CLEANING', 'GENERAL_SERVICE', 'DRY_SERVICE', 'FIXED', 399, '9987', 30, '{}', 10),
  ('SVC-JET-WASH', 'Jet wash', 'High-pressure water wash of the indoor coil to remove deep dirt and grease.',
   ARRAY['Indoor coil jet wash','Filter cleaning','Drain check','Cooling check'], ARRAY['Gas top-up','Spare parts'],
   'CLEANING', 'GENERAL_SERVICE', 'JET_SERVICE', 'FIXED', 1199, '9987', 60, ARRAY['STANDALONE-JET'], 20),
  ('SVC-FOAM', 'Foam jet wash & sanitisation', 'Foam chemical clean followed by jet wash and sanitising spray.',
   ARRAY['Foam chemical clean','Jet wash','Sanitising spray'], ARRAY['Gas top-up','Spare parts'],
   'CLEANING', 'GENERAL_SERVICE', 'JET_SERVICE', 'FIXED', 999, '9987', 75, '{}', 30),
  ('SVC-PUMPDOWN', 'Pump down', 'Gas recovery and pump down, e.g. before shifting or repair.',
   ARRAY['Refrigerant recovery into the outdoor unit','Pressure check'], ARRAY['Gas top-up (charged extra if needed)'],
   'GAS', 'GENERAL_SERVICE', 'PUMPDOWN_SERVICE', 'FIXED', 1299, '9987', 45, ARRAY['STANDALONE-PUMP'], 40),
  ('SVC-GAS', 'Gas leak test & charging', 'Find and fix the leak point, then charge refrigerant to the correct pressure.',
   ARRAY['Leak test','Gas charging','Pressure and cooling check'], ARRAY['Coil replacement','Brazing of major leaks'],
   'GAS', 'REPAIR', 'GAS_RECHARGE', 'FIXED', 1850, '9987', 90, '{}', 50),
  ('SVC-INSTALL', 'Installation', 'Standard installation of a split or window AC.',
   ARRAY['Indoor and outdoor unit mounting','Standard piping connection','Test run'], ARRAY['Extra copper piping','Stand / bracket','Core cutting'],
   'INSTALLATION', 'INSTALLATION', 'GENERAL_REPAIR', 'FIXED', 1450, '9987', 120, '{}', 60),
  ('SVC-UNINSTALL', 'Uninstallation', 'Safe removal of the AC with gas pump down.',
   ARRAY['Pump down','Dismounting indoor and outdoor units'], ARRAY['Transport','Reinstallation'],
   'INSTALLATION', 'UNINSTALLATION', 'PUMPDOWN_SERVICE', 'FIXED', 800, '9987', 60, '{}', 70),
  ('SVC-DIAG', 'Diagnosis visit', 'Technician visit to find the cause: no cooling, leak, noise, tripping or smell.',
   ARRAY['Full check-up','Written findings and repair quote'], ARRAY['Repair work and parts (quoted separately)'],
   'DIAGNOSIS', 'BREAKDOWN', 'DIAGNOSTIC_INSPECTION', 'FROM', 449, '9987', 45, '{}', 80),
  ('SVC-PCB', 'PCB repair', 'Repair of the AC control board.',
   '{}', '{}', 'REPAIR', 'REPAIR', 'PCB_REPAIR', 'QUOTE_AFTER_DIAGNOSIS', NULL, '9987', NULL, '{}', 90),
  ('SVC-CAP', 'Capacitor replacement', 'Replacement of a failed fan or compressor capacitor.',
   '{}', '{}', 'REPAIR', 'REPAIR', 'CAPACITOR_REPLACE', 'QUOTE_AFTER_DIAGNOSIS', NULL, '9987', NULL, '{}', 100),
  ('SVC-FAN', 'Fan motor repair', 'Repair or replacement of the indoor or outdoor fan motor.',
   '{}', '{}', 'REPAIR', 'REPAIR', 'MOTOR_REPAIR', 'QUOTE_AFTER_DIAGNOSIS', NULL, '9987', NULL, '{}', 110),
  ('SVC-COMP', 'Compressor repair', 'Compressor diagnosis, repair or replacement.',
   '{}', '{}', 'REPAIR', 'REPAIR', 'COMPRESSOR_REPAIR', 'QUOTE_AFTER_DIAGNOSIS', NULL, '9987', NULL, '{}', 120),
  ('SVC-ELEC', 'Electrical repair', 'Tripping, wiring and power-supply faults.',
   '{}', '{}', 'REPAIR', 'REPAIR', 'ELECTRICAL_FIX', 'QUOTE_AFTER_DIAGNOSIS', NULL, '9987', NULL, '{}', 130)
ON CONFLICT (code) DO NOTHING;  -- never overwrite prices an Admin has edited

-- 8. Seed: customer-facing codes for existing AMC plans (prices and GST left unchanged) -----
UPDATE public.amc_plans p SET
  public_code = v.public_code, is_public = v.is_public, display_order = v.display_order,
  applies_to_ac_types = v.ac_types, sac_code = '9987',
  legacy_codes = (SELECT ARRAY(SELECT DISTINCT unnest(p.legacy_codes || v.legacy)))
FROM (VALUES
  ('SEMI-COMP-SPLIT',  'SAMC-1', true,  10, ARRAY['SPLIT'],          ARRAY['SEMI-COMP-SPLIT','SAMC 1']),
  ('SAMC-1-SPLIT',     'SAMC-2', true,  20, ARRAY['SPLIT'],          ARRAY['SAMC-1-SPLIT','SAMC 2']),
  ('SAMC-2-WINDOW',    'SAMC-3', true,  30, ARRAY['WINDOW'],         ARRAY['SAMC-2-WINDOW']),
  ('ORD-3-VISIT',      'ORD-3',  true,  40, ARRAY['SPLIT','WINDOW'], ARRAY['ORD-3-VISIT']),
  ('ORD-4-VISIT',      'ORD-4',  true,  50, ARRAY['SPLIT','WINDOW'], ARRAY['ORD-4-VISIT']),
  ('ORD-6-VISIT',      'ORD-6',  true,  60, ARRAY['SPLIT','WINDOW'], ARRAY['ORD-6-VISIT']),
  ('JACKET-2-SERVICE', 'JKT-2',  true,  70, ARRAY['SPLIT'],          ARRAY['JACKET-2-SERVICE']),
  ('JACKET-3-SERVICE', 'JKT-3',  true,  80, ARRAY['SPLIT'],          ARRAY['JACKET-3-SERVICE']),
  -- Pump down and jet wash are one-off services now (SVC-PUMPDOWN / SVC-JET-WASH); kept for history.
  ('STANDALONE-PUMP',  NULL,     false, 900, ARRAY['SPLIT','WINDOW'], ARRAY['STANDALONE-PUMP']),
  ('STANDALONE-JET',   NULL,     false, 910, ARRAY['SPLIT','WINDOW'], ARRAY['STANDALONE-JET'])
) AS v(plan_code, public_code, is_public, display_order, ac_types, legacy)
WHERE p.plan_code = v.plan_code;
