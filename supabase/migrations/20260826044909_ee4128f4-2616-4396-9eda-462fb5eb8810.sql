-- 1) Theme: stop exposing the full settings row (incl. shop_line_id) to anonymous visitors.
ALTER VIEW public.shop_theme_settings_public SET (security_invoker = off);
GRANT SELECT ON public.shop_theme_settings_public TO anon, authenticated;
DROP POLICY IF EXISTS theme_public_read ON public.shop_theme_settings;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.shop_theme_settings FROM anon;

-- 2) Guest orders: keep the fail-closed insert rule and remove client write privileges entirely.
REVOKE INSERT, DELETE ON public.guest_orders FROM anon, authenticated;
REVOKE SELECT, UPDATE ON public.guest_orders FROM anon;
GRANT ALL ON public.guest_orders TO service_role;