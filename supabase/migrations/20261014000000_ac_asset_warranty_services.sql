-- Migration: 20261014000000_ac_asset_warranty_services.sql
-- Description: Add Warranty Service Allocation columns and reconciliation constraints to AC Assets register
-- Purpose: Records manufacturer-provided warranty service entitlements and visit-type breakdowns (Dry, Jet, Pumpdown)
--          distinct from AMC contract maintenance obligations.

-- 1. Add warranty service columns to ac_assets
ALTER TABLE public.ac_assets
  ADD COLUMN IF NOT EXISTS total_warranty_services INTEGER NULL,
  ADD COLUMN IF NOT EXISTS dry_warranty_visits INTEGER NULL,
  ADD COLUMN IF NOT EXISTS jet_warranty_visits INTEGER NULL,
  ADD COLUMN IF NOT EXISTS pumpdown_warranty_visits INTEGER NULL;

-- 2. Add individual non-negative checks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ac_assets_total_warranty_services_non_neg'
  ) THEN
    ALTER TABLE public.ac_assets
      ADD CONSTRAINT chk_ac_assets_total_warranty_services_non_neg
      CHECK (total_warranty_services IS NULL OR total_warranty_services >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ac_assets_dry_warranty_visits_non_neg'
  ) THEN
    ALTER TABLE public.ac_assets
      ADD CONSTRAINT chk_ac_assets_dry_warranty_visits_non_neg
      CHECK (dry_warranty_visits IS NULL OR dry_warranty_visits >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ac_assets_jet_warranty_visits_non_neg'
  ) THEN
    ALTER TABLE public.ac_assets
      ADD CONSTRAINT chk_ac_assets_jet_warranty_visits_non_neg
      CHECK (jet_warranty_visits IS NULL OR jet_warranty_visits >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ac_assets_pumpdown_warranty_visits_non_neg'
  ) THEN
    ALTER TABLE public.ac_assets
      ADD CONSTRAINT chk_ac_assets_pumpdown_warranty_visits_non_neg
      CHECK (pumpdown_warranty_visits IS NULL OR pumpdown_warranty_visits >= 0);
  END IF;
END $$;

-- 3. Add allocation invariant check constraint:
-- Case 1: No allocation or service count specified at all (all 4 are NULL)
-- Case 2: Total specified, breakdown unspecified (total IS NOT NULL, all 3 breakdown visits are NULL)
-- Case 3: Explicit breakdown specified (all 3 breakdown visits are NOT NULL and sum equals total_warranty_services)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ac_assets_warranty_services_allocation'
  ) THEN
    ALTER TABLE public.ac_assets
      ADD CONSTRAINT chk_ac_assets_warranty_services_allocation CHECK (
        (total_warranty_services IS NULL AND dry_warranty_visits IS NULL AND jet_warranty_visits IS NULL AND pumpdown_warranty_visits IS NULL)
        OR
        (total_warranty_services IS NOT NULL AND dry_warranty_visits IS NULL AND jet_warranty_visits IS NULL AND pumpdown_warranty_visits IS NULL)
        OR
        (total_warranty_services IS NOT NULL
         AND dry_warranty_visits IS NOT NULL
         AND jet_warranty_visits IS NOT NULL
         AND pumpdown_warranty_visits IS NOT NULL
         AND (dry_warranty_visits + jet_warranty_visits + pumpdown_warranty_visits = total_warranty_services))
      );
  END IF;
END $$;
