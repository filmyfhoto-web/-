-- RLS policies for product-images bucket
-- Staff can upload/update/delete; authenticated users can read (for customer shop)
CREATE POLICY "product-images staff write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND public.is_staff(auth.uid()));

CREATE POLICY "product-images staff update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images' AND public.is_staff(auth.uid()));

CREATE POLICY "product-images staff delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images' AND public.is_staff(auth.uid()));

CREATE POLICY "product-images authenticated read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images');