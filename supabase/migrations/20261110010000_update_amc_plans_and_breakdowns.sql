-- ============================================================================
-- Migration: 20261110010000_update_amc_plans_and_breakdowns.sql
-- Purpose:
--   1. Seed Extreme Sales & Services official rate chart (8 AMC plans + 2 standalone services)
--   2. Expand frequency check constraints for AMC plans and contracts
--   3. Add comprehensive rate metadata and pricing tier columns to amc_plans
--   4. Safely deactivate legacy generic plans without breaking historical relations
--   5. Expand planned_service_type and performed_service_type constraints for real breakdown repairs
--   6. Add issue_category to service_requests for breakdown symptom classification
-- ============================================================================

-- 1. Expand frequency constraints
ALTER TABLE public.amc_plans DROP CONSTRAINT IF EXISTS amc_plans_default_frequency_check;
ALTER TABLE public.amc_plans ADD CONSTRAINT amc_plans_default_frequency_check
  CHECK (default_frequency IN ('MONTHLY', 'BI_MONTHLY', 'QUARTERLY', 'FOUR_MONTHLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM', 'ON_DEMAND'));

ALTER TABLE public.amc_contracts DROP CONSTRAINT IF EXISTS amc_contracts_frequency_check;
ALTER TABLE public.amc_contracts ADD CONSTRAINT amc_contracts_frequency_check
  CHECK (frequency IN ('MONTHLY', 'BI_MONTHLY', 'QUARTERLY', 'FOUR_MONTHLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM', 'ON_DEMAND'));

-- 2. Add rich rate card columns to amc_plans
ALTER TABLE public.amc_plans
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'ORDINARY',
  ADD COLUMN IF NOT EXISTS coverage_summary TEXT,
  ADD COLUMN IF NOT EXISTS pricing_model TEXT NOT NULL DEFAULT 'TIERED_TONNAGE',
  ADD COLUMN IF NOT EXISTS rate_split_small NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS rate_split_large NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS rate_window_small NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS rate_window_large NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS rate_flat NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS gst_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS max_equipment_age_years INTEGER,
  ADD COLUMN IF NOT EXISTS has_gas_charging BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_spare_parts BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_unlimited_complaints BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rate_metadata JSONB;

-- 3. Safely deactivate legacy generic plans
UPDATE public.amc_plans
SET is_active = FALSE
WHERE plan_code IN ('PLAN-BASIC', 'PLAN-COMPREHENSIVE', 'PLAN-SEMI-ANNUAL', 'PLAN-ANNUAL');

