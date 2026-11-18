-- 1) source linkage columns
ALTER TABLE public.rds_documents
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES public.rds_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_document_no text,
  ADD COLUMN IF NOT EXISTS created_source text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_rds_documents_source_document_id
  ON public.rds_documents(source_document_id);

ALTER TABLE public.document_command_drafts
  ADD COLUMN IF NOT EXISTS source_document_id uuid,
  ADD COLUMN IF NOT EXISTS source_document_no text;

-- 2) validator: source must be an ISSUED quotation of the SAME store
CREATE OR REPLACE FUNCTION public.rds_assert_quotation_source(
  p_store_id uuid,
  p_document_type text,
  p_source_id uuid
) RETURNS public.rds_documents
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  q public.rds_documents%ROWTYPE;
BEGIN
  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'quotation_required: % ต้องสร้างจากใบเสนอราคาที่ออกแล้วเท่านั้น', p_document_type;
  END IF;
  SELECT * INTO q FROM public.rds_documents WHERE id = p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found: ไม่พบใบเสนอราคาต้นทาง';
  END IF;
  IF q.document_type <> 'quotation' THEN
    RAISE EXCEPTION 'source_not_quotation: เอกสารต้นทางต้องเป็นใบเสนอราคา';
  END IF;
  IF q.store_id <> p_store_id THEN
    RAISE EXCEPTION 'source_store_mismatch: ใบเสนอราคาต้นทางเป็นของคนละร้าน';
  END IF;
  IF q.deleted_at IS NOT NULL OR q.status <> 'issued' THEN
    RAISE EXCEPTION 'source_not_issued: ใบเสนอราคาต้นทางยังเป็นฉบับร่าง/ถูกยกเลิก';
  END IF;
  RETURN q;
END $$;

-- 3) universal quotation-first guard on insert
CREATE OR REPLACE FUNCTION public.rds_documents_quotation_first()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  q public.rds_documents%ROWTYPE;
BEGIN
  IF NEW.source_document_id IS NOT NULL THEN
    q := public.rds_assert_quotation_source(NEW.store_id, NEW.document_type, NEW.source_document_id);
    NEW.source_document_no := q.document_no;
    IF NEW.related_document_no IS NULL THEN
      NEW.related_document_no := q.document_no;
    END IF;
  ELSIF COALESCE(NEW.created_source, 'manual') IN ('ai', 'line_bot', 'api')
        AND NEW.document_type IN ('delivery', 'receipt', 'tax_invoice') THEN
    RAISE EXCEPTION 'quotation_required: ระบบกำหนดให้เริ่มจากใบเสนอราคาก่อน (%)', NEW.document_type;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rds_documents_quotation_first ON public.rds_documents;
CREATE TRIGGER trg_rds_documents_quotation_first
  BEFORE INSERT ON public.rds_documents
  FOR EACH ROW EXECUTE FUNCTION public.rds_documents_quotation_first();

