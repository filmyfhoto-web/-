
-- 1) Tighten store_invite_codes INSERT: block owner/admin unless caller is a global owner
DROP POLICY IF EXISTS "store staff can create invite codes" ON public.store_invite_codes;

CREATE POLICY "store staff can create invite codes"
  ON public.store_invite_codes FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'owner')
      OR EXISTS (
        SELECT 1 FROM public.staff_stores s
        WHERE s.user_id = auth.uid() AND s.store_id = store_invite_codes.store_id
      )
    )
    AND (
      role NOT IN ('owner', 'admin')
      OR public.has_role(auth.uid(), 'owner')
    )
  );

-- 2) Remove anonymous public read on film_shop_settings (protects google_sheets_webhook_url etc.)
DROP POLICY IF EXISTS "public_read" ON public.film_shop_settings;
REVOKE SELECT ON public.film_shop_settings FROM anon;
