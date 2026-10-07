-- ============================================================================
-- PLACE YOUR SERVICE (PYS) — PHASE 6: SERVICE REQUEST MANAGEMENT MIGRATION
-- Migration: 20261007020000_service_request_management.sql
-- Description: Enhances service_requests table with notes, cancellation tracking,
--              flexible request types and priorities, and performance indexes.
-- ============================================================================

-- 1. Add operational tracking columns to service_requests
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. Update priority check constraint to support URGENT alongside EMERGENCY
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_priority_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_priority_check 
  CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'EMERGENCY'));

-- 3. Update request_type check constraint to support common service categories
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_request_type_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_request_type_check 
  CHECK (request_type IN (
    'BREAKDOWN',
    'COMPLAINT',
    'REPAIR',
    'EMERGENCY',
    'INSTALLATION',
    'GENERAL_SERVICE',
    'INSPECTION',
    'PREVENTIVE_MAINTENANCE',
    'UNPLANNED_OTHER',
    'OTHER'
  ));

-- 4. Create performance indexes for relational lookups & listing queries
CREATE INDEX IF NOT EXISTS idx_service_requests_site ON service_requests(site_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_asset ON service_requests(asset_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_created_at ON service_requests(created_at DESC);
