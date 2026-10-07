-- ============================================================================
-- PLACE YOUR SERVICE (PYS) - MIGRATION 20261007010000
-- Phase 5: Customer Sites & AC Asset Management Constraints and Performance Indexes
-- ============================================================================

-- 1. Enforce at most one primary site per customer at the database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_sites_single_primary 
  ON customer_sites (customer_id) 
  WHERE (is_primary = TRUE);

-- 2. Performance index for active status filtering on AC assets
CREATE INDEX IF NOT EXISTS idx_ac_assets_active 
  ON ac_assets (is_active);
