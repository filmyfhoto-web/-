-- ============================================================
-- 1) Central guard: no movement may drive stock below zero
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_stock_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delta numeric;
  v_before numeric;
  v_after numeric;
BEGIN
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
  IF NEW.move_type = 'in' THEN v_delta := NEW.qty;
  ELSIF NEW.move_type = 'out' THEN v_delta := -NEW.qty;
  ELSE v_delta := NULL;
  END IF;

  IF NEW.variant_id IS NOT NULL THEN
    SELECT stock INTO v_before FROM public.product_variants WHERE id = NEW.variant_id FOR UPDATE;
    v_before := COALESCE(v_before, 0);
    IF v_delta IS NULL THEN v_after := NEW.qty;
    ELSE v_after := v_before + v_delta;
    END IF;
    IF v_after < 0 AND v_after < v_before THEN
      RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = '55000',
        HINT = 'variant ' || NEW.variant_id::text || ' คงเหลือ ' || v_before::text;
    END IF;
    UPDATE public.product_variants SET stock = v_after, updated_at = now() WHERE id = NEW.variant_id;
    UPDATE public.products p
       SET stock = COALESCE((SELECT SUM(stock) FROM public.product_variants WHERE product_id = p.id AND active = true), 0),
           updated_at = now()
     WHERE p.id = NEW.product_id;
  ELSE
    SELECT stock INTO v_before FROM public.products WHERE id = NEW.product_id FOR UPDATE;
    v_before := COALESCE(v_before, 0);
    IF v_delta IS NULL THEN v_after := NEW.qty;
    ELSE v_after := v_before + v_delta;
    END IF;
    IF v_after < 0 AND v_after < v_before THEN
      RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = '55000',
        HINT = 'product ' || NEW.product_id::text || ' คงเหลือ ' || v_before::text;
    END IF;
    UPDATE public.products SET stock = v_after, updated_at = now() WHERE id = NEW.product_id;
  END IF;

  NEW.before_qty := v_before;
  NEW.after_qty := v_after;
  RETURN NEW;
END $function$;

