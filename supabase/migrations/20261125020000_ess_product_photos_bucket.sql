-- S10: storage for product photos uploaded from the ESS admin.
-- Public read (the shop shows them to everyone); uploads ONLY through the PYS API, which hands the ESS admin a
-- one-time signed upload link after checking the person's ESS role. No storage policies are added for anon or
-- authenticated, so nobody can write directly. 5 MB and JPEG/PNG/WebP are enforced by the bucket itself too.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ess-product-photos', 'ess-product-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
