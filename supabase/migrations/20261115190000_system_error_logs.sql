-- ==============================================================================
-- Migration: 20261115190000_system_error_logs.sql
-- Description: Centralized Crash Telemetry and Error Observability table for
--              Place Your Service (PYS) and Extreme Sales & Services (ESS).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.system_error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(50) NOT NULL DEFAULT 'PYS', -- 'PYS' | 'ESS' | 'CLIENT'
    error_level VARCHAR(20) NOT NULL DEFAULT 'ERROR', -- 'INFO' | 'WARN' | 'ERROR' | 'FATAL'
    message TEXT NOT NULL,
    error_name VARCHAR(100),
    stack_trace TEXT,
    context_data JSONB DEFAULT '{}'::jsonb,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compound and single-column performance indexes for fast dashboard queries
CREATE INDEX IF NOT EXISTS idx_system_error_logs_service_created 
    ON public.system_error_logs (service_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_level_created 
    ON public.system_error_logs (error_level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_resolved_created 
    ON public.system_error_logs (resolved, created_at DESC);

-- Enable RLS
ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on system_error_logs" 
    ON public.system_error_logs 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- Authenticated users (admin/staff) can read error logs
CREATE POLICY "Authenticated users can read system_error_logs" 
    ON public.system_error_logs 
    FOR SELECT 
    TO authenticated 
    USING (true);

-- Authenticated users (admins) can update resolved status
CREATE POLICY "Authenticated users can update system_error_logs" 
    ON public.system_error_logs 
    FOR UPDATE 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);
