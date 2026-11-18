
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS line_add_friend_url text;
ALTER TABLE public.guest_orders ADD COLUMN IF NOT EXISTS customer_snapshot jsonb;

DROP FUNCTION IF EXISTS public.get_public_settings();

CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE(
  store_name text, phone text, address text, logo_url text, tax_id text,
  receipt_header text, receipt_footer text,
  receipt_reply_template text, receipt_line_template text,
  line_url text, line_add_friend_url text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    s.store_name, s.phone, s.address, s.logo_url, s.tax_id,
    s.receipt_header, s.receipt_footer,
    s.receipt_reply_template, s.receipt_line_template,
    s.line_url, s.line_add_friend_url
  FROM public.settings s
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated;
