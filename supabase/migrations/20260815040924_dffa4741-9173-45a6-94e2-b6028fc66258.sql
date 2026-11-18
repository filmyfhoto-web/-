-- 1) customer_messages: staff UPDATE must only toggle read-status ------------
CREATE OR REPLACE FUNCTION public.customer_messages_guard_staff_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role (edge functions / admin jobs) bypasses the column lock.
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.topic IS DISTINCT FROM OLD.topic
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'customer_messages: only is_read may be updated';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_messages_guard_staff_update ON public.customer_messages;
CREATE TRIGGER customer_messages_guard_staff_update
BEFORE UPDATE ON public.customer_messages
FOR EACH ROW EXECUTE FUNCTION public.customer_messages_guard_staff_update();

DROP POLICY IF EXISTS "staff update messages" ON public.customer_messages;
CREATE POLICY "staff mark messages read"
ON public.customer_messages
FOR UPDATE
TO authenticated
USING (public.is_staff_any(auth.uid()))
WITH CHECK (public.is_staff_any(auth.uid()));

REVOKE ALL ON public.customer_messages FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.customer_messages TO authenticated;
GRANT ALL ON public.customer_messages TO service_role;

-- 2) line_otp_codes: service-role-only issuance/verification ------------------
REVOKE ALL ON public.line_otp_codes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.line_otp_codes FROM authenticated;
GRANT SELECT ON public.line_otp_codes TO authenticated;
GRANT ALL ON public.line_otp_codes TO service_role;

ALTER TABLE public.line_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_otp_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.line_otp_codes NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own OTP codes" ON public.line_otp_codes;
CREATE POLICY "Users can view their own OTP codes"
ON public.line_otp_codes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 3) product_shops: strict per-store isolation --------------------------------
ALTER TABLE public.product_shops ALTER COLUMN store_id SET NOT NULL;

-- Redundant with product_shops_staff_all (same predicate) — remove duplicate.
DROP POLICY IF EXISTS product_shops_staff_read ON public.product_shops;

REVOKE ALL ON public.product_shops FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_shops TO authenticated;
GRANT ALL ON public.product_shops TO service_role;
