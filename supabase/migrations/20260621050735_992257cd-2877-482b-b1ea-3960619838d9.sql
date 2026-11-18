
DROP POLICY IF EXISTS "product-images read active or staff" ON storage.objects;

CREATE POLICY "product-images read approved or staff"
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
    )
  )
);
