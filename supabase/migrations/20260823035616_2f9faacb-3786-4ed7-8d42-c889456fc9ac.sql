-- 1) site_settings: remove public read of whole row (incl. internal_config)
DROP POLICY IF EXISTS site_settings_public_read ON public.site_settings;
REVOKE SELECT ON public.site_settings FROM anon;

CREATE OR REPLACE VIEW public.site_settings_public
WITH (security_invoker = false) AS
SELECT id, config, updated_at FROM public.site_settings;

GRANT SELECT ON public.site_settings_public TO anon, authenticated;

-- 2) shop_theme_settings: scope public read to display columns only
DROP POLICY IF EXISTS theme_public_read ON public.shop_theme_settings;
REVOKE SELECT ON public.shop_theme_settings FROM anon;

CREATE POLICY theme_staff_read ON public.shop_theme_settings
FOR SELECT TO authenticated
USING (public.is_staff_any(auth.uid()));

CREATE OR REPLACE VIEW public.shop_theme_settings_public
WITH (security_invoker = false) AS
SELECT id, primary_hsl, accent_hsl, gradient_strength, icon_size, icon_columns,
       font_scale, shop_name, shop_logo_url, shop_line_id, sections, updated_at
FROM public.shop_theme_settings;

GRANT SELECT ON public.shop_theme_settings_public TO anon, authenticated;