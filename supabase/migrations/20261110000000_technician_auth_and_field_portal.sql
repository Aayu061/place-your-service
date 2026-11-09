-- ============================================================================
-- Migration: 20261110000000_technician_auth_and_field_portal.sql
-- Purpose: Support dedicated technician authentication and mobile field portal
-- ============================================================================

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_duty_status_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_device_info TEXT;

-- Index for fast technician lookup by code and phone during mobile login
CREATE INDEX IF NOT EXISTS idx_technicians_phone_active ON public.technicians(phone) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_technicians_code_active ON public.technicians(technician_code) WHERE is_active = true;

-- Default sample PIN hash (PIN: "1234") for existing technicians if pin_hash is null
-- Hash generated via SHA-256 with salt 'pys-tech-salt-2026'
-- SHA256('1234' || 'pys-tech-salt-2026') = 8848db71d368d1469f3d6dbf4eb4779417efc051a37c041f0b0949d282f9ef2d
UPDATE public.technicians
SET pin_hash = '8848db71d368d1469f3d6dbf4eb4779417efc051a37c041f0b0949d282f9ef2d'
WHERE pin_hash IS NULL;

