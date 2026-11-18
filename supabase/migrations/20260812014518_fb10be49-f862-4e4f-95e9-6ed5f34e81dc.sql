CREATE OR REPLACE FUNCTION public.orders_guard_customer_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Staff/service role edits pass through untouched.
  IF auth.uid() IS NULL OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Customers may never change pricing or fulfilment/billing state on their order.
  NEW.subtotal := OLD.subtotal;
  NEW.discount := OLD.discount;
  NEW.shipping_fee := OLD.shipping_fee;
  NEW.total := OLD.total;
  NEW.status := OLD.status;
  NEW.order_no := OLD.order_no;
  NEW.organization_id := OLD.organization_id;
  NEW.customer_id := OLD.customer_id;
  NEW.shop_id := OLD.shop_id;
  NEW.paid_at := OLD.paid_at;
  NEW.receipt_no := OLD.receipt_no;
  NEW.receipt_issued_at := OLD.receipt_issued_at;
  NEW.deleted_at := OLD.deleted_at;
  NEW.customer_view_token := OLD.customer_view_token;
  NEW.customer_view_token_revoked_at := OLD.customer_view_token_revoked_at;
  NEW.customer_view_visibility := OLD.customer_view_visibility;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_guard_customer_financials ON public.orders;
CREATE TRIGGER trg_orders_guard_customer_financials
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_guard_customer_financials();