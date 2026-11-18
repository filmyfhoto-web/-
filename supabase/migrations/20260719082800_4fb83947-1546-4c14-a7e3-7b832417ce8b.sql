REVOKE EXECUTE ON FUNCTION public.link_my_line_profile(text, text, text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.link_my_line_profile(text, text, text);