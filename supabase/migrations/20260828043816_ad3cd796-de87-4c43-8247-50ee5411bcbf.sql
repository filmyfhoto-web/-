GRANT SELECT ON public.shop_theme_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_theme_settings TO authenticated;
GRANT ALL ON public.shop_theme_settings TO service_role;

GRANT EXECUTE ON FUNCTION public.is_staff_any(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;