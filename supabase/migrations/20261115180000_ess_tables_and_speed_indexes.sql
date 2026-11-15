-- ============================================================================
-- PLACE YOUR SERVICE (PYS) & EXTREME SALES & SERVICES (ESS)
-- MIGRATION: 20261115180000_ess_tables_and_speed_indexes.sql
-- Description: Storefront product catalog, customer enquiries, backup logging,
--              and high-performance composite indexes for AC model selection.
-- ============================================================================

-- 1. ESS STOREFRONT PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.ess_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'new_ac', -- 'new_ac', 'commercial', 'spare_parts', 'used_ac'
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_display TEXT,
  stock INTEGER NOT NULL DEFAULT 10,
  in_stock BOOLEAN NOT NULL DEFAULT true,
  brand TEXT,
  model_number TEXT,
  tonnage TEXT,
  star_rating TEXT,
  condition TEXT DEFAULT 'Brand New',
  description TEXT,
  cooling_capacity TEXT,
  power_consumption TEXT,
  refrigerant TEXT,
  noise_level TEXT,
  dimensions TEXT,
  warranty TEXT,
  key_features TEXT[] DEFAULT '{}',
  image_url TEXT,
  is_custom_quote BOOLEAN DEFAULT false,
  space_type TEXT DEFAULT 'all',
  ideal_for TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ess_products_category ON public.ess_products(category, in_stock);
CREATE INDEX IF NOT EXISTS idx_ess_products_brand ON public.ess_products(brand);

-- 2. CUSTOMER CONTACT ENQUIRIES TABLE
CREATE TABLE IF NOT EXISTS public.contact_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_number TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  service_type TEXT,
  subject TEXT,
  message TEXT,
  source_channel TEXT NOT NULL DEFAULT 'EXTREME_SALES_SERVICES',
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'RESOLVED', 'SPAM')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_enquiries_status ON public.contact_enquiries(status);
CREATE INDEX IF NOT EXISTS idx_contact_enquiries_phone ON public.contact_enquiries(phone);
CREATE INDEX IF NOT EXISTS idx_contact_enquiries_source ON public.contact_enquiries(source_channel);

-- 3. DATABASE REPLICA & BACKUPS LOG TABLE
CREATE TABLE IF NOT EXISTS public.database_backups_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('json', 'sql')),
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  tables_count INTEGER NOT NULL DEFAULT 0,
  total_records INTEGER NOT NULL DEFAULT 0,
  checksum_sha256 TEXT,
  created_by TEXT DEFAULT 'SYSTEM',
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_database_backups_log_created ON public.database_backups_log(created_at DESC);

-- ============================================================================
-- 4. PERFORMANCE ACCELERATION COMPOUND INDEXES (< 2ms queries)
-- ============================================================================

-- Fast AC Model lookup by brand & active status
CREATE INDEX IF NOT EXISTS idx_ac_models_brand_active ON public.ac_models(brand_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ac_models_model_number ON public.ac_models(model_number);

-- Fast AC Model Variant lookup by parent model & active status
CREATE INDEX IF NOT EXISTS idx_ac_model_variants_model_active ON public.ac_model_variants(model_id, is_active);

-- Fast Customer Phone Lookup
CREATE INDEX IF NOT EXISTS idx_customers_phone_lookup ON public.customers(phone, is_active);

-- Fast Service Requests by Source Channel & Status
CREATE INDEX IF NOT EXISTS idx_service_requests_channel_status ON public.service_requests(source_channel, status, created_at DESC);

-- Fast Service Schedules by Technician & Date
CREATE INDEX IF NOT EXISTS idx_service_schedules_tech_date ON public.service_schedules(technician_id, scheduled_date, status);

-- Fast AMC Contract Active Status Lookup
CREATE INDEX IF NOT EXISTS idx_amc_contracts_customer_active ON public.amc_contracts(customer_id, status);

-- ============================================================================
-- 5. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.ess_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_backups_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- ess_products: Public read, Authenticated & Service Role manage
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ess_products' AND policyname = 'Public read ess_products') THEN
    CREATE POLICY "Public read ess_products" ON public.ess_products FOR SELECT TO anon, authenticated, service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ess_products' AND policyname = 'Service role all ess_products') THEN
    CREATE POLICY "Service role all ess_products" ON public.ess_products FOR ALL TO service_role USING (true);
  END IF;

  -- contact_enquiries: Public insert, Authenticated/Service Role read & manage
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_enquiries' AND policyname = 'Public insert contact_enquiries') THEN
    CREATE POLICY "Public insert contact_enquiries" ON public.contact_enquiries FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_enquiries' AND policyname = 'Authenticated select contact_enquiries') THEN
    CREATE POLICY "Authenticated select contact_enquiries" ON public.contact_enquiries FOR SELECT TO authenticated, service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_enquiries' AND policyname = 'Service role all contact_enquiries') THEN
    CREATE POLICY "Service role all contact_enquiries" ON public.contact_enquiries FOR ALL TO service_role USING (true);
  END IF;

  -- database_backups_log: Service Role all
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'database_backups_log' AND policyname = 'Service role all database_backups_log') THEN
    CREATE POLICY "Service role all database_backups_log" ON public.database_backups_log FOR ALL TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'database_backups_log' AND policyname = 'Authenticated select database_backups_log') THEN
    CREATE POLICY "Authenticated select database_backups_log" ON public.database_backups_log FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
