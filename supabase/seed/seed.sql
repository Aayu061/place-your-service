-- ============================================================================
-- PLACE YOUR SERVICE (PYS) — SYSTEM BOOTSTRAP SEED
-- Description: Standard system configuration templates only.
-- Extreme Sales & Services Official AMC Rate Chart
-- ============================================================================

-- Standard AMC plan templates (official rate cards)
INSERT INTO amc_plans (
  id, plan_code, name, category, description, coverage_summary,
  default_frequency, default_visits_per_year, pricing_model,
  rate_split_small, rate_split_large, rate_window_small, rate_window_large, rate_flat,
  gst_rate_percent, max_equipment_age_years, has_gas_charging, has_spare_parts, has_unlimited_complaints,
  is_active
) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'SEMI-COMP-SPLIT', 'Semi-Comprehensive AMC (Non-Inverter Split)', 'SEMI_COMPREHENSIVE', 'Includes 4 routine services, unlimited complaints attend, capacitor replacement, motor winding, and PCB repair (refrigerant gas charging excluded).', '4 Services, Unlimited Complaints, Capacitor, Motor Winding & PCB Repair (No Gas)', 'QUARTERLY', 4, 'TIERED_TONNAGE', 2999.00, 3999.00, NULL, NULL, NULL, 0.00, NULL, FALSE, TRUE, TRUE, TRUE),
  ('a0000000-0000-0000-0000-000000000002', 'SAMC-1-SPLIT', 'Special Comprehensive AMC (SAMC 1) - Split', 'SPECIAL_COMPREHENSIVE', 'Special comprehensive protection for Split ACs under 3 years old. Includes 4 services, unlimited complaints, capacitor, PCB repair, motor winding, and gas charging.', '4 Services, Unlimited Complaints, Capacitor, PCB Repair, Motor Winding & Gas Charging Included', 'QUARTERLY', 4, 'TIERED_TONNAGE', 4499.00, 5499.00, NULL, NULL, NULL, 28.00, 3, TRUE, TRUE, TRUE, TRUE),
  ('a0000000-0000-0000-0000-000000000003', 'SAMC-2-WINDOW', 'Special Comprehensive AMC (SAMC 2) - Window', 'SPECIAL_COMPREHENSIVE', 'Special comprehensive protection for Window ACs under 3 years old. Includes 4 services, unlimited complaints, capacitor, PCB repair, motor winding, and gas charging.', '4 Services, Unlimited Complaints, Capacitor, PCB Repair, Motor Winding & Gas Charging Included', 'QUARTERLY', 4, 'TIERED_TONNAGE', NULL, NULL, 3499.00, 4499.00, NULL, 28.00, 3, TRUE, TRUE, TRUE, TRUE),
  ('a0000000-0000-0000-0000-000000000004', 'ORD-3-VISIT', 'Ordinary AMC (3 Services / Visits)', 'ORDINARY', 'Standard non-comprehensive routine care with 3 scheduled visits per year across 4-month intervals.', '3 Scheduled Services / Visits per Year', 'FOUR_MONTHLY', 3, 'TIERED_TONNAGE', 1500.00, 1500.00, 1000.00, 1000.00, NULL, 0.00, NULL, FALSE, FALSE, FALSE, TRUE),
  ('a0000000-0000-0000-0000-000000000005', 'ORD-4-VISIT', 'Ordinary AMC (4 Services + Complaints)', 'ORDINARY', 'Quarterly maintenance with 4 scheduled services and unlimited normal complaints. Window units include 1 wet wash.', '4 Services & Unlimited Normal Complaints (Window Includes 1 Wet Wash)', 'QUARTERLY', 4, 'TIERED_TONNAGE', 1800.00, 1800.00, 1300.00, 1300.00, NULL, 0.00, NULL, FALSE, FALSE, TRUE, TRUE),
  ('a0000000-0000-0000-0000-000000000006', 'ORD-6-VISIT', 'Ordinary AMC (6 Services / Bi-Monthly)', 'ORDINARY', 'Bi-monthly high-cadence maintenance with 6 scheduled services and unlimited normal complaints. Window units include 1 wet wash.', '6 Services & Unlimited Normal Complaints (Window Includes 1 Wet Wash)', 'BI_MONTHLY', 6, 'TIERED_TONNAGE', 2200.00, 2200.00, 1700.00, 1700.00, NULL, 0.00, NULL, FALSE, FALSE, TRUE, TRUE),
  ('a0000000-0000-0000-0000-000000000007', 'JACKET-2-SERVICE', 'Premium Jacket AMC (2 Services)', 'PREMIUM_JACKET', 'Deep clean jacket wash preventive care. Includes 2 jacket chemical cleans and unlimited breakdown complaint attendance.', '2 Jacket Deep Cleaning Services & Unlimited Complaints', 'HALF_YEARLY', 2, 'FLAT_PER_UNIT', NULL, NULL, NULL, NULL, 2599.00, 0.00, NULL, FALSE, FALSE, TRUE, TRUE),
  ('a0000000-0000-0000-0000-000000000008', 'JACKET-3-SERVICE', 'Premium Jacket AMC (3 Services)', 'PREMIUM_JACKET', 'Maximum preventive care with 3 jacket deep chemical wash services per year and unlimited complaint attendance.', '3 Jacket Deep Cleaning Services & Unlimited Complaints', 'FOUR_MONTHLY', 3, 'FLAT_PER_UNIT', NULL, NULL, NULL, NULL, 3599.00, 0.00, NULL, FALSE, FALSE, TRUE, TRUE),
  ('a0000000-0000-0000-0000-000000000009', 'STANDALONE-PUMP', 'Pump Down Service (Overhaul)', 'STANDALONE', 'Refrigerant gas recovery, system pump down, and indoor/outdoor unit dismounting or relocation (gas top-up extra if required).', 'Pump Down Refrigerant Recovery Service', 'ON_DEMAND', 1, 'FLAT_PER_UNIT', NULL, NULL, NULL, NULL, 1299.00, 0.00, NULL, FALSE, FALSE, FALSE, TRUE),
  ('a0000000-0000-0000-0000-000000000010', 'STANDALONE-JET', 'Jet Wash Service (High-Pressure Deep Clean)', 'STANDALONE', 'High-pressure motorized wet pump coil wash for deep dirt and grease elimination.', 'High-Pressure Jet Wash Deep Clean Service', 'ON_DEMAND', 1, 'FLAT_PER_UNIT', NULL, NULL, NULL, NULL, 1199.00, 0.00, NULL, FALSE, FALSE, FALSE, TRUE)
ON CONFLICT (plan_code) DO NOTHING;

-- Initial Admin bootstrap note:
-- The singleton Admin account is linked to an authenticated user created via Supabase Auth
-- during deployment initialization (e.g., via Supabase Studio or CLI bootstrap).
-- The database constraint `idx_staff_singleton_admin` guarantees that only ONE
-- active record with role = 'ADMIN' can ever exist in the `staff` table.
