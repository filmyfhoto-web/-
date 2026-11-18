CREATE OR REPLACE FUNCTION public.save_order_reply_draft(_order_id UUID, _draft TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  UPDATE public.orders SET reply_draft = _draft WHERE id = _order_id;

  INSERT INTO public.activity_logs (user_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'reply_draft_saved', 'order', _order_id,
          jsonb_build_object('length', COALESCE(length(_draft), 0)));
END;
$$;

CREATE OR REPLACE FUNCTION public.void_order_receipt(_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev_no TEXT;
  _prev_issued TIMESTAMPTZ;
  _prev_paid TIMESTAMPTZ;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  SELECT receipt_no, receipt_issued_at, paid_at
    INTO _prev_no, _prev_issued, _prev_paid
    FROM public.orders WHERE id = _order_id;

  UPDATE public.orders
     SET receipt_no = NULL,
         receipt_issued_at = NULL,
         paid_at = NULL
   WHERE id = _order_id;

  INSERT INTO public.activity_logs (user_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'receipt_voided', 'order', _order_id,
          jsonb_build_object(
            'voided_receipt_no', _prev_no,
            'voided_issued_at', _prev_issued,
            'voided_paid_at', _prev_paid
          ));
END;
$$;