-- Add Before and After Photo URLs to service_reports for mobile field documentation
ALTER TABLE public.service_reports 
ADD COLUMN IF NOT EXISTS before_photo_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS after_photo_url TEXT DEFAULT NULL;
