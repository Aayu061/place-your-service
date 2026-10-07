-- Phase 7: Technician Management Schema Enhancements

-- 1. Add administrative status, structured availability, and audit attribution
ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS working_days TEXT[] DEFAULT ARRAY['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']::TEXT[],
  ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT '{"start": "09:00", "end": "18:00"}'::jsonb,
  ADD COLUMN IF NOT EXISTS availability JSONB DEFAULT '{"workingDays": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"], "workingHours": {"start": "09:00", "end": "18:00"}}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Update status check constraint to include OFF_DUTY
ALTER TABLE public.technicians
  DROP CONSTRAINT IF EXISTS technicians_status_check;

ALTER TABLE public.technicians
  ADD CONSTRAINT technicians_status_check
  CHECK (status = ANY (ARRAY['AVAILABLE'::text, 'BUSY'::text, 'ON_LEAVE'::text, 'OFF_DUTY'::text, 'INACTIVE'::text]));

-- 3. Add performance and search indexes
CREATE INDEX IF NOT EXISTS idx_technicians_status ON public.technicians(status);
CREATE INDEX IF NOT EXISTS idx_technicians_is_active ON public.technicians(is_active);
CREATE INDEX IF NOT EXISTS idx_technicians_phone ON public.technicians(phone);
CREATE INDEX IF NOT EXISTS idx_technicians_email ON public.technicians(email);
CREATE INDEX IF NOT EXISTS idx_technicians_created_at ON public.technicians(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_technicians_specializations ON public.technicians USING GIN(specializations);
CREATE INDEX IF NOT EXISTS idx_technicians_service_areas ON public.technicians USING GIN(service_areas);
