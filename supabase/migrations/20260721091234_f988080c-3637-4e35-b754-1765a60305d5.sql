
CREATE OR REPLACE FUNCTION public.pos_cancel_receipt(p_receipt_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r public.pos_receipts; it public.pos_receipt_items;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  SELECT * INTO r FROM public.pos_receipts WHERE id=p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt_not_found' USING ERRCODE='P0002'; END IF;
  IF r.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('receipt_id',r.id,'already_cancelled',true);
  END IF;

  FOR it IN SELECT * FROM public.pos_receipt_items WHERE receipt_id=p_receipt_id ORDER BY id LOOP
    IF it.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock = stock + it.qty, updated_at=now() WHERE id=it.variant_id;
    ELSIF it.base_product_id IS NOT NULL AND it.base_ratio IS NOT NULL THEN
      INSERT INTO public.stock_movements(product_id, move_type, qty, ref_type, ref_id, reason, created_by, note)
      VALUES (it.base_product_id, 'in', it.qty*it.base_ratio, 'pos_receipt', r.id, 'cancel_restock_linked',
              auth.uid(), 'pos_cancel_receipt ' || r.receipt_number);
    ELSE
      INSERT INTO public.stock_movements(product_id, move_type, qty, ref_type, ref_id, reason, created_by, note)
      VALUES (it.product_id, 'in', it.qty, 'pos_receipt', r.id, 'cancel_restock', auth.uid(), 'pos_cancel_receipt ' || r.receipt_number);
    END IF;
  END LOOP;

  UPDATE public.pos_receipts
    SET cancelled_at=now(), cancelled_reason=p_reason, payment_status='cancelled', updated_at=now()
  WHERE id=p_receipt_id;

  RETURN jsonb_build_object('receipt_id',r.id,'already_cancelled',false);
END; $$;