-- ============================================================
-- 2) POS checkout: variant sales must go through stock_movements
-- ============================================================
CREATE OR REPLACE FUNCTION public.pos_checkout(p_idempotency_key text, p_items jsonb, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_line_user_id text DEFAULT NULL::text, p_payment_type text DEFAULT 'cash'::text, p_payment_status text DEFAULT 'paid'::text, p_discount numeric DEFAULT 0, p_cash_received numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_branch text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing public.pos_receipts; new_receipt public.pos_receipts;
  it jsonb; pid uuid; vid uuid; qty numeric;
  server_price numeric; server_name text; server_unit text;
  cur_stock numeric; is_active boolean; is_deleted boolean;
  parent_has_variants boolean; v_row public.product_variants;
  v_attrs jsonb; v_label text; v_attr_bits text;
  link_row public.product_unit_links; base_stock numeric; need_base numeric;
  subtotal numeric := 0; total numeric := 0; change_amount numeric;
  receipt_number text;
  ids uuid[]; vids uuid[]; qtys numeric[];
  base_ids uuid[]; ratios integer[]; i int;
  tier_price numeric;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO existing FROM public.pos_receipts WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('receipt_id',existing.id,'receipt_number',existing.receipt_number,'total',existing.total,'replay',true);
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'empty_cart' USING ERRCODE='22023';
  END IF;

  ids := ARRAY[]::uuid[]; vids := ARRAY[]::uuid[]; qtys := ARRAY[]::numeric[];
  base_ids := ARRAY[]::uuid[]; ratios := ARRAY[]::integer[];
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    pid := (it->>'product_id')::uuid;
    vid := NULLIF(it->>'variant_id','')::uuid;
    qty := (it->>'qty')::numeric;
    IF pid IS NULL THEN RAISE EXCEPTION 'product_id_required' USING ERRCODE='22023'; END IF;
    IF qty IS NULL OR qty <= 0 THEN RAISE EXCEPTION 'invalid_qty' USING ERRCODE='22023'; END IF;
    ids := ids || pid;
    vids := vids || COALESCE(vid,'00000000-0000-0000-0000-000000000000'::uuid);
    qtys := qtys || qty;
    base_ids := base_ids || NULL::uuid;
    ratios := ratios || NULL::integer;
  END LOOP;

  PERFORM 1 FROM public.products WHERE id = ANY(ids) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.product_variants
    WHERE id = ANY(ARRAY(SELECT DISTINCT v FROM unnest(vids) v WHERE v<>'00000000-0000-0000-0000-000000000000'::uuid))
    ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.products
    WHERE id = ANY(ARRAY(
      SELECT DISTINCT l.base_id FROM public.product_unit_links l
      WHERE l.wrapper_id = ANY(ids) AND l.enabled=true
    ))
    ORDER BY id FOR UPDATE;

  FOR i IN 1..array_length(ids,1) LOOP
    SELECT stock, standard_price, name, unit, active, (deleted_at IS NOT NULL), has_variants
      INTO cur_stock, server_price, server_name, server_unit, is_active, is_deleted, parent_has_variants
      FROM public.products WHERE id=ids[i];
    IF cur_stock IS NULL THEN RAISE EXCEPTION 'product_not_found: %', ids[i] USING ERRCODE='P0002'; END IF;
    IF is_deleted OR NOT is_active THEN RAISE EXCEPTION 'product_inactive: %', ids[i] USING ERRCODE='22023'; END IF;

    IF vids[i] <> '00000000-0000-0000-0000-000000000000'::uuid THEN
      SELECT * INTO v_row FROM public.product_variants WHERE id=vids[i];
      IF NOT FOUND THEN RAISE EXCEPTION 'variant_not_found: %', vids[i] USING ERRCODE='P0002'; END IF;
      IF v_row.product_id <> ids[i] THEN RAISE EXCEPTION 'variant_product_mismatch: %', vids[i] USING ERRCODE='22023'; END IF;
      IF NOT v_row.active OR v_row.archived_at IS NOT NULL THEN RAISE EXCEPTION 'variant_inactive: %', vids[i] USING ERRCODE='22023'; END IF;
      IF v_row.stock < qtys[i] THEN
        RAISE EXCEPTION 'insufficient_stock: %', vids[i] USING ERRCODE='55000', HINT=v_row.stock::text;
      END IF;
      server_price := COALESCE(v_row.price_override, v_row.price, server_price);
    ELSE
      IF parent_has_variants THEN RAISE EXCEPTION 'variant_required: %', ids[i] USING ERRCODE='22023'; END IF;

      SELECT * INTO link_row FROM public.product_unit_links WHERE wrapper_id=ids[i] AND enabled=true;
      IF FOUND THEN
        base_ids[i] := link_row.base_id;
        ratios[i]   := link_row.ratio;
        need_base   := qtys[i] * link_row.ratio;
        SELECT stock INTO base_stock FROM public.products WHERE id=link_row.base_id;
        IF base_stock IS NULL OR base_stock < need_base THEN
          RAISE EXCEPTION 'insufficient_stock: %', ids[i] USING ERRCODE='55000',
            HINT = COALESCE(base_stock,0)::text || '/' || link_row.ratio::text;
        END IF;
      ELSE
        IF cur_stock < qtys[i] THEN
          RAISE EXCEPTION 'insufficient_stock: %', ids[i] USING ERRCODE='55000', HINT=cur_stock::text;
        END IF;
      END IF;

      SELECT unit_price INTO tier_price
      FROM public.product_wholesale_tiers
      WHERE product_id = ids[i] AND min_qty <= qtys[i]
      ORDER BY unit_price ASC
      LIMIT 1;
      IF tier_price IS NOT NULL AND tier_price < server_price THEN
        server_price := tier_price;
      END IF;
    END IF;

    subtotal := subtotal + (server_price * qtys[i]);
  END LOOP;

  total := greatest(subtotal - coalesce(p_discount,0), 0);
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

  FOR i IN 1..array_length(ids,1) LOOP
    IF vids[i] <> '00000000-0000-0000-0000-000000000000'::uuid THEN
      SELECT * INTO v_row FROM public.product_variants WHERE id=vids[i];
      SELECT name, unit INTO server_name, server_unit FROM public.products WHERE id=ids[i];
      server_price := COALESCE(v_row.price_override, v_row.price, (SELECT standard_price FROM public.products WHERE id=ids[i]));
      v_attrs := COALESCE(v_row.attributes,'{}'::jsonb);
      SELECT string_agg(k || ':' || (v_attrs->>k),' / ' ORDER BY k) INTO v_attr_bits FROM jsonb_object_keys(v_attrs) k;
      v_label := COALESCE(NULLIF(v_row.name,''), v_attr_bits, v_row.sku, '');
      IF v_row.sku IS NOT NULL AND v_row.sku <> '' THEN v_label := v_label || ' [' || v_row.sku || ']'; END IF;

      INSERT INTO public.pos_receipt_items(receipt_id, product_id, variant_id, name, unit, qty, unit_price, line_total, variant_label)
      VALUES (new_receipt.id, ids[i], vids[i], server_name, COALESCE(server_unit,''), qtys[i], server_price, server_price*qtys[i], v_label);

      -- central path: variant sale is a movement, never a direct stock write
      INSERT INTO public.stock_movements(product_id, variant_id, move_type, qty, ref_type, ref_id, reason, created_by, note, idempotency_key)
      VALUES (ids[i], vids[i], 'out', qtys[i], 'pos_receipt', new_receipt.id, 'sell_out', auth.uid(),
              'pos_checkout ' || receipt_number, 'possale:' || new_receipt.id::text || ':' || i::text);
    ELSE
      SELECT standard_price, name, unit INTO server_price, server_name, server_unit FROM public.products WHERE id=ids[i];

      SELECT unit_price INTO tier_price
      FROM public.product_wholesale_tiers
      WHERE product_id = ids[i] AND min_qty <= qtys[i]
      ORDER BY unit_price ASC
      LIMIT 1;
      IF tier_price IS NOT NULL AND tier_price < server_price THEN
        server_price := tier_price;
      END IF;

      INSERT INTO public.pos_receipt_items(receipt_id, product_id, name, unit, qty, unit_price, line_total, base_product_id, base_ratio)
      VALUES (new_receipt.id, ids[i], server_name, server_unit, qtys[i], server_price, server_price*qtys[i], base_ids[i], ratios[i]);

      IF base_ids[i] IS NOT NULL THEN
        INSERT INTO public.stock_movements(product_id, move_type, qty, ref_type, ref_id, reason, created_by, note, idempotency_key)
        VALUES (base_ids[i], 'out', qtys[i]*ratios[i], 'pos_receipt', new_receipt.id, 'sell_out_linked',
                auth.uid(), 'pos_checkout ' || receipt_number || ' via wrapper ' || ids[i]::text,
                'possale:' || new_receipt.id::text || ':' || i::text);
      ELSE
        INSERT INTO public.stock_movements(product_id, move_type, qty, ref_type, ref_id, reason, created_by, note, idempotency_key)
        VALUES (ids[i], 'out', qtys[i], 'pos_receipt', new_receipt.id, 'sell_out', auth.uid(),
                'pos_checkout ' || receipt_number, 'possale:' || new_receipt.id::text || ':' || i::text);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('receipt_id',new_receipt.id,'receipt_number',receipt_number,'total',total,'replay',false);
END; $function$;

-- ============================================================
-- 3) One canonical cancel/void path
-- ============================================================
CREATE OR REPLACE FUNCTION public.pos_cancel_receipt_core(p_receipt_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.pos_receipts;
  it public.pos_receipt_items;
  v_key text;
  v_restored int := 0;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  IF p_receipt_id IS NULL THEN
    RAISE EXCEPTION 'receipt_id_required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO r FROM public.pos_receipts WHERE id=p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt_not_found' USING ERRCODE='P0002'; END IF;
  IF r.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('receipt_id',r.id,'already_cancelled',true,'restored',0);
  END IF;

  FOR it IN SELECT * FROM public.pos_receipt_items WHERE receipt_id=p_receipt_id ORDER BY id LOOP
    v_key := 'poscancel:' || r.id::text || ':' || it.id::text;
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = v_key) THEN
      CONTINUE;
    END IF;

    IF it.variant_id IS NOT NULL THEN
      INSERT INTO public.stock_movements(product_id, variant_id, move_type, qty, ref_type, ref_id, reason, created_by, note, idempotency_key)
      VALUES (it.product_id, it.variant_id, 'in', it.qty, 'pos_receipt_cancel', r.id, 'cancel_restock',
              auth.uid(), 'pos_cancel ' || r.receipt_number || COALESCE(' — ' || left(p_reason,180), ''), v_key);
    ELSIF it.base_product_id IS NOT NULL AND it.base_ratio IS NOT NULL THEN
      INSERT INTO public.stock_movements(product_id, move_type, qty, ref_type, ref_id, reason, created_by, note, idempotency_key)
      VALUES (it.base_product_id, 'in', it.qty*it.base_ratio, 'pos_receipt_cancel', r.id, 'cancel_restock_linked',
              auth.uid(), 'pos_cancel ' || r.receipt_number || COALESCE(' — ' || left(p_reason,180), ''), v_key);
    ELSIF it.product_id IS NOT NULL THEN
      INSERT INTO public.stock_movements(product_id, move_type, qty, ref_type, ref_id, reason, created_by, note, idempotency_key)
      VALUES (it.product_id, 'in', it.qty, 'pos_receipt_cancel', r.id, 'cancel_restock',
              auth.uid(), 'pos_cancel ' || r.receipt_number || COALESCE(' — ' || left(p_reason,180), ''), v_key);
    ELSE
      CONTINUE;
    END IF;
    v_restored := v_restored + 1;
  END LOOP;

  UPDATE public.pos_receipts
    SET cancelled_at=now(), cancelled_reason=p_reason, payment_status='cancelled', updated_at=now()
  WHERE id=p_receipt_id;

  RETURN jsonb_build_object('receipt_id',r.id,'already_cancelled',false,'restored',v_restored);
