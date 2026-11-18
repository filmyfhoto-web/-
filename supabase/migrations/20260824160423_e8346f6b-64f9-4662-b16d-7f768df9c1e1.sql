-- 1) site_settings: no direct public row read; expose only display config via a view
DROP VIEW IF EXISTS public.site_settings_public;
CREATE VIEW public.site_settings_public WITH (security_invoker = off) AS
SELECT id, config, updated_at FROM public.site_settings WHERE id = 1;
GRANT SELECT ON public.site_settings_public TO anon, authenticated;

DROP POLICY IF EXISTS site_settings_public_read ON public.site_settings;
REVOKE SELECT ON public.site_settings FROM anon;
REVOKE SELECT (id, config, updated_at, internal_config, updated_by) ON public.site_settings FROM anon, authenticated;
GRANT SELECT ON public.site_settings TO authenticated; -- rows still limited to owner/admin by RLS
GRANT SELECT ON public.site_settings TO service_role;

-- 2) shop_theme_settings: shop_line_id is staff-only; public display fields via a view
DROP VIEW IF EXISTS public.shop_theme_settings_public;
CREATE VIEW public.shop_theme_settings_public WITH (security_invoker = off) AS
SELECT id, primary_hsl, accent_hsl, gradient_strength, icon_size, icon_columns,
       font_scale, shop_name, shop_logo_url, sections, updated_at
FROM public.shop_theme_settings WHERE id = 1;
GRANT SELECT ON public.shop_theme_settings_public TO anon, authenticated;

DROP POLICY IF EXISTS theme_public_read ON public.shop_theme_settings;
REVOKE SELECT ON public.shop_theme_settings FROM anon;
REVOKE SELECT (id, primary_hsl, accent_hsl, gradient_strength, icon_size, icon_columns,
       font_scale, shop_name, shop_logo_url, shop_line_id, sections, updated_at)
  ON public.shop_theme_settings FROM anon, authenticated;
GRANT SELECT ON public.shop_theme_settings TO authenticated; -- rows limited to staff by theme_staff_read
GRANT SELECT ON public.shop_theme_settings TO service_role;

COMMENT ON COLUMN public.shop_theme_settings.shop_line_id IS
  'Staff-only contact ID. Public pages must read public display fields from shop_theme_settings_public.';
COMMENT ON COLUMN public.site_settings.internal_config IS
  'Internal-only config. Public pages must read site_settings_public.';