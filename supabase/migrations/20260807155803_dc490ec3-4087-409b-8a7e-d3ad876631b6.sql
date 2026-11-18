CREATE TABLE public.document_command_counters (
  shop_key TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_key, doc_type, year)
);
GRANT SELECT ON public.document_command_counters TO authenticated;
GRANT ALL ON public.document_command_counters TO service_role;
ALTER TABLE public.document_command_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read counters" ON public.document_command_counters
  FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.document_command_finalize(p_draft_id uuid)
RETURNS TABLE (doc_no text, already boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.document_command_drafts%ROWTYPE;
  v_items int;
  v_bad int;
  v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int;
  v_seq int;
  v_prefix text;
  v_no text;
BEGIN
  IF NOT (public.is_staff_any(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

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
   WHERE draft_id = p_draft_id AND (coalesce(trim(description),'') = '' OR unit_price IS NULL OR unit_price <= 0 OR quantity IS NULL OR quantity <= 0);
  IF v_bad > 0 THEN RAISE EXCEPTION 'missing_price'; END IF;

  IF d.doc_type IN ('receipt','tax_receipt') AND d.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'receipt_unpaid';
  END IF;

  INSERT INTO public.document_command_counters (shop_key, doc_type, year, seq)
  VALUES (d.shop_key, d.doc_type, v_year, 1)
  ON CONFLICT (shop_key, doc_type, year)
  DO UPDATE SET seq = public.document_command_counters.seq + 1, updated_at = now()
  RETURNING seq INTO v_seq;

  v_prefix := CASE d.doc_type
    WHEN 'quotation' THEN 'QT'
    WHEN 'delivery_note' THEN 'DN'
    WHEN 'receipt' THEN 'RC'
    WHEN 'tax_receipt' THEN 'TX'
    ELSE 'WO' END;
  v_no := v_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');

  UPDATE public.document_command_drafts
     SET status = 'final',
         final_doc_no = v_no,
         confirmed_by = auth.uid(),
         confirmed_at = now(),
         last_error = NULL
   WHERE id = p_draft_id;

  INSERT INTO public.document_command_audit (draft_id, event, detail, actor_id, source)
  VALUES (p_draft_id, 'finalized', jsonb_build_object('doc_no', v_no, 'doc_type', d.doc_type, 'shop_key', d.shop_key, 'total', d.total), auth.uid(), d.source);

  RETURN QUERY SELECT v_no, false;
END;
$$;

REVOKE ALL ON FUNCTION public.document_command_finalize(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_command_finalize(uuid) TO authenticated;