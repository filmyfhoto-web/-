
-- =========================================================
-- 1) line_oa_settings: restrict SELECT to staff
-- =========================================================
DROP POLICY IF EXISTS line_oa_settings_read ON public.line_oa_settings;
CREATE POLICY line_oa_settings_read
  ON public.line_oa_settings
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- =========================================================
-- 2) orders: prevent customers from tampering with pricing fields
-- =========================================================
CREATE OR REPLACE FUNCTION public.trg_orders_protect_customer_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- staff/admins bypass entirely
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Non-staff can only touch a limited allow-list. Force sensitive fields
  -- back to their previous values.
  NEW.total            := OLD.total;
  NEW.subtotal         := OLD.subtotal;
  NEW.discount         := OLD.discount;
  NEW.shipping_fee     := OLD.shipping_fee;
  NEW.status           := OLD.status;
  NEW.customer_id      := OLD.customer_id;
  NEW.organization_id  := OLD.organization_id;
  NEW.is_guest         := OLD.is_guest;
  NEW.guest_id         := OLD.guest_id;
  NEW.guest_phone      := OLD.guest_phone;
  NEW.cancelled_at     := OLD.cancelled_at;
  NEW.cancelled_by     := OLD.cancelled_by;
  NEW.cancelled_reason := OLD.cancelled_reason;
  NEW.deleted_at       := OLD.deleted_at;
  NEW.line_link_token  := OLD.line_link_token;
  NEW.line_user_id     := OLD.line_user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_protect_customer_fields ON public.orders;
CREATE TRIGGER trg_orders_protect_customer_fields
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_protect_customer_fields();

-- =========================================================
-- 3) profiles: block self-service change of organization_id (+ role-like fields)
-- =========================================================
CREATE OR REPLACE FUNCTION public.trg_profiles_protect_privileged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  -- non-staff cannot change these fields on their own profile
  NEW.organization_id           := OLD.organization_id;
  NEW.cost_visible              := OLD.cost_visible;
  NEW.accepted_terms_version    := COALESCE(NEW.accepted_terms_version,   OLD.accepted_terms_version);
  NEW.accepted_privacy_version  := COALESCE(NEW.accepted_privacy_version, OLD.accepted_privacy_version);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_privileged ON public.profiles;
CREATE TRIGGER trg_profiles_protect_privileged
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_protect_privileged();
