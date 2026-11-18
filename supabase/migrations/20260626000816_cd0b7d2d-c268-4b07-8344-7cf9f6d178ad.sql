
-- Cancel document (soft, keep history)
CREATE OR REPLACE FUNCTION public.rds_cancel_document(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.rds_documents
     SET status = 'cancelled',
         cancelled_at = now(),
         updated_at = now(),
         notes = CASE
           WHEN p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN notes
           ELSE coalesce(notes,'') || E'\n[ยกเลิก] ' || p_reason
         END
   WHERE id = p_id AND deleted_at IS NULL;
END $$;

-- Duplicate document with new running number
CREATE OR REPLACE FUNCTION public.rds_duplicate_document(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid;
  v_new_no text;
  v_src public.rds_documents%ROWTYPE;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_src FROM public.rds_documents WHERE id = p_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'document not found'; END IF;

  v_new_no := public.rds_next_doc_no(v_src.store_id, v_src.document_type);

  INSERT INTO public.rds_documents (
    store_id, document_type, document_no, document_date, show_document_date,
    paper_size, customer_id, customer_name, customer_phone, customer_address,
    customer_tax_id, customer_branch, price_type, vat_mode, vat_rate,
    discount_amount, discount_percent, subtotal, discount_total, amount_before_vat,
    vat_amount, withholding_tax_enabled, withholding_tax_rate, withholding_tax_amount,
    grand_total, net_total, payment_method, payment_status, status, notes,
    template, print_mode, auto_fit_a4, print_scale, project_name,
    show_payment_method, show_payment_date, show_footer_document_date, font_scale,
    created_by, related_document_no
  ) VALUES (
    v_src.store_id, v_src.document_type, v_new_no, now()::date, v_src.show_document_date,
    v_src.paper_size, v_src.customer_id, v_src.customer_name, v_src.customer_phone, v_src.customer_address,
    v_src.customer_tax_id, v_src.customer_branch, v_src.price_type, v_src.vat_mode, v_src.vat_rate,
    v_src.discount_amount, v_src.discount_percent, v_src.subtotal, v_src.discount_total, v_src.amount_before_vat,
    v_src.vat_amount, v_src.withholding_tax_enabled, v_src.withholding_tax_rate, v_src.withholding_tax_amount,
    v_src.grand_total, v_src.net_total, v_src.payment_method, 'unpaid', 'draft', v_src.notes,
    v_src.template, v_src.print_mode, v_src.auto_fit_a4, v_src.print_scale, v_src.project_name,
    v_src.show_payment_method, v_src.show_payment_date, v_src.show_footer_document_date, v_src.font_scale,
    auth.uid(), v_src.document_no
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.rds_document_items (
    document_id, item_order, product_id, name, description,
    price, quantity, unit, discount_percent, discount_amount, line_total
  )
  SELECT v_new_id, item_order, product_id, name, description,
         price, quantity, unit, discount_percent, discount_amount, line_total
  FROM public.rds_document_items
  WHERE document_id = p_id
  ORDER BY item_order;

  RETURN v_new_id;
END $$;

GRANT EXECUTE ON FUNCTION public.rds_cancel_document(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rds_duplicate_document(uuid) TO authenticated;
