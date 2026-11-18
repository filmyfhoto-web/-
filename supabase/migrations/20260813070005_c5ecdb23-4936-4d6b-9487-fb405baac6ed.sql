ALTER TABLE public.document_command_drafts
  ADD COLUMN IF NOT EXISTS customer_branch text,
  ADD COLUMN IF NOT EXISTS paper_size text,
  ADD COLUMN IF NOT EXISTS template text,
  ADD COLUMN IF NOT EXISTS price_type text,
  ADD COLUMN IF NOT EXISTS document_date date,
  ADD COLUMN IF NOT EXISTS companions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS final_document_id uuid,
  ADD COLUMN IF NOT EXISTS companion_doc_nos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ตัวออกเลขที่เอกสารของระบบ RDS แบบใช้ภายใน (ไม่ผูกกับ auth.uid())
CREATE OR REPLACE FUNCTION public.rds_next_doc_no_internal(p_store_id uuid, p_document_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_format text;
  v_seq int;
  v_year text := to_char(now(),'YYYY');
  v_month text := to_char(now(),'MM');
  v_result text;
  v_actual text := p_document_type;
  v_alt text := NULL;
  v_max_existing int;
  v_pad int;
  v_lock_key bigint;
BEGIN
  IF p_document_type = 'delivery' THEN v_alt := 'delivery_order';
  ELSIF p_document_type = 'delivery_order' THEN v_alt := 'delivery';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rds_document_settings
    WHERE store_id = p_store_id AND document_type = v_actual
  ) AND v_alt IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.rds_document_settings
    WHERE store_id = p_store_id AND document_type = v_alt
  ) THEN
    v_actual := v_alt;
  END IF;

  v_lock_key := hashtextextended(p_store_id::text || ':' || v_actual, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT prefix, running_format INTO v_prefix, v_format
  FROM public.rds_document_settings
  WHERE store_id = p_store_id AND document_type = v_actual;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'document settings not found for % / %', p_store_id, p_document_type;
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(document_no, '.*[^0-9]([0-9]+)$', '\1'), '')::int), 0)
    INTO v_max_existing
  FROM public.rds_documents
  WHERE store_id = p_store_id
    AND (document_type = v_actual OR (v_alt IS NOT NULL AND document_type = v_alt))
    AND document_no ~ '[0-9]+$';

  UPDATE public.rds_document_settings
    SET next_number = GREATEST(next_number, v_max_existing + 1)
    WHERE store_id = p_store_id AND document_type = v_actual;

  UPDATE public.rds_document_settings
     SET next_number = next_number + 1
   WHERE store_id = p_store_id AND document_type = v_actual
  RETURNING next_number - 1 INTO v_seq;

  v_pad := COALESCE(length((regexp_match(v_format,'\{seq:(0+)\}'))[1]), 0);
  v_result := replace(v_format, '{prefix}', v_prefix);
  v_result := replace(v_result, '{yyyy}', v_year);
  v_result := replace(v_result, '{mm}', v_month);
  IF v_pad > 0 THEN
    v_result := regexp_replace(v_result, '\{seq:0+\}', lpad(v_seq::text, v_pad, '0'));
  END IF;
  v_result := replace(v_result, '{seq}', v_seq::text);

  RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.rds_next_doc_no_internal(uuid, text) FROM PUBLIC, anon, authenticated;

