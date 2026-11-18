CREATE OR REPLACE FUNCTION public.film_next_receipt_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  prefix text;
  last_no int;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  prefix := 'RC-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMM');
  PERFORM pg_advisory_xact_lock(hashtextextended('film_receipt_no:' || prefix, 0));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '^' || prefix, ''), '')::int), 0)
    INTO last_no
    FROM public.film_invoices
   WHERE type = 'receipt'
     AND invoice_number LIKE prefix || '%';
  RETURN prefix || lpad((last_no + 1)::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.film_next_receipt_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.film_next_receipt_number() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.film_recalc_order_payment() FROM PUBLIC, anon, authenticated;