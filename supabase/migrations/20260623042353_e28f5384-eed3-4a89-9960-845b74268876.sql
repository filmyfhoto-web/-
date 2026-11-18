
-- 1) Extend settings SELECT to admins (is_staff = owner+admin), keep writes owner-only
DROP POLICY IF EXISTS "owners read settings" ON public.settings;
CREATE POLICY "staff read settings"
  ON public.settings FOR SELECT
  USING (public.is_staff(auth.uid()));

-- 2) Constrain photo_staff upload paths to their own uid-prefixed folder
DROP POLICY IF EXISTS "product-images staff_any write" ON storage.objects;
CREATE POLICY "product-images staff write scoped"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      public.can_edit_product(auth.uid())
      OR (
        public.is_staff_any(auth.uid())
        AND name LIKE (auth.uid()::text || '/%')
      )
    )
  );

DROP POLICY IF EXISTS "product-images staff_any update" ON storage.objects;
CREATE POLICY "product-images staff update scoped"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'product-images'
    AND (
      public.can_edit_product(auth.uid())
      OR (
        public.is_staff_any(auth.uid())
        AND name LIKE (auth.uid()::text || '/%')
      )
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      public.can_edit_product(auth.uid())
      OR (
        public.is_staff_any(auth.uid())
        AND name LIKE (auth.uid()::text || '/%')
      )
    )
  );
