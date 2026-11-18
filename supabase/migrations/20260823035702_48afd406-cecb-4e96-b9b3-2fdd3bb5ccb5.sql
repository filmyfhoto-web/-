-- Replace security-definer views with column-level grants
DROP VIEW IF EXISTS public.site_settings_public;
DROP VIEW IF EXISTS public.shop_theme_settings_public;

-- site_settings: anon/authenticated may read only public display config
CREATE POLICY site_settings_public_read ON public.site_settings
FOR SELECT TO anon, authenticated USING (true);

REVOKE SELECT ON public.site_settings FROM anon, authenticated;
GRANT SELECT (id, config, updated_at) ON public.site_settings TO anon, authenticated;
GRANT SELECT ON public.site_settings TO service_role;

-- shop_theme_settings: public read limited to display columns
CREATE POLICY theme_public_read ON public.shop_theme_settings
FOR SELECT TO anon, authenticated USING (true);

REVOKE SELECT ON public.shop_theme_settings FROM anon, authenticated;
GRANT SELECT (id, primary_hsl, accent_hsl, gradient_strength, icon_size, icon_columns,
              font_scale, shop_name, shop_logo_url, shop_line_id, sections, updated_at)
  ON public.shop_theme_settings TO anon, authenticated;
GRANT SELECT ON public.shop_theme_settings TO service_role;