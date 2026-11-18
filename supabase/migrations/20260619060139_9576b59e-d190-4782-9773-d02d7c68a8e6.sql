
-- 1) Move cost_price to its own staff-only table
CREATE TABLE public.product_costs (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  cost_price numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.product_costs (product_id, cost_price)
SELECT id, COALESCE(cost_price, 0) FROM public.products;
ALTER TABLE public.products DROP COLUMN cost_price;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_costs TO authenticated;
GRANT ALL ON public.product_costs TO service_role;
ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage product_costs" ON public.product_costs
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 2) Settings: staff-only direct read; public-safe RPC for customers
DROP POLICY IF EXISTS "anyone read settings" ON public.settings;
CREATE POLICY "staff read settings" ON public.settings
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE(
  store_name text, logo_url text, address text, phone text, email text,
  quote_prefix text, order_prefix text, delivery_prefix text, po_prefix text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT store_name, logo_url, address, phone, email,
         quote_prefix, order_prefix, delivery_prefix, po_prefix
  FROM public.settings WHERE id = 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO authenticated, anon;

-- 3) Group prices: only own group or staff
DROP POLICY IF EXISTS "auth read group prices" ON public.group_prices;
CREATE POLICY "read own group prices" ON public.group_prices
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR price_group_id = (
      SELECT o.price_group_id FROM public.organizations o
      JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );

-- 4) Activity logs: users can only insert their own
DROP POLICY IF EXISTS "auth insert logs" ON public.activity_logs;
CREATE POLICY "users insert own logs" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 5) Notifications: users only for themselves; staff can insert anything
DROP POLICY IF EXISTS "auth insert notifs" ON public.notifications;
CREATE POLICY "insert notifs scoped" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    OR (user_id = auth.uid() AND for_staff = false)
  );

-- 6) Safe RPC for customer-side staff notifications (new orders, signups)
CREATE OR REPLACE FUNCTION public.notify_staff(
  p_type text, p_title text, p_body text, p_ref_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_type NOT IN ('new_order', 'new_signup') THEN
    RAISE EXCEPTION 'invalid notification type';
  END IF;
  INSERT INTO public.notifications (for_staff, type, title, body, ref_id)
  VALUES (true, p_type, left(coalesce(p_title,''), 200), left(coalesce(p_body,''), 500), p_ref_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_staff(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_staff(text, text, text, uuid) TO authenticated;

-- 7) Fix mutable search_path on set_updated_at; lock down handle_new_user
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
