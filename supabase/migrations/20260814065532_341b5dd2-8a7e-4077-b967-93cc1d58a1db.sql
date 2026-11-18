CREATE OR REPLACE FUNCTION public.myshop_apply_order_stock(p_order_number text, p_direction text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.myshop_orders%ROWTYPE;
  it record;
  v_deduct_key text;
  v_restore_key text;
  v_count int := 0;
  v_blocked int := 0;
  v_missing int := 0;
  v_full boolean := false;
BEGIN
  IF p_direction NOT IN ('deduct','restore') THEN
    RAISE EXCEPTION 'invalid_direction' USING ERRCODE='22023';
  END IF;

  SELECT * INTO r FROM public.myshop_orders WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_order'); END IF;
  IF r.order_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_local_order'); END IF;

  IF p_direction = 'deduct' THEN
    -- Retry-safe: skip only lines that already have a deduct movement.
    FOR it IN
      SELECT oi.id, oi.product_id, oi.qty FROM public.order_items oi
      WHERE oi.order_id = r.order_id AND oi.product_id IS NOT NULL AND oi.qty > 0
    LOOP
      v_deduct_key := 'myshop:' || r.order_number || ':deduct:' || it.id::text;
      IF EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.idempotency_key = v_deduct_key) THEN
        CONTINUE;
      END IF;
      BEGIN
        INSERT INTO public.stock_movements
          (product_id, move_type, qty, reason, reference, note, idempotency_key, ref_type, ref_id)
        VALUES (it.product_id, 'out'::stock_move_type, it.qty, 'sell_out'::stock_reason,
                r.order_number, 'LINE MyShop ' || r.order_number, v_deduct_key, 'myshop_order', r.order_id);
        v_count := v_count + 1;
      EXCEPTION WHEN sqlstate '55000' THEN
        v_blocked := v_blocked + 1;
      END;
    END LOOP;

    -- Fully deducted only when EVERY eligible line has a deduct movement.
    SELECT count(*) INTO v_missing
    FROM public.order_items oi
    WHERE oi.order_id = r.order_id AND oi.product_id IS NOT NULL AND oi.qty > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements m
        WHERE m.idempotency_key = 'myshop:' || r.order_number || ':deduct:' || oi.id::text
      );
    v_full := (v_missing = 0);

    UPDATE public.myshop_orders
       SET stock_deducted = v_full,
           stock_deducted_at = CASE WHEN v_full THEN COALESCE(stock_deducted_at, now()) ELSE NULL END
     WHERE id = r.id;

    RETURN jsonb_build_object('ok', true, 'direction', 'deduct', 'movements', v_count,
                              'blocked', v_blocked, 'pending_lines', v_missing,
                              'fully_deducted', v_full);
  END IF;

  -- restore: never gated on the global stock_deducted flag; restore exactly the
  -- lines that really were deducted and are not yet restored.
  FOR it IN
    SELECT oi.id, oi.product_id, oi.qty FROM public.order_items oi
    WHERE oi.order_id = r.order_id AND oi.product_id IS NOT NULL AND oi.qty > 0
      AND EXISTS (
        SELECT 1 FROM public.stock_movements m
        WHERE m.idempotency_key = 'myshop:' || r.order_number || ':deduct:' || oi.id::text
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements m
        WHERE m.idempotency_key = 'myshop:' || r.order_number || ':restore:' || oi.id::text
      )
  LOOP
    v_restore_key := 'myshop:' || r.order_number || ':restore:' || it.id::text;
    BEGIN
      INSERT INTO public.stock_movements
        (product_id, move_type, qty, reason, reference, note, idempotency_key, ref_type, ref_id)
      VALUES (it.product_id, 'in'::stock_move_type, it.qty, 'cancel_restock'::stock_reason,
              r.order_number, 'LINE MyShop ' || r.order_number, v_restore_key, 'myshop_order', r.order_id);
      v_count := v_count + 1;
    EXCEPTION WHEN sqlstate '55000' THEN
      v_blocked := v_blocked + 1;
    END;
  END LOOP;

  SELECT count(*) INTO v_missing
  FROM public.order_items oi
  WHERE oi.order_id = r.order_id AND oi.product_id IS NOT NULL AND oi.qty > 0
    AND EXISTS (
      SELECT 1 FROM public.stock_movements m
      WHERE m.idempotency_key = 'myshop:' || r.order_number || ':deduct:' || oi.id::text
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.stock_movements m
      WHERE m.idempotency_key = 'myshop:' || r.order_number || ':restore:' || oi.id::text
    );
  v_full := (v_missing = 0);

  UPDATE public.myshop_orders
     SET stock_restored = v_full,
         stock_restored_at = CASE WHEN v_full THEN COALESCE(stock_restored_at, now()) ELSE NULL END
   WHERE id = r.id;

  RETURN jsonb_build_object('ok', true, 'direction', 'restore', 'movements', v_count,
                            'blocked', v_blocked, 'pending_lines', v_missing,
                            'fully_restored', v_full);
END $function$;

REVOKE ALL ON FUNCTION public.myshop_apply_order_stock(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.myshop_apply_order_stock(text, text) TO service_role;