DROP POLICY IF EXISTS "customer uploads own read" ON storage.objects;
CREATE POLICY "customer uploads own read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'customer-uploads'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_staff(auth.uid()))
  );

DROP POLICY IF EXISTS "customer uploads own insert" ON storage.objects;
CREATE POLICY "customer uploads own insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'customer-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "customer uploads own update" ON storage.objects;
CREATE POLICY "customer uploads own update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'customer-uploads' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'customer-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "customer uploads own delete" ON storage.objects;
CREATE POLICY "customer uploads own delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'customer-uploads'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_staff(auth.uid()))
  );