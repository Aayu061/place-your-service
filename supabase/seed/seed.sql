-- ============================================================================
-- PLACE YOUR SERVICE (PYS) — SYSTEM BOOTSTRAP SEED
-- Description: Standard system configuration templates only.
-- IMPORTANT: No fake business records (customers, services, inventory, technicians)
-- ============================================================================

-- Standard AMC plan templates (system master configurations)
INSERT INTO amc_plans (id, plan_code, name, description, default_frequency, default_visits_per_year, is_active)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'AMC-COMP-YR', 'Comprehensive Annual Plan', 'Full coverage with quarterly preventive maintenance checks', 'QUARTERLY', 4, TRUE),
  ('a0000000-0000-0000-0000-000000000002', 'AMC-SEMI-YR', 'Semi-Annual Maintenance Plan', 'Bi-annual preventive maintenance checks', 'HALF_YEARLY', 2, TRUE),
  ('a0000000-0000-0000-0000-000000000003', 'AMC-MONTHLY', 'Commercial Monthly Plan', 'Monthly routine inspections for high-load commercial facilities', 'MONTHLY', 12, TRUE),
  ('a0000000-0000-0000-0000-000000000004', 'AMC-ANNUAL', 'Standard Annual Plan', 'Annual pre-season servicing and inspection', 'YEARLY', 1, TRUE)
ON CONFLICT (plan_code) DO NOTHING;

-- Initial Admin bootstrap note:
-- The singleton Admin account is linked to an authenticated user created via Supabase Auth
-- during deployment initialization (e.g., via Supabase Studio or CLI bootstrap).
-- The database constraint `idx_staff_singleton_admin` guarantees that only ONE
-- active record with role = 'ADMIN' can ever exist in the `staff` table.
