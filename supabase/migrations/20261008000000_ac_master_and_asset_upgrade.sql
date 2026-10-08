-- ============================================================================
-- PLACE YOUR SERVICE (PYS) - MIGRATION 20261008000000
-- AC Asset Registration, ESSC Asset Identity & AC Master Data Upgrade
-- ============================================================================

-- 1. AC BRANDS MASTER TABLE
CREATE TABLE IF NOT EXISTS ac_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ac_brands_name UNIQUE (name),
  CONSTRAINT uq_ac_brands_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_ac_brands_active ON ac_brands(is_active);
CREATE INDEX IF NOT EXISTS idx_ac_brands_name ON ac_brands(name);

-- 2. AC MODELS MASTER TABLE
CREATE TABLE IF NOT EXISTS ac_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES ac_brands(id) ON DELETE RESTRICT,
  model_number TEXT NOT NULL,
  ac_type TEXT,
  technology TEXT,
  capacity_tons NUMERIC(4, 2),
  rating TEXT,
  refrigerant TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ac_models_brand_model UNIQUE (brand_id, model_number)
);

CREATE INDEX IF NOT EXISTS idx_ac_models_brand_id ON ac_models(brand_id);
CREATE INDEX IF NOT EXISTS idx_ac_models_active ON ac_models(is_active);
CREATE INDEX IF NOT EXISTS idx_ac_models_model_number ON ac_models(model_number);

-- 3. ESSC ASSET CODE SEQUENCE & ATOMIC FUNCTION
CREATE SEQUENCE IF NOT EXISTS ac_asset_code_seq START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE OR REPLACE FUNCTION generate_next_essc_code()
RETURNS TEXT AS $$
DECLARE
  next_val BIGINT;
