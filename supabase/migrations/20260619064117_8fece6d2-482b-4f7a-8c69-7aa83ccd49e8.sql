
DROP POLICY IF EXISTS "anyone insert org (signup)" ON public.organizations;
CREATE POLICY "users insert org pending approval"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (approved = false AND price_group_id IS NULL);

DROP POLICY IF EXISTS "product-images authenticated read" ON storage.objects;
CREATE POLICY "product-images read active or staff"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        AND p.active = true
    )
  )
);
