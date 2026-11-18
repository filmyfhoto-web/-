
-- =========================================================
-- LINE MyShop integration (additive only)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.myshop_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL UNIQUE,
  label text,
  enabled boolean NOT NULL DEFAULT false,
  api_key_last4 text,
  webhook_secret_last4 text,
  sync_products boolean NOT NULL DEFAULT false,
  sync_inventory boolean NOT NULL DEFAULT false,
  sync_orders boolean NOT NULL DEFAULT true,
  last_tested_at timestamptz,
  last_sync_at timestamptz,
  status text NOT NULL DEFAULT 'not_connected',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.myshop_integrations TO authenticated;
GRANT ALL ON public.myshop_integrations TO service_role;
ALTER TABLE public.myshop_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage myshop integrations" ON public.myshop_integrations
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.myshop_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.myshop_integrations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  myshop_product_id text NOT NULL,
  myshop_variant_id text,
  myshop_inventory_id text,
  sku text,
  barcode text,
  myshop_name text,
  match_source text,
  sync_status text NOT NULL DEFAULT 'mapped',
  last_price_synced_at timestamptz,
  last_stock_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS myshop_mapping_remote_uniq
  ON public.myshop_product_mappings (myshop_product_id, COALESCE(myshop_variant_id, ''));
CREATE UNIQUE INDEX IF NOT EXISTS myshop_mapping_local_uniq
  ON public.myshop_product_mappings (product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS myshop_mapping_sku_idx ON public.myshop_product_mappings (sku);
CREATE INDEX IF NOT EXISTS myshop_mapping_barcode_idx ON public.myshop_product_mappings (barcode);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.myshop_product_mappings TO authenticated;
GRANT ALL ON public.myshop_product_mappings TO service_role;
ALTER TABLE public.myshop_product_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage myshop mappings" ON public.myshop_product_mappings
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.myshop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.myshop_integrations(id) ON DELETE SET NULL,
  order_number text NOT NULL UNIQUE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  channel_id text,
  order_status text,
  payment_status text,
  shipment_status text,
  last_event text,
  last_event_at timestamptz,
  total_price numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  shipment_price numeric NOT NULL DEFAULT 0,
  shipping_address jsonb,
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb,
  needs_mapping boolean NOT NULL DEFAULT false,
  stock_deducted boolean NOT NULL DEFAULT false,
  stock_deducted_at timestamptz,
  stock_restored boolean NOT NULL DEFAULT false,
  stock_restored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.myshop_orders TO authenticated;
GRANT ALL ON public.myshop_orders TO service_role;
ALTER TABLE public.myshop_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage myshop orders" ON public.myshop_orders
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.myshop_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  request_id text,
  trace_id text,
  signature_valid boolean NOT NULL DEFAULT false,
  event_name text,
  order_number text,
  raw jsonb,
  processed boolean NOT NULL DEFAULT false,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS myshop_webhook_events_received_idx ON public.myshop_webhook_events (received_at DESC);
GRANT SELECT ON public.myshop_webhook_events TO authenticated;
GRANT ALL ON public.myshop_webhook_events TO service_role;
ALTER TABLE public.myshop_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read myshop webhook events" ON public.myshop_webhook_events
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.myshop_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.myshop_integrations(id) ON DELETE CASCADE,
  action text NOT NULL,
  method text,
  url_path text,
  status_code int,
  request_id text,
  oap_request_id text,
  ok boolean NOT NULL DEFAULT true,
  error text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS myshop_sync_logs_created_idx ON public.myshop_sync_logs (created_at DESC);
GRANT SELECT ON public.myshop_sync_logs TO authenticated;
GRANT ALL ON public.myshop_sync_logs TO service_role;
ALTER TABLE public.myshop_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read myshop sync logs" ON public.myshop_sync_logs
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- Additive order tagging ------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS external_order_no text;
CREATE INDEX IF NOT EXISTS orders_source_idx ON public.orders (source);

-- updated_at triggers ---------------------------------------------------
CREATE TRIGGER myshop_integrations_touch BEFORE UPDATE ON public.myshop_integrations
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER myshop_product_mappings_touch BEFORE UPDATE ON public.myshop_product_mappings
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER myshop_orders_touch BEFORE UPDATE ON public.myshop_orders
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- Vault-backed secret storage (server-only) ------------------------------
CREATE OR REPLACE FUNCTION public.myshop_set_secret(p_name text, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_name IS NULL OR p_name !~ '^myshop_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'invalid_secret_name' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, p_name, 'LINE MyShop integration secret');
  ELSE
    PERFORM vault.update_secret(v_id, p_value, p_name, 'LINE MyShop integration secret');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.myshop_set_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.myshop_set_secret(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.myshop_get_secret(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.myshop_get_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.myshop_get_secret(text) TO service_role;

-- Idempotent stock deduction / restore for MyShop orders ------------------
CREATE OR REPLACE FUNCTION public.myshop_apply_order_stock(p_order_number text, p_direction text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.myshop_orders%ROWTYPE;
  it record;
  v_key text;
  v_count int := 0;
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
  END LOOP;

  IF p_direction = 'deduct' THEN
    UPDATE public.myshop_orders SET stock_deducted = true, stock_deducted_at = now() WHERE id = r.id;
  ELSE
    UPDATE public.myshop_orders SET stock_restored = true, stock_restored_at = now() WHERE id = r.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'movements', v_count);
END $$;
REVOKE ALL ON FUNCTION public.myshop_apply_order_stock(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.myshop_apply_order_stock(text, text) TO service_role;
