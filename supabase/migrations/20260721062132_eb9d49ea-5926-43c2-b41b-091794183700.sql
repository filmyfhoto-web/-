
-- 1) Snapshot column for historical variant label
ALTER TABLE public.pos_receipt_items
  ADD COLUMN IF NOT EXISTS variant_label text;

CREATE INDEX IF NOT EXISTS pos_receipt_items_variant_idx
  ON public.pos_receipt_items(variant_id) WHERE variant_id IS NOT NULL;

-- 2) Rewrite pos_checkout with optional variant_id per line (backward compatible)
CREATE OR REPLACE FUNCTION public.pos_checkout(
  p_idempotency_key text,
  p_items jsonb,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_customer_name text DEFAULT NULL::text,
  p_line_user_id text DEFAULT NULL::text,
  p_payment_type text DEFAULT 'cash'::text,
  p_payment_status text DEFAULT 'paid'::text,
  p_discount numeric DEFAULT 0,
  p_cash_received numeric DEFAULT NULL::numeric,
  p_notes text DEFAULT NULL::text,
  p_branch text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing public.pos_receipts;
  new_receipt public.pos_receipts;
  it jsonb;
  pid uuid;
  vid uuid;
  qty numeric;
  server_price numeric;
  server_name text;
  server_unit text;
  cur_stock numeric;
  is_active boolean;
  is_deleted boolean;
  parent_has_variants boolean;
  v_row public.product_variants;
  v_attrs jsonb;
  v_label text;
  v_attr_bits text;
  subtotal numeric := 0;
  total numeric := 0;
  change_amount numeric;
  receipt_number text;
  ids uuid[];
  vids uuid[];
  qtys numeric[];
  i int;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = '22023';
  END IF;

  -- Idempotency short-circuit
  SELECT * INTO existing FROM public.pos_receipts WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'receipt_id', existing.id,
      'receipt_number', existing.receipt_number,
      'total', existing.total,
      'replay', true
    );
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart' USING ERRCODE = '22023';
  END IF;

  -- Extract ids + vids + qtys, validate qty>0
  ids := ARRAY[]::uuid[];
  vids := ARRAY[]::uuid[];
  qtys := ARRAY[]::numeric[];
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    pid := (it->>'product_id')::uuid;
    vid := NULLIF(it->>'variant_id','')::uuid;
    qty := (it->>'qty')::numeric;
    IF pid IS NULL THEN RAISE EXCEPTION 'product_id_required' USING ERRCODE = '22023'; END IF;
    IF qty IS NULL OR qty <= 0 THEN RAISE EXCEPTION 'invalid_qty' USING ERRCODE = '22023'; END IF;
    ids := ids || pid;
    vids := vids || COALESCE(vid, '00000000-0000-0000-0000-000000000000'::uuid);
    qtys := qtys || qty;
  END LOOP;

  -- Lock parents (deterministic order)
  PERFORM 1 FROM public.products WHERE id = ANY(ids) ORDER BY id FOR UPDATE;

  -- Lock any variants (deterministic order)
  PERFORM 1 FROM public.product_variants
   WHERE id = ANY(ARRAY(SELECT DISTINCT v FROM unnest(vids) v WHERE v <> '00000000-0000-0000-0000-000000000000'::uuid))
   ORDER BY id FOR UPDATE;

  -- Validate + compute subtotal using SERVER-trusted price
  FOR i IN 1..array_length(ids, 1) LOOP
    SELECT stock, standard_price, name, unit, active, (deleted_at IS NOT NULL), has_variants
      INTO cur_stock, server_price, server_name, server_unit, is_active, is_deleted, parent_has_variants
    FROM public.products WHERE id = ids[i];

    IF cur_stock IS NULL THEN
      RAISE EXCEPTION 'product_not_found: %', ids[i] USING ERRCODE = 'P0002';
    END IF;
    IF is_deleted OR NOT is_active THEN
      RAISE EXCEPTION 'product_inactive: %', ids[i] USING ERRCODE = '22023';
    END IF;

    IF vids[i] <> '00000000-0000-0000-0000-000000000000'::uuid THEN
      -- Variant line
      SELECT * INTO v_row FROM public.product_variants WHERE id = vids[i];
      IF NOT FOUND THEN
        RAISE EXCEPTION 'variant_not_found: %', vids[i] USING ERRCODE = 'P0002';
      END IF;
      IF v_row.product_id <> ids[i] THEN
        RAISE EXCEPTION 'variant_product_mismatch: %', vids[i] USING ERRCODE = '22023';
      END IF;
      IF NOT v_row.active OR v_row.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'variant_inactive: %', vids[i] USING ERRCODE = '22023';
      END IF;
      IF v_row.stock < qtys[i] THEN
        RAISE EXCEPTION 'insufficient_stock: %', vids[i]
          USING ERRCODE = '55000', HINT = v_row.stock::text;
      END IF;
      server_price := COALESCE(v_row.price_override, v_row.price, server_price);
    ELSE
      IF parent_has_variants THEN
        RAISE EXCEPTION 'variant_required: %', ids[i] USING ERRCODE = '22023';
      END IF;
      IF cur_stock < qtys[i] THEN
        RAISE EXCEPTION 'insufficient_stock: %', ids[i]
          USING ERRCODE = '55000', HINT = cur_stock::text;
      END IF;
    END IF;

    subtotal := subtotal + (server_price * qtys[i]);
  END LOOP;

  total := greatest(subtotal - coalesce(p_discount, 0), 0);
  change_amount := CASE WHEN p_cash_received IS NULL THEN NULL ELSE p_cash_received - total END;
  receipt_number := 'POS-' || to_char(now(),'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

  INSERT INTO public.pos_receipts(
    receipt_number, idempotency_key, branch, customer_id, customer_name, line_user_id,
    payment_type, payment_status, subtotal, discount, total, cash_received, change_amount,
    notes, created_by
  ) VALUES (
    receipt_number, p_idempotency_key, p_branch, p_customer_id, p_customer_name, p_line_user_id,
    p_payment_type, p_payment_status, subtotal, coalesce(p_discount,0), total,
    p_cash_received, change_amount, p_notes, auth.uid()
  ) RETURNING * INTO new_receipt;

  FOR i IN 1..array_length(ids, 1) LOOP
    IF vids[i] <> '00000000-0000-0000-0000-000000000000'::uuid THEN
      SELECT * INTO v_row FROM public.product_variants WHERE id = vids[i];
      SELECT name, unit INTO server_name, server_unit FROM public.products WHERE id = ids[i];
      server_price := COALESCE(v_row.price_override, v_row.price,
        (SELECT standard_price FROM public.products WHERE id = ids[i]));
      v_attrs := COALESCE(v_row.attributes, '{}'::jsonb);
      SELECT string_agg(k || ':' || (v_attrs->>k), ' / ' ORDER BY k)
        INTO v_attr_bits
        FROM jsonb_object_keys(v_attrs) k;
      v_label := COALESCE(NULLIF(v_row.name,''), v_attr_bits, v_row.sku, '');
      IF v_row.sku IS NOT NULL AND v_row.sku <> '' THEN
        v_label := v_label || ' [' || v_row.sku || ']';
      END IF;

      INSERT INTO public.pos_receipt_items(
        receipt_id, product_id, variant_id, name, unit, qty, unit_price, line_total, variant_label
      ) VALUES (
        new_receipt.id, ids[i], vids[i],
        server_name, COALESCE(server_unit, ''), qtys[i], server_price, server_price * qtys[i],
        v_label
      );

      -- Decrement ONLY the variant stock; parent stock is derived when has_variants=true.
      UPDATE public.product_variants
        SET stock = stock - qtys[i], updated_at = now()
      WHERE id = vids[i];
    ELSE
      SELECT standard_price, name, unit
        INTO server_price, server_name, server_unit
      FROM public.products WHERE id = ids[i];

      INSERT INTO public.pos_receipt_items(receipt_id, product_id, name, unit, qty, unit_price, line_total)
      VALUES (new_receipt.id, ids[i], server_name, server_unit, qtys[i], server_price, server_price * qtys[i]);

      -- Byte-for-byte: keep the exact non-variant decrement path.
      UPDATE public.products
        SET stock = stock - qtys[i], updated_at = now()
      WHERE id = ids[i];

      INSERT INTO public.stock_movements(product_id, move_type, qty, ref_type, ref_id, reason, created_by, note)
      VALUES (ids[i], 'out', qtys[i], 'pos_receipt', new_receipt.id, 'sell_out', auth.uid(),
              'pos_checkout ' || receipt_number);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'receipt_id', new_receipt.id,
    'receipt_number', receipt_number,
    'total', total,
    'replay', false
  );
