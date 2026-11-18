
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS line_binding_policy text NOT NULL DEFAULT 'optional';

ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_line_binding_policy_chk;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_line_binding_policy_chk
  CHECK (line_binding_policy IN ('optional','recommended','required'));

DROP FUNCTION IF EXISTS public.get_public_settings();
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE(
  store_name text, logo_url text, address text, phone text, email text,
  line_url text, quote_prefix text, order_prefix text, delivery_prefix text,
  po_prefix text, line_binding_policy text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT store_name, logo_url, address, phone, email, line_url,
         quote_prefix, order_prefix, delivery_prefix, po_prefix,
         COALESCE(line_binding_policy, 'optional')
  FROM public.settings WHERE id = 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO authenticated, anon;
