DROP POLICY IF EXISTS "staff manage job attachments" ON storage.objects;
CREATE POLICY "staff manage job attachments"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'job-attachments' AND public.is_staff_any(auth.uid()))
  WITH CHECK (bucket_id = 'job-attachments' AND public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS "customers upload own job attachments" ON storage.objects;
CREATE POLICY "customers upload own job attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-attachments'
    AND (storage.foldername(name))[1] = 'customer'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "customers read own job attachments" ON storage.objects;
CREATE POLICY "customers read own job attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-attachments'
    AND (storage.foldername(name))[1] = 'customer'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );