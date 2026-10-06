-- ============================================================================
-- PLACE YOUR SERVICE (PYS) — FOUNDATION DATABASE MIGRATION
-- Migration: 20261007000000_foundation_schema.sql
-- Description: Core relational schema, constraints, indexes, and RLS policies
-- ============================================================================

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. UTILITY FUNCTIONS & TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper function to lookup user role safely in RLS policies
CREATE OR REPLACE FUNCTION get_user_role(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT s.role INTO v_role
  FROM profiles p
  JOIN staff s ON s.profile_id = p.id
  WHERE p.id = p_user_id AND s.is_active = TRUE;
  
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. AUTHENTICATION & PROFILES
-- ============================================================================

-- Internal profiles linked to auth.users
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Staff table with Admin Singleton constraint
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- STRICT ENFORCEMENT: Exactly ONE active ADMIN account can exist in the system
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_singleton_admin
  ON staff (role)
  WHERE role = 'ADMIN';

CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);
CREATE INDEX IF NOT EXISTS idx_staff_active ON staff(is_active);

CREATE TRIGGER trg_staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 3. CUSTOMER DOMAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS customers (
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
  customer_type TEXT NOT NULL DEFAULT 'TEMPORARY' CHECK (customer_type IN ('TEMPORARY', 'PERMANENT')),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS customer_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  site_name TEXT NOT NULL,
  address TEXT NOT NULL,
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_sites_customer ON customer_sites(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_sites_active ON customer_sites(is_active);

CREATE TRIGGER trg_customer_sites_updated_at
  BEFORE UPDATE ON customer_sites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 4. AC ASSET REGISTER
-- ============================================================================

CREATE TABLE IF NOT EXISTS ac_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag TEXT NOT NULL UNIQUE,
  site_id UUID NOT NULL REFERENCES customer_sites(id) ON DELETE RESTRICT,
  brand TEXT NOT NULL,
  model_number TEXT,
  serial_number TEXT,
  ac_type TEXT NOT NULL CHECK (ac_type IN ('SPLIT', 'WINDOW', 'CASSETTE', 'PACKAGE', 'TOWER', 'DUCTABLE', 'VRV_VRF', 'OTHER')),
  capacity_tons NUMERIC(4, 2) CHECK (capacity_tons > 0),
  installation_date DATE,
  floor_location TEXT,
  room_location TEXT,
  refrigerant_type TEXT,
  warranty_status TEXT NOT NULL DEFAULT 'UNDER_WARRANTY' CHECK (warranty_status IN ('UNDER_WARRANTY', 'EXPIRED', 'AMC_COVERED', 'OUT_OF_WARRANTY')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ac_assets_site ON ac_assets(site_id);
CREATE INDEX IF NOT EXISTS idx_ac_assets_tag ON ac_assets(asset_tag);
CREATE INDEX IF NOT EXISTS idx_ac_assets_serial ON ac_assets(serial_number);
CREATE INDEX IF NOT EXISTS idx_ac_assets_status ON ac_assets(warranty_status);

CREATE TRIGGER trg_ac_assets_updated_at
  BEFORE UPDATE ON ac_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 5. TECHNICIAN DOMAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  specializations TEXT[] DEFAULT '{}',
  service_areas TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BUSY', 'ON_LEAVE', 'INACTIVE')),
  max_daily_workload INTEGER NOT NULL DEFAULT 5 CHECK (max_daily_workload > 0),
  current_workload INTEGER NOT NULL DEFAULT 0 CHECK (current_workload >= 0),
  joining_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_technicians_code ON technicians(technician_code);
CREATE INDEX IF NOT EXISTS idx_technicians_status ON technicians(status);

CREATE TRIGGER trg_technicians_updated_at
  BEFORE UPDATE ON technicians
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 6. AMC CONTRACTS & ASSETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS amc_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  default_frequency TEXT NOT NULL CHECK (default_frequency IN ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY')),
  default_visits_per_year INTEGER NOT NULL CHECK (default_visits_per_year > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS amc_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  plan_id UUID REFERENCES amc_plans(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY')),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  total_visits INTEGER NOT NULL CHECK (total_visits > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'CANCELLED', 'RENEWED')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_amc_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_amc_customer ON amc_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_amc_status ON amc_contracts(status);
CREATE INDEX IF NOT EXISTS idx_amc_dates ON amc_contracts(start_date, end_date);

CREATE TRIGGER trg_amc_contracts_updated_at
  BEFORE UPDATE ON amc_contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS amc_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amc_id UUID NOT NULL REFERENCES amc_contracts(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES ac_assets(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_amc_asset UNIQUE (amc_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_amc_assets_amc ON amc_assets(amc_id);
CREATE INDEX IF NOT EXISTS idx_amc_assets_asset ON amc_assets(asset_id);

-- ============================================================================
-- 7. SERVICE OPERATIONS (REQUESTS & SCHEDULES)
-- ============================================================================

-- Operational Unplanned Service Requests
CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  site_id UUID NOT NULL REFERENCES customer_sites(id) ON DELETE RESTRICT,
  asset_id UUID REFERENCES ac_assets(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('BREAKDOWN', 'COMPLAINT', 'REPAIR', 'EMERGENCY', 'INSTALLATION', 'UNPLANNED_OTHER')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY')),
  description TEXT NOT NULL,
  reported_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  preferred_date DATE,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
    'REQUESTED', 'PENDING', 'SCHEDULED', 'ASSIGNED', 'IN_PROGRESS',
    'AWAITING_PARTS', 'ON_HOLD', 'REVISIT_REQUIRED', 'RESOLVED',
    'COMPLETED', 'PAYMENT', 'CLOSED', 'CANCELLED'
  )),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_customer ON service_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_service_requests_priority ON service_requests(priority);
CREATE INDEX IF NOT EXISTS idx_service_requests_reported ON service_requests(reported_date);

CREATE TRIGGER trg_service_requests_updated_at
  BEFORE UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Planned Service Schedules (e.g., generated from AMC)
CREATE TABLE IF NOT EXISTS service_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_number TEXT NOT NULL UNIQUE,
  amc_id UUID REFERENCES amc_contracts(id) ON DELETE SET NULL,
  asset_id UUID NOT NULL REFERENCES ac_assets(id) ON DELETE RESTRICT,
  scheduled_date DATE NOT NULL,
  visit_number INTEGER CHECK (visit_number > 0),
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN (
    'SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'COMPLETED', 'CANCELLED', 'OVERDUE'
  )),
  is_system_generated BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_amc_asset_schedule UNIQUE (amc_id, asset_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_service_schedules_amc ON service_schedules(amc_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_asset ON service_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_date ON service_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_service_schedules_status ON service_schedules(status);

CREATE TRIGGER trg_service_schedules_updated_at
  BEFORE UPDATE ON service_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Service Assignments
CREATE TABLE IF NOT EXISTS service_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE,
  service_schedule_id UUID REFERENCES service_schedules(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_start_time TIMESTAMPTZ,
  scheduled_end_time TIMESTAMPTZ,
  is_override BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason TEXT,
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN (
    'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'REASSIGNED', 'CANCELLED'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_assignment_target CHECK (service_request_id IS NOT NULL OR service_schedule_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_service_assignments_tech ON service_assignments(technician_id);
CREATE INDEX IF NOT EXISTS idx_service_assignments_req ON service_assignments(service_request_id);
CREATE INDEX IF NOT EXISTS idx_service_assignments_sched ON service_assignments(service_schedule_id);

CREATE TRIGGER trg_service_assignments_updated_at
  BEFORE UPDATE ON service_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Service Execution Reports
CREATE TABLE IF NOT EXISTS service_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number TEXT NOT NULL UNIQUE,
  service_request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
  service_schedule_id UUID REFERENCES service_schedules(id) ON DELETE SET NULL,
  technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
  service_date DATE NOT NULL,
  work_description TEXT NOT NULL,
  observations TEXT,
  action_taken TEXT,
  recommendation TEXT,
  customer_feedback TEXT,
  customer_signature_url TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'VERIFIED')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_reports_tech ON service_reports(technician_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_date ON service_reports(service_date);

CREATE TRIGGER trg_service_reports_updated_at
  BEFORE UPDATE ON service_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 8. INVENTORY & PARTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  unit_of_measure TEXT NOT NULL DEFAULT 'PIECE',
  unit_cost NUMERIC(10, 2) NOT NULL CHECK (unit_cost >= 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parts_code ON parts(part_code);
CREATE INDEX IF NOT EXISTS idx_parts_category ON parts(category);

CREATE TRIGGER trg_parts_updated_at
  BEFORE UPDATE ON parts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('OPENING', 'PURCHASE', 'ADJUSTMENT', 'SERVICE_USAGE', 'RETURN')),
  quantity INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  reason TEXT NOT NULL,
  recorded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_part ON inventory_transactions(part_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created ON inventory_transactions(created_at);

CREATE TABLE IF NOT EXISTS service_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_report_id UUID NOT NULL REFERENCES service_reports(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_parts_report ON service_parts(service_report_id);
CREATE INDEX IF NOT EXISTS idx_service_parts_part ON service_parts(part_id);

-- ============================================================================
-- 9. PAYMENTS & TRANSACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  service_request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
  amc_id UUID REFERENCES amc_contracts(id) ON DELETE SET NULL,
  total_amount_due NUMERIC(12, 2) NOT NULL CHECK (total_amount_due >= 0),
  total_amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount_paid >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'REFUNDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  transaction_reference TEXT NOT NULL UNIQUE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'ONLINE')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('SUCCESS', 'PENDING', 'FAILED', 'REFUNDED')),
  recorded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment ON payment_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_ref ON payment_transactions(transaction_reference);

-- ============================================================================
-- 10. NOTIFICATIONS & AUDIT / ACTIVITY LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('INFO', 'WARNING', 'ALERT', 'SUCCESS')),
  category TEXT NOT NULL CHECK (category IN (
    'AMC_EXPIRY', 'SERVICE_OVERDUE', 'NEW_ASSIGNMENT', 'LOW_STOCK', 'PAYMENT_FAILED', 'AWAITING_PARTS', 'SYSTEM'
  )),
  entity_type TEXT,
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_profile_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(recipient_profile_id, is_read);

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON activity_logs(actor_profile_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);

-- ============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE ac_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE amc_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE amc_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE amc_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- 11.1 Profiles Policies
CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profiles_update_owner_or_admin" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR get_user_role(auth.uid()) = 'ADMIN');

-- 11.2 Staff Policies
CREATE POLICY "staff_select_authenticated" ON staff
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "staff_manage_admin_only" ON staff
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'ADMIN')
  WITH CHECK (get_user_role(auth.uid()) = 'ADMIN');

-- 11.3 Operational Tables Policies: ADMIN has full access; STAFF has read/write operations
-- Macros for standard operational permissions
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'customers', 'customer_sites', 'ac_assets', 'technicians',
      'amc_plans', 'amc_contracts', 'amc_assets',
      'service_requests', 'service_schedules', 'service_assignments',
      'service_reports', 'parts', 'inventory_transactions', 'service_parts',
      'payments', 'payment_transactions'
    ])
  LOOP
    -- Read policy for authenticated ADMIN or STAFF
    EXECUTE format('
      CREATE POLICY "%I_select_authorized" ON %I
        FOR SELECT TO authenticated
        USING (get_user_role(auth.uid()) IN (''ADMIN'', ''STAFF''));
    ', tbl, tbl);

    -- Insert/Update policy for authenticated ADMIN or STAFF
    EXECUTE format('
      CREATE POLICY "%I_modify_authorized" ON %I
        FOR INSERT TO authenticated
        WITH CHECK (get_user_role(auth.uid()) IN (''ADMIN'', ''STAFF''));
    ', tbl, tbl);

    EXECUTE format('
      CREATE POLICY "%I_update_authorized" ON %I
        FOR UPDATE TO authenticated
        USING (get_user_role(auth.uid()) IN (''ADMIN'', ''STAFF''))
        WITH CHECK (get_user_role(auth.uid()) IN (''ADMIN'', ''STAFF''));
    ', tbl, tbl);

    -- Delete policy strictly reserved for ADMIN (soft-delete is standard for staff)
    EXECUTE format('
      CREATE POLICY "%I_delete_admin_only" ON %I
        FOR DELETE TO authenticated
        USING (get_user_role(auth.uid()) = ''ADMIN'');
    ', tbl, tbl);
  END LOOP;
END $$;

-- 11.4 Notifications Policies
CREATE POLICY "notifications_select_recipient_or_admin" ON notifications
  FOR SELECT TO authenticated
  USING (recipient_profile_id = auth.uid() OR get_user_role(auth.uid()) = 'ADMIN');

CREATE POLICY "notifications_update_recipient" ON notifications
  FOR UPDATE TO authenticated
  USING (recipient_profile_id = auth.uid())
  WITH CHECK (recipient_profile_id = auth.uid());

CREATE POLICY "notifications_insert_authorized" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role(auth.uid()) IN ('ADMIN', 'STAFF'));

-- 11.5 Activity Logs Policies (Append-only for operations, readable by ADMIN and staff)
CREATE POLICY "activity_logs_select_authorized" ON activity_logs
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) IN ('ADMIN', 'STAFF'));

CREATE POLICY "activity_logs_insert_authorized" ON activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role(auth.uid()) IN ('ADMIN', 'STAFF'));

-- Strictly prevent non-admins from modifying or deleting audit logs
CREATE POLICY "activity_logs_immutable" ON activity_logs
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "activity_logs_no_delete" ON activity_logs
  FOR DELETE TO authenticated
  USING (false);

-- ============================================================================
-- 12. PERMISSIONS & SCHEMA PRIVILEGES
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated;

