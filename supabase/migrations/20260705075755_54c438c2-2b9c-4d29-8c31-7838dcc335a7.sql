
ALTER TABLE public.line_oa_settings
  ADD COLUMN IF NOT EXISTS liff_id text,
  ADD COLUMN IF NOT EXISTS liff_endpoint_url text,
  ADD COLUMN IF NOT EXISTS liff_callback_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS liff_scopes text[] NOT NULL DEFAULT ARRAY['profile','openid']::text[];

CREATE OR REPLACE FUNCTION public.get_public_liff_config()
RETURNS TABLE (liff_id text, liff_endpoint_url text, liff_scopes text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT liff_id, liff_endpoint_url, liff_scopes
  FROM public.line_oa_settings
  ORDER BY created_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_public_liff_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_liff_config() TO anon, authenticated;
