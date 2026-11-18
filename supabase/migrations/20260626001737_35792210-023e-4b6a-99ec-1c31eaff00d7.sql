
CREATE INDEX IF NOT EXISTS rds_documents_store_no_idx
  ON public.rds_documents (store_id, document_no);

CREATE OR REPLACE FUNCTION public.rds_restore_from_sheets(
  p_store_id uuid,
  p_document_no text,
  p_header jsonb,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_type text;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_store_id IS NULL OR p_document_no IS NULL OR length(btrim(p_document_no)) = 0 THEN
    RAISE EXCEPTION 'store_id and document_no required';
  END IF;

  v_type := coalesce(p_header->>'document_type', 'receipt');

  SELECT id INTO v_id
    FROM public.rds_documents
   WHERE store_id = p_store_id AND document_no = p_document_no
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.rds_documents (
      store_id, document_type, document_no, document_date,
      customer_name, customer_phone, customer_address,
      customer_tax_id, customer_branch,
      notes, status,
      subtotal, discount_total, amount_before_vat,
      vat_amount, withholding_tax_amount, grand_total, net_total,
      created_by, deleted_at
    ) VALUES (
      p_store_id, v_type, p_document_no,
      COALESCE((p_header->>'issue_date')::date, now()::date),
      p_header->>'customer_name', p_header->>'phone', p_header->>'address',
      p_header->>'tax_id', p_header->>'branch',
      p_header->>'note', coalesce(p_header->>'status','issued'),
      COALESCE((p_header->>'subtotal')::numeric, 0),
      COALESCE((p_header->>'discount')::numeric, 0),
      COALESCE((p_header->>'subtotal')::numeric, 0),
      COALESCE((p_header->>'vat')::numeric, 0),
      COALESCE((p_header->>'wht')::numeric, 0),
      COALESCE((p_header->>'total')::numeric, 0),
      COALESCE((p_header->>'total')::numeric, 0),
      auth.uid(), NULL
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.rds_documents SET
      customer_name = COALESCE(p_header->>'customer_name', customer_name),
      customer_phone = COALESCE(p_header->>'phone', customer_phone),
      customer_address = COALESCE(p_header->>'address', customer_address),
      customer_tax_id = COALESCE(p_header->>'tax_id', customer_tax_id),
      customer_branch = COALESCE(p_header->>'branch', customer_branch),
      notes = COALESCE(p_header->>'note', notes),
      subtotal = COALESCE((p_header->>'subtotal')::numeric, subtotal),
      discount_total = COALESCE((p_header->>'discount')::numeric, discount_total),
      vat_amount = COALESCE((p_header->>'vat')::numeric, vat_amount),
      withholding_tax_amount = COALESCE((p_header->>'wht')::numeric, withholding_tax_amount),
      grand_total = COALESCE((p_header->>'total')::numeric, grand_total),
      net_total = COALESCE((p_header->>'total')::numeric, net_total),
      deleted_at = NULL,
      updated_at = now()
    WHERE id = v_id;
  END IF;

  -- Replace items
  DELETE FROM public.rds_document_items WHERE document_id = v_id;
  INSERT INTO public.rds_document_items (
    document_id, item_order, name, quantity, unit, price, line_total
  )
  SELECT
    v_id,
    COALESCE((it->>'seq')::int, ord),
    it->>'name',
    COALESCE((it->>'qty')::numeric, 0),
    it->>'unit',
    COALESCE((it->>'unit_price')::numeric, 0),
    COALESCE((it->>'amount')::numeric, 0)
  FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) WITH ORDINALITY AS t(it, ord);

  INSERT INTO public.rds_activity_logs(store_id, user_id, action, target_type, target_id, detail)
  VALUES (p_store_id, auth.uid(), 'document_restore_from_sheets', 'document', v_id,
          jsonb_build_object('document_no', p_document_no));

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.rds_restore_from_sheets(uuid, text, jsonb, jsonb) TO authenticated;
