DROP POLICY IF EXISTS "pwa_icons_signed_in_read" ON storage.objects;
DROP POLICY IF EXISTS "website_assets_signed_in_read" ON storage.objects;

CREATE POLICY "website_assets_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'website-assets'
    AND (public.has_role(auth.uid(), 'owner'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );