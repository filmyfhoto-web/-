-- 1) Typed idempotency column + unique partial index scoped to verified LINE user
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Enforce uniqueness only when both fields are present; multiple NULLs allowed
-- so staff/POS orders (no LINE user, no key) remain unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS orders_line_idempotency_uniq
  ON public.orders (line_user_id, idempotency_key)
  WHERE line_user_id IS NOT NULL AND idempotency_key IS NOT NULL;

-- 2) Atomic submission RPC — SECURITY DEFINER, service_role only.
-- Contract:
--   p_line_user_id     verified LINE user (edge function guarantees this)
--   p_idempotency_key  8..64 [A-Za-z0-9_-]
--   p_order            jsonb: order_no, organization_id, note, guest_id,
--                      guest_name, guest_phone, project_name, school_name,
--                      customer_tax_id, customer_branch, line_link_token,
--                      subtotal, total, customer_snapshot
--   p_items            jsonb array of { product_id, product_name, product_code,
--                      qty, unit, price, total }
-- Returns exactly one row: (order_id, order_no, line_link_token, deduplicated).
-- Handles concurrent duplicate keys atomically via unique_violation recovery.
CREATE OR REPLACE FUNCTION public.submit_guest_order_atomic(
  p_line_user_id text,
  p_idempotency_key text,
  p_order jsonb,
  p_items jsonb
) RETURNS TABLE(order_id uuid, order_no text, line_link_token text, deduplicated boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_existing_no text;
  v_existing_token text;
  v_id uuid;
  v_no text;
  v_token text;
BEGIN
  IF p_line_user_id IS NULL OR btrim(p_line_user_id) = ''
     OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'missing_identity_or_key' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_items' USING ERRCODE = '22023';
  END IF;

  v_no := p_order->>'order_no';
  v_token := p_order->>'line_link_token';
  IF v_no IS NULL OR v_no = '' OR v_token IS NULL OR v_token = '' THEN
    RAISE EXCEPTION 'missing_order_no_or_token' USING ERRCODE = '22023';
  END IF;

  -- Pre-check dedupe (fast path — no writes if already exists).
  SELECT o.id, o.order_no, o.line_link_token
    INTO v_existing_id, v_existing_no, v_existing_token
    FROM public.orders o
   WHERE o.line_user_id = p_line_user_id
     AND o.idempotency_key = p_idempotency_key
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    order_id := v_existing_id;
    order_no := v_existing_no;
    line_link_token := v_existing_token;
    deduplicated := true;
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.orders (
      order_no, organization_id, status, note, is_guest, guest_id,
      guest_name, guest_phone, project_name, school_name,
      customer_tax_id, customer_branch, line_link_token, line_user_id,
      subtotal, discount, shipping_fee, total, customer_snapshot,
      idempotency_key
    ) VALUES (
      v_no,
      NULLIF(p_order->>'organization_id','')::uuid,
      'pending_quote'::order_status,
      NULLIF(p_order->>'note',''),
      true,
      NULLIF(p_order->>'guest_id','')::uuid,
      p_order->>'guest_name',
      p_order->>'guest_phone',
      NULLIF(p_order->>'project_name',''),
      NULLIF(p_order->>'school_name',''),
      NULLIF(p_order->>'customer_tax_id',''),
      NULLIF(p_order->>'customer_branch',''),
      v_token,
      p_line_user_id,
      COALESCE((p_order->>'subtotal')::numeric, 0),
      0,
      0,
      COALESCE((p_order->>'total')::numeric, 0),
      p_order->'customer_snapshot',
      p_idempotency_key
    )
    RETURNING id INTO v_id;

    INSERT INTO public.order_items
      (order_id, product_id, product_name, product_code, qty, unit, price, total)
    SELECT
      v_id,
      NULLIF(it->>'product_id','')::uuid,
      it->>'product_name',
      NULLIF(it->>'product_code',''),
      (it->>'qty')::numeric,
      NULLIF(it->>'unit',''),
      COALESCE((it->>'price')::numeric, 0),
      COALESCE((it->>'total')::numeric, 0)
    FROM jsonb_array_elements(p_items) it;

    INSERT INTO public.order_status_events (order_id, status, note)
    VALUES (v_id, 'pending_quote', 'รับคำขอเสนอราคาแล้ว รอทางร้านตรวจสอบ');

  EXCEPTION WHEN unique_violation THEN
    -- Might be the idempotency index (concurrent duplicate) — return existing.
    -- Or an order_no collision — re-raise so caller retries with a fresh no.
    SELECT o.id, o.order_no, o.line_link_token
      INTO v_existing_id, v_existing_no, v_existing_token
      FROM public.orders o
     WHERE o.line_user_id = p_line_user_id
       AND o.idempotency_key = p_idempotency_key
     LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      order_id := v_existing_id;
      order_no := v_existing_no;
      line_link_token := v_existing_token;
      deduplicated := true;
      RETURN NEXT;
      RETURN;
    END IF;
    RAISE;
  END;

  order_id := v_id;
  order_no := v_no;
  line_link_token := v_token;
  deduplicated := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_guest_order_atomic(text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_guest_order_atomic(text, text, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.submit_guest_order_atomic(text, text, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_guest_order_atomic(text, text, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.submit_guest_order_atomic(text, text, jsonb, jsonb) IS
  'Atomic customer order insert (order + items + status event) for the guest-order-submit edge function. Service role only. Idempotent on (line_user_id, idempotency_key).';
