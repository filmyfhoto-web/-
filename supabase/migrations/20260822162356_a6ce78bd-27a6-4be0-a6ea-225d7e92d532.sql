-- 1) product_images: hide internal staff identifiers from anonymous visitors
REVOKE SELECT ON public.product_images FROM anon;
GRANT SELECT (id, product_id, url, storage_path, status, is_primary, created_at, updated_at)
  ON public.product_images TO anon;

-- 2) site_settings: public visitors read only the display config
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS internal_config jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP POLICY IF EXISTS site_settings_public_read ON public.site_settings;
CREATE POLICY site_settings_public_read ON public.site_settings
  FOR SELECT TO anon, authenticated USING (true);

REVOKE SELECT ON public.site_settings FROM anon;
REVOKE SELECT ON public.site_settings FROM authenticated;
GRANT SELECT (id, config) ON public.site_settings TO anon;
GRANT SELECT (id, config, updated_at) ON public.site_settings TO authenticated;

DROP POLICY IF EXISTS site_settings_staff_read_all ON public.site_settings;
CREATE POLICY site_settings_staff_read_all ON public.site_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

COMMENT ON COLUMN public.site_settings.config IS 'Public display settings only — never store secrets, tokens or internal URLs here (readable by anonymous visitors).';
COMMENT ON COLUMN public.site_settings.internal_config IS 'Owner/admin-only settings. Not granted to anon/authenticated.';

-- 3) line_login_diagnostics: make owner/admin-only cleanup explicit
DROP POLICY IF EXISTS "Staff can clean line login diagnostics" ON public.line_login_diagnostics;
CREATE POLICY "Owners and admins can clean line login diagnostics" ON public.line_login_diagnostics
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));