END; $function$;

CREATE OR REPLACE FUNCTION public.pos_cancel_receipt(p_receipt_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.pos_cancel_receipt_core(p_receipt_id, p_reason);
END; $function$;

CREATE OR REPLACE FUNCTION public.pos_cancel_sale(p_receipt_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 2 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  RETURN public.pos_cancel_receipt_core(p_receipt_id, p_reason);
END; $function$;

-- ============================================================
-- 4) RDS documents: movements only (trigger already writes stock)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rds_apply_document_stock(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doc      public.rds_documents;
  v_it       record;
  v_old      record;
  v_pid      uuid;
  v_applied  int := 0;
  v_skipped  int := 0;
  v_blocked  int := 0;
  v_reversed int := 0;
BEGIN
  SELECT * INTO v_doc FROM public.rds_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', 0, 'skipped', 0, 'reason', 'not_found');
  END IF;

  IF NOT public.is_staff_of_store(auth.uid(), v_doc.store_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_old IN
    SELECT sm.id, sm.product_id, sm.qty, sm.idempotency_key
    FROM public.stock_movements sm
    WHERE sm.ref_type = 'rds_document'
      AND sm.ref_id = p_document_id
      AND sm.move_type = 'out'
      AND sm.idempotency_key LIKE 'rdsdoc:' || p_document_id::text || ':%'
      AND NOT EXISTS (
        SELECT 1 FROM public.rds_document_items i
        WHERE i.document_id = p_document_id
          AND sm.idempotency_key = 'rdsdoc:' || p_document_id::text || ':' || i.id::text
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements rev
        WHERE rev.idempotency_key = 'rdsdocrev:' || sm.idempotency_key
      )
  LOOP
    INSERT INTO public.stock_movements (
      product_id, move_type, qty, reason, ref_type, ref_id, reference, note,
      idempotency_key, created_by
    ) VALUES (
      v_old.product_id, 'in', v_old.qty, 'cancel_restock', 'rds_document', p_document_id,
      v_doc.document_no, 'คืนสต๊อกจากการแก้ไขเอกสาร ' || COALESCE(v_doc.document_no, ''),
      'rdsdocrev:' || v_old.idempotency_key,
      auth.uid()
    )
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    v_reversed := v_reversed + 1;
  END LOOP;

  IF COALESCE(v_doc.internal_sale_type, 'real_goods') <> 'real_goods'
     OR v_doc.deleted_at IS NOT NULL
     OR lower(COALESCE(v_doc.status, '')) IN ('cancelled', 'canceled', 'void', 'draft')
     OR COALESCE(v_doc.document_type, '') NOT IN ('receipt', 'delivery', 'tax_invoice') THEN
    RETURN jsonb_build_object('applied', 0, 'skipped', 0, 'reversed', v_reversed, 'reason', 'not_applicable');
  END IF;

  FOR v_it IN
    SELECT i.id, i.product_id, i.name, i.quantity
    FROM public.rds_document_items i
    WHERE i.document_id = p_document_id AND COALESCE(i.quantity, 0) > 0
  LOOP
    v_pid := NULL;

    IF v_it.product_id IS NOT NULL THEN
      SELECT rp.canonical_product_id INTO v_pid
      FROM public.rds_products rp
      WHERE rp.id = v_it.product_id;

      IF v_pid IS NULL THEN
        SELECT p.id INTO v_pid
        FROM public.rds_products rp
        JOIN public.products p
          ON p.deleted_at IS NULL
         AND (
              (rp.barcode IS NOT NULL AND rp.barcode <> '' AND p.barcode = rp.barcode)
           OR (rp.sku IS NOT NULL AND rp.sku <> '' AND p.code = rp.sku)
           OR (lower(btrim(p.name)) = lower(btrim(rp.name)))
         )
        WHERE rp.id = v_it.product_id
        LIMIT 1;
      END IF;
    END IF;

    IF v_pid IS NULL AND v_it.name IS NOT NULL AND btrim(v_it.name) <> '' THEN
      SELECT p.id INTO v_pid
      FROM public.products p
      WHERE p.deleted_at IS NULL
        AND lower(btrim(p.name)) = lower(btrim(v_it.name))
      LIMIT 1;
    END IF;

    IF v_pid IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.stock_movements (
        product_id, move_type, qty, reason, ref_type, ref_id, reference, note,
        idempotency_key, created_by
      ) VALUES (
        v_pid, 'out', v_it.quantity, 'sell_out', 'rds_document', p_document_id,
        v_doc.document_no, 'ขายจริงจากเอกสาร ' || COALESCE(v_doc.document_no, ''),
        'rdsdoc:' || p_document_id::text || ':' || v_it.id::text,
        auth.uid()
      )
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
      v_applied := v_applied + 1;
    EXCEPTION WHEN sqlstate '55000' THEN
      -- stock would go negative: never block issuing the document, report instead
      v_blocked := v_blocked + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('applied', v_applied, 'skipped', v_skipped, 'blocked', v_blocked, 'reversed', v_reversed);
END;
$function$;

-- ============================================================
-- 5) MyShop order stock: tolerate the negative-stock guard
-- ============================================================
CREATE OR REPLACE FUNCTION public.myshop_apply_order_stock(p_order_number text, p_direction text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.myshop_orders%ROWTYPE;
  it record;
  v_key text;
  v_count int := 0;
  v_blocked int := 0;
BEGIN
  IF p_direction NOT IN ('deduct','restore') THEN
    RAISE EXCEPTION 'invalid_direction' USING ERRCODE='22023';
  END IF;

  SELECT * INTO r FROM public.myshop_orders WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_order'); END IF;
  IF r.order_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_local_order'); END IF;

  IF p_direction = 'deduct' AND r.stock_deducted THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'already_deducted');
  END IF;
  IF p_direction = 'restore' AND (NOT r.stock_deducted OR r.stock_restored) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'nothing_to_restore');
  END IF;

  FOR it IN
    SELECT id, product_id, qty FROM public.order_items
    WHERE order_id = r.order_id AND product_id IS NOT NULL AND qty > 0
  LOOP
    v_key := 'myshop:' || r.order_number || ':' || p_direction || ':' || it.id::text;
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = v_key) THEN
      CONTINUE;
    END IF;
    BEGIN
      INSERT INTO public.stock_movements
        (product_id, move_type, qty, reason, reference, note, idempotency_key, ref_type, ref_id)
      VALUES (
        it.product_id,
        CASE WHEN p_direction = 'deduct' THEN 'out' ELSE 'in' END::stock_move_type,
        it.qty,
        CASE WHEN p_direction = 'deduct' THEN 'sell_out' ELSE 'cancel_restock' END::stock_reason,
        r.order_number,
        'LINE MyShop ' || r.order_number,
        v_key,
        'myshop_order',
        r.order_id
      );
      v_count := v_count + 1;
    EXCEPTION WHEN sqlstate '55000' THEN
      v_blocked := v_blocked + 1;
    END;
  END LOOP;

  IF p_direction = 'deduct' THEN
    UPDATE public.myshop_orders SET stock_deducted = true, stock_deducted_at = now() WHERE id = r.id;
  ELSE
    UPDATE public.myshop_orders SET stock_restored = true, stock_restored_at = now() WHERE id = r.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'movements', v_count, 'blocked', v_blocked);
