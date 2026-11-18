CREATE OR REPLACE FUNCTION public.admin_backfill_customer_tax_ids()
RETURNS TABLE(guest_orders_filled integer, orders_filled integer, film_invoices_filled integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_g integer := 0;
  v_o integer := 0;
  v_f integer := 0;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH upd AS (
    UPDATE public.guest_orders o
    SET customer_tax_id = c.tax_id,
        customer_branch = COALESCE(NULLIF(o.customer_branch,''), c.tax_branch)
    FROM public.guest_customers c
    WHERE (o.customer_tax_id IS NULL OR o.customer_tax_id = '')
      AND o.customer_phone = c.phone
      AND c.tax_id IS NOT NULL AND c.tax_id <> ''
    RETURNING 1
  )
  SELECT count(*)::int INTO v_g FROM upd;

  WITH upd AS (
    UPDATE public.orders o
    SET customer_tax_id = p.tax_id,
        customer_branch = COALESCE(NULLIF(o.customer_branch,''), p.tax_branch)
    FROM public.profiles p
    WHERE (o.customer_tax_id IS NULL OR o.customer_tax_id = '')
      AND o.customer_id = p.id
      AND p.tax_id IS NOT NULL AND p.tax_id <> ''
    RETURNING 1
  )
  SELECT count(*)::int INTO v_o FROM upd;

  WITH upd AS (
    UPDATE public.film_invoices i
    SET customer_tax_id = c.tax_id,
        customer_branch = COALESCE(NULLIF(i.customer_branch,''), c.tax_branch)
    FROM public.film_customers c
    WHERE (i.customer_tax_id IS NULL OR i.customer_tax_id = '')
      AND i.customer_id = c.id
      AND c.tax_id IS NOT NULL AND c.tax_id <> ''
    RETURNING 1
  )
  SELECT count(*)::int INTO v_f FROM upd;

  guest_orders_filled := v_g;
  orders_filled := v_o;
  film_invoices_filled := v_f;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_backfill_customer_tax_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_backfill_customer_tax_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_backfill_customer_tax_ids() TO service_role;