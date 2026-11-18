
-- Restrict product_images writes to admins only (is_staff = owner+admin).
-- Customers keep read access only to approved images of active+published products
-- (existing "staff_any read images" policy already enforces that).

DROP POLICY IF EXISTS "staff_any insert images" ON public.product_images;
DROP POLICY IF EXISTS "uploader update own pending" ON public.product_images;
DROP POLICY IF EXISTS "admin manage images" ON public.product_images;

CREATE POLICY "admins insert images" ON public.product_images
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "admins update images" ON public.product_images
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "admins delete images" ON public.product_images
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- Storage bucket: tighten writes to admins only (drop the staff_any-scoped policies)
DROP POLICY IF EXISTS "product-images staff write scoped" ON storage.objects;
DROP POLICY IF EXISTS "product-images staff update scoped" ON storage.objects;
DROP POLICY IF EXISTS "product-images admin delete" ON storage.objects;

CREATE POLICY "product-images admin write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.is_staff(auth.uid()));

CREATE POLICY "product-images admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'product-images' AND public.is_staff(auth.uid()));

CREATE POLICY "product-images admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_staff(auth.uid()));
