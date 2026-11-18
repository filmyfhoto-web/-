
-- Brand color per store
ALTER TABLE public.rds_stores
  ADD COLUMN IF NOT EXISTS brand_color text;

UPDATE public.rds_stores SET brand_color = '221 83% 45%'
  WHERE slug = 'colorlab' AND brand_color IS NULL;
UPDATE public.rds_stores SET brand_color = '160 72% 38%'
  WHERE slug = 'printing' AND brand_color IS NULL;

-- Storage policies for the store-logos bucket
-- Staff can read/write logos for any store they belong to (staff-any)
DROP POLICY IF EXISTS "store_logos_staff_read"   ON storage.objects;
DROP POLICY IF EXISTS "store_logos_staff_write"  ON storage.objects;
DROP POLICY IF EXISTS "store_logos_staff_update" ON storage.objects;
DROP POLICY IF EXISTS "store_logos_staff_delete" ON storage.objects;

CREATE POLICY "store_logos_staff_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'store-logos' AND public.is_staff_any(auth.uid()));

CREATE POLICY "store_logos_staff_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'store-logos' AND public.is_staff_any(auth.uid()));

CREATE POLICY "store_logos_staff_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'store-logos' AND public.is_staff_any(auth.uid()))
  WITH CHECK (bucket_id = 'store-logos' AND public.is_staff_any(auth.uid()));

CREATE POLICY "store_logos_staff_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'store-logos' AND public.is_staff_any(auth.uid()));
