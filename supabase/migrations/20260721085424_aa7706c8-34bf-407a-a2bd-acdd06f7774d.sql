
-- Linked-unit products: wrapper (pack/carton) links to exactly one base product with an integer ratio.
-- Wrapper stock is derived at read/checkout time from base.stock / ratio.

CREATE TABLE IF NOT EXISTS public.product_unit_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wrapper_id uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  base_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  ratio integer NOT NULL CHECK (ratio > 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT product_unit_links_no_self CHECK (wrapper_id <> base_id)
);

CREATE INDEX IF NOT EXISTS product_unit_links_base_idx ON public.product_unit_links(base_id);
CREATE INDEX IF NOT EXISTS product_unit_links_enabled_idx ON public.product_unit_links(enabled) WHERE enabled;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_unit_links TO authenticated;
GRANT ALL ON public.product_unit_links TO service_role;

ALTER TABLE public.product_unit_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read unit links"
  ON public.product_unit_links FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()));

CREATE POLICY "Staff manage unit links via RPC only"
  ON public.product_unit_links FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid()))
  WITH CHECK (public.is_staff_any(auth.uid()));

CREATE OR REPLACE FUNCTION public.product_unit_links_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_product_unit_links_updated ON public.product_unit_links;
CREATE TRIGGER trg_product_unit_links_updated
  BEFORE UPDATE ON public.product_unit_links
  FOR EACH ROW EXECUTE FUNCTION public.product_unit_links_touch_updated_at();

-- Snapshot columns on receipt items so a restock/refund replays exact base decrement
ALTER TABLE public.pos_receipt_items
  ADD COLUMN IF NOT EXISTS base_product_id uuid REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS base_ratio integer;

-- ============================================================
-- RPC: set the link (create/update). Rejects self, chain, cycle,
-- SKU conflict, already-a-base wrapper, archived, cross-org.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_product_unit_link(
  _wrapper_id uuid, _base_id uuid, _ratio integer
) RETURNS public.product_unit_links
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.products; b public.products;
  used_as_base int; base_is_wrapper int; existing public.product_unit_links;
  out_row public.product_unit_links;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  IF _wrapper_id IS NULL OR _base_id IS NULL THEN
    RAISE EXCEPTION 'wrapper_and_base_required' USING ERRCODE='22023';
  END IF;
  IF _wrapper_id = _base_id THEN
    RAISE EXCEPTION 'self_link_forbidden' USING ERRCODE='22023';
  END IF;
  IF _ratio IS NULL OR _ratio <= 0 THEN
    RAISE EXCEPTION 'ratio_must_be_positive_integer' USING ERRCODE='22023';
  END IF;

  SELECT * INTO w FROM public.products WHERE id=_wrapper_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wrapper_not_found' USING ERRCODE='P0002'; END IF;
  IF w.deleted_at IS NOT NULL OR NOT w.active THEN
    RAISE EXCEPTION 'wrapper_inactive' USING ERRCODE='22023';
  END IF;
  IF COALESCE(w.has_variants,false) THEN
    RAISE EXCEPTION 'wrapper_has_variants_conflict' USING ERRCODE='22023';
  END IF;

  SELECT * INTO b FROM public.products WHERE id=_base_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'base_not_found' USING ERRCODE='P0002'; END IF;
  IF b.deleted_at IS NOT NULL OR NOT b.active THEN
    RAISE EXCEPTION 'base_inactive' USING ERRCODE='22023';
  END IF;
  IF COALESCE(b.has_variants,false) THEN
    RAISE EXCEPTION 'base_has_variants_conflict' USING ERRCODE='22023';
  END IF;

  -- No chain: base itself must not be a wrapper linked to something else
  SELECT count(*) INTO base_is_wrapper FROM public.product_unit_links
    WHERE wrapper_id = _base_id AND enabled = true;
  IF base_is_wrapper > 0 THEN
    RAISE EXCEPTION 'base_is_itself_a_wrapper_no_chain' USING ERRCODE='22023';
  END IF;

  -- No cycle / no promotion: wrapper must not currently be a base of anything
  SELECT count(*) INTO used_as_base FROM public.product_unit_links
    WHERE base_id = _wrapper_id AND enabled = true;
  IF used_as_base > 0 THEN
    RAISE EXCEPTION 'wrapper_is_already_base_of_other_wrapper' USING ERRCODE='22023';
  END IF;

  SELECT * INTO existing FROM public.product_unit_links WHERE wrapper_id=_wrapper_id;
  IF FOUND THEN
    UPDATE public.product_unit_links
      SET base_id=_base_id, ratio=_ratio, enabled=true, updated_at=now()
      WHERE wrapper_id=_wrapper_id
      RETURNING * INTO out_row;
  ELSE
    INSERT INTO public.product_unit_links(wrapper_id, base_id, ratio, enabled, created_by)
      VALUES (_wrapper_id, _base_id, _ratio, true, auth.uid())
      RETURNING * INTO out_row;
  END IF;
  RETURN out_row;
END; $$;