-- 4) create the next document from an issued quotation (copies customer/items/tax defaults)
CREATE OR REPLACE FUNCTION public.rds_create_next_doc_from_quotation(
  p_source_id uuid,
  p_document_type text,
  p_actor uuid DEFAULT NULL,
  p_created_source text DEFAULT 'manual',
  p_store_id uuid DEFAULT NULL
) RETURNS TABLE(doc_no text, document_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  q public.rds_documents%ROWTYPE;
  v_no text;
  v_id uuid;
BEGIN
  IF p_document_type NOT IN ('delivery', 'receipt', 'tax_invoice') THEN
    RAISE EXCEPTION 'unsupported_next_type: %', p_document_type;
  END IF;
  SELECT * INTO q FROM public.rds_documents WHERE id = p_source_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'source_not_found: ไม่พบใบเสนอราคาต้นทาง'; END IF;
  IF p_store_id IS NOT NULL AND p_store_id <> q.store_id THEN
    RAISE EXCEPTION 'source_store_mismatch: ใบเสนอราคาต้นทางเป็นของคนละร้าน';
  END IF;
  PERFORM public.rds_assert_quotation_source(q.store_id, p_document_type, p_source_id);

  v_no := public.rds_next_doc_no_internal(q.store_id, p_document_type);

  INSERT INTO public.rds_documents (
    store_id, document_type, document_no, document_date, paper_size, template,
    customer_id, customer_name, customer_phone, customer_address, customer_tax_id, customer_branch,
    price_type, vat_mode, vat_rate,
    discount_amount, discount_percent, subtotal, discount_total, amount_before_vat, vat_amount,
    withholding_tax_enabled, withholding_tax_rate, withholding_tax_amount,
    grand_total, net_total, payment_method, payment_status, status, notes, project_name,
    source_document_id, source_document_no, related_document_no, created_source, created_by
  ) VALUES (
    q.store_id, p_document_type, v_no, (now() AT TIME ZONE 'Asia/Bangkok')::date, q.paper_size, q.template,
    q.customer_id, q.customer_name, q.customer_phone, q.customer_address, q.customer_tax_id, q.customer_branch,
    q.price_type, q.vat_mode, q.vat_rate,
    q.discount_amount, q.discount_percent, q.subtotal, q.discount_total, q.amount_before_vat, q.vat_amount,
    q.withholding_tax_enabled, q.withholding_tax_rate, q.withholding_tax_amount,
    q.grand_total, q.net_total, NULL, 'unpaid', 'issued', q.notes, q.project_name,
    q.id, q.document_no, q.document_no, COALESCE(p_created_source, 'manual'), p_actor
  ) RETURNING id INTO v_id;

  INSERT INTO public.rds_document_items
    (document_id, product_id, item_order, name, description, price, quantity, unit, discount_percent, discount_amount, line_total)
  SELECT v_id, i.product_id, i.item_order, i.name, i.description, i.price, i.quantity, i.unit,
         i.discount_percent, i.discount_amount, i.line_total
  FROM public.rds_document_items i
  WHERE i.document_id = q.id
  ORDER BY i.item_order;

  RETURN QUERY SELECT v_no, v_id;
END $$;

REVOKE ALL ON FUNCTION public.rds_create_next_doc_from_quotation(uuid, text, uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rds_create_next_doc_from_quotation(uuid, text, uuid, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.rds_assert_quotation_source(uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rds_assert_quotation_source(uuid, text, uuid) TO authenticated, service_role;

-- 5) bot draft -> rds document, now carrying the source link + origin
CREATE OR REPLACE FUNCTION public.rds_create_doc_from_bot_draft(
  p_draft_id uuid,
  p_store_id uuid,
  p_document_type text,
  p_actor uuid,
  p_related_doc_no text DEFAULT NULL::text,
  p_source_document_id uuid DEFAULT NULL::uuid
) RETURNS TABLE(doc_no text, document_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  IF p_document_type IN ('delivery','receipt','tax_invoice') THEN
    PERFORM public.rds_assert_quotation_source(p_store_id, p_document_type, p_source_document_id);
  END IF;

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
    related_document_no, source_document_id, created_source, created_by
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
    'issued', d.notes, d.project, p_related_doc_no, p_source_document_id, 'line_bot', p_actor
  ) RETURNING id INTO v_id;

  INSERT INTO public.rds_document_items (document_id, item_order, name, quantity, unit, price, discount_amount, line_total)
  SELECT v_id, COALESCE(i.sort_order, 1), i.description, i.quantity, i.unit, i.unit_price,
         COALESCE(i.discount, 0), COALESCE(i.total, i.quantity * i.unit_price)
  FROM public.document_command_items i
  WHERE i.draft_id = p_draft_id
  ORDER BY i.sort_order;

  RETURN QUERY SELECT v_no, v_id;
END $$;

-- 6) LINE bot finalize: new jobs may only produce a quotation; next docs need a source
CREATE OR REPLACE FUNCTION public.document_command_finalize_bot(
  p_draft_id uuid,
  p_line_user_id text,
  p_channel_id uuid,
  p_actor_label text DEFAULT NULL::text
) RETURNS TABLE(doc_no text, already boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- quotation-first: bot may not issue a next-stage document without an issued quotation
  IF d.doc_type IN ('delivery_note','receipt','tax_receipt') AND d.source_document_id IS NULL THEN
    RAISE EXCEPTION 'quotation_required: ระบบกำหนดให้เริ่มจากใบเสนอราคาก่อน';
  END IF;

  SELECT id INTO v_store FROM public.rds_stores WHERE slug = d.shop_key LIMIT 1;
  v_rds_type := CASE d.doc_type
    WHEN 'quotation' THEN 'quotation'
    WHEN 'delivery_note' THEN 'delivery'
    WHEN 'receipt' THEN 'receipt'
    WHEN 'tax_receipt' THEN 'tax_invoice'
    ELSE NULL END;

  IF v_store IS NOT NULL AND v_rds_type IS NOT NULL THEN
    SELECT r.doc_no, r.document_id INTO v_no, v_doc_id
    FROM public.rds_create_doc_from_bot_draft(p_draft_id, v_store, v_rds_type, v_actor, NULL, d.source_document_id) r;

    -- companions are only allowed once an issued quotation exists as the source
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
                       'channel_id', p_channel_id, 'rds_document_id', v_doc_id, 'companions', v_comp_nos,
                       'source_document_id', d.source_document_id, 'source_document_no', d.source_document_no),
    v_actor,
    p_actor_label,
    d.source,
    p_line_user_id
  );

  RETURN QUERY SELECT v_no, false;
END $$;