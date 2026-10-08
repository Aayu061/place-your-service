-- ============================================================================
-- Migration: 20261008010000_amc_renewal_and_asset_performance.sql
-- Description: Indexes and optimizations for AMC renewal and asset coverage
-- ============================================================================

-- 1. Index previous_contract_id for fast successor/predecessor lookup & renewal duplicate prevention
CREATE INDEX IF NOT EXISTS idx_amc_contracts_previous_id
  ON public.amc_contracts(previous_contract_id);

-- 2. Composite index on service_schedules for rapid visit completion progress queries
CREATE INDEX IF NOT EXISTS idx_service_schedules_amc_asset_status
  ON public.service_schedules(amc_id, asset_id, status);

-- 3. Composite index on amc_assets to optimize asset active contract resolution
CREATE INDEX IF NOT EXISTS idx_amc_assets_composite
  ON public.amc_assets(asset_id, amc_id);
