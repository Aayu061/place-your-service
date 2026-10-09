-- ============================================================================
-- PLACE YOUR SERVICE (PYS) — MIGRATION 20261009000000
-- AC Parent Model + Model Variants Architecture (Option 1)
-- ============================================================================

-- 1. Create ac_model_variants table
CREATE TABLE IF NOT EXISTS public.ac_model_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES public.ac_models(id) ON DELETE CASCADE,
  variant_code TEXT,
  capacity_tons NUMERIC(4, 2) NOT NULL,
  capacity_display TEXT,
  star_rating TEXT NOT NULL DEFAULT '3 Star',
  ac_type TEXT NOT NULL DEFAULT 'Split AC',
  technology TEXT NOT NULL DEFAULT 'Inverter',
  refrigerant TEXT,
  series TEXT,
  source_provenance TEXT DEFAULT 'VERIFIED_SPEC',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ac_model_variants_spec UNIQUE (model_id, capacity_tons, star_rating, ac_type, technology)
);

CREATE INDEX IF NOT EXISTS idx_ac_model_variants_model_id ON public.ac_model_variants(model_id);
CREATE INDEX IF NOT EXISTS idx_ac_model_variants_active ON public.ac_model_variants(is_active);

-- 2. Add variant_id to ac_assets (nullable for backwards compatibility)
ALTER TABLE public.ac_assets
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.ac_model_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ac_assets_variant_id ON public.ac_assets(variant_id);

-- 3. RLS for ac_model_variants
ALTER TABLE public.ac_model_variants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_model_variants' AND policyname = 'Allow authenticated read ac_model_variants') THEN
    CREATE POLICY "Allow authenticated read ac_model_variants" ON public.ac_model_variants FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_model_variants' AND policyname = 'Allow service role all ac_model_variants') THEN
    CREATE POLICY "Allow service role all ac_model_variants" ON public.ac_model_variants FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- 4. Seed initial default variants for existing 8 seed models in ac_models
INSERT INTO public.ac_model_variants (
  model_id,
  capacity_tons,
  capacity_display,
  star_rating,
  ac_type,
  technology,
  refrigerant,
  source_provenance,
  is_active
)
SELECT
  id AS model_id,
  COALESCE(capacity_tons, 1.50) AS capacity_tons,
  COALESCE(capacity_tons::TEXT || ' Tr', '1.5 Tr') AS capacity_display,
  COALESCE(rating, '3 Star') AS star_rating,
  COALESCE(ac_type, 'Split AC') AS ac_type,
  COALESCE(technology, 'Inverter') AS technology,
  refrigerant,
  'SEED_MIGRATION' AS source_provenance,
  true AS is_active
FROM public.ac_models
ON CONFLICT (model_id, capacity_tons, star_rating, ac_type, technology) DO NOTHING;
