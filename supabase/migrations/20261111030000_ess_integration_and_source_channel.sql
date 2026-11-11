-- Extreme Sales & Services (ESS) Integration Migration
-- Adds source_channel and external_reference_id to service_requests

ALTER TABLE public.service_requests 
ADD COLUMN IF NOT EXISTS source_channel TEXT DEFAULT 'PYS_DIRECT',
ADD COLUMN IF NOT EXISTS external_reference_id TEXT;

-- Create indexes for performance on external references and source filtering
CREATE INDEX IF NOT EXISTS idx_service_requests_external_reference_id 
ON public.service_requests(external_reference_id);

CREATE INDEX IF NOT EXISTS idx_service_requests_source_channel 
ON public.service_requests(source_channel);