-- 4. Seed Extreme Sales & Services Official 8 Plans + 2 Standalone Services
INSERT INTO public.amc_plans (
  plan_code, name, category, description, coverage_summary,
  default_frequency, default_visits_per_year, pricing_model,
  rate_split_small, rate_split_large, rate_window_small, rate_window_large, rate_flat,
  gst_rate_percent, max_equipment_age_years, has_gas_charging, has_spare_parts, has_unlimited_complaints,
  is_active
) VALUES
  (
    'SEMI-COMP-SPLIT',
    'Semi-Comprehensive AMC (Non-Inverter Split)',
    'SEMI_COMPREHENSIVE',
    'Includes 4 routine services, unlimited complaints attend, capacitor replacement, motor winding, and PCB repair (refrigerant gas charging excluded).',
    '4 Services, Unlimited Complaints, Capacitor, Motor Winding & PCB Repair (No Gas)',
    'QUARTERLY',
    4,
    'TIERED_TONNAGE',
    2999.00,
    3999.00,
    NULL,
    NULL,
    NULL,
    0.00,
    NULL,
    FALSE,
    TRUE,
    TRUE,
    TRUE
  ),
  (
    'SAMC-1-SPLIT',
    'Special Comprehensive AMC (SAMC 1) - Split',
    'SPECIAL_COMPREHENSIVE',
    'Special comprehensive protection for Split ACs under 3 years old. Includes 4 services, unlimited complaints, capacitor, PCB repair, motor winding, and gas charging.',
    '4 Services, Unlimited Complaints, Capacitor, PCB Repair, Motor Winding & Gas Charging Included',
    'QUARTERLY',
    4,
    'TIERED_TONNAGE',
    4499.00,
    5499.00,
    NULL,
    NULL,
    NULL,
    28.00,
    3,
    TRUE,
    TRUE,
    TRUE,
    TRUE
  ),
  (
    'SAMC-2-WINDOW',
    'Special Comprehensive AMC (SAMC 2) - Window',
    'SPECIAL_COMPREHENSIVE',
    'Special comprehensive protection for Window ACs under 3 years old. Includes 4 services, unlimited complaints, capacitor, PCB repair, motor winding, and gas charging.',
    '4 Services, Unlimited Complaints, Capacitor, PCB Repair, Motor Winding & Gas Charging Included',
    'QUARTERLY',
    4,
    'TIERED_TONNAGE',
    NULL,
    NULL,
    3499.00,
    4499.00,
    NULL,
    28.00,
    3,
    TRUE,
    TRUE,
    TRUE,
    TRUE
  ),
  (
    'ORD-3-VISIT',
    'Ordinary AMC (3 Services / Visits)',
    'ORDINARY',
    'Standard non-comprehensive routine care with 3 scheduled visits per year across 4-month intervals.',
    '3 Scheduled Services / Visits per Year',
    'FOUR_MONTHLY',
    3,
    'TIERED_TONNAGE',
    1500.00,
    1500.00,
    1000.00,
    1000.00,
    NULL,
    0.00,
    NULL,
    FALSE,
    FALSE,
    FALSE,
    TRUE
  ),
  (
    'ORD-4-VISIT',
    'Ordinary AMC (4 Services + Complaints)',
    'ORDINARY',
    'Quarterly maintenance with 4 scheduled services and unlimited normal complaints. Window units include 1 wet wash.',
    '4 Services & Unlimited Normal Complaints (Window Includes 1 Wet Wash)',
    'QUARTERLY',
    4,
    'TIERED_TONNAGE',
    1800.00,
    1800.00,
    1300.00,
    1300.00,
    NULL,
    0.00,
    NULL,
    FALSE,
    FALSE,
    TRUE,
    TRUE
  ),
  (
    'ORD-6-VISIT',
    'Ordinary AMC (6 Services / Bi-Monthly)',
    'ORDINARY',
    'Bi-monthly high-cadence maintenance with 6 scheduled services and unlimited normal complaints. Window units include 1 wet wash.',
    '6 Services & Unlimited Normal Complaints (Window Includes 1 Wet Wash)',
    'BI_MONTHLY',
    6,
    'TIERED_TONNAGE',
    2200.00,
    2200.00,
    1700.00,
    1700.00,
    NULL,
    0.00,
    NULL,
    FALSE,
    FALSE,
    TRUE,
    TRUE
  ),
  (
    'JACKET-2-SERVICE',
    'Premium Jacket AMC (2 Services)',
    'PREMIUM_JACKET',
    'Deep clean jacket wash preventive care. Includes 2 jacket chemical cleans and unlimited breakdown complaint attendance.',
    '2 Jacket Deep Cleaning Services & Unlimited Complaints',
    'HALF_YEARLY',
    2,
    'FLAT_PER_UNIT',
    NULL,
    NULL,
    NULL,
    NULL,
    2599.00,
    0.00,
    NULL,
    FALSE,
    FALSE,
    TRUE,
    TRUE
  ),
  (
    'JACKET-3-SERVICE',
    'Premium Jacket AMC (3 Services)',
    'PREMIUM_JACKET',
    'Maximum preventive care with 3 jacket deep chemical wash services per year and unlimited complaint attendance.',
    '3 Jacket Deep Cleaning Services & Unlimited Complaints',
    'FOUR_MONTHLY',
    3,
    'FLAT_PER_UNIT',
    NULL,
    NULL,
    NULL,
    NULL,
    3599.00,
    0.00,
    NULL,
    FALSE,
    FALSE,
    TRUE,
    TRUE
  ),
  (
    'STANDALONE-PUMP',
    'Pump Down Service (Overhaul)',
    'STANDALONE',
    'Refrigerant gas recovery, system pump down, and indoor/outdoor unit dismounting or relocation (gas top-up extra if required).',
    'Pump Down Refrigerant Recovery Service',
    'ON_DEMAND',
    1,
    'FLAT_PER_UNIT',
    NULL,
    NULL,
    NULL,
    NULL,
    1299.00,
    0.00,
    NULL,
    FALSE,
    FALSE,
    FALSE,
    TRUE
  ),
  (
    'STANDALONE-JET',
    'Jet Wash Service (High-Pressure Deep Clean)',
    'STANDALONE',
    'High-pressure motorized wet pump coil wash for deep dirt and grease elimination.',
    'High-Pressure Jet Wash Deep Clean Service',
    'ON_DEMAND',
    1,
    'FLAT_PER_UNIT',
    NULL,
    NULL,
    NULL,
    NULL,
    1199.00,
    0.00,
    NULL,
    FALSE,
    FALSE,
    FALSE,
    TRUE
  )
