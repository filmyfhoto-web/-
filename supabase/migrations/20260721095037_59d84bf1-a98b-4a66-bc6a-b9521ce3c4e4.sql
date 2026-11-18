
-- ============================================================
-- STEP 6: Stock adjustment audit fields + variant-aware trigger
-- ============================================================

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS before_qty numeric,
  ADD COLUMN IF NOT EXISTS after_qty numeric;

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_idempotency_uidx
  ON public.stock_movements(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_movements_variant_idx
  ON public.stock_movements(variant_id) WHERE variant_id IS NOT NULL;

-- Replacement trigger: variant-aware; sets before/after; keeps parent sum in sync
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
  ELSE v_delta := NULL; -- adjust = absolute set
  END IF;

  IF NEW.variant_id IS NOT NULL THEN
    SELECT stock INTO v_before FROM public.product_variants WHERE id = NEW.variant_id FOR UPDATE;
    v_before := COALESCE(v_before, 0);
    IF v_delta IS NULL THEN v_after := NEW.qty;
    ELSE v_after := v_before + v_delta;
    END IF;
    IF v_after < 0 THEN RAISE EXCEPTION 'insufficient_variant_stock' USING ERRCODE='23514'; END IF;
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
    IF v_after < 0 THEN RAISE EXCEPTION 'insufficient_stock' USING ERRCODE='23514'; END IF;
    UPDATE public.products SET stock = v_after WHERE id = NEW.product_id;
  END IF;

  NEW.before_qty := v_before;
  NEW.after_qty := v_after;
  RETURN NEW;
END $$;

-- Convert stock_apply into BEFORE INSERT so before/after land in the row itself
DROP TRIGGER IF EXISTS stock_apply ON public.stock_movements;
CREATE TRIGGER stock_apply
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_stock_apply();

-- Quick-adjust RPC: modes add/reduce/set, wrapper-rejection, idempotent
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_move_type text;
  v_qty numeric;
  v_is_wrapper boolean;
  v_id uuid;
BEGIN
  IF NOT public.can_edit_product(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF p_qty IS NULL OR p_qty < 0 THEN RAISE EXCEPTION 'invalid_qty' USING ERRCODE='22023'; END IF;
  IF p_mode NOT IN ('add','reduce','set') THEN RAISE EXCEPTION 'invalid_mode' USING ERRCODE='22023'; END IF;
  IF p_product_id IS NULL THEN RAISE EXCEPTION 'invalid_product' USING ERRCODE='22023'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.stock_movements WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.product_unit_links
    WHERE wrapper_id = p_product_id AND enabled = true
  ) INTO v_is_wrapper;
  IF v_is_wrapper THEN
    RAISE EXCEPTION 'wrapper_stock_locked' USING ERRCODE='23514',
      HINT = 'ปรับสต๊อกที่สินค้าหน่วยเล็ก (base) แทน';
  END IF;

  IF p_variant_id IS NOT NULL THEN
    PERFORM 1 FROM public.product_variants WHERE id = p_variant_id AND product_id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'variant_mismatch' USING ERRCODE='22023'; END IF;
  END IF;

  IF p_mode = 'add' THEN v_move_type := 'in'; v_qty := p_qty;
  ELSIF p_mode = 'reduce' THEN v_move_type := 'out'; v_qty := p_qty;
  ELSE v_move_type := 'adjust'; v_qty := p_qty;
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

-- ============================================================
-- STEP 7: Suppliers additive columns + upsert/archive RPCs
-- ============================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS branch text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_code_uidx
  ON public.suppliers(lower(code)) WHERE code IS NOT NULL AND archived_at IS NULL;

-- Idempotent default supplier seed
INSERT INTO public.suppliers (name, code, is_active)
SELECT 'ผู้ขายทั่วไป', 'GENERAL', true
WHERE NOT EXISTS (SELECT 1 FROM public.suppliers WHERE lower(code) = 'general');

CREATE OR REPLACE FUNCTION public.pos_supplier_upsert(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  v_id := NULLIF(p->>'id','')::uuid;
  IF v_id IS NULL THEN
    INSERT INTO public.suppliers (name, code, branch, phone, email, tax_id, address, note, is_active, created_by)
    VALUES (
      NULLIF(p->>'name',''), NULLIF(p->>'code',''), NULLIF(p->>'branch',''),
      NULLIF(p->>'phone',''), NULLIF(p->>'email',''), NULLIF(p->>'tax_id',''),
      NULLIF(p->>'address',''), NULLIF(p->>'note',''),
      COALESCE((p->>'is_active')::boolean, true), auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.suppliers SET
      name = COALESCE(NULLIF(p->>'name',''), name),
      code = NULLIF(p->>'code',''),
      branch = NULLIF(p->>'branch',''),
      phone = NULLIF(p->>'phone',''),
      email = NULLIF(p->>'email',''),
      tax_id = NULLIF(p->>'tax_id',''),
      address = NULLIF(p->>'address',''),
      note = NULLIF(p->>'note',''),
      is_active = COALESCE((p->>'is_active')::boolean, is_active),
      updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.pos_supplier_upsert(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.pos_supplier_upsert(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_supplier_archive(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_refs int;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT COUNT(*) INTO v_refs FROM public.purchase_orders WHERE supplier_id = p_id;
  IF v_refs > 0 THEN
    RAISE EXCEPTION 'supplier_in_use' USING ERRCODE='23503',
      HINT='ไม่สามารถลบผู้ขายที่ถูกใช้ในใบสั่งซื้อได้ กรุณาปิดใช้งานแทน';
  END IF;
  UPDATE public.suppliers SET archived_at = now(), is_active = false WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.pos_supplier_archive(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pos_supplier_archive(uuid) TO authenticated;

-- ============================================================
-- STEP 7: Purchase order status enum & header/line additive columns
-- ============================================================

DO $$ BEGIN
  ALTER TYPE public.po_status ADD VALUE IF NOT EXISTS 'pending_approval';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.po_status ADD VALUE IF NOT EXISTS 'approved_waiting_receipt';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.po_status ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS vat_included boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_method text NOT NULL DEFAULT 'last',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_cost_method_chk;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_cost_method_chk CHECK (cost_method IN ('last','average'));

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snapshot_name text,
  ADD COLUMN IF NOT EXISTS snapshot_code text,
  ADD COLUMN IF NOT EXISTS snapshot_barcode text,
  ADD COLUMN IF NOT EXISTS snapshot_unit text,
  ADD COLUMN IF NOT EXISTS unit_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS base_ratio integer;

CREATE INDEX IF NOT EXISTS po_items_po_idx ON public.purchase_order_items(po_id);

-- ============================================================
-- STEP 7: New tables — receipts, receipt items, status history
-- ============================================================

CREATE TABLE IF NOT EXISTS public.po_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  received_by uuid REFERENCES auth.users(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  note text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.po_receipts TO authenticated;
GRANT ALL ON public.po_receipts TO service_role;
ALTER TABLE public.po_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read po_receipts" ON public.po_receipts FOR SELECT TO authenticated USING (public.is_staff_any(auth.uid()));

CREATE TABLE IF NOT EXISTS public.po_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.po_receipts(id) ON DELETE CASCADE,
  po_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
  qty numeric NOT NULL CHECK (qty > 0),
  base_qty numeric,
  base_product_id uuid REFERENCES public.products(id),
  ratio_snapshot integer,
  unit_cost_snapshot numeric NOT NULL DEFAULT 0
);
GRANT SELECT ON public.po_receipt_items TO authenticated;
GRANT ALL ON public.po_receipt_items TO service_role;
ALTER TABLE public.po_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read po_receipt_items" ON public.po_receipt_items FOR SELECT TO authenticated USING (public.is_staff_any(auth.uid()));

CREATE TABLE IF NOT EXISTS public.po_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  actor uuid REFERENCES auth.users(id),
  at timestamptz NOT NULL DEFAULT now(),
  from_status text,
  to_status text NOT NULL,
  note text
);
CREATE INDEX IF NOT EXISTS po_status_history_po_idx ON public.po_status_history(po_id, at DESC);
GRANT SELECT ON public.po_status_history TO authenticated;
GRANT ALL ON public.po_status_history TO service_role;
ALTER TABLE public.po_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read po_status_history" ON public.po_status_history FOR SELECT TO authenticated USING (public.is_staff_any(auth.uid()));

-- ============================================================
-- STEP 7: Helper to compute totals (idempotent, deterministic)
-- ============================================================

CREATE OR REPLACE FUNCTION public._po_recalc_totals(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sub numeric := 0; v_disc numeric; v_ship numeric; v_other numeric;
  v_vat_rate numeric; v_vat_on boolean; v_vat_incl boolean;
  v_taxable numeric; v_vat numeric; v_total numeric;
BEGIN
  SELECT COALESCE(SUM(line_total),0) INTO v_sub FROM public.purchase_order_items WHERE po_id = p_po_id;
  SELECT discount_amount, shipping_cost, other_cost, vat_rate, vat_enabled, vat_included
    INTO v_disc, v_ship, v_other, v_vat_rate, v_vat_on, v_vat_incl
    FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  v_taxable := GREATEST(v_sub - COALESCE(v_disc,0), 0) + COALESCE(v_ship,0) + COALESCE(v_other,0);
  IF v_vat_on THEN
    IF v_vat_incl THEN
      v_vat := round(v_taxable * v_vat_rate / (100 + v_vat_rate), 2);
      v_total := v_taxable;
    ELSE
      v_vat := round(v_taxable * v_vat_rate / 100, 2);
      v_total := v_taxable + v_vat;
    END IF;
  ELSE
    v_vat := 0;
    v_total := v_taxable;
  END IF;
  UPDATE public.purchase_orders
     SET subtotal = v_sub, vat_amount = v_vat, grand_total = v_total, total = v_total, updated_at = now()
   WHERE id = p_po_id;
END $$;

-- ============================================================
-- STEP 7: PO upsert (draft/pending, no stock touch)
-- ============================================================

CREATE OR REPLACE FUNCTION public.pos_po_upsert(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status po_status;
  v_line jsonb;
  v_po_no text;
  v_next int;
  v_product_id uuid;
  v_variant_id uuid;
  v_qty numeric; v_cost numeric; v_disc_amt numeric; v_disc_pct numeric;
  v_line_total numeric;
  v_prod record;
  v_var record;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  v_id := NULLIF(p->>'id','')::uuid;

  IF v_id IS NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(po_no, '\D', '', 'g'),'')::bigint),0)::int + 1 INTO v_next
      FROM public.purchase_orders WHERE po_no LIKE 'PO%';
    v_po_no := 'PO' || to_char(now(),'YYYYMMDD') || '-' || lpad(v_next::text,4,'0');
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
      cost_method = COALESCE(NULLIF(p->>'cost_method',''), cost_method),
      discount_amount = COALESCE((p->>'discount_amount')::numeric, discount_amount),
      shipping_cost = COALESCE((p->>'shipping_cost')::numeric, shipping_cost),
      other_cost = COALESCE((p->>'other_cost')::numeric, other_cost),
      vat_rate = COALESCE((p->>'vat_rate')::numeric, vat_rate),
      vat_enabled = COALESCE((p->>'vat_enabled')::boolean, vat_enabled),
      vat_included = COALESCE((p->>'vat_included')::boolean, vat_included),
      updated_by = auth.uid(), updated_at = now()
    WHERE id = v_id;
    -- Replace lines
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
      IF v_variant_id IS NOT NULL THEN
        SELECT sku, name, barcode INTO v_var FROM public.product_variants WHERE id = v_variant_id AND product_id = v_product_id AND active = true;
        IF NOT FOUND THEN RAISE EXCEPTION 'variant_required_or_invalid' USING ERRCODE='22023'; END IF;
      END IF;
      INSERT INTO public.purchase_order_items
        (po_id, product_id, variant_id, product_name, snapshot_name, snapshot_code, snapshot_barcode, snapshot_unit,
         qty, cost_price, unit_cost, discount_amount, discount_percent, total, line_total)
      VALUES (
        v_id, v_product_id, v_variant_id, v_prod.name,
        COALESCE(v_var.name, v_prod.name),
        COALESCE(v_var.sku, v_prod.code),
        COALESCE(v_var.barcode, v_prod.barcode),
        v_prod.unit,
        v_qty, v_cost, v_cost, v_disc_amt, v_disc_pct, v_line_total, v_line_total
      );
    END LOOP;
  END IF;

  PERFORM public._po_recalc_totals(v_id);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.pos_po_upsert(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.pos_po_upsert(jsonb) TO authenticated;

-- ============================================================
-- STEP 7: State-machine RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public._po_transition(p_po_id uuid, p_from po_status[], p_to po_status, p_note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_cur po_status;
BEGIN
  SELECT status INTO v_cur FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF v_cur IS NULL THEN RAISE EXCEPTION 'po_not_found' USING ERRCODE='02000'; END IF;
  IF NOT (v_cur = ANY(p_from)) THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE='23514';
  END IF;
  UPDATE public.purchase_orders SET status = p_to, updated_at = now(), updated_by = auth.uid() WHERE id = p_po_id;
  INSERT INTO public.po_status_history(po_id, actor, from_status, to_status, note)
    VALUES (p_po_id, auth.uid(), v_cur::text, p_to::text, p_note);
END $$;

CREATE OR REPLACE FUNCTION public.pos_po_submit_approval(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  PERFORM public._po_transition(p_po_id, ARRAY['draft']::po_status[], 'pending_approval'::po_status, 'ขออนุมัติ');
END $$;
REVOKE ALL ON FUNCTION public.pos_po_submit_approval(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pos_po_submit_approval(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_po_approve(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_approve(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  PERFORM public._po_transition(p_po_id, ARRAY['draft','pending_approval']::po_status[], 'approved_waiting_receipt'::po_status, 'อนุมัติ');
  UPDATE public.purchase_orders SET approved_by = auth.uid(), approved_at = now() WHERE id = p_po_id;
END $$;
REVOKE ALL ON FUNCTION public.pos_po_approve(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pos_po_approve(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_po_cancel(p_po_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_has_receipt boolean;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.po_receipts WHERE po_id = p_po_id) INTO v_has_receipt;
  IF v_has_receipt THEN
    RAISE EXCEPTION 'po_has_receipts' USING ERRCODE='23514',
      HINT='ใบสั่งซื้อที่มีการรับสินค้าแล้วต้องใช้ workflow คืนสินค้าแทน';
  END IF;
  PERFORM public._po_transition(p_po_id, ARRAY['draft','pending_approval','approved_waiting_receipt']::po_status[], 'cancelled'::po_status, COALESCE(p_note,'ยกเลิก'));
END $$;
REVOKE ALL ON FUNCTION public.pos_po_cancel(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.pos_po_cancel(uuid,text) TO authenticated;

-- ============================================================
-- STEP 7: Receiving RPC — atomic, idempotent, cost-posting
-- ============================================================

CREATE OR REPLACE FUNCTION public.pos_po_receive(
  p_po_id uuid,
  p_lines jsonb,             -- [{po_item_id, qty}]
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_receipt_id uuid;
  v_po record;
  v_line jsonb;
  v_item record;
  v_qty numeric;
  v_ratio integer;
  v_base_id uuid;
  v_base_qty numeric;
  v_unit_cost_base numeric;
  v_prev_stock numeric; v_prev_cost numeric; v_new_cost numeric;
  v_remaining_after numeric;
  v_all_done boolean;
BEGIN
  IF NOT public.can_approve(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.po_receipts WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'po_not_found' USING ERRCODE='02000'; END IF;
  IF v_po.status NOT IN ('approved_waiting_receipt') THEN
    RAISE EXCEPTION 'po_not_receivable' USING ERRCODE='23514',
      HINT='ต้องอนุมัติใบสั่งซื้อก่อนรับสินค้า';
  END IF;

  INSERT INTO public.po_receipts(po_id, received_by, note, idempotency_key)
    VALUES (p_po_id, auth.uid(), p_note, p_idempotency_key)
    RETURNING id INTO v_receipt_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := COALESCE((v_line->>'qty')::numeric,0);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT * INTO v_item FROM public.purchase_order_items
      WHERE id = (v_line->>'po_item_id')::uuid AND po_id = p_po_id FOR UPDATE;
    IF v_item.id IS NULL THEN RAISE EXCEPTION 'po_item_not_found' USING ERRCODE='02000'; END IF;
    IF v_item.received_qty + v_qty > v_item.qty THEN
      RAISE EXCEPTION 'receive_exceeds_ordered' USING ERRCODE='23514';
    END IF;

    -- Resolve linked wrapper -> base at receive time
    v_ratio := NULL; v_base_id := NULL;
    SELECT base_id, ratio INTO v_base_id, v_ratio
      FROM public.product_unit_links
      WHERE wrapper_id = v_item.product_id AND enabled = true;

    IF v_base_id IS NOT NULL THEN
      v_base_qty := v_qty * v_ratio;
      v_unit_cost_base := CASE WHEN v_ratio > 0 THEN v_item.unit_cost / v_ratio ELSE 0 END;
      -- stock: base product
      INSERT INTO public.stock_movements(product_id, move_type, qty, reason, ref_type, ref_id, note, created_by)
        VALUES (v_base_id, 'in'::stock_move_type, v_base_qty, 'receive_in'::stock_reason,
                'po_receipt', v_receipt_id,
                'รับเข้าจาก ' || v_po.po_no || ' (wrapper→base)', auth.uid());
      -- cost update on BASE
      IF v_po.cost_method = 'last' THEN
        INSERT INTO public.product_costs(product_id, cost_price) VALUES (v_base_id, v_unit_cost_base)
          ON CONFLICT (product_id) DO UPDATE SET cost_price = EXCLUDED.cost_price, updated_at = now();
      ELSE
        SELECT stock INTO v_prev_stock FROM public.products WHERE id = v_base_id;
        v_prev_stock := COALESCE(v_prev_stock,0) - v_base_qty; -- prior physical stock
        SELECT cost_price INTO v_prev_cost FROM public.product_costs WHERE product_id = v_base_id;
        v_prev_cost := COALESCE(v_prev_cost,0);
        IF v_prev_stock + v_base_qty > 0 THEN
          v_new_cost := (v_prev_stock * v_prev_cost + v_base_qty * v_unit_cost_base) / (v_prev_stock + v_base_qty);
        ELSE v_new_cost := v_unit_cost_base; END IF;
        INSERT INTO public.product_costs(product_id, cost_price) VALUES (v_base_id, v_new_cost)
          ON CONFLICT (product_id) DO UPDATE SET cost_price = EXCLUDED.cost_price, updated_at = now();
      END IF;
    ELSE
      -- normal / variant
      INSERT INTO public.stock_movements(product_id, variant_id, move_type, qty, reason, ref_type, ref_id, note, created_by)
        VALUES (v_item.product_id, v_item.variant_id, 'in'::stock_move_type, v_qty, 'receive_in'::stock_reason,
                'po_receipt', v_receipt_id, 'รับเข้าจาก ' || v_po.po_no, auth.uid());
      IF v_po.cost_method = 'last' THEN
        INSERT INTO public.product_costs(product_id, cost_price) VALUES (v_item.product_id, v_item.unit_cost)
          ON CONFLICT (product_id) DO UPDATE SET cost_price = EXCLUDED.cost_price, updated_at = now();
      ELSE
        SELECT stock INTO v_prev_stock FROM public.products WHERE id = v_item.product_id;
        v_prev_stock := COALESCE(v_prev_stock,0) - v_qty;
        SELECT cost_price INTO v_prev_cost FROM public.product_costs WHERE product_id = v_item.product_id;
        v_prev_cost := COALESCE(v_prev_cost,0);
        IF v_prev_stock + v_qty > 0 THEN
          v_new_cost := (v_prev_stock * v_prev_cost + v_qty * v_item.unit_cost) / (v_prev_stock + v_qty);
        ELSE v_new_cost := v_item.unit_cost; END IF;
        INSERT INTO public.product_costs(product_id, cost_price) VALUES (v_item.product_id, v_new_cost)
          ON CONFLICT (product_id) DO UPDATE SET cost_price = EXCLUDED.cost_price, updated_at = now();
      END IF;
    END IF;

    INSERT INTO public.po_receipt_items(receipt_id, po_item_id, qty, base_qty, base_product_id, ratio_snapshot, unit_cost_snapshot)
      VALUES (v_receipt_id, v_item.id, v_qty, v_base_qty, v_base_id, v_ratio, v_item.unit_cost);

    UPDATE public.purchase_order_items
       SET received_qty = received_qty + v_qty,
           base_product_id = COALESCE(base_product_id, v_base_id),
           base_ratio = COALESCE(base_ratio, v_ratio)
     WHERE id = v_item.id;
  END LOOP;

  -- Fully received?
  SELECT NOT EXISTS(
    SELECT 1 FROM public.purchase_order_items WHERE po_id = p_po_id AND received_qty < qty
  ) INTO v_all_done;
  IF v_all_done THEN
    UPDATE public.purchase_orders SET status = 'received', received_at = now(), updated_at = now() WHERE id = p_po_id;
    INSERT INTO public.po_status_history(po_id, actor, from_status, to_status, note)
      VALUES (p_po_id, auth.uid(), 'approved_waiting_receipt', 'received', 'รับสินค้าครบแล้ว');
  END IF;

  RETURN v_receipt_id;
END $$;
REVOKE ALL ON FUNCTION public.pos_po_receive(uuid,jsonb,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.pos_po_receive(uuid,jsonb,text,text) TO authenticated;

-- ============================================================
-- STEP 7: One-shot create+approve+receive
-- ============================================================

CREATE OR REPLACE FUNCTION public.pos_po_create_and_receive(p jsonb, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_po_id uuid;
  v_receipt_id uuid;
  v_lines jsonb := '[]'::jsonb;
  v_row record;
BEGIN
  IF NOT public.can_approve(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  v_po_id := public.pos_po_upsert(p);
  PERFORM public.pos_po_approve(v_po_id);
  FOR v_row IN SELECT id, qty FROM public.purchase_order_items WHERE po_id = v_po_id LOOP
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('po_item_id', v_row.id, 'qty', v_row.qty));
  END LOOP;
  v_receipt_id := public.pos_po_receive(v_po_id, v_lines, 'นำเข้าทันที', p_idempotency_key);
  RETURN jsonb_build_object('po_id', v_po_id, 'receipt_id', v_receipt_id);
END $$;
REVOKE ALL ON FUNCTION public.pos_po_create_and_receive(jsonb,text) FROM public;
GRANT EXECUTE ON FUNCTION public.pos_po_create_and_receive(jsonb,text) TO authenticated;
