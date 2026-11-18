
-- 1) order_items: split policies; customers cannot tamper with prices
DROP POLICY IF EXISTS "items follow order write" ON public.order_items;

CREATE POLICY "staff manage order items"
ON public.order_items FOR ALL
TO authenticated
USING (is_staff(auth.uid()))
WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "customers insert own pending order items"
ON public.order_items FOR INSERT
TO authenticated
WITH CHECK (
  COALESCE(price,0) = 0
  AND COALESCE(total,0) = 0
  AND order_id IN (
    SELECT id FROM public.orders
    WHERE customer_id = auth.uid()
      AND status = 'pending_quote'
  )
);

-- 2) orders: trigger preserves financial / ownership fields for non-staff updates
CREATE OR REPLACE FUNCTION public.trg_orders_protect_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    NEW.customer_id     := OLD.customer_id;
    NEW.organization_id := OLD.organization_id;
    NEW.subtotal        := OLD.subtotal;
    NEW.discount        := OLD.discount;
    NEW.shipping_fee    := OLD.shipping_fee;
    NEW.total           := OLD.total;
    NEW.status          := OLD.status;
    NEW.order_no        := OLD.order_no;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_protect_fields ON public.orders;
CREATE TRIGGER trg_orders_protect_fields
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_protect_fields();

-- 3) notifications: customers cannot insert directly
DROP POLICY IF EXISTS "insert notifs scoped" ON public.notifications;

CREATE POLICY "staff insert notifs"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (is_staff(auth.uid()));

-- 4) settings: owner-only access (protects webhook_url)
DROP POLICY IF EXISTS "staff read settings" ON public.settings;
DROP POLICY IF EXISTS "staff write settings" ON public.settings;

CREATE POLICY "owners read settings"
ON public.settings FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'owner'));

CREATE POLICY "owners write settings"
ON public.settings FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'owner'))
WITH CHECK (has_role(auth.uid(), 'owner'));

-- 5) products realtime: remove from publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'products'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.products';
  END IF;
END $$;

-- 6) products_public view: use security_invoker so it honors querying user's RLS
DROP VIEW IF EXISTS public.products_public;
CREATE VIEW public.products_public
WITH (security_invoker = true) AS
SELECT id, code, name, category_id, description, unit, image_url,
       standard_price, active, created_at, updated_at
FROM public.products
WHERE active = true;

GRANT SELECT ON public.products_public TO anon, authenticated;
