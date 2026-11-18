-- Prefer column-level grants over a SECURITY DEFINER view.
ALTER VIEW public.shop_theme_settings_public SET (security_invoker = on);

CREATE POLICY theme_public_read ON public.shop_theme_settings
  FOR SELECT TO anon, authenticated USING (id = 1);

REVOKE SELECT ON public.shop_theme_settings FROM anon;
GRANT SELECT (id, primary_hsl, accent_hsl, gradient_strength, icon_size, icon_columns,
              font_scale, shop_name, shop_logo_url, sections, updated_at)
  ON public.shop_theme_settings TO anon;