BEGIN
  next_val := nextval('ac_asset_code_seq');
  RETURN 'ESSC-' || LPAD(next_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_next_essc_code()
RETURNS TEXT AS $$
BEGIN
  RETURN generate_next_essc_code();
END;
$$ LANGUAGE plpgsql;

-- Align sequence if any existing ESSC tags exist
SELECT setval('ac_asset_code_seq', GREATEST(1, COALESCE((
  SELECT MAX(substring(asset_tag from 6)::bigint)
  FROM ac_assets
  WHERE asset_tag ~ '^ESSC-[0-9]+$'
), 0) + 1), false);

-- Set default for ac_assets.asset_tag
ALTER TABLE ac_assets 
  ALTER COLUMN asset_tag SET DEFAULT generate_next_essc_code();

-- 4. EXTEND AC_ASSETS TABLE WITH SPECIFICATIONS & LIFECYCLE
ALTER TABLE ac_assets
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES ac_brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES ac_models(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS indoor_serial_number TEXT,
  ADD COLUMN IF NOT EXISTS outdoor_serial_number TEXT,
  ADD COLUMN IF NOT EXISTS purchase_date DATE,
  ADD COLUMN IF NOT EXISTS warranty_start_date DATE,
  ADD COLUMN IF NOT EXISTS warranty_end_date DATE,
  ADD COLUMN IF NOT EXISTS technology TEXT,
  ADD COLUMN IF NOT EXISTS star_rating TEXT,
  ADD COLUMN IF NOT EXISTS asset_status TEXT NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS asset_condition TEXT NOT NULL DEFAULT 'Good';

-- Update check constraints on warranty_status
ALTER TABLE ac_assets DROP CONSTRAINT IF EXISTS ac_assets_warranty_status_check;
ALTER TABLE ac_assets ADD CONSTRAINT ac_assets_warranty_status_check 
  CHECK (warranty_status IN ('UNDER_WARRANTY', 'EXPIRING_SOON', 'EXPIRED', 'AMC_COVERED', 'OUT_OF_WARRANTY'));

-- Relax ac_type check constraint to support expanded HVAC types
ALTER TABLE ac_assets DROP CONSTRAINT IF EXISTS ac_assets_ac_type_check;
ALTER TABLE ac_assets ADD CONSTRAINT ac_assets_ac_type_check 
  CHECK (ac_type IN (
    'SPLIT', 'WINDOW', 'CASSETTE', 'PACKAGE', 'TOWER', 'DUCTABLE', 'VRV_VRF',
    'FLOOR_STANDING', 'CEILING_SUSPENDED', 'PORTABLE', 'CENTRAL', 'VRF_SYSTEM', 
    'VRV_SYSTEM', 'AHU_FCU', 'OTHER',
    'Split AC', 'Window AC', 'Cassette AC', 'Floor Standing AC', 'Tower AC', 
    'Ductable AC', 'Ceiling Suspended AC', 'Portable AC', 'Central AC', 
    'Package AC', 'VRF System', 'VRV System', 'AHU / FCU Connected System', 'Other'
  ));

-- Add constraint for asset_status
ALTER TABLE ac_assets DROP CONSTRAINT IF EXISTS ac_assets_asset_status_check;
ALTER TABLE ac_assets ADD CONSTRAINT ac_assets_asset_status_check
  CHECK (asset_status IN ('Active', 'Under Service', 'Under Repair', 'Temporarily Inactive', 'Decommissioned', 'Replaced', 'Scrapped'));

-- Add constraint for asset_condition
ALTER TABLE ac_assets DROP CONSTRAINT IF EXISTS ac_assets_asset_condition_check;
ALTER TABLE ac_assets ADD CONSTRAINT ac_assets_asset_condition_check
  CHECK (asset_condition IN ('Excellent', 'Good', 'Fair', 'Needs Maintenance', 'Poor', 'Critical'));

-- Serial Number Uniqueness Constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_ac_assets_indoor_serial_unique 
  ON ac_assets (indoor_serial_number) 
  WHERE (indoor_serial_number IS NOT NULL AND indoor_serial_number <> '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_ac_assets_outdoor_serial_unique 
  ON ac_assets (outdoor_serial_number) 
  WHERE (outdoor_serial_number IS NOT NULL AND outdoor_serial_number <> '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_ac_assets_single_serial_unique 
  ON ac_assets (serial_number) 
  WHERE (serial_number IS NOT NULL AND serial_number <> '');

CREATE INDEX IF NOT EXISTS idx_ac_assets_brand_id ON ac_assets(brand_id);
CREATE INDEX IF NOT EXISTS idx_ac_assets_model_id ON ac_assets(model_id);
CREATE INDEX IF NOT EXISTS idx_ac_assets_asset_status ON ac_assets(asset_status);
CREATE INDEX IF NOT EXISTS idx_ac_assets_asset_condition ON ac_assets(asset_condition);

-- 5. RLS POLICIES FOR MASTER TABLES
ALTER TABLE ac_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE ac_models ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_brands' AND policyname = 'Allow authenticated read ac_brands') THEN
    CREATE POLICY "Allow authenticated read ac_brands" ON ac_brands FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_brands' AND policyname = 'Allow service role all ac_brands') THEN
    CREATE POLICY "Allow service role all ac_brands" ON ac_brands FOR ALL TO service_role USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_models' AND policyname = 'Allow authenticated read ac_models') THEN
    CREATE POLICY "Allow authenticated read ac_models" ON ac_models FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_models' AND policyname = 'Allow service role all ac_models') THEN
    CREATE POLICY "Allow service role all ac_models" ON ac_models FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- 6. SEED INITIAL BRANDS AND VERIFIED REFERENCE MODELS
INSERT INTO ac_brands (name, code, is_active) VALUES
  ('Daikin', 'DAIKIN', true),
  ('Mitsubishi Electric', 'MITSUBISHI_ELECTRIC', true),
  ('Mitsubishi Heavy', 'MITSUBISHI_HEAVY', true),
  ('Voltas', 'VOLTAS', true),
  ('Haier', 'HAIER', true),
  ('TCL', 'TCL', true),
  ('Akabishi', 'AKABISHI', true),
  ('LG', 'LG', true),
  ('Samsung', 'SAMSUNG', true),
  ('Hitachi', 'HITACHI', true),
  ('Panasonic', 'PANASONIC', true),
  ('General', 'GENERAL', true)
ON CONFLICT (name) DO UPDATE SET is_active = true, updated_at = NOW();

DO $$
DECLARE
  v_daikin_id UUID;
  v_voltas_id UUID;
  v_lg_id UUID;
BEGIN
  SELECT id INTO v_daikin_id FROM ac_brands WHERE code = 'DAIKIN';
  SELECT id INTO v_voltas_id FROM ac_brands WHERE code = 'VOLTAS';
  SELECT id INTO v_lg_id FROM ac_brands WHERE code = 'LG';

  IF v_daikin_id IS NOT NULL THEN
    INSERT INTO ac_models (brand_id, model_number, ac_type, technology, capacity_tons, rating, refrigerant, is_active)
    VALUES
      (v_daikin_id, 'FTKF50TV', 'Split AC', 'Inverter', 1.5, '5 Star', 'R32', true),
      (v_daikin_id, 'FTKF35TV', 'Split AC', 'Inverter', 1.0, '5 Star', 'R32', true),
      (v_daikin_id, 'FCQ71KAVE', 'Cassette AC', 'Inverter', 2.0, '4 Star', 'R410A', true)
    ON CONFLICT (brand_id, model_number) DO NOTHING;
  END IF;

  IF v_voltas_id IS NOT NULL THEN
    INSERT INTO ac_models (brand_id, model_number, ac_type, technology, capacity_tons, rating, refrigerant, is_active)
    VALUES
      (v_voltas_id, '185V-VECTRA', 'Split AC', 'Inverter', 1.5, '5 Star', 'R32', true),
      (v_voltas_id, '123V-VERTIS', 'Split AC', 'Inverter', 1.0, '3 Star', 'R32', true),
      (v_voltas_id, '183-DZH', 'Window AC', 'Fixed Speed', 1.5, '3 Star', 'R22', true)
    ON CONFLICT (brand_id, model_number) DO NOTHING;
  END IF;

  IF v_lg_id IS NOT NULL THEN
    INSERT INTO ac_models (brand_id, model_number, ac_type, technology, capacity_tons, rating, refrigerant, is_active)
    VALUES
      (v_lg_id, 'RS-Q19ENZE', 'Split AC', 'Inverter', 1.5, '5 Star', 'R32', true),
      (v_lg_id, 'RW-Q18WUXA', 'Window AC', 'Inverter', 1.5, '4 Star', 'R32', true)
    ON CONFLICT (brand_id, model_number) DO NOTHING;
  END IF;
END $$;
