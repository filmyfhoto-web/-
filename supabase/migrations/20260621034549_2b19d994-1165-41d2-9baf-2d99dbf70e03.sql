
DROP POLICY IF EXISTS "product-images staff write" ON storage.objects;
DROP POLICY IF EXISTS "product-images staff update" ON storage.objects;
DROP POLICY IF EXISTS "product-images staff delete" ON storage.objects;

CREATE POLICY "product-images staff_any write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.is_staff_any(auth.uid()));

CREATE POLICY "product-images staff_any update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_staff_any(auth.uid()))
  WITH CHECK (bucket_id = 'product-images' AND public.is_staff_any(auth.uid()));

CREATE POLICY "product-images admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.can_approve(auth.uid()));