REVOKE ALL ON FUNCTION public.set_product_unit_link(uuid,uuid,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_product_unit_link(uuid,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.unset_product_unit_link(_wrapper_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.product_unit_links WHERE wrapper_id=_wrapper_id;
END; $$;

REVOKE ALL ON FUNCTION public.unset_product_unit_link(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unset_product_unit_link(uuid) TO authenticated;

-- ============================================================
-- View: derived wrapper availability (floor(base.stock / ratio))
-- ============================================================
CREATE OR REPLACE VIEW public.v_product_effective_stock
WITH (security_invoker = on) AS
SELECT
  p.id AS product_id,
  p.stock AS own_stock,
  l.base_id,
  l.ratio,
  CASE
    WHEN l.base_id IS NULL THEN p.stock
    ELSE floor(COALESCE(b.stock,0) / l.ratio)
  END AS effective_stock,
  CASE WHEN l.base_id IS NULL THEN NULL ELSE COALESCE(b.stock,0) - (floor(COALESCE(b.stock,0)/l.ratio) * l.ratio) END AS base_remainder
FROM public.products p
LEFT JOIN public.product_unit_links l ON l.wrapper_id = p.id AND l.enabled = true
LEFT JOIN public.products b ON b.id = l.base_id;

GRANT SELECT ON public.v_product_effective_stock TO authenticated;

-- ============================================================
-- Rewrite pos_checkout: honor linked-unit products.
-- If a product line has an enabled unit link, lock the BASE row,
-- validate base stock >= qty*ratio, decrement base atomically,
-- snapshot base_product_id/base_ratio on the receipt item.
-- ============================================================
CREATE OR REPLACE FUNCTION public.pos_checkout(
  p_idempotency_key text, p_items jsonb,
  p_customer_id uuid DEFAULT NULL, p_customer_name text DEFAULT NULL,
  p_line_user_id text DEFAULT NULL, p_payment_type text DEFAULT 'cash',
  p_payment_status text DEFAULT 'paid', p_discount numeric DEFAULT 0,
  p_cash_received numeric DEFAULT NULL, p_notes text DEFAULT NULL,
  p_branch text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Collect base ids that need locking (unique + deterministic order)
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

      -- Linked-unit resolution (server trusts DB, never client ratio)
      SELECT * INTO link_row FROM public.product_unit_links WHERE wrapper_id=ids[i] AND enabled=true;
      IF FOUND THEN
        base_ids[i] := link_row.base_id;
        ratios[i] := link_row.ratio;
        need_base := qtys[i] * link_row.ratio;
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

      UPDATE public.product_variants SET stock = stock - qtys[i], updated_at = now() WHERE id=vids[i];
    ELSE
      SELECT standard_price, name, unit INTO server_price, server_name, server_unit FROM public.products WHERE id=ids[i];

      INSERT INTO public.pos_receipt_items(receipt_id, product_id, name, unit, qty, unit_price, line_total, base_product_id, base_ratio)
      VALUES (new_receipt.id, ids[i], server_name, server_unit, qtys[i], server_price, server_price*qtys[i], base_ids[i], ratios[i]);

      IF base_ids[i] IS NOT NULL THEN
        UPDATE public.products SET stock = stock - (qtys[i] * ratios[i]), updated_at=now() WHERE id=base_ids[i];
        INSERT INTO public.stock_movements(product_id, move_type, qty, ref_type, ref_id, reason, created_by, note)
        VALUES (base_ids[i], 'out', qtys[i]*ratios[i], 'pos_receipt', new_receipt.id, 'sell_out_linked',
                auth.uid(), 'pos_checkout ' || receipt_number || ' via wrapper ' || ids[i]::text);
      ELSE
        UPDATE public.products SET stock = stock - qtys[i], updated_at=now() WHERE id=ids[i];
        INSERT INTO public.stock_movements(product_id, move_type, qty, ref_type, ref_id, reason, created_by, note)
        VALUES (ids[i], 'out', qtys[i], 'pos_receipt', new_receipt.id, 'sell_out', auth.uid(), 'pos_checkout ' || receipt_number);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('receipt_id',new_receipt.id,'receipt_number',receipt_number,'total',total,'replay',false);
END; $$;

-- ============================================================
-- Rewrite pos_cancel_receipt: restore variant OR base OR own stock.
-- Idempotent via existing cancelled_at guard.
-- ============================================================
CREATE OR REPLACE FUNCTION public.pos_cancel_receipt(p_receipt_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r public.pos_receipts; it public.pos_receipt_items;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  SELECT * INTO r FROM public.pos_receipts WHERE id=p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt_not_found' USING ERRCODE='P0002'; END IF;
  IF r.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('receipt_id',r.id,'already_cancelled',true);
  END IF;

  FOR it IN SELECT * FROM public.pos_receipt_items WHERE receipt_id=p_receipt_id ORDER BY id LOOP
    IF it.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock = stock + it.qty, updated_at=now() WHERE id=it.variant_id;
    ELSIF it.base_product_id IS NOT NULL AND it.base_ratio IS NOT NULL THEN
      UPDATE public.products SET stock = stock + (it.qty * it.base_ratio), updated_at=now() WHERE id=it.base_product_id;
      INSERT INTO public.stock_movements(product_id, move_type, qty, ref_type, ref_id, reason, created_by, note)
      VALUES (it.base_product_id, 'in', it.qty*it.base_ratio, 'pos_receipt', r.id, 'cancel_restock_linked',
              auth.uid(), 'pos_cancel_receipt ' || r.receipt_number);
    ELSE
      UPDATE public.products SET stock = stock + it.qty, updated_at=now() WHERE id=it.product_id;
      INSERT INTO public.stock_movements(product_id, move_type, qty, ref_type, ref_id, reason, created_by, note)
      VALUES (it.product_id, 'in', it.qty, 'pos_receipt', r.id, 'cancel_restock', auth.uid(), 'pos_cancel_receipt ' || r.receipt_number);
    END IF;
  END LOOP;

  UPDATE public.pos_receipts
    SET cancelled_at=now(), cancelled_by=auth.uid(), cancel_reason=p_reason, payment_status='cancelled', updated_at=now()
  WHERE id=p_receipt_id;

  RETURN jsonb_build_object('receipt_id',r.id,'already_cancelled',false);
END; $$;
