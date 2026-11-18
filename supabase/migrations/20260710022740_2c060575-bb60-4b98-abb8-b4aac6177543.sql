
-- 1) Prevent non-staff customers from tampering financial/ownership fields on their own orders
CREATE OR REPLACE FUNCTION public.orders_prevent_customer_tamper()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  -- Non-staff: freeze ownership + financial + status
  NEW.customer_id      := OLD.customer_id;
  NEW.organization_id  := OLD.organization_id;
  NEW.status           := OLD.status;
  NEW.total            := OLD.total;
  NEW.subtotal         := OLD.subtotal;
  NEW.discount         := OLD.discount;
  NEW.shipping_fee     := OLD.shipping_fee;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_prevent_customer_tamper ON public.orders;
CREATE TRIGGER trg_orders_prevent_customer_tamper
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_prevent_customer_tamper();

-- 2) Add auto LINE bill toggle
ALTER TABLE public.nw_settings
  ADD COLUMN IF NOT EXISTS auto_line_bill_on_delivery boolean NOT NULL DEFAULT true;
