
-- 1. line_login_diagnostics: only authenticated users may insert
DROP POLICY IF EXISTS "Public can add line login diagnostics" ON public.line_login_diagnostics;
CREATE POLICY "Authenticated can add line login diagnostics"
  ON public.line_login_diagnostics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (event = ANY (ARRAY['liff_init_fail','liff_login_loop','link_verify_fail','liff_redirect','liff_config_fallback','liff_auto_bind_ok','liff_auto_bind_fail']))
    AND (jsonb_typeof(detail) = 'object')
    AND (pg_column_size(detail) <= 8192)
  );

-- 2. orders: scope UPDATE policies to authenticated only
DROP POLICY IF EXISTS "customer update own pending orders" ON public.orders;
CREATE POLICY "customer update own pending orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING ((customer_id = auth.uid()) AND (status = ANY (ARRAY['pending_quote'::order_status,'quoted'::order_status])))
  WITH CHECK ((customer_id = auth.uid()) AND (status = ANY (ARRAY['pending_quote'::order_status,'quoted'::order_status])));

DROP POLICY IF EXISTS "staff update orders" ON public.orders;
CREATE POLICY "staff update orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

-- 3. product_view_logs: scope staff SELECT to authenticated role only.
-- Inserts remain server-side (service_role via edge function log-product-view) — no INSERT policy exists,
-- so RLS blocks all direct client inserts.
DROP POLICY IF EXISTS "staff read product view logs" ON public.product_view_logs;
CREATE POLICY "staff read product view logs"
  ON public.product_view_logs
  FOR SELECT
  TO authenticated
  USING (is_staff(auth.uid()));
