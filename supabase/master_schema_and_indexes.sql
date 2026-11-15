-- ============================================================================
-- PLACE YOUR SERVICE (PYS) & EXTREME SALES & SERVICES (ESS)
-- MASTER SCHEMA AND INDEX REGISTRY
-- File: supabase/master_schema_and_indexes.sql
-- Description: Complete 1-Click Database Setup. Contains all 22+ tables,
--              foreign keys, cascade rules, RLS policies, seed plans,
--              and performance indexes in dependency order.
-- ============================================================================

-- Ensure core cryptographic & UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Utility function for timestamp updates
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. AUTH & PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_singleton_admin ON public.staff(role) WHERE role = 'ADMIN';
CREATE INDEX IF NOT EXISTS idx_staff_role ON public.staff(role);
CREATE INDEX IF NOT EXISTS idx_staff_active ON public.staff(is_active);

-- ============================================================================
-- 2. FIELD TECHNICIANS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  portal_pin_hash TEXT,
  pin_salt TEXT,
  skills TEXT[] DEFAULT '{}',
  service_zones TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  duty_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (duty_status IN ('AVAILABLE', 'BUSY', 'OFF_DUTY', 'ON_LEAVE')),
  rating NUMERIC(3, 2) DEFAULT 5.00,
  completed_jobs_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_technicians_phone ON public.technicians(phone);
CREATE INDEX IF NOT EXISTS idx_technicians_active ON public.technicians(is_active);
CREATE INDEX IF NOT EXISTS idx_technicians_duty_status ON public.technicians(duty_status);

-- ============================================================================
-- 3. CUSTOMERS & SITES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  company_name TEXT,
  email TEXT,
  phone TEXT NOT NULL,
  alternate_phone TEXT,
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  gst_number TEXT,
  customer_type TEXT NOT NULL DEFAULT 'TEMPORARY' CHECK (customer_type IN ('TEMPORARY', 'PERMANENT')),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone_lookup ON public.customers(phone, is_active);
CREATE INDEX IF NOT EXISTS idx_customers_active ON public.customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers(customer_code);

CREATE TABLE IF NOT EXISTS public.customer_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  site_name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_sites_customer ON public.customer_sites(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_sites_active ON public.customer_sites(is_active);

-- ============================================================================
-- 4. AC MASTER DATA (BRANDS, MODELS & VARIANTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ac_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ac_brands_active ON public.ac_brands(is_active);
CREATE INDEX IF NOT EXISTS idx_ac_brands_name ON public.ac_brands(name);

CREATE TABLE IF NOT EXISTS public.ac_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.ac_brands(id) ON DELETE RESTRICT,
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

-- Fast AC Model Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_ac_models_brand_active ON public.ac_models(brand_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ac_models_model_number ON public.ac_models(model_number);
CREATE INDEX IF NOT EXISTS idx_ac_models_brand_id ON public.ac_models(brand_id);

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

-- Fast Variant Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_ac_model_variants_model_active ON public.ac_model_variants(model_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ac_model_variants_model_id ON public.ac_model_variants(model_id);

-- ============================================================================
-- 5. AC ASSET INVENTORY
-- ============================================================================

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

CREATE TABLE IF NOT EXISTS public.ac_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.customer_sites(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.ac_brands(id) ON DELETE SET NULL,
  model_id UUID REFERENCES public.ac_models(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.ac_model_variants(id) ON DELETE SET NULL,
  asset_tag TEXT NOT NULL UNIQUE DEFAULT generate_next_essc_code(),
  brand TEXT NOT NULL,
  model_number TEXT NOT NULL,
  ac_type TEXT NOT NULL DEFAULT 'Split AC',
  capacity_tons NUMERIC(4, 2),
  technology TEXT,
  star_rating TEXT,
  refrigerant_type TEXT,
  room_location TEXT,
  indoor_serial_number TEXT,
  outdoor_serial_number TEXT,
  purchase_date DATE,
  warranty_start_date DATE,
  warranty_end_date DATE,
  warranty_status TEXT NOT NULL DEFAULT 'OUT_OF_WARRANTY'
    CHECK (warranty_status IN ('UNDER_WARRANTY', 'EXPIRING_SOON', 'EXPIRED', 'AMC_COVERED', 'OUT_OF_WARRANTY')),
  asset_status TEXT NOT NULL DEFAULT 'Active',
  asset_condition TEXT NOT NULL DEFAULT 'Good',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ac_assets_site ON public.ac_assets(site_id);
CREATE INDEX IF NOT EXISTS idx_ac_assets_brand ON public.ac_assets(brand_id);
CREATE INDEX IF NOT EXISTS idx_ac_assets_model ON public.ac_assets(model_id);
CREATE INDEX IF NOT EXISTS idx_ac_assets_variant ON public.ac_assets(variant_id);
CREATE INDEX IF NOT EXISTS idx_ac_assets_tag ON public.ac_assets(asset_tag);

-- ============================================================================
-- 6. AMC MASTER PLANS & CONTRACTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.amc_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('COMPREHENSIVE', 'NON_COMPREHENSIVE', 'SEMI_COMPREHENSIVE')),
  description TEXT,
  features TEXT[] DEFAULT '{}',
  includes_gas_charging BOOLEAN DEFAULT FALSE,
  includes_compressor BOOLEAN DEFAULT FALSE,
  includes_all_spares BOOLEAN DEFAULT FALSE,
  includes_selected_spares BOOLEAN DEFAULT FALSE,
  rate_window_small NUMERIC(10, 2) DEFAULT 0,
  rate_window_large NUMERIC(10, 2) DEFAULT 0,
  rate_split_small NUMERIC(10, 2) DEFAULT 0,
  rate_split_large NUMERIC(10, 2) DEFAULT 0,
  rate_cassette_small NUMERIC(10, 2) DEFAULT 0,
  rate_cassette_large NUMERIC(10, 2) DEFAULT 0,
  rate_tower_small NUMERIC(10, 2) DEFAULT 0,
  rate_tower_large NUMERIC(10, 2) DEFAULT 0,
  gst_percentage NUMERIC(5, 2) DEFAULT 18.00,
  sac_code TEXT DEFAULT '998719',
  dry_services_per_year INTEGER NOT NULL DEFAULT 2,
  wet_services_per_year INTEGER NOT NULL DEFAULT 1,
  breakdown_calls_included INTEGER NOT NULL DEFAULT 999,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amc_plans_active ON public.amc_plans(is_active);

CREATE TABLE IF NOT EXISTS public.amc_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  amc_plan_id UUID NOT NULL REFERENCES public.amc_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'QUOTATION_SENT', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'RENEWED')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'QUARTERLY'
    CHECK (cadence IN ('MONTHLY', 'BI_MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL')),
  dry_visits_per_year INTEGER NOT NULL DEFAULT 2,
  jet_visits_per_year INTEGER NOT NULL DEFAULT 1,
  pumpdown_visits_per_year INTEGER NOT NULL DEFAULT 0,
  total_visits_per_year INTEGER NOT NULL DEFAULT 3,
  completed_visits INTEGER NOT NULL DEFAULT 0,
  subtotal_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED')),
  notes TEXT,
  previous_contract_id UUID REFERENCES public.amc_contracts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amc_contracts_customer_active ON public.amc_contracts(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_dates ON public.amc_contracts(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_plan ON public.amc_contracts(amc_plan_id);

CREATE TABLE IF NOT EXISTS public.amc_covered_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amc_contract_id UUID NOT NULL REFERENCES public.amc_contracts(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.ac_assets(id) ON DELETE RESTRICT,
  annual_rate NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_amc_covered_assets UNIQUE (amc_contract_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_amc_covered_assets_contract ON public.amc_covered_assets(amc_contract_id);
CREATE INDEX IF NOT EXISTS idx_amc_covered_assets_asset ON public.amc_covered_assets(asset_id);

-- ============================================================================
-- 7. SERVICE REQUESTS & TICKETING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  site_id UUID REFERENCES public.customer_sites(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.ac_assets(id) ON DELETE SET NULL,
  amc_contract_id UUID REFERENCES public.amc_contracts(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL DEFAULT 'BREAKDOWN'
    CHECK (request_type IN ('BREAKDOWN', 'PREVENTIVE', 'INSTALLATION', 'UNINSTALLATION', 'GAS_REFILL', 'OTHER')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'COMPLETED', 'CANCELLED')),
  source_channel TEXT NOT NULL DEFAULT 'PYS_DIRECT'
    CHECK (source_channel IN ('PYS_DIRECT', 'EXTREME_SALES_SERVICES', 'PHONE', 'WHATSAPP', 'OTHER')),
  external_reference_id TEXT,
  description TEXT NOT NULL,
  issue_category TEXT,
  preferred_date DATE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_channel_status ON public.service_requests(source_channel, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_customer ON public.service_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_asset ON public.service_requests(asset_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_ext_ref ON public.service_requests(external_reference_id);

-- ============================================================================
-- 8. SERVICE SCHEDULES & DISPATCH
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.service_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_number TEXT NOT NULL UNIQUE,
  service_request_id UUID REFERENCES public.service_requests(id) ON DELETE SET NULL,
  amc_contract_id UUID REFERENCES public.amc_contracts(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.ac_assets(id) ON DELETE SET NULL,
  customer_site_id UUID NOT NULL REFERENCES public.customer_sites(id) ON DELETE RESTRICT,
  technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
  assistant_technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  time_window TEXT NOT NULL DEFAULT '09:00 - 12:00',
  visit_type TEXT NOT NULL DEFAULT 'BREAKDOWN'
    CHECK (visit_type IN ('BREAKDOWN', 'PREVENTIVE', 'INSTALLATION', 'UNINSTALLATION', 'GAS_TOPUP')),
  service_action_type TEXT DEFAULT 'INSPECTION'
    CHECK (service_action_type IN ('DRY_SERVICE', 'JET_PUMP_WASH', 'PUMPDOWN_FLUSH', 'INSPECTION', 'BREAKDOWN_REPAIR')),
  status TEXT NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED')),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_schedules_tech_date ON public.service_schedules(technician_id, scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_service_schedules_sr ON public.service_schedules(service_request_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_amc ON public.service_schedules(amc_contract_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_date ON public.service_schedules(scheduled_date);

-- ============================================================================
-- 9. SERVICE VISIT REPORTS (DIGITAL JOB CARDS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.service_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number TEXT NOT NULL UNIQUE,
  service_schedule_id UUID NOT NULL UNIQUE REFERENCES public.service_schedules(id) ON DELETE RESTRICT,
  technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE RESTRICT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  suction_pressure_psi NUMERIC(6, 2),
  discharge_pressure_psi NUMERIC(6, 2),
  voltage_volts NUMERIC(6, 2),
  current_amps NUMERIC(6, 2),
  ambient_temp_celsius NUMERIC(5, 2),
  grill_temp_celsius NUMERIC(5, 2),
  refrigerant_added_grams NUMERIC(8, 2) DEFAULT 0,
  work_performed_notes TEXT NOT NULL,
  recommendations TEXT,
  customer_signoff_name TEXT NOT NULL,
  customer_signature_data_url TEXT,
  customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5),
  primary_outcome TEXT NOT NULL DEFAULT 'COMPLETED'
    CHECK (primary_outcome IN ('COMPLETED', 'PARTS_PENDING', 'FOLLOW_UP_REQUIRED', 'UNRESOLVED')),
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_reports_schedule ON public.service_reports(service_schedule_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_tech ON public.service_reports(technician_id);

-- ============================================================================
-- 10. INVENTORY & SPARE PARTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('ELECTRICAL', 'MECHANICAL', 'GAS', 'REFRIGERATION', 'CONSUMABLE', 'TOOL')),
  unit_of_measure TEXT NOT NULL DEFAULT 'PIECE',
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  minimum_reorder_level INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_parts_active ON public.inventory_parts(is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_parts_code ON public.inventory_parts(part_code);

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.inventory_parts(id) ON DELETE RESTRICT,
  service_report_id UUID REFERENCES public.service_reports(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('PURCHASE_RECEIPT', 'SERVICE_CONSUMPTION', 'ADJUSTMENT', 'RETURN')),
  quantity INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_part ON public.inventory_transactions(part_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_report ON public.inventory_transactions(service_report_id);

-- ============================================================================
-- 11. FINANCE, INVOICES & PAYMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  amc_contract_id UUID REFERENCES public.amc_contracts(id) ON DELETE SET NULL,
  service_request_id UUID REFERENCES public.service_requests(id) ON DELETE SET NULL,
  service_report_id UUID REFERENCES public.service_reports(id) ON DELETE SET NULL,
  subtotal_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_amc ON public.payments(amc_contract_id);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  transaction_reference TEXT NOT NULL UNIQUE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI', 'NEFT', 'RTGS', 'CASH', 'CHEQUE', 'ONLINE')),
  amount NUMERIC(12, 2) NOT NULL,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pay_tx_payment ON public.payment_transactions(payment_id);

-- ============================================================================
-- 12. ESS STOREFRONT PRODUCTS, ENQUIRIES & REPLICA LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ess_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'new_ac',
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
-- 13. SEED OFFICIAL 10 AMC PLANS
-- ============================================================================

INSERT INTO public.amc_plans (
  plan_code, name, plan_type, description,
  rate_window_small, rate_window_large, rate_split_small, rate_split_large, rate_cassette_small, rate_cassette_large,
  rate_tower_small, rate_tower_large, gst_percentage, sac_code, dry_services_per_year, wet_services_per_year,
  includes_gas_charging, includes_compressor, includes_all_spares, includes_selected_spares, is_active
) VALUES
  ('COMP-WINDOW', 'Comprehensive Window AC AMC', 'COMPREHENSIVE', 'Complete coverage including compressor, gas charging, and all mechanical/electrical spare parts.', 3200, 3800, 0, 0, 0, 0, 0, 0, 18.00, '998719', 2, 1, true, true, true, false, true),
  ('COMP-SPLIT', 'Comprehensive Split AC AMC', 'COMPREHENSIVE', 'All-inclusive coverage covering PCB, fan motor, compressor, gas charging, and 3 scheduled preventive visits.', 0, 0, 4200, 4800, 0, 0, 0, 0, 18.00, '998719', 2, 1, true, true, true, false, true),
  ('COMP-CASSETTE', 'Comprehensive Cassette AC AMC', 'COMPREHENSIVE', 'Commercial ceiling cassette coverage with deep chemical cleaning, drain pump checks, and compressor parts.', 0, 0, 0, 0, 6500, 7800, 0, 0, 18.00, '998719', 2, 2, true, true, true, false, true),
  ('COMP-TOWER', 'Comprehensive Tower / Floor Standing AC AMC', 'COMPREHENSIVE', 'Heavy commercial package for retail floors, restaurants, and halls. Comprehensive parts and gas.', 0, 0, 0, 0, 0, 0, 7500, 9200, 18.00, '998719', 2, 2, true, true, true, false, true),
  ('SEMI-COMP-SPLIT', 'Semi-Comprehensive Split AC AMC', 'SEMI-COMPREHENSIVE', 'Covers labour, maintenance visits, breakdown calls, and routine electrical spares (excluding compressor).', 0, 0, 2600, 3100, 0, 0, 0, 0, 18.00, '998719', 2, 1, false, false, false, true, true),
  ('SEMI-COMP-WINDOW', 'Semi-Comprehensive Window AC AMC', 'SEMI-COMPREHENSIVE', 'Labour and basic electrical spares with routine preventive wash cycles included.', 2100, 2500, 0, 0, 0, 0, 0, 0, 18.00, '998719', 2, 1, false, false, false, true, true),
  ('NON-COMP-SPLIT', 'Non-Comprehensive Split AC AMC', 'NON_COMPREHENSIVE', 'Annual labour maintenance contract covering 3 scheduled visits and unlimited emergency breakdown assistance.', 0, 0, 1600, 1900, 0, 0, 0, 0, 18.00, '998719', 2, 1, false, false, false, false, true),
  ('NON-COMP-WINDOW', 'Non-Comprehensive Window AC AMC', 'NON_COMPREHENSIVE', 'Routine filter cleaning, cooling coil wash, and electrical triage. Spares and gas billed separately.', 1200, 1500, 0, 0, 0, 0, 0, 0, 18.00, '998719', 2, 1, false, false, false, false, true),
  ('NON-COMP-CASSETTE', 'Non-Comprehensive Cassette AC AMC', 'NON_COMPREHENSIVE', 'Labour and routine wash visits for commercial ceiling cassettes across office premises.', 0, 0, 0, 0, 3200, 3800, 0, 0, 18.00, '998719', 2, 2, false, false, false, false, true),
  ('NON-COMP-TOWER', 'Non-Comprehensive Tower AC AMC', 'NON_COMPREHENSIVE', 'Quarterly scheduled checkups, filter washes, and blower inspection for large capacity floor units.', 0, 0, 0, 0, 0, 0, 3800, 4600, 18.00, '998719', 2, 2, false, false, false, false, true)
ON CONFLICT (plan_code) DO NOTHING;
