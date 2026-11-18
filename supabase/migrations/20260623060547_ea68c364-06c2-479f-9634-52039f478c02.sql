
-- 1. Restrict settings SELECT to owners only (webhook_url exposure)
DROP POLICY IF EXISTS "staff read settings" ON public.settings;
CREATE POLICY "owners read settings"
  ON public.settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- 2. Remove customer self-update on organizations; staff-only updates remain
DROP POLICY IF EXISTS "users update own org" ON public.organizations;

-- 3. Restrict storage write/update policies to authenticated role
DROP POLICY IF EXISTS "product-images staff write scoped" ON storage.objects;
CREATE POLICY "product-images staff write scoped"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      public.can_edit_product(auth.uid())
      OR (public.is_staff_any(auth.uid()) AND name LIKE (auth.uid()::text || '/%'))
    )
  );

DROP POLICY IF EXISTS "product-images staff update scoped" ON storage.objects;
CREATE POLICY "product-images staff update scoped"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      public.can_edit_product(auth.uid())
      OR (public.is_staff_any(auth.uid()) AND name LIKE (auth.uid()::text || '/%'))
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      public.can_edit_product(auth.uid())
      OR (public.is_staff_any(auth.uid()) AND name LIKE (auth.uid()::text || '/%'))
    )
  );

-- 4. Public-facing RPC already returns non-sensitive subset; ensure it can be called
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO authenticated, anon;
