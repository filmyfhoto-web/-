
-- ============================================================
-- 1. Table: order_customer_view_defaults (per-shop defaults)
-- ============================================================
CREATE TABLE public.order_customer_view_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid REFERENCES public.rds_stores(id) ON DELETE CASCADE, -- NULL = system-wide default
  -- Identity
  show_order_no boolean NOT NULL DEFAULT true,
  show_created_at boolean NOT NULL DEFAULT true,
  show_project_name boolean NOT NULL DEFAULT true,
  -- Items & money
  show_items boolean NOT NULL DEFAULT true,
  show_qty boolean NOT NULL DEFAULT true,
  show_unit_price boolean NOT NULL DEFAULT true,
  show_item_subtotal boolean NOT NULL DEFAULT true,
  show_subtotal boolean NOT NULL DEFAULT true,
  show_discount boolean NOT NULL DEFAULT true,
  show_shipping boolean NOT NULL DEFAULT true,
  show_tax boolean NOT NULL DEFAULT true,
  show_total boolean NOT NULL DEFAULT true,
  -- Status / delivery
  show_status boolean NOT NULL DEFAULT true,
  show_payment_method boolean NOT NULL DEFAULT true,
  show_payment_status boolean NOT NULL DEFAULT true,
  show_production_status boolean NOT NULL DEFAULT true,
  show_delivery_due boolean NOT NULL DEFAULT true,
  show_tracking_no boolean NOT NULL DEFAULT true,
  show_shipping_address boolean NOT NULL DEFAULT false,
  -- Content
  show_notes_to_customer boolean NOT NULL DEFAULT true,
  show_attachments boolean NOT NULL DEFAULT true,
  show_quotation_link boolean NOT NULL DEFAULT true,
  show_receipt_link boolean NOT NULL DEFAULT true,
  show_status_history boolean NOT NULL DEFAULT true,
  show_shop_messages boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_customer_view_defaults TO authenticated;
GRANT ALL ON public.order_customer_view_defaults TO service_role;

ALTER TABLE public.order_customer_view_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage order visibility defaults"
  ON public.order_customer_view_defaults
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Seed a single system-wide default row (shop_id IS NULL) so the RPC always has a base.
INSERT INTO public.order_customer_view_defaults (shop_id) VALUES (NULL)
  ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. Table: order_internal_notes (staff-only, separated from customer-facing notes)
