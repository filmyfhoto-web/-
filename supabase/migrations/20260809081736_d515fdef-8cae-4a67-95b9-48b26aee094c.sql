CREATE POLICY "staff read film line attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'film-line-attachments'
  AND (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'stock_staff')
    OR public.has_role(auth.uid(), 'photo_staff')
  )
);