ALTER TABLE public.rds_documents
  ADD COLUMN IF NOT EXISTS internal_sale_type text NOT NULL DEFAULT 'real_goods'
  CHECK (internal_sale_type IN ('bill_only','real_goods'));

CREATE INDEX IF NOT EXISTS idx_rds_documents_internal_sale_type
  ON public.rds_documents(store_id, internal_sale_type);

CREATE OR REPLACE FUNCTION public.rds_duplicate_document(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    created_by, related_document_no, internal_sale_type
  ) VALUES (
    v_src.store_id, v_src.document_type, v_new_no, now()::date, v_src.show_document_date,
    v_src.paper_size, v_src.customer_id, v_src.customer_name, v_src.customer_phone, v_src.customer_address,
    v_src.customer_tax_id, v_src.customer_branch, v_src.price_type, v_src.vat_mode, v_src.vat_rate,
    v_src.discount_amount, v_src.discount_percent, v_src.subtotal, v_src.discount_total, v_src.amount_before_vat,
    v_src.vat_amount, v_src.withholding_tax_enabled, v_src.withholding_tax_rate, v_src.withholding_tax_amount,
    v_src.grand_total, v_src.net_total, v_src.payment_method, 'unpaid', 'draft', v_src.notes,
    v_src.template, v_src.print_mode, v_src.auto_fit_a4, v_src.print_scale, v_src.project_name,
    v_src.show_payment_method, v_src.show_payment_date, v_src.show_footer_document_date, v_src.font_scale,
    auth.uid(), v_src.document_no, COALESCE(v_src.internal_sale_type,'real_goods')
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
END $function$;

CREATE OR REPLACE FUNCTION public.rds_restore_from_sheets(p_store_id uuid, p_document_no text, p_header jsonb, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_type text;
  v_internal text;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_store_id IS NULL OR p_document_no IS NULL OR length(btrim(p_document_no)) = 0 THEN
    RAISE EXCEPTION 'store_id and document_no required';
  END IF;

  v_type := coalesce(p_header->>'document_type', 'receipt');
  v_internal := coalesce(p_header->>'internal_sale_type', 'real_goods');
  IF v_internal NOT IN ('bill_only','real_goods') THEN v_internal := 'real_goods'; END IF;

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
      created_by, deleted_at, internal_sale_type
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
      auth.uid(), NULL, v_internal
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
      internal_sale_type = v_internal,
      deleted_at = NULL,
      updated_at = now()
    WHERE id = v_id;
  END IF;

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
END $function$;