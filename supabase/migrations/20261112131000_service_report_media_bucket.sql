-- Phase 2: Private Supabase Storage Bucket for Field Photos & Signatures

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'service-report-media',
  'service-report-media',
  FALSE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS service_report_media_staff_tech_read ON storage.objects;
CREATE POLICY service_report_media_staff_tech_read
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'service-report-media'
    AND public.get_user_role((SELECT auth.uid())) IN ('ADMIN', 'STAFF', 'TECHNICIAN')
  );

DROP POLICY IF EXISTS service_report_media_staff_tech_insert ON storage.objects;
CREATE POLICY service_report_media_staff_tech_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'service-report-media'
    AND public.get_user_role((SELECT auth.uid())) IN ('ADMIN', 'STAFF', 'TECHNICIAN')
  );