END $function$;

-- ============================================================
-- 6) Read-only reconciliation report (never rewrites stock)
-- ============================================================
CREATE OR REPLACE FUNCTION public.stock_reconciliation_report(p_limit integer DEFAULT 100)
RETURNS TABLE(
  product_id uuid,
  code text,
  name text,
  current_stock numeric,
  movement_net numeric,
  implied_opening numeric,
  has_variants boolean,
  variant_sum numeric,
  parent_mismatch boolean,
  negative boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.code,
    p.name,
    COALESCE(p.stock, 0),
    COALESCE(m.net, 0),
    COALESCE(p.stock, 0) - COALESCE(m.net, 0),
    p.has_variants,
    COALESCE(v.sum_stock, 0),
    (p.has_variants AND COALESCE(p.stock,0) <> COALESCE(v.sum_stock, 0)),
    (COALESCE(p.stock, 0) < 0 OR COALESCE(v.min_stock, 0) < 0)
  FROM public.products p
  LEFT JOIN (
    SELECT product_id,
           SUM(CASE WHEN move_type = 'in' THEN qty WHEN move_type = 'out' THEN -qty ELSE 0 END) AS net
    FROM public.stock_movements
    GROUP BY product_id
  ) m ON m.product_id = p.id
  LEFT JOIN (
    SELECT product_id, SUM(stock) AS sum_stock, MIN(stock) AS min_stock
    FROM public.product_variants WHERE active = true AND archived_at IS NULL
    GROUP BY product_id
  ) v ON v.product_id = p.id
  WHERE p.deleted_at IS NULL
    AND public.is_staff_any(auth.uid())
    AND (
      COALESCE(p.stock, 0) < 0
      OR COALESCE(v.min_stock, 0) < 0
      OR (p.has_variants AND COALESCE(p.stock,0) <> COALESCE(v.sum_stock, 0))
    )
  ORDER BY p.name
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$function$;

REVOKE ALL ON FUNCTION public.pos_cancel_receipt_core(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_cancel_receipt_core(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_reconciliation_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_reconciliation_report(integer) TO authenticated, service_role;