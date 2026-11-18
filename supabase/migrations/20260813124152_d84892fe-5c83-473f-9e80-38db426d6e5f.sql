INSERT INTO public.rds_document_settings (store_id, document_type, title, prefix, running_format, next_number)
SELECT s.id, 'job_order', 'ใบสั่งจ้าง', 'JO', '{prefix}-{yyyy}-{seq:0000}', 1
FROM public.rds_stores s
WHERE NOT EXISTS (
  SELECT 1 FROM public.rds_document_settings ds
  WHERE ds.store_id = s.id AND ds.document_type = 'job_order'
);

CREATE OR REPLACE FUNCTION public.document_command_finalize_bot(p_draft_id uuid, p_line_user_id text, p_channel_id uuid, p_actor_label text DEFAULT NULL::text)
 RETURNS TABLE(doc_no text, already boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d public.document_command_drafts%ROWTYPE;
  v_items int;
  v_bad int;
  v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int;
  v_seq int;
  v_prefix text;
  v_no text;
  v_perm jsonb;
  v_actor uuid;
  v_guard int := 0;
  v_store uuid;
  v_rds_type text;
  v_doc_id uuid;
  v_comp text;
  v_comp_type text;
  v_comp_no text;
  v_comp_id uuid;
  v_comp_nos jsonb := '[]'::jsonb;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') NOT IN ('service_role', '') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_perm := public.line_queue_command_allowed(p_line_user_id, p_channel_id);
  IF NOT coalesce((v_perm ->> 'allowed')::boolean, false) THEN
    RAISE EXCEPTION 'not_authorized:%', coalesce(v_perm ->> 'reason', 'unknown');
  END IF;
  v_actor := nullif(v_perm ->> 'user_id', '')::uuid;

  SELECT * INTO d FROM public.document_command_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft_not_found'; END IF;

  IF d.status = 'final' AND d.final_doc_no IS NOT NULL THEN
    RETURN QUERY SELECT d.final_doc_no, true;
    RETURN;
  END IF;
  IF d.status = 'cancelled' THEN RAISE EXCEPTION 'draft_cancelled'; END IF;

  IF coalesce(trim(d.customer_name),'') = '' THEN RAISE EXCEPTION 'missing_customer'; END IF;
  IF coalesce(trim(d.shop_key),'') = '' THEN RAISE EXCEPTION 'missing_shop'; END IF;

  SELECT count(*) INTO v_items FROM public.document_command_items WHERE draft_id = p_draft_id;
  IF v_items = 0 THEN RAISE EXCEPTION 'missing_items'; END IF;

  SELECT count(*) INTO v_bad FROM public.document_command_items
   WHERE draft_id = p_draft_id
     AND (coalesce(trim(description),'') = '' OR unit_price IS NULL OR unit_price <= 0 OR quantity IS NULL OR quantity <= 0);
  IF v_bad > 0 THEN RAISE EXCEPTION 'missing_price'; END IF;

  IF d.doc_type IN ('receipt','tax_receipt') AND d.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'receipt_unpaid';
  END IF;

  IF d.doc_type IN ('delivery_note','receipt','tax_receipt') AND d.source_document_id IS NULL THEN
    RAISE EXCEPTION 'quotation_required: ระบบกำหนดให้เริ่มจากใบเสนอราคาก่อน';
  END IF;

  SELECT id INTO v_store FROM public.rds_stores WHERE slug = d.shop_key LIMIT 1;
  v_rds_type := CASE d.doc_type
    WHEN 'quotation' THEN 'quotation'
    WHEN 'delivery_note' THEN 'delivery'
    WHEN 'receipt' THEN 'receipt'
    WHEN 'tax_receipt' THEN 'tax_invoice'
    WHEN 'job_order' THEN 'job_order'
    ELSE NULL END;

  IF v_store IS NOT NULL AND v_rds_type IS NOT NULL THEN
    SELECT r.doc_no, r.document_id INTO v_no, v_doc_id
    FROM public.rds_create_doc_from_bot_draft(p_draft_id, v_store, v_rds_type, v_actor, NULL, d.source_document_id) r;

    FOR v_comp IN SELECT jsonb_array_elements_text(COALESCE(d.companions, '[]'::jsonb)) LOOP
      v_comp_type := CASE v_comp
        WHEN 'quotation' THEN 'quotation'
        WHEN 'delivery_note' THEN 'delivery'
        WHEN 'delivery' THEN 'delivery'
        WHEN 'receipt' THEN 'receipt'
        WHEN 'tax_receipt' THEN 'tax_invoice'
        WHEN 'tax_invoice' THEN 'tax_invoice'
        ELSE NULL END;
      CONTINUE WHEN v_comp_type IS NULL OR v_comp_type = v_rds_type;
      CONTINUE WHEN v_comp_type IN ('delivery','receipt','tax_invoice') AND d.source_document_id IS NULL;
      SELECT r.doc_no, r.document_id INTO v_comp_no, v_comp_id
      FROM public.rds_create_doc_from_bot_draft(p_draft_id, v_store, v_comp_type, v_actor, v_no, d.source_document_id) r;
      v_comp_nos := v_comp_nos || to_jsonb(v_comp_no);
    END LOOP;
  ELSE
    v_prefix := CASE d.doc_type
      WHEN 'quotation' THEN 'QT'
      WHEN 'delivery_note' THEN 'DN'
      WHEN 'receipt' THEN 'RC'
      WHEN 'tax_receipt' THEN 'TX'
      WHEN 'job_order' THEN 'JO'
      ELSE 'WO' END;

    LOOP
      v_guard := v_guard + 1;
      IF v_guard > 1000 THEN RAISE EXCEPTION 'doc_no_exhausted'; END IF;

      UPDATE public.document_command_counters
         SET seq = seq + 1
       WHERE doc_type = d.doc_type AND year = v_year
      RETURNING seq INTO v_seq;

      IF v_seq IS NULL THEN
        INSERT INTO public.document_command_counters (doc_type, year, seq)
        VALUES (d.doc_type, v_year, 1)
        ON CONFLICT (doc_type, year) DO UPDATE SET seq = public.document_command_counters.seq + 1
        RETURNING seq INTO v_seq;
      END IF;

      v_no := v_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.document_command_drafts WHERE final_doc_no = v_no);
    END LOOP;
  END IF;

  UPDATE public.document_command_drafts
     SET status = 'final',
         final_doc_no = v_no,
         final_document_id = v_doc_id,
         companion_doc_nos = v_comp_nos,
         finalized_at = now(),
         finalized_by = v_actor
   WHERE id = p_draft_id;

  INSERT INTO public.document_command_audit (draft_id, event, detail, source, line_user_id, actor_label)
  VALUES (p_draft_id, 'finalized_bot',
          jsonb_build_object('doc_no', v_no, 'companions', v_comp_nos, 'doc_type', d.doc_type),
          'line', p_line_user_id, p_actor_label);

  RETURN QUERY SELECT v_no, false;
END $function$;