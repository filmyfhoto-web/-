CREATE OR REPLACE FUNCTION public.film_apply_stock_movement()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_doc_type text;
  v_deleted timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
    SELECT document_type, deleted_at INTO v_doc_type, v_deleted FROM public.film_documents WHERE id = NEW.document_id;
    IF v_deleted IS NOT NULL THEN RETURN NEW; END IF;
    IF v_doc_type IN ('receipt','delivery','delivery_order','tax_invoice') THEN
      UPDATE public.film_products SET stock_qty = COALESCE(stock_qty,0) - NEW.quantity
       WHERE id = NEW.product_id AND stock_qty IS NOT NULL;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NULL THEN RETURN OLD; END IF;
    SELECT document_type INTO v_doc_type FROM public.film_documents WHERE id = OLD.document_id;
    IF v_doc_type IN ('receipt','delivery','delivery_order','tax_invoice') THEN
      UPDATE public.film_products SET stock_qty = COALESCE(stock_qty,0) + OLD.quantity
       WHERE id = OLD.product_id AND stock_qty IS NOT NULL;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.film_cancel_document(p_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.film_documents
     SET status = 'cancelled', cancelled_at = now(), updated_at = now(),
         notes = CASE WHEN p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN notes
                      ELSE coalesce(notes,'') || E'\n[ยกเลิก] ' || p_reason END
   WHERE id = p_id AND deleted_at IS NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.film_next_doc_no(p_store_id uuid, p_document_type text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text; v_format text; v_seq int;
  v_year text := to_char(now(),'YYYY');
  v_month text := to_char(now(),'MM');
  v_result text; v_actual text := p_document_type;
  v_alt text := NULL; v_max_existing int; v_pad int; v_lock_key bigint;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_document_type = 'delivery' THEN v_alt := 'delivery_order';
  ELSIF p_document_type = 'delivery_order' THEN v_alt := 'delivery';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.film_document_settings WHERE store_id = p_store_id AND document_type = v_actual)
     AND v_alt IS NOT NULL AND EXISTS (SELECT 1 FROM public.film_document_settings WHERE store_id = p_store_id AND document_type = v_alt) THEN
    v_actual := v_alt;
  END IF;
  v_lock_key := hashtextextended(p_store_id::text || ':' || v_actual, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);
  SELECT prefix, running_format INTO v_prefix, v_format FROM public.film_document_settings
   WHERE store_id = p_store_id AND document_type = v_actual;
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'document settings not found for % / %', p_store_id, p_document_type; END IF;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(document_no, '.*[^0-9]([0-9]+)$', '\1'), '')::int), 0) INTO v_max_existing
    FROM public.film_documents WHERE store_id = p_store_id
      AND (document_type = v_actual OR (v_alt IS NOT NULL AND document_type = v_alt))
      AND document_no ~ '[0-9]+$';
  UPDATE public.film_document_settings SET next_number = GREATEST(next_number, v_max_existing + 1)
    WHERE store_id = p_store_id AND document_type = v_actual;
  UPDATE public.film_document_settings SET next_number = next_number + 1
    WHERE store_id = p_store_id AND document_type = v_actual
    RETURNING next_number - 1 INTO v_seq;
  v_pad := COALESCE(length((regexp_match(v_format,'\{seq:(0+)\}'))[1]), 0);
  v_result := replace(v_format, '{prefix}', v_prefix);
  v_result := replace(v_result, '{yyyy}', v_year);
  v_result := replace(v_result, '{mm}', v_month);
  IF v_pad > 0 THEN v_result := regexp_replace(v_result, '\{seq:0+\}', lpad(v_seq::text, v_pad, '0')); END IF;
  v_result := replace(v_result, '{seq}', v_seq::text);
  RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.film_duplicate_document(p_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_new_id uuid; v_new_no text; v_src public.film_documents%ROWTYPE;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_src FROM public.film_documents WHERE id = p_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'document not found'; END IF;
  v_new_no := public.film_next_doc_no(v_src.store_id, v_src.document_type);
  INSERT INTO public.film_documents (
    store_id, document_type, document_no, document_date, show_document_date, paper_size,
    customer_id, customer_name, customer_phone, customer_address, customer_tax_id, customer_branch,
    price_type, vat_mode, vat_rate, discount_amount, discount_percent, subtotal, discount_total,
    amount_before_vat, vat_amount, withholding_tax_enabled, withholding_tax_rate, withholding_tax_amount,
    grand_total, net_total, payment_method, payment_status, status, notes, template, print_mode,
    auto_fit_a4, print_scale, project_name, show_payment_method, show_payment_date,
    show_footer_document_date, font_scale, created_by, related_document_no, internal_sale_type
  ) VALUES (
    v_src.store_id, v_src.document_type, v_new_no, now()::date, v_src.show_document_date, v_src.paper_size,
    v_src.customer_id, v_src.customer_name, v_src.customer_phone, v_src.customer_address, v_src.customer_tax_id, v_src.customer_branch,
    v_src.price_type, v_src.vat_mode, v_src.vat_rate, v_src.discount_amount, v_src.discount_percent, v_src.subtotal, v_src.discount_total,
    v_src.amount_before_vat, v_src.vat_amount, v_src.withholding_tax_enabled, v_src.withholding_tax_rate, v_src.withholding_tax_amount,
    v_src.grand_total, v_src.net_total, v_src.payment_method, 'unpaid', 'draft', v_src.notes, v_src.template, v_src.print_mode,
    v_src.auto_fit_a4, v_src.print_scale, v_src.project_name, v_src.show_payment_method, v_src.show_payment_date,
    v_src.show_footer_document_date, v_src.font_scale, auth.uid(), v_src.document_no, COALESCE(v_src.internal_sale_type,'real_goods')
  ) RETURNING id INTO v_new_id;
  INSERT INTO public.film_document_items (document_id, item_order, product_id, name, description, price, quantity, unit, discount_percent, discount_amount, line_total)
  SELECT v_new_id, item_order, product_id, name, description, price, quantity, unit, discount_percent, discount_amount, line_total
    FROM public.film_document_items WHERE document_id = p_id ORDER BY item_order;
  RETURN v_new_id;
END $function$;

CREATE OR REPLACE FUNCTION public.film_merge_customers(p_target uuid, p_source uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_t public.film_customers; v_s public.film_customers; v_moved int;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_target IS NULL OR p_source IS NULL OR p_target = p_source THEN RAISE EXCEPTION 'invalid params'; END IF;
  SELECT * INTO v_t FROM public.film_customers WHERE id = p_target;
  SELECT * INTO v_s FROM public.film_customers WHERE id = p_source;
  IF v_t.id IS NULL OR v_s.id IS NULL THEN RAISE EXCEPTION 'customer not found'; END IF;
  IF v_t.store_id <> v_s.store_id THEN RAISE EXCEPTION 'different stores'; END IF;
  UPDATE public.film_customers SET
    phone       = COALESCE(NULLIF(v_t.phone,''),       NULLIF(v_s.phone,'')),
    address     = COALESCE(NULLIF(v_t.address,''),     NULLIF(v_s.address,'')),
    tax_id      = COALESCE(NULLIF(v_t.tax_id,''),      NULLIF(v_s.tax_id,'')),
    branch_name = COALESCE(NULLIF(v_t.branch_name,''), NULLIF(v_s.branch_name,'')),
    email       = COALESCE(NULLIF(v_t.email,''),       NULLIF(v_s.email,'')),
    org_id      = COALESCE(v_t.org_id, v_s.org_id), updated_at = now()
   WHERE id = p_target;
  UPDATE public.film_documents SET customer_id = p_target WHERE customer_id = p_source;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  DELETE FROM public.film_customers WHERE id = p_source;
  INSERT INTO public.film_activity_logs(store_id, user_id, action, target_type, target_id, detail)
  VALUES (v_t.store_id, auth.uid(), 'customer_merge', 'customer', p_target,
          jsonb_build_object('source_id', p_source, 'source_name', v_s.name, 'documents_moved', v_moved));
  RETURN jsonb_build_object('target_id', p_target, 'documents_moved', v_moved);
END $function$;

CREATE OR REPLACE FUNCTION public.film_restore_documents(p_ids uuid[])
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  IF NOT is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.film_documents SET deleted_at = NULL, status = 'issued', updated_at = now()
   WHERE id = ANY(p_ids) AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$;

CREATE OR REPLACE FUNCTION public.film_soft_delete_documents(p_ids uuid[])
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  IF NOT is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.film_documents SET deleted_at = now(), status = 'trash', updated_at = now()
   WHERE id = ANY(p_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$;

CREATE OR REPLACE FUNCTION public.film_restore_from_sheets(p_store_id uuid, p_document_no text, p_header jsonb, p_items jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_type text; v_internal text;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_type := coalesce(p_header->>'document_type','receipt');
  v_internal := coalesce(p_header->>'internal_sale_type','real_goods');
  SELECT id INTO v_id FROM public.film_documents
   WHERE store_id = p_store_id AND document_no = p_document_no ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.film_documents (
      store_id, document_type, document_no, document_date,
      customer_name, customer_phone, customer_address, customer_tax_id, customer_branch,
      notes, status, subtotal, discount_total, amount_before_vat,
      vat_amount, withholding_tax_amount, grand_total, net_total,
      created_by, deleted_at, internal_sale_type
    ) VALUES (
      p_store_id, v_type, p_document_no, COALESCE((p_header->>'issue_date')::date, now()::date),
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
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.film_documents SET
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
      internal_sale_type = v_internal, deleted_at = NULL, updated_at = now()
    WHERE id = v_id;
  END IF;
  DELETE FROM public.film_document_items WHERE document_id = v_id;
  INSERT INTO public.film_document_items (document_id, item_order, name, quantity, unit, price, line_total)
  SELECT v_id, COALESCE((it->>'seq')::int, ord), it->>'name',
         COALESCE((it->>'qty')::numeric, 0), it->>'unit',
         COALESCE((it->>'unit_price')::numeric, 0), COALESCE((it->>'amount')::numeric, 0)
    FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) WITH ORDINALITY AS t(it, ord);
  INSERT INTO public.film_activity_logs(store_id, user_id, action, target_type, target_id, detail)
  VALUES (p_store_id, auth.uid(), 'document_restore_from_sheets', 'document', v_id,
          jsonb_build_object('document_no', p_document_no));
  RETURN v_id;
END $function$;

DROP TRIGGER IF EXISTS film_document_items_stock ON public.film_document_items;
CREATE TRIGGER film_document_items_stock
  AFTER INSERT OR DELETE ON public.film_document_items
  FOR EACH ROW EXECUTE FUNCTION public.film_apply_stock_movement();