CREATE TABLE public.site_settings (
  id integer PRIMARY KEY DEFAULT 1,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT site_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_settings_public_read" ON public.site_settings
  FOR SELECT USING (true);

CREATE POLICY "site_settings_admin_insert" ON public.site_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "site_settings_admin_update" ON public.site_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER site_settings_touch
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE POLICY "website_assets_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'website-assets');

CREATE POLICY "website_assets_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'website-assets' AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "website_assets_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'website-assets' AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "website_assets_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'website-assets' AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')));