-- สร้างเอกสารจริงในระบบ RDS จากร่างของบอท (คืนเลขที่เอกสาร)
CREATE OR REPLACE FUNCTION public.rds_create_doc_from_bot_draft(
  p_draft_id uuid,
  p_store_id uuid,
  p_document_type text,
  p_actor uuid,
  p_related_doc_no text DEFAULT NULL
)
RETURNS TABLE(doc_no text, document_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d public.document_command_drafts%ROWTYPE;
  v_no text;
  v_id uuid;
  v_price_type text;
  v_vat_mode text;
  v_net numeric;
  v_before_vat numeric;
  v_paid boolean;
BEGIN
  SELECT * INTO d FROM public.document_command_drafts WHERE id = p_draft_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft_not_found'; END IF;

  v_no := public.rds_next_doc_no_internal(p_store_id, p_document_type);

  v_vat_mode := COALESCE(NULLIF(d.vat_mode, ''), 'none');
  v_price_type := COALESCE(NULLIF(d.price_type, ''),
    CASE v_vat_mode WHEN 'exclusive' THEN 'exclude_vat' WHEN 'inclusive' THEN 'include_vat' ELSE 'no_vat' END);

  v_net := GREATEST(COALESCE(d.subtotal,0) - COALESCE(d.discount,0), 0);
  v_before_vat := CASE WHEN v_vat_mode = 'inclusive' THEN v_net - COALESCE(d.vat_amount,0) ELSE v_net END;
  v_paid := (p_document_type IN ('receipt','tax_invoice') AND d.payment_status = 'paid');

  INSERT INTO public.rds_documents (
    store_id, document_type, document_no, document_date, paper_size, template,
    customer_name, customer_phone, customer_address, customer_tax_id, customer_branch,
    price_type, vat_mode, vat_rate,
    discount_amount, subtotal, discount_total, amount_before_vat, vat_amount,
    withholding_tax_enabled, withholding_tax_rate, withholding_tax_amount,
    grand_total, net_total, payment_method, payment_status, status, notes, project_name,
    related_document_no, created_by
  ) VALUES (
    p_store_id, p_document_type, v_no, COALESCE(d.document_date, (now() AT TIME ZONE 'Asia/Bangkok')::date),
    COALESCE(NULLIF(d.paper_size,''), 'A4'), COALESCE(NULLIF(d.template,''), 'modern'),
    d.customer_name, d.customer_phone, d.customer_address, d.customer_tax_id, d.customer_branch,
    v_price_type, v_vat_mode, COALESCE(d.vat_rate, 0),
    COALESCE(d.discount,0), COALESCE(d.subtotal,0), COALESCE(d.discount,0), v_before_vat, COALESCE(d.vat_amount,0),
    COALESCE(d.wht_rate,0) > 0, COALESCE(d.wht_rate,0), COALESCE(d.wht_amount,0),
    COALESCE(d.total,0), COALESCE(d.total,0),
    CASE WHEN v_paid THEN d.payment_method ELSE NULL END,
    CASE WHEN v_paid THEN 'paid' ELSE 'unpaid' END,
    'issued', d.notes, d.project, p_related_doc_no, p_actor
  ) RETURNING id INTO v_id;

  INSERT INTO public.rds_document_items (document_id, item_order, name, quantity, unit, price, discount_amount, line_total)
  SELECT v_id, COALESCE(i.sort_order, 1), i.description, i.quantity, i.unit, i.unit_price,
         COALESCE(i.discount, 0), COALESCE(i.total, i.quantity * i.unit_price)
  FROM public.document_command_items i
  WHERE i.draft_id = p_draft_id
  ORDER BY i.sort_order;

  RETURN QUERY SELECT v_no, v_id;
END $function$;

REVOKE ALL ON FUNCTION public.rds_create_doc_from_bot_draft(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;

-- ยืนยันจากบอท: ออกเอกสารจริงเข้าระบบ RDS (ถ้าร้าน/ชนิดเอกสารรองรับ)
CREATE OR REPLACE FUNCTION public.document_command_finalize_bot(
  p_draft_id uuid,
  p_line_user_id text,
  p_channel_id uuid,
  p_actor_label text DEFAULT NULL::text
)
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

  -- ร้าน + ชนิดเอกสารในระบบ RDS
  SELECT id INTO v_store FROM public.rds_stores WHERE slug = d.shop_key LIMIT 1;
  v_rds_type := CASE d.doc_type
    WHEN 'quotation' THEN 'quotation'
    WHEN 'delivery_note' THEN 'delivery'
    WHEN 'receipt' THEN 'receipt'
    WHEN 'tax_receipt' THEN 'tax_invoice'
    ELSE NULL END;

  IF v_store IS NOT NULL AND v_rds_type IS NOT NULL THEN
    SELECT r.doc_no, r.document_id INTO v_no, v_doc_id
    FROM public.rds_create_doc_from_bot_draft(p_draft_id, v_store, v_rds_type, v_actor, NULL) r;

    -- เอกสารที่สั่งให้ออกพร้อมกัน
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
      SELECT r.doc_no, r.document_id INTO v_comp_no, v_comp_id
      FROM public.rds_create_doc_from_bot_draft(p_draft_id, v_store, v_comp_type, v_actor, v_no) r;
      v_comp_nos := v_comp_nos || to_jsonb(v_comp_no);
    END LOOP;
  ELSE
    v_prefix := CASE d.doc_type
      WHEN 'quotation' THEN 'QT'
      WHEN 'delivery_note' THEN 'DN'
      WHEN 'receipt' THEN 'RC'
      WHEN 'tax_receipt' THEN 'TX'
      ELSE 'WO' END;

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
  END IF;

  UPDATE public.document_command_drafts
     SET status = 'final',
         final_doc_no = v_no,
         final_document_id = v_doc_id,
         companion_doc_nos = v_comp_nos,
         confirmed_by = v_actor,
         confirmed_at = now(),
         last_error = NULL
   WHERE id = p_draft_id;

  INSERT INTO public.document_command_audit (draft_id, event, detail, actor_id, actor_label, source, line_user_id)
  VALUES (
    p_draft_id,
    'finalized_by_line_bot',
    jsonb_build_object('doc_no', v_no, 'doc_type', d.doc_type, 'shop_key', d.shop_key, 'total', d.total,
                       'channel_id', p_channel_id, 'rds_document_id', v_doc_id, 'companions', v_comp_nos),
    v_actor,
    p_actor_label,
    d.source,
    p_line_user_id
  );

  RETURN QUERY SELECT v_no, false;
END;
$function$;