END;
$function$;

-- 3) Cancel: restock variant OR parent, appropriately
CREATE OR REPLACE FUNCTION public.pos_cancel_receipt(p_receipt_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec public.pos_receipts;
  it public.pos_receipt_items;
BEGIN
  IF NOT public.can_approve(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT * INTO rec FROM public.pos_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF rec.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('receipt_id', rec.id, 'already_cancelled', true);
  END IF;

  FOR it IN SELECT * FROM public.pos_receipt_items WHERE receipt_id = rec.id LOOP
    IF it.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock = stock + it.qty, updated_at = now()
        WHERE id = it.variant_id;
    ELSIF it.product_id IS NOT NULL THEN
      UPDATE public.products SET stock = stock + it.qty, updated_at = now() WHERE id = it.product_id;
      INSERT INTO public.stock_movements(product_id, move_type, qty, ref_type, ref_id, reason, created_by, note)
      VALUES (it.product_id, 'in', it.qty, 'pos_receipt_cancel', rec.id, 'other', auth.uid(), 'pos_cancel ' || rec.receipt_number);
    END IF;
  END LOOP;

  UPDATE public.pos_receipts SET cancelled_at = now(), cancelled_reason = p_reason WHERE id = rec.id;
  RETURN jsonb_build_object('receipt_id', rec.id, 'cancelled', true);
END;
$function$;

-- 4) Grants (previously missing) so the POS UI can invoke the RPCs.
REVOKE ALL ON FUNCTION public.pos_checkout(text, jsonb, uuid, text, text, text, text, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_checkout(text, jsonb, uuid, text, text, text, text, numeric, numeric, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pos_cancel_receipt(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_cancel_receipt(uuid, text) TO authenticated;
