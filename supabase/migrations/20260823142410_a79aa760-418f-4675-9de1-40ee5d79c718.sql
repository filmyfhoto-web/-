-- 1) shop_theme_settings: LINE contact ID no longer readable by anonymous visitors
REVOKE SELECT (shop_line_id) ON public.shop_theme_settings FROM anon;
-- keep display columns for anon
GRANT SELECT (id, primary_hsl, accent_hsl, gradient_strength, icon_size, icon_columns,
              font_scale, shop_name, shop_logo_url, sections, updated_at)
  ON public.shop_theme_settings TO anon;
GRANT SELECT (shop_line_id) ON public.shop_theme_settings TO authenticated;

COMMENT ON COLUMN public.shop_theme_settings.shop_line_id IS
  'Signed-in users only. Not granted to anon (anti-scraping).';

-- 2) site_settings: narrow the public read policy so it is not a blanket true,
--    and re-assert that internal_config is never granted to anon/authenticated.
DROP POLICY IF EXISTS site_settings_public_read ON public.site_settings;
CREATE POLICY site_settings_public_read ON public.site_settings
FOR SELECT TO anon, authenticated USING (id = 1);

REVOKE SELECT ON public.site_settings FROM anon, authenticated;
REVOKE SELECT (internal_config, updated_by) ON public.site_settings FROM anon, authenticated;
GRANT SELECT (id, config, updated_at) ON public.site_settings TO anon, authenticated;
GRANT SELECT ON public.site_settings TO service_role;

COMMENT ON COLUMN public.site_settings.internal_config IS
  'Owner/admin-only. Never granted to anon/authenticated; read via service role or admin RPC only.';