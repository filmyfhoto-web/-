DROP POLICY IF EXISTS "Public can read approved product images" ON storage.objects;
DROP POLICY IF EXISTS "product_images_storage_public_read" ON storage.objects;
DROP POLICY IF EXISTS "Product images readable when product published" ON storage.objects;

CREATE POLICY "Product images readable when product published"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'product-images'
  AND (
    public.is_staff_any(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.product_images pi
      JOIN public.products p ON p.id = pi.product_id
      WHERE pi.storage_path = storage.objects.name
        AND pi.status = 'approved'
        AND p.active = true
        AND p.status IN ('published','low_stock')
    )
  )
);