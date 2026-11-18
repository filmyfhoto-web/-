
-- 1) admin_alert_rules: require admin role for writes
DROP POLICY IF EXISTS own_or_admin_write_rules ON public.admin_alert_rules;
CREATE POLICY admin_write_rules ON public.admin_alert_rules
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND admin_user_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND admin_user_id = auth.uid());

-- 2) orders: block customers from tampering with pricing/assignment fields
CREATE OR REPLACE FUNCTION public.prevent_customer_order_financial_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Staff may change anything
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- For non-staff (customer) updates, disallow changes to sensitive fields
  IF NEW.customer_id       IS DISTINCT FROM OLD.customer_id       OR
     NEW.organization_id   IS DISTINCT FROM OLD.organization_id   OR
     NEW.shop_id           IS DISTINCT FROM OLD.shop_id           OR
     NEW.status            IS DISTINCT FROM OLD.status            OR
     NEW.total             IS DISTINCT FROM OLD.total             OR
     NEW.subtotal          IS DISTINCT FROM OLD.subtotal          OR
     COALESCE(NEW.discount, 0)      IS DISTINCT FROM COALESCE(OLD.discount, 0)      OR
     COALESCE(NEW.shipping_fee, 0)  IS DISTINCT FROM COALESCE(OLD.shipping_fee, 0)  OR
     COALESCE(NEW.tax, 0)           IS DISTINCT FROM COALESCE(OLD.tax, 0)
  THEN
    RAISE EXCEPTION 'Customers cannot modify pricing or assignment fields on an order'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_customer_order_tampering ON public.orders;
CREATE TRIGGER trg_prevent_customer_order_tampering
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_customer_order_financial_tampering();
