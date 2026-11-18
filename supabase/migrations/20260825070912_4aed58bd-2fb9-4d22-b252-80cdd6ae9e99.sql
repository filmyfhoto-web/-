ALTER VIEW public.site_settings_public SET (security_invoker = off);
DROP POLICY IF EXISTS site_settings_public_read ON public.site_settings;
REVOKE SELECT ON public.site_settings FROM anon;
GRANT SELECT ON public.site_settings_public TO anon, authenticated;