ON CONFLICT (plan_code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  coverage_summary = EXCLUDED.coverage_summary,
  default_frequency = EXCLUDED.default_frequency,
  default_visits_per_year = EXCLUDED.default_visits_per_year,
  pricing_model = EXCLUDED.pricing_model,
  rate_split_small = EXCLUDED.rate_split_small,
  rate_split_large = EXCLUDED.rate_split_large,
  rate_window_small = EXCLUDED.rate_window_small,
  rate_window_large = EXCLUDED.rate_window_large,
  rate_flat = EXCLUDED.rate_flat,
  gst_rate_percent = EXCLUDED.gst_rate_percent,
  max_equipment_age_years = EXCLUDED.max_equipment_age_years,
  has_gas_charging = EXCLUDED.has_gas_charging,
  has_spare_parts = EXCLUDED.has_spare_parts,
  has_unlimited_complaints = EXCLUDED.has_unlimited_complaints,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 5. Expand planned_service_type & performed_service_type constraints for real breakdown repairs
ALTER TABLE public.service_schedules DROP CONSTRAINT IF EXISTS service_schedules_planned_service_type_check;
ALTER TABLE public.service_schedules ADD CONSTRAINT service_schedules_planned_service_type_check
  CHECK (planned_service_type IS NULL OR planned_service_type IN (
    -- PM Types
    'DRY_SERVICE', 'JET_SERVICE', 'JACKET_SERVICE', 'PUMPDOWN_SERVICE',
    -- Breakdown & Repair Types
    'DIAGNOSTIC_INSPECTION', 'GAS_RECHARGE', 'CAPACITOR_REPLACE',
    'PCB_REPAIR', 'MOTOR_REPAIR', 'COMPRESSOR_REPAIR',
    'WATER_LEAK_FIX', 'ELECTRICAL_FIX', 'COIL_BRAZING', 'GENERAL_REPAIR'
  ));

ALTER TABLE public.service_reports DROP CONSTRAINT IF EXISTS service_reports_planned_service_type_check;
ALTER TABLE public.service_reports ADD CONSTRAINT service_reports_planned_service_type_check
  CHECK (planned_service_type IS NULL OR planned_service_type IN (
    -- PM Types
    'DRY_SERVICE', 'JET_SERVICE', 'JACKET_SERVICE', 'PUMPDOWN_SERVICE',
    -- Breakdown & Repair Types
    'DIAGNOSTIC_INSPECTION', 'GAS_RECHARGE', 'CAPACITOR_REPLACE',
    'PCB_REPAIR', 'MOTOR_REPAIR', 'COMPRESSOR_REPAIR',
    'WATER_LEAK_FIX', 'ELECTRICAL_FIX', 'COIL_BRAZING', 'GENERAL_REPAIR'
  ));

ALTER TABLE public.service_reports DROP CONSTRAINT IF EXISTS service_reports_performed_service_type_check;
ALTER TABLE public.service_reports ADD CONSTRAINT service_reports_performed_service_type_check
  CHECK (performed_service_type IS NULL OR performed_service_type IN (
    -- PM Types
    'DRY_SERVICE', 'JET_SERVICE', 'JACKET_SERVICE', 'PUMPDOWN_SERVICE',
    -- Breakdown & Repair Types
    'DIAGNOSTIC_INSPECTION', 'GAS_RECHARGE', 'CAPACITOR_REPLACE',
    'PCB_REPAIR', 'MOTOR_REPAIR', 'COMPRESSOR_REPAIR',
    'WATER_LEAK_FIX', 'ELECTRICAL_FIX', 'COIL_BRAZING', 'GENERAL_REPAIR'
  ));

-- 6. Add issue_category to service_requests for breakdown symptoms
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS issue_category TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_service_requests_issue_category
  ON public.service_requests(issue_category)
  WHERE issue_category IS NOT NULL;

