CREATE OR REPLACE FUNCTION public.pos_po_upsert(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_status po_status;
  v_line jsonb;
  v_po_no text;
  v_next bigint;
  v_prefix text;
  v_product_id uuid;
  v_variant_id uuid;
  v_qty numeric; v_cost numeric; v_disc_amt numeric; v_disc_pct numeric;
  v_line_total numeric;
  v_prod record;
  v_var_name text;
  v_var_sku text;
  v_var_barcode text;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  v_id := NULLIF(p->>'id','')::uuid;

  IF v_id IS NULL THEN
    v_prefix := 'PO' || to_char(now(),'YYYYMMDD') || '-';
    SELECT COALESCE(MAX(NULLIF(substring(po_no from length(v_prefix)+1),'')::bigint),0) + 1
      INTO v_next
      FROM public.purchase_orders
     WHERE po_no LIKE v_prefix || '%';
    v_po_no := v_prefix || lpad(v_next::text,4,'0');
    INSERT INTO public.purchase_orders
      (po_no, supplier_id, supplier_name, status, note, reference, cost_method,
       discount_amount, shipping_cost, other_cost, vat_rate, vat_enabled, vat_included, created_by)
    VALUES (
      v_po_no,
      NULLIF(p->>'supplier_id','')::uuid,
      NULLIF(p->>'supplier_name',''),
      COALESCE(NULLIF(p->>'status','')::po_status, 'draft'),
      NULLIF(p->>'note',''),
      NULLIF(p->>'reference',''),
      COALESCE(NULLIF(p->>'cost_method',''),'last'),
      COALESCE((p->>'discount_amount')::numeric,0),
      COALESCE((p->>'shipping_cost')::numeric,0),
      COALESCE((p->>'other_cost')::numeric,0),
      COALESCE((p->>'vat_rate')::numeric,7),
      COALESCE((p->>'vat_enabled')::boolean,false),
      COALESCE((p->>'vat_included')::boolean,false),
      auth.uid()
    ) RETURNING id INTO v_id;
    INSERT INTO public.po_status_history(po_id, actor, from_status, to_status, note)
      VALUES (v_id, auth.uid(), NULL, 'draft', 'สร้างใบสั่งซื้อ');
  ELSE
    SELECT status INTO v_status FROM public.purchase_orders WHERE id = v_id FOR UPDATE;
    IF v_status NOT IN ('draft','pending_approval') THEN
      RAISE EXCEPTION 'po_not_editable' USING ERRCODE='23514',
        HINT='ใบสั่งซื้อสถานะนี้แก้ไขไม่ได้';
    END IF;
    UPDATE public.purchase_orders SET
      supplier_id = NULLIF(p->>'supplier_id','')::uuid,
      supplier_name = NULLIF(p->>'supplier_name',''),
      note = NULLIF(p->>'note',''),
      reference = NULLIF(p->>'reference',''),
      cost_method = COALESCE(NULLIF(p->>'cost_method',''),'last'),
      discount_amount = COALESCE((p->>'discount_amount')::numeric,0),
      shipping_cost = COALESCE((p->>'shipping_cost')::numeric,0),
      other_cost = COALESCE((p->>'other_cost')::numeric,0),
      vat_rate = COALESCE((p->>'vat_rate')::numeric,7),
      vat_enabled = COALESCE((p->>'vat_enabled')::boolean,false),
      vat_included = COALESCE((p->>'vat_included')::boolean,false),
      updated_by = auth.uid()
    WHERE id = v_id;
    DELETE FROM public.purchase_order_items WHERE po_id = v_id;
  END IF;

  IF jsonb_typeof(p->'lines') = 'array' THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p->'lines') LOOP
      v_product_id := NULLIF(v_line->>'product_id','')::uuid;
      v_variant_id := NULLIF(v_line->>'variant_id','')::uuid;
      IF v_product_id IS NULL THEN CONTINUE; END IF;
      v_qty := COALESCE((v_line->>'qty')::numeric,0);
      IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_line_qty' USING ERRCODE='22023'; END IF;
      v_cost := COALESCE((v_line->>'unit_cost')::numeric,0);
      v_disc_amt := COALESCE((v_line->>'discount_amount')::numeric,0);
      v_disc_pct := COALESCE((v_line->>'discount_percent')::numeric,0);
      v_line_total := GREATEST(v_qty * v_cost - v_disc_amt - (v_qty * v_cost * v_disc_pct / 100.0), 0);
      SELECT code, name, unit, barcode INTO v_prod FROM public.products WHERE id = v_product_id;
      v_var_name := NULL; v_var_sku := NULL; v_var_barcode := NULL;
      IF v_variant_id IS NOT NULL THEN
        SELECT name, sku, barcode INTO v_var_name, v_var_sku, v_var_barcode
          FROM public.product_variants WHERE id = v_variant_id AND product_id = v_product_id AND active = true;
        IF NOT FOUND THEN RAISE EXCEPTION 'variant_required_or_invalid' USING ERRCODE='22023'; END IF;
      END IF;
      INSERT INTO public.purchase_order_items
        (po_id, product_id, variant_id, product_name, snapshot_name, snapshot_code, snapshot_barcode, snapshot_unit,
         qty, cost_price, unit_cost, discount_amount, discount_percent, total, line_total)
      VALUES (
        v_id, v_product_id, v_variant_id, v_prod.name,
        COALESCE(v_var_name, v_prod.name),
        COALESCE(v_var_sku, v_prod.code),
        COALESCE(v_var_barcode, v_prod.barcode),
        v_prod.unit,
        v_qty, v_cost, v_cost, v_disc_amt, v_disc_pct, v_line_total, v_line_total
      );
    END LOOP;
  END IF;

  PERFORM public._po_recalc_totals(v_id);
  RETURN v_id;
END $function$;