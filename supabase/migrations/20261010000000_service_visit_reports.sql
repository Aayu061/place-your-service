-- ============================================================================
-- Migration: 20261010000000_service_visit_reports.sql
-- Description: Service Visit Report & Completion Management Module
--              Supports AMC Preventive Maintenance visits & Service Request visits
--              Manually entered unique report numbers
--              Primary outcomes: COMPLETED, PENDING_PARTS, PENDING_REPAIRS
--              Per-asset reporting & Parts/Repairs follow-up requirements
-- ============================================================================

-- 1. Upgrade service_reports header table
ALTER TABLE service_reports
  ADD COLUMN IF NOT EXISTS visit_type TEXT NOT NULL DEFAULT 'SERVICE_REQUEST'
    CHECK (visit_type IN ('PREVENTIVE', 'SERVICE_REQUEST')),
  ADD COLUMN IF NOT EXISTS amc_id UUID REFERENCES amc_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pm_obligation_id UUID REFERENCES service_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES customer_sites(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS start_time TEXT,
  ADD COLUMN IF NOT EXISTS end_time TEXT,
  ADD COLUMN IF NOT EXISTS primary_outcome TEXT NOT NULL DEFAULT 'COMPLETED'
    CHECK (primary_outcome IN ('COMPLETED', 'PENDING_PARTS', 'PENDING_REPAIRS')),
  ADD COLUMN IF NOT EXISTS technician_remarks TEXT,
  ADD COLUMN IF NOT EXISTS customer_representative TEXT,
  ADD COLUMN IF NOT EXISTS customer_acknowledgement TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_schedule_id UUID REFERENCES service_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Make work_description optional if not already, allowing summary or asset-level details
ALTER TABLE service_reports ALTER COLUMN work_description DROP NOT NULL;

-- Create indexes on service_reports for high-performance lookup & filtering
CREATE INDEX IF NOT EXISTS idx_service_reports_number ON service_reports(report_number);
CREATE INDEX IF NOT EXISTS idx_service_reports_schedule ON service_reports(service_schedule_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_sr ON service_reports(service_request_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_amc ON service_reports(amc_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_customer ON service_reports(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_site ON service_reports(site_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_outcome ON service_reports(primary_outcome);
CREATE INDEX IF NOT EXISTS idx_service_reports_visit_type ON service_reports(visit_type);
CREATE INDEX IF NOT EXISTS idx_service_reports_follow_up ON service_reports(follow_up_schedule_id);

-- 2. Per-Asset Visit Report Details
CREATE TABLE IF NOT EXISTS service_report_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES service_reports(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES ac_assets(id) ON DELETE RESTRICT,
  fault_reported TEXT,
  diagnosis_findings TEXT,
  work_performed TEXT,
  asset_outcome TEXT NOT NULL DEFAULT 'COMPLETED'
    CHECK (asset_outcome IN ('COMPLETED', 'PENDING_PARTS', 'PENDING_REPAIRS')),
  final_condition TEXT CHECK (final_condition IN ('OPERATIONAL', 'DEGRADED', 'NON_OPERATIONAL', 'Good', 'Fair', 'Poor', 'Critical')),
  refrigerant_added BOOLEAN NOT NULL DEFAULT FALSE,
  refrigerant_qty_kg NUMERIC(6, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_assets_report_id ON service_report_assets(report_id);
CREATE INDEX IF NOT EXISTS idx_report_assets_asset_id ON service_report_assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_report_assets_outcome ON service_report_assets(asset_outcome);

DROP TRIGGER IF EXISTS trg_service_report_assets_updated_at ON service_report_assets;
CREATE TRIGGER trg_service_report_assets_updated_at
  BEFORE UPDATE ON service_report_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Parts & Repairs Follow-Up Requirements
CREATE TABLE IF NOT EXISTS service_report_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES service_reports(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES ac_assets(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('PART_REQUIRED', 'REPAIR_REQUIRED')),
  item_name TEXT NOT NULL,
  part_number TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  reason TEXT NOT NULL,
  diagnosis TEXT,
  work_completed TEXT,
  recommended_action TEXT,
  is_approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_specialist_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_revisit_required BOOLEAN NOT NULL DEFAULT TRUE,
  ac_condition TEXT,
  follow_up_notes TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_items_report_id ON service_report_items(report_id);
CREATE INDEX IF NOT EXISTS idx_report_items_asset_id ON service_report_items(asset_id);
CREATE INDEX IF NOT EXISTS idx_report_items_type ON service_report_items(item_type);
CREATE INDEX IF NOT EXISTS idx_report_items_resolved ON service_report_items(is_resolved);

DROP TRIGGER IF EXISTS trg_service_report_items_updated_at ON service_report_items;
CREATE TRIGGER trg_service_report_items_updated_at
  BEFORE UPDATE ON service_report_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Enable Row Level Security
ALTER TABLE service_report_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_report_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for authenticated Admin and Staff
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['service_report_assets', 'service_report_items'])
  LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "%I_select_authorized" ON %I;
      CREATE POLICY "%I_select_authorized" ON %I
        FOR SELECT TO authenticated
        USING (get_user_role(auth.uid()) IN (''ADMIN'', ''STAFF''));

      DROP POLICY IF EXISTS "%I_insert_authorized" ON %I;
      CREATE POLICY "%I_insert_authorized" ON %I
        FOR INSERT TO authenticated
        WITH CHECK (get_user_role(auth.uid()) IN (''ADMIN'', ''STAFF''));

      DROP POLICY IF EXISTS "%I_update_authorized" ON %I;
      CREATE POLICY "%I_update_authorized" ON %I
        FOR UPDATE TO authenticated
        USING (get_user_role(auth.uid()) IN (''ADMIN'', ''STAFF''))
        WITH CHECK (get_user_role(auth.uid()) IN (''ADMIN'', ''STAFF''));

      DROP POLICY IF EXISTS "%I_delete_admin_only" ON %I;
      CREATE POLICY "%I_delete_admin_only" ON %I
        FOR DELETE TO authenticated
        USING (get_user_role(auth.uid()) = ''ADMIN'');
    ', tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl);
  END LOOP;
END $$;