-- ============================================================
CREATE TABLE public.order_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  order_kind text NOT NULL CHECK (order_kind IN ('order', 'guest')),
  body text NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_internal_notes_order ON public.order_internal_notes (order_id, order_kind, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_internal_notes TO authenticated;
GRANT ALL ON public.order_internal_notes TO service_role;

ALTER TABLE public.order_internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage internal notes"
  ON public.order_internal_notes
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ============================================================
-- 3. Add customer-view columns to orders & guest_orders
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_view_visibility jsonb,
  ADD COLUMN IF NOT EXISTS customer_view_token text,
  ADD COLUMN IF NOT EXISTS customer_view_token_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes_to_customer text;

ALTER TABLE public.guest_orders
  ADD COLUMN IF NOT EXISTS customer_view_visibility jsonb,
  ADD COLUMN IF NOT EXISTS customer_view_token text,
  ADD COLUMN IF NOT EXISTS customer_view_token_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes_to_customer text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_customer_view_token_key
  ON public.orders (customer_view_token) WHERE customer_view_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS guest_orders_customer_view_token_key
  ON public.guest_orders (customer_view_token) WHERE customer_view_token IS NOT NULL;

-- ============================================================
-- 4. updated_at trigger for the new tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at_generic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ocvd_updated_at ON public.order_customer_view_defaults;
CREATE TRIGGER trg_ocvd_updated_at BEFORE UPDATE ON public.order_customer_view_defaults
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

DROP TRIGGER IF EXISTS trg_oin_updated_at ON public.order_internal_notes;
CREATE TRIGGER trg_oin_updated_at BEFORE UPDATE ON public.order_internal_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

-- ============================================================
-- 5. Effective-visibility resolver (default merged with per-order override)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_order_visibility_effective(_order_id uuid, _kind text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop_id uuid;
  v_default_row public.order_customer_view_defaults%ROWTYPE;
  v_override jsonb;
  v_result jsonb;
BEGIN
  -- staff-only helper
  IF NOT public.is_staff(auth.uid()) THEN
    RETURN NULL;
  END IF;

  IF _kind = 'order' THEN
    SELECT shop_id, customer_view_visibility INTO v_shop_id, v_override
      FROM public.orders WHERE id = _order_id;
  ELSIF _kind = 'guest' THEN
    v_shop_id := NULL; -- guest_orders has no shop_id column
    SELECT customer_view_visibility INTO v_override
      FROM public.guest_orders WHERE id = _order_id;
  ELSE
    RETURN NULL;
  END IF;

  -- Prefer shop default, fall back to system default (shop_id IS NULL)
  SELECT * INTO v_default_row FROM public.order_customer_view_defaults
    WHERE shop_id IS NOT DISTINCT FROM v_shop_id
    LIMIT 1;
  IF v_default_row.id IS NULL THEN
    SELECT * INTO v_default_row FROM public.order_customer_view_defaults
      WHERE shop_id IS NULL LIMIT 1;
  END IF;

  v_result := jsonb_build_object(
    'show_order_no', v_default_row.show_order_no,
    'show_created_at', v_default_row.show_created_at,
    'show_project_name', v_default_row.show_project_name,
    'show_items', v_default_row.show_items,
    'show_qty', v_default_row.show_qty,
    'show_unit_price', v_default_row.show_unit_price,
    'show_item_subtotal', v_default_row.show_item_subtotal,
    'show_subtotal', v_default_row.show_subtotal,
    'show_discount', v_default_row.show_discount,
    'show_shipping', v_default_row.show_shipping,
    'show_tax', v_default_row.show_tax,
    'show_total', v_default_row.show_total,
    'show_status', v_default_row.show_status,
    'show_payment_method', v_default_row.show_payment_method,
    'show_payment_status', v_default_row.show_payment_status,
    'show_production_status', v_default_row.show_production_status,
    'show_delivery_due', v_default_row.show_delivery_due,
    'show_tracking_no', v_default_row.show_tracking_no,
    'show_shipping_address', v_default_row.show_shipping_address,
    'show_notes_to_customer', v_default_row.show_notes_to_customer,
    'show_attachments', v_default_row.show_attachments,
    'show_quotation_link', v_default_row.show_quotation_link,
    'show_receipt_link', v_default_row.show_receipt_link,
    'show_status_history', v_default_row.show_status_history,
    'show_shop_messages', v_default_row.show_shop_messages
  );

  -- Per-order override: only keys present in override replace defaults
  IF v_override IS NOT NULL AND jsonb_typeof(v_override) = 'object' THEN
    v_result := v_result || v_override;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_visibility_effective(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_visibility_effective(uuid, text) TO authenticated;

-- ============================================================
-- 6. Public token lookup — the ONLY path customers use
-- ============================================================
-- Uses a whitelist: fields not covered by any show_* flag are hard-excluded.
-- Fields hard-excluded from the payload (never returned regardless of settings):
--   id, customer_id, guest_id, line_user_id, line_link_token,
--   drive_folder_id, drive_folder_url, drive_synced_at, drive_last_error, drive_store_slug,
--   handled_by, cancelled_by, note (legacy internal), reply_draft, receipt_no (internal only)
CREATE OR REPLACE FUNCTION public.get_order_by_customer_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_kind text;
  v_shop_id uuid;
  v_vis jsonb;
  v_default_row public.order_customer_view_defaults%ROWTYPE;
  v_items jsonb;
  v_out jsonb;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RETURN NULL;
  END IF;

  -- Try orders first
  SELECT id, order_no, created_at, status::text AS status, subtotal, discount, shipping_fee,
         total, project_name, shop_id, customer_view_visibility, customer_view_token_revoked_at,
         notes_to_customer, paid_at, receipt_issued_at
    INTO v_row
    FROM public.orders
    WHERE customer_view_token = _token
    LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    v_kind := 'order';
    v_shop_id := v_row.shop_id;
  ELSE
    SELECT id, order_no, created_at, status, total, customer_view_visibility,
           customer_view_token_revoked_at, notes_to_customer
      INTO v_row
      FROM public.guest_orders
      WHERE customer_view_token = _token
      LIMIT 1;
    IF v_row.id IS NULL THEN
      RETURN NULL;
    END IF;
    v_kind := 'guest';
    v_shop_id := NULL;
  END IF;

  IF v_row.customer_view_token_revoked_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- Resolve visibility (inline; can't call staff-only fn)
  SELECT * INTO v_default_row FROM public.order_customer_view_defaults
    WHERE shop_id IS NOT DISTINCT FROM v_shop_id LIMIT 1;
  IF v_default_row.id IS NULL THEN
    SELECT * INTO v_default_row FROM public.order_customer_view_defaults
      WHERE shop_id IS NULL LIMIT 1;
  END IF;

  v_vis := jsonb_build_object(
    'show_order_no', v_default_row.show_order_no,
    'show_created_at', v_default_row.show_created_at,
    'show_project_name', v_default_row.show_project_name,
    'show_items', v_default_row.show_items,
    'show_qty', v_default_row.show_qty,
    'show_unit_price', v_default_row.show_unit_price,
    'show_item_subtotal', v_default_row.show_item_subtotal,
    'show_subtotal', v_default_row.show_subtotal,
    'show_discount', v_default_row.show_discount,
    'show_shipping', v_default_row.show_shipping,
    'show_tax', v_default_row.show_tax,
    'show_total', v_default_row.show_total,
    'show_status', v_default_row.show_status,
    'show_payment_method', v_default_row.show_payment_method,
    'show_payment_status', v_default_row.show_payment_status,
    'show_production_status', v_default_row.show_production_status,
    'show_delivery_due', v_default_row.show_delivery_due,
    'show_tracking_no', v_default_row.show_tracking_no,
    'show_shipping_address', v_default_row.show_shipping_address,
    'show_notes_to_customer', v_default_row.show_notes_to_customer,
    'show_attachments', v_default_row.show_attachments,
    'show_quotation_link', v_default_row.show_quotation_link,
    'show_receipt_link', v_default_row.show_receipt_link,
    'show_status_history', v_default_row.show_status_history,
    'show_shop_messages', v_default_row.show_shop_messages
  );
  IF v_row.customer_view_visibility IS NOT NULL AND jsonb_typeof(v_row.customer_view_visibility) = 'object' THEN
    v_vis := v_vis || v_row.customer_view_visibility;
  END IF;

  v_out := jsonb_build_object('kind', v_kind);

  -- Build payload — every key is gated on a show_* flag
  IF (v_vis->>'show_order_no')::boolean THEN
    v_out := v_out || jsonb_build_object('order_no', v_row.order_no);
  END IF;
  IF (v_vis->>'show_created_at')::boolean THEN
    v_out := v_out || jsonb_build_object('created_at', v_row.created_at);
  END IF;
  IF (v_vis->>'show_status')::boolean THEN
    v_out := v_out || jsonb_build_object('status', v_row.status);
  END IF;
  IF (v_vis->>'show_total')::boolean THEN
    v_out := v_out || jsonb_build_object('total', v_row.total);
  END IF;
  IF (v_vis->>'show_notes_to_customer')::boolean THEN
    v_out := v_out || jsonb_build_object('notes_to_customer', v_row.notes_to_customer);
  END IF;

  IF v_kind = 'order' THEN
    IF (v_vis->>'show_project_name')::boolean THEN
      v_out := v_out || jsonb_build_object('project_name', v_row.project_name);
    END IF;
    IF (v_vis->>'show_subtotal')::boolean THEN
      v_out := v_out || jsonb_build_object('subtotal', v_row.subtotal);
    END IF;
    IF (v_vis->>'show_discount')::boolean THEN
      v_out := v_out || jsonb_build_object('discount', v_row.discount);
    END IF;
    IF (v_vis->>'show_shipping')::boolean THEN
      v_out := v_out || jsonb_build_object('shipping_fee', v_row.shipping_fee);
    END IF;
    IF (v_vis->>'show_payment_status')::boolean THEN
      v_out := v_out || jsonb_build_object('paid_at', v_row.paid_at);
    END IF;
    IF (v_vis->>'show_receipt_link')::boolean THEN
      v_out := v_out || jsonb_build_object('receipt_issued_at', v_row.receipt_issued_at);
    END IF;

    IF (v_vis->>'show_items')::boolean THEN
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'name', product_name,
        'qty', CASE WHEN (v_vis->>'show_qty')::boolean THEN qty END,
        'unit', CASE WHEN (v_vis->>'show_qty')::boolean THEN unit END,
        'unit_price', CASE WHEN (v_vis->>'show_unit_price')::boolean THEN price END,
        'subtotal', CASE WHEN (v_vis->>'show_item_subtotal')::boolean THEN total END
      )) ORDER BY id)
      INTO v_items
      FROM public.order_items WHERE order_id = v_row.id;
      v_out := v_out || jsonb_build_object('items', COALESCE(v_items, '[]'::jsonb));
    END IF;
  ELSE
    -- guest_order: items are already jsonb on the row
    IF (v_vis->>'show_items')::boolean THEN
      SELECT items INTO v_items FROM public.guest_orders WHERE id = v_row.id;
      v_out := v_out || jsonb_build_object('items', COALESCE(v_items, '[]'::jsonb));
    END IF;
  END IF;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_by_customer_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_by_customer_token(text) TO anon, authenticated;

-- ============================================================
-- 7. Token management (staff only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.regenerate_order_customer_token(_order_id uuid, _kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- URL-safe base64 (~32 chars from 24 bytes) with padding/special stripped
  v_token := regexp_replace(encode(gen_random_bytes(24), 'base64'), '[^A-Za-z0-9]', '', 'g');

  IF _kind = 'order' THEN
    UPDATE public.orders
      SET customer_view_token = v_token,
          customer_view_token_revoked_at = NULL,
          updated_at = now()
      WHERE id = _order_id;
  ELSIF _kind = 'guest' THEN
    UPDATE public.guest_orders
      SET customer_view_token = v_token,
          customer_view_token_revoked_at = NULL,
          updated_at = now()
      WHERE id = _order_id;
  ELSE
    RAISE EXCEPTION 'invalid kind';
  END IF;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_order_customer_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_order_customer_token(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_order_customer_token(_order_id uuid, _kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF _kind = 'order' THEN
    UPDATE public.orders
      SET customer_view_token_revoked_at = now(), updated_at = now()
      WHERE id = _order_id;
  ELSIF _kind = 'guest' THEN
    UPDATE public.guest_orders
      SET customer_view_token_revoked_at = now(), updated_at = now()
      WHERE id = _order_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_order_customer_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_order_customer_token(uuid, text) TO authenticated;
