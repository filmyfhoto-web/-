
CREATE OR REPLACE FUNCTION public.trg_stock_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    UPDATE public.products SET stock = v_after WHERE id = NEW.product_id;
  END IF;

  NEW.before_qty := v_before;
  NEW.after_qty := v_after;
  RETURN NEW;
END $$;

-- Additional guard: pos_adjust_stock rejects negative results (already true; explicit re-check)
CREATE OR REPLACE FUNCTION public.pos_adjust_stock(
  p_product_id uuid,
  p_variant_id uuid,
  p_mode text,
  p_qty numeric,
  p_reason text DEFAULT 'other',
  p_reference text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing uuid; v_move_type text; v_qty numeric;
  v_is_wrapper boolean; v_id uuid;
  v_before numeric; v_after numeric;
BEGIN
  IF NOT public.can_edit_product(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF p_qty IS NULL OR p_qty < 0 THEN RAISE EXCEPTION 'invalid_qty' USING ERRCODE='22023'; END IF;
  IF p_mode NOT IN ('add','reduce','set') THEN RAISE EXCEPTION 'invalid_mode' USING ERRCODE='22023'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.stock_movements WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.product_unit_links WHERE wrapper_id = p_product_id AND enabled = true) INTO v_is_wrapper;
  IF v_is_wrapper THEN
    RAISE EXCEPTION 'wrapper_stock_locked' USING ERRCODE='23514',
      HINT='ปรับสต๊อกที่สินค้าหน่วยเล็ก (base) แทน';
  END IF;

  IF p_variant_id IS NOT NULL THEN
    PERFORM 1 FROM public.product_variants WHERE id = p_variant_id AND product_id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'variant_mismatch' USING ERRCODE='22023'; END IF;
    SELECT stock INTO v_before FROM public.product_variants WHERE id = p_variant_id;
  ELSE
    SELECT stock INTO v_before FROM public.products WHERE id = p_product_id;
  END IF;
  v_before := COALESCE(v_before, 0);

  IF p_mode = 'add' THEN v_move_type := 'in'; v_qty := p_qty; v_after := v_before + p_qty;
  ELSIF p_mode = 'reduce' THEN v_move_type := 'out'; v_qty := p_qty; v_after := v_before - p_qty;
  ELSE v_move_type := 'adjust'; v_qty := p_qty; v_after := p_qty;
  END IF;

  IF v_after < 0 THEN
    RAISE EXCEPTION 'insufficient_stock' USING ERRCODE='23514',
      HINT='ผลลัพธ์ติดลบ - สต๊อกไม่พอ';
  END IF;

  INSERT INTO public.stock_movements
    (product_id, variant_id, move_type, qty, reason, note, reference, idempotency_key, created_by)
  VALUES
    (p_product_id, p_variant_id, v_move_type::stock_move_type, v_qty,
     COALESCE(p_reason,'other')::stock_reason, p_note, p_reference, p_idempotency_key, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.pos_adjust_stock(uuid,uuid,text,numeric,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.pos_adjust_stock(uuid,uuid,text,numeric,text,text,text,text) TO authenticated;
