
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS receipt_header text,
  ADD COLUMN IF NOT EXISTS receipt_footer text;

DROP FUNCTION IF EXISTS public.get_public_settings();
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE(
  store_name text, logo_url text, address text, phone text, email text,
  line_url text, quote_prefix text, order_prefix text, delivery_prefix text,
  po_prefix text, line_binding_policy text,
  tax_id text, receipt_header text, receipt_footer text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT store_name, logo_url, address, phone, email, line_url,
         quote_prefix, order_prefix, delivery_prefix, po_prefix,
         COALESCE(line_binding_policy, 'optional'),
         tax_id, receipt_header, receipt_footer
  FROM public.settings WHERE id = 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO authenticated, anon;

-- Include store info + settings in receipt payload
CREATE OR REPLACE FUNCTION public.get_guest_order_receipt(_order_id uuid, _phone text)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'header', to_jsonb(o.*),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(i.*) ORDER BY i.id)
      FROM public.order_items i WHERE i.order_id = o.id
    ), '[]'::jsonb),
    'org', to_jsonb(org.*),
    'store', (
      SELECT jsonb_build_object(
        'store_name', s.store_name, 'logo_url', s.logo_url, 'address', s.address,
        'phone', s.phone, 'email', s.email,
        'tax_id', s.tax_id, 'receipt_header', s.receipt_header, 'receipt_footer', s.receipt_footer
      ) FROM public.settings s WHERE s.id = 1
    )
  )
  FROM public.orders o
  LEFT JOIN public.organizations org ON org.id = o.organization_id
  WHERE o.id = _order_id
    AND o.receipt_no IS NOT NULL
    AND (
      o.guest_phone = _phone
      OR public.is_staff(auth.uid())
    );
$$;
GRANT EXECUTE ON FUNCTION public.get_guest_order_receipt(uuid, text) TO anon, authenticated;

-- Activity log for an order (staff only)
CREATE OR REPLACE FUNCTION public.get_order_activity_log(_order_id uuid)
RETURNS TABLE(id uuid, action text, detail jsonb, created_at timestamptz, user_id uuid, user_email text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT a.id, a.action, a.detail, a.created_at, a.user_id,
         (SELECT email FROM auth.users u WHERE u.id = a.user_id) AS user_email
  FROM public.activity_logs a
  WHERE a.target_type = 'order'
    AND a.target_id::text = _order_id::text
    AND public.is_staff(auth.uid())
  ORDER BY a.created_at DESC
  LIMIT 200;
$$;
GRANT EXECUTE ON FUNCTION public.get_order_activity_log(uuid) TO authenticated;
