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

  v_prefix := CASE d.doc_type
    WHEN 'quotation' THEN 'QT'
    WHEN 'delivery_note' THEN 'DN'
    WHEN 'receipt' THEN 'RC'
    WHEN 'tax_receipt' THEN 'TX'
    ELSE 'WO' END;

  -- เลขที่เอกสารต้องไม่ซ้ำทั้งระบบ (ตัวนับแยกตามร้าน จึงอาจชนกันได้) → ข้ามเลขที่ถูกใช้ไปแล้ว
  LOOP
    v_guard := v_guard + 1;
    IF v_guard > 1000 THEN RAISE EXCEPTION 'doc_no_exhausted'; END IF;

    INSERT INTO public.document_command_counters (shop_key, doc_type, year, seq)
    VALUES (d.shop_key, d.doc_type, v_year, 1)
    ON CONFLICT (shop_key, doc_type, year)
    DO UPDATE SET seq = public.document_command_counters.seq + 1, updated_at = now()
    RETURNING seq INTO v_seq;

    v_no := v_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.document_command_drafts WHERE final_doc_no = v_no
    );
  END LOOP;

  UPDATE public.document_command_drafts
     SET status = 'final',
         final_doc_no = v_no,
         confirmed_by = v_actor,
         confirmed_at = now(),
         last_error = NULL
   WHERE id = p_draft_id;

  INSERT INTO public.document_command_audit (draft_id, event, detail, actor_id, actor_label, source, line_user_id)
  VALUES (
    p_draft_id,
    'finalized_by_line_bot',
    jsonb_build_object('doc_no', v_no, 'doc_type', d.doc_type, 'shop_key', d.shop_key, 'total', d.total, 'channel_id', p_channel_id),
    v_actor,
    p_actor_label,
    d.source,
    p_line_user_id
  );

  RETURN QUERY SELECT v_no, false;
END;
$function$;