CREATE OR REPLACE FUNCTION public.myshop_stock_enqueue_recent(p_hours integer DEFAULT 24)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE m record; v_n integer := 0; v_since timestamptz;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  v_since := now() - (GREATEST(COALESCE(p_hours, 24), 1) || ' hours')::interval;
  FOR m IN
    SELECT DISTINCT mp.product_id, mp.variant_id
    FROM public.myshop_product_mappings mp
    JOIN public.myshop_integrations i ON i.id = mp.integration_id
    WHERE mp.product_id IS NOT NULL
      AND i.enabled = true AND i.sync_inventory = true
      AND (
        EXISTS (
          SELECT 1 FROM public.stock_movements sm
          WHERE sm.product_id = mp.product_id
            AND COALESCE(sm.variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE(mp.variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
            AND sm.created_at >= v_since
        )
        OR EXISTS (
          SELECT 1 FROM public.products p
          WHERE p.id = mp.product_id AND p.updated_at >= v_since
        )
      )
  LOOP
    v_n := v_n + public.stock_sync_enqueue(m.product_id, m.variant_id);
  END LOOP;
  RETURN v_n;
END $function$;

REVOKE ALL ON FUNCTION public.myshop_stock_enqueue_recent(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.myshop_stock_enqueue_recent(integer) TO authenticated, service_role;