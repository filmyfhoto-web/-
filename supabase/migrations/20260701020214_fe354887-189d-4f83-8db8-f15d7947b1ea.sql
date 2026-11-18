CREATE OR REPLACE FUNCTION public.trg_orders_protect_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_guest_approve boolean := false;
BEGIN
  -- Allow the guest-approve RPC to flip status: quoted -> approved on a guest order.
  IF COALESCE(OLD.is_guest, false)
     AND COALESCE(NEW.is_guest, false)
     AND OLD.status = 'quoted'
     AND NEW.status = 'approved' THEN
    v_guest_approve := true;
  END IF;

  IF NOT public.is_staff(auth.uid()) AND NOT v_guest_approve THEN
    NEW.customer_id     := OLD.customer_id;
    NEW.organization_id := OLD.organization_id;
    NEW.subtotal        := OLD.subtotal;
    NEW.discount        := OLD.discount;
    NEW.shipping_fee    := OLD.shipping_fee;
    NEW.total           := OLD.total;
    NEW.status          := OLD.status;
    NEW.order_no        := OLD.order_no;
  ELSIF v_guest_approve THEN
    -- Only allow status change; keep the rest immutable.
    NEW.customer_id     := OLD.customer_id;
    NEW.organization_id := OLD.organization_id;
    NEW.subtotal        := OLD.subtotal;
    NEW.discount        := OLD.discount;
    NEW.shipping_fee    := OLD.shipping_fee;
    NEW.total           := OLD.total;
    NEW.order_no        := OLD.order_no;
    NEW.is_guest        := OLD.is_guest;
    NEW.guest_id        := OLD.guest_id;
    NEW.guest_phone     := OLD.guest_phone;
    NEW.guest_name      := OLD.guest_name;
  END IF;
  RETURN NEW;
END $function$;