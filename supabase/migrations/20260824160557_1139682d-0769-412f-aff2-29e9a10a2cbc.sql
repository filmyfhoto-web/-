-- Views must not be SECURITY DEFINER; use invoker views + column-level grants
DROP VIEW IF EXISTS public.site_settings_public;
CREATE VIEW public.site_settings_public WITH (security_invoker = on) AS
SELECT id, config, updated_at FROM public.site_settings WHERE id = 1;
GRANT SELECT ON public.site_settings_public TO anon, authenticated;

DROP VIEW IF EXISTS public.shop_theme_settings_public;
CREATE VIEW public.shop_theme_settings_public WITH (security_invoker = on) AS
SELECT id, primary_hsl, accent_hsl, gradient_strength, icon_size, icon_columns,
       font_scale, shop_name, shop_logo_url, sections, updated_at
FROM public.shop_theme_settings WHERE id = 1;
GRANT SELECT ON public.shop_theme_settings_public TO anon, authenticated;

-- site_settings: clients may only read the display config columns of row 1
REVOKE SELECT ON public.site_settings FROM anon, authenticated;
GRANT SELECT (id, config, updated_at) ON public.site_settings TO anon, authenticated;
DROP POLICY IF EXISTS site_settings_public_read ON public.site_settings;
CREATE POLICY site_settings_public_read ON public.site_settings
  FOR SELECT TO anon, authenticated USING (id = 1);

-- shop_theme_settings: shop_line_id readable by no client role (staff use the RPC below)
REVOKE SELECT ON public.shop_theme_settings FROM anon, authenticated;
GRANT SELECT (id, primary_hsl, accent_hsl, gradient_strength, icon_size, icon_columns,
       font_scale, shop_name, shop_logo_url, sections, updated_at)
  ON public.shop_theme_settings TO anon, authenticated;
DROP POLICY IF EXISTS theme_public_read ON public.shop_theme_settings;
CREATE POLICY theme_public_read ON public.shop_theme_settings
  FOR SELECT TO anon, authenticated USING (id = 1);

CREATE OR REPLACE FUNCTION public.staff_shop_line_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.is_staff_any(auth.uid())
    THEN (SELECT shop_line_id FROM public.shop_theme_settings WHERE id = 1)
    ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.staff_shop_line_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_shop_line_id() TO authenticated;