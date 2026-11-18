
-- Replace the permissive combined UPDATE policy with split policies and a guard trigger.
DROP POLICY IF EXISTS "staff update orders" ON public.orders;

CREATE POLICY "staff update orders"
ON public.orders
FOR UPDATE
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "customer update own pending orders"
ON public.orders
FOR UPDATE
USING (
  customer_id = auth.uid()
  AND status = ANY (ARRAY['pending_quote'::order_status, 'quoted'::order_status])
)
WITH CHECK (
  customer_id = auth.uid()
  AND status = ANY (ARRAY['pending_quote'::order_status, 'quoted'::order_status])
);

-- Trigger to prevent customers (non-staff) from altering protected columns
CREATE OR REPLACE FUNCTION public.orders_guard_customer_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Customers cannot change order status';
  END IF;
  IF NEW.total IS DISTINCT FROM OLD.total THEN
    RAISE EXCEPTION 'Customers cannot change order total';
  END IF;
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'Customers cannot reassign order ownership';
  END IF;
  IF to_jsonb(NEW) ? 'organization_id'
     AND (to_jsonb(NEW)->>'organization_id') IS DISTINCT FROM (to_jsonb(OLD)->>'organization_id') THEN
    RAISE EXCEPTION 'Customers cannot change order organization';
  END IF;
  IF to_jsonb(NEW) ? 'discount'
     AND (to_jsonb(NEW)->>'discount') IS DISTINCT FROM (to_jsonb(OLD)->>'discount') THEN
    RAISE EXCEPTION 'Customers cannot change discount';
  END IF;
  IF to_jsonb(NEW) ? 'shipping_fee'
     AND (to_jsonb(NEW)->>'shipping_fee') IS DISTINCT FROM (to_jsonb(OLD)->>'shipping_fee') THEN
    RAISE EXCEPTION 'Customers cannot change shipping fee';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_guard_customer_update_trg ON public.orders;
CREATE TRIGGER orders_guard_customer_update_trg
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_guard_customer_update();
