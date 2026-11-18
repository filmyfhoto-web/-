DROP POLICY IF EXISTS "nw-attach owner-admin delete" ON storage.objects;

CREATE POLICY "nw-attach staff read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'nw-attachments' AND EXISTS (
  SELECT 1 FROM public.staff_stores ss
  WHERE ss.user_id = auth.uid() AND ss.store_id::text = split_part(objects.name, '/', 1)));

CREATE POLICY "nw-attach staff write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'nw-attachments' AND EXISTS (
  SELECT 1 FROM public.staff_stores ss
  WHERE ss.user_id = auth.uid() AND ss.store_id::text = split_part(objects.name, '/', 1)));

CREATE POLICY "nw-attach staff update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'nw-attachments' AND EXISTS (
  SELECT 1 FROM public.staff_stores ss
  WHERE ss.user_id = auth.uid() AND ss.store_id::text = split_part(objects.name, '/', 1)))
WITH CHECK (bucket_id = 'nw-attachments' AND EXISTS (
  SELECT 1 FROM public.staff_stores ss
  WHERE ss.user_id = auth.uid() AND ss.store_id::text = split_part(objects.name, '/', 1)));

CREATE POLICY "nw-attach owner-admin delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'nw-attachments' AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')));