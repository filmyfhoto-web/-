DROP FUNCTION IF EXISTS public.get_public_settings();
CREATE OR REPLACE FUNCTION public.get_public_settings()
 RETURNS TABLE(store_name text, logo_url text, address text, phone text, email text, line_url text, quote_prefix text, order_prefix text, delivery_prefix text, po_prefix text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT store_name, logo_url, address, phone, email, line_url,
         quote_prefix, order_prefix, delivery_prefix, po_prefix
  FROM public.settings WHERE id = 1;
$function$;