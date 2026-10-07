-- Phase 8: AMC & Preventive Maintenance Enhancements
-- Adds cancellation and tracking columns to amc_contracts and service_schedules
-- Expands status checks for contract lifecycle and preventive maintenance states
-- Seeds default AMC plans

-- 1. Enhance amc_contracts
ALTER TABLE public.amc_contracts
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS previous_contract_id UUID REFERENCES public.amc_contracts(id) ON DELETE SET NULL;

-- Expand amc_contracts status check to include DRAFT
ALTER TABLE public.amc_contracts
    DROP CONSTRAINT IF EXISTS amc_contracts_status_check;

ALTER TABLE public.amc_contracts
    ADD CONSTRAINT amc_contracts_status_check
    CHECK (status IN ('DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'CANCELLED', 'RENEWED'));

-- 2. Enhance service_schedules
ALTER TABLE public.service_schedules
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Expand service_schedules status check to include PLANNED, DUE, SKIPPED
ALTER TABLE public.service_schedules
    DROP CONSTRAINT IF EXISTS service_schedules_status_check;

ALTER TABLE public.service_schedules
    ADD CONSTRAINT service_schedules_status_check
    CHECK (status IN ('SCHEDULED', 'PLANNED', 'DUE', 'OVERDUE', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'COMPLETED', 'SKIPPED', 'CANCELLED'));

-- 3. Seed default reusable AMC plans if none exist
INSERT INTO public.amc_plans (plan_code, name, description, default_frequency, default_visits_per_year, is_active)
VALUES
    ('PLAN-BASIC', 'Basic AMC', 'Standard quarterly filter cleaning, basic coil inspection and cooling diagnostics', 'QUARTERLY', 4, true),
    ('PLAN-COMPREHENSIVE', 'Comprehensive AMC', 'Complete preventive care with monthly inspection, deep chemical wash and priority attention', 'MONTHLY', 12, true),
    ('PLAN-SEMI-ANNUAL', 'Semi-Annual AMC', 'Seasonal preventive maintenance with half-yearly deep cleaning and electrical health checks', 'HALF_YEARLY', 2, true),
    ('PLAN-ANNUAL', 'Annual Maintenance', 'Single annual comprehensive overhaul, complete coil wash and refrigerant level validation', 'YEARLY', 1, true)
ON CONFLICT (plan_code) DO NOTHING;
