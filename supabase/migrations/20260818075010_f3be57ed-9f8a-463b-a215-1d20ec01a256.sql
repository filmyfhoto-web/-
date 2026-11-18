-- 1) review_token: hide from client reads (column-level privileges)
REVOKE SELECT ON public.customer_purchase_orders FROM authenticated;
GRANT SELECT (id, po_number, user_id, customer_name, customer_phone, school_or_org, seller_name,
  document_date, items, subtotal, note, request_quotation, request_delivery_note, status, source,
  submitted_at, created_at, updated_at, review_status, discount, vat_enabled, vat_rate, vat_amount,
  wht_enabled, wht_rate, wht_amount, net_total, revision_note, last_sent_at, confirmed_at,
  documented_at, document_no, document_id, store_slug, line_user_id)
  ON public.customer_purchase_orders TO authenticated;

CREATE OR REPLACE FUNCTION public.cpo_review_link(p_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN public.is_staff(auth.uid())
    THEN (SELECT review_token FROM public.customer_purchase_orders WHERE id = p_id)
    ELSE NULL END
$$;

REVOKE ALL ON FUNCTION public.cpo_review_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cpo_review_link(uuid) TO authenticated;

-- 2) guest_customers PII: owner/admin only
DROP POLICY IF EXISTS "Staff can view guest customers" ON public.guest_customers;
CREATE POLICY "Owners and admins can view guest customers"
  ON public.guest_customers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

-- 3) profiles: nobody may change their own staff status, ever
CREATE OR REPLACE FUNCTION public.guard_profile_staff_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Only owner/admin acting on SOMEONE ELSE's profile may change staff status.
  IF auth.uid() <> NEW.id
     AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RETURN NEW;
  END IF;
  NEW.staff_active      := OLD.staff_active;
  NEW.staff_disabled_at := OLD.staff_disabled_at;
  NEW.staff_disabled_by := OLD.staff_disabled_by;
  RETURN NEW;
END;
$$;