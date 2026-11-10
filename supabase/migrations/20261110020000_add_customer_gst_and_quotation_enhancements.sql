-- Migration: 20261110020000_add_customer_gst_and_quotation_enhancements.sql
-- Description: Adds gst_number to customers and supports B2B tax compliance

-- 1. Add gst_number to customers table if it doesn't already exist
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gst_number TEXT;

-- 2. Create index on gst_number for fast lookups
CREATE INDEX IF NOT EXISTS idx_customers_gst_number ON customers(gst_number) WHERE gst_number IS NOT NULL;

-- 3. Document column
COMMENT ON COLUMN customers.gst_number IS '15-character Indian Goods and Services Tax Identification Number (GSTIN)';

