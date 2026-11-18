ALTER VIEW public.site_settings_public SET (security_invoker = on);

CREATE POLICY site_settings_public_read ON public.site_settings
  FOR SELECT TO anon, authenticated
  USING (id = 1);

REVOKE SELECT ON public.site_settings FROM anon;
GRANT SELECT (id, config, updated_at) ON public.site_settings TO anon;
GRANT SELECT ON public.site_settings_public TO anon, authenticated;