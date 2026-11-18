
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_no TEXT,
  ADD COLUMN IF NOT EXISTS receipt_issued_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS orders_receipt_no_uniq ON public.orders(receipt_no) WHERE receipt_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.issue_order_receipt(_order_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _no TEXT;
  _seq INT;
  _prefix TEXT;
  _existing TEXT;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not_staff';
  END IF;

  SELECT receipt_no INTO _existing FROM public.orders WHERE id = _order_id;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  _prefix := 'RC-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMM') || '-';
  SELECT COALESCE(MAX(NULLIF(regexp_replace(receipt_no, '^.*-', ''), '')::int), 0) + 1
    INTO _seq
    FROM public.orders
    WHERE receipt_no LIKE _prefix || '%';
  _no := _prefix || lpad(_seq::text, 4, '0');

  UPDATE public.orders
     SET receipt_no = _no,
         receipt_issued_at = now(),
         paid_at = COALESCE(paid_at, now())
   WHERE id = _order_id;

  RETURN _no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_order_receipt(uuid) TO authenticated;

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
    'org', to_jsonb(org.*)
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
