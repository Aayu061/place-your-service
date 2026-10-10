-- ============================================================================
-- PLACE YOUR SERVICE (PYS) — MIGRATION 20261010030000
-- Admin Master Data RLS Hardening and Safe Inactive Brand Lifecycle Transition
-- ============================================================================

-- 1. Explicit Admin RLS Policies for ac_brands
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_brands' AND policyname = 'Allow admin insert ac_brands') THEN
    CREATE POLICY "Allow admin insert ac_brands" ON public.ac_brands
      FOR INSERT TO authenticated
      WITH CHECK (public.get_user_role(auth.uid()) = 'ADMIN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_brands' AND policyname = 'Allow admin update ac_brands') THEN
    CREATE POLICY "Allow admin update ac_brands" ON public.ac_brands
      FOR UPDATE TO authenticated
      USING (public.get_user_role(auth.uid()) = 'ADMIN')
      WITH CHECK (public.get_user_role(auth.uid()) = 'ADMIN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_brands' AND policyname = 'Allow admin delete ac_brands') THEN
    CREATE POLICY "Allow admin delete ac_brands" ON public.ac_brands
      FOR DELETE TO authenticated
      USING (public.get_user_role(auth.uid()) = 'ADMIN');
  END IF;
END $$;

-- 2. Explicit Admin RLS Policies for ac_models
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_models' AND policyname = 'Allow admin insert ac_models') THEN
    CREATE POLICY "Allow admin insert ac_models" ON public.ac_models
      FOR INSERT TO authenticated
      WITH CHECK (public.get_user_role(auth.uid()) = 'ADMIN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_models' AND policyname = 'Allow admin update ac_models') THEN
    CREATE POLICY "Allow admin update ac_models" ON public.ac_models
      FOR UPDATE TO authenticated
      USING (public.get_user_role(auth.uid()) = 'ADMIN')
      WITH CHECK (public.get_user_role(auth.uid()) = 'ADMIN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_models' AND policyname = 'Allow admin delete ac_models') THEN
    CREATE POLICY "Allow admin delete ac_models" ON public.ac_models
      FOR DELETE TO authenticated
      USING (public.get_user_role(auth.uid()) = 'ADMIN');
  END IF;
END $$;

-- 3. Explicit Admin RLS Policies for ac_model_variants
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_model_variants' AND policyname = 'Allow admin insert ac_model_variants') THEN
    CREATE POLICY "Allow admin insert ac_model_variants" ON public.ac_model_variants
      FOR INSERT TO authenticated
      WITH CHECK (public.get_user_role(auth.uid()) = 'ADMIN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_model_variants' AND policyname = 'Allow admin update ac_model_variants') THEN
    CREATE POLICY "Allow admin update ac_model_variants" ON public.ac_model_variants
      FOR UPDATE TO authenticated
      USING (public.get_user_role(auth.uid()) = 'ADMIN')
      WITH CHECK (public.get_user_role(auth.uid()) = 'ADMIN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ac_model_variants' AND policyname = 'Allow admin delete ac_model_variants') THEN
    CREATE POLICY "Allow admin delete ac_model_variants" ON public.ac_model_variants
      FOR DELETE TO authenticated
      USING (public.get_user_role(auth.uid()) = 'ADMIN');
  END IF;
END $$;

-- 4. Safe Deactivation of 6 Verified Zero-Reference Brands
-- Verified: General, Haier, Hitachi, TCL, Samsung, and Panasonic have 0 models, 0 variants, and 0 customer assets.
UPDATE public.ac_brands
SET is_active = FALSE, updated_at = NOW()
WHERE name IN ('General', 'Haier', 'Hitachi', 'TCL', 'Samsung', 'Panasonic')
  AND is_active = TRUE;
