ALTER TABLE public.film_orders ADD COLUMN IF NOT EXISTS intake_request_id text;
CREATE UNIQUE INDEX IF NOT EXISTS film_orders_intake_request_id_key
  ON public.film_orders(intake_request_id) WHERE intake_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.film_queue_intake_confirm(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req text := nullif(p_payload->>'request_id','');
  v_existing public.film_orders%ROWTYPE;
  v_order_id uuid; v_order_no text; v_customer_id uuid;
  v_name text := coalesce(nullif(trim(p_payload#>>'{customer,name}'),''), '');
  v_phone text := nullif(trim(coalesce(p_payload#>>'{customer,phone}','')),'');
  v_items jsonb := coalesce(p_payload->'items','[]'::jsonb);
  v_it jsonb; v_idx int := 0;
  v_subtotal numeric := 0; v_discount numeric := 0; v_total numeric := 0;
  v_line numeric;
  v_mode text := coalesce(p_payload#>>'{payment,mode}','unpaid');
  v_deposit numeric := coalesce((p_payload#>>'{payment,deposit}')::numeric, 0);
  v_method text := coalesce(nullif(p_payload#>>'{payment,method}',''), 'cash');
  v_paid numeric := 0; v_pay_status text;
  v_due timestamptz := nullif(p_payload->>'due_at','')::timestamptz;
  v_jo_no text; v_jo_id uuid; v_rc_no text; v_rc_id uuid;
  v_doc_items jsonb := '[]'::jsonb;
  v_notes text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'customer name required'; END IF;
  IF jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'items required'; END IF;

  IF v_req IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.film_orders WHERE intake_request_id = v_req;
    IF FOUND THEN
      SELECT id, invoice_number INTO v_jo_id, v_jo_no FROM public.film_invoices
        WHERE source_order_id = v_existing.id AND type = 'job_order' LIMIT 1;
      SELECT id, invoice_number INTO v_rc_id, v_rc_no FROM public.film_invoices
        WHERE source_order_id = v_existing.id AND type = 'receipt' LIMIT 1;
      RETURN jsonb_build_object('duplicate', true, 'order_id', v_existing.id, 'order_no', v_existing.order_no,
        'job_order_id', v_jo_id, 'job_order_no', v_jo_no, 'receipt_id', v_rc_id, 'receipt_no', v_rc_no);
    END IF;
  END IF;

  -- totals + document line items
  FOR v_it IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_idx := v_idx + 1;
    v_line := greatest(0,
      coalesce((v_it->>'quantity')::numeric,1) * coalesce((v_it->>'unit_price')::numeric,0)
      - coalesce((v_it->>'discount')::numeric,0));
    v_subtotal := v_subtotal + coalesce((v_it->>'quantity')::numeric,1) * coalesce((v_it->>'unit_price')::numeric,0);
    v_discount := v_discount + coalesce((v_it->>'discount')::numeric,0);
    v_total := v_total + v_line;
    v_doc_items := v_doc_items || jsonb_build_array(jsonb_build_object(
      'id', v_idx::text,
      'name', coalesce(nullif(v_it->>'title',''), 'รายการงาน'),
      'unit', coalesce(nullif(v_it->>'unit',''), 'ชิ้น'),
      'width', 0, 'height', 0, 'pricePerSqm', 0,
      'quantity', coalesce((v_it->>'quantity')::numeric,1),
      'discount', coalesce((v_it->>'discount')::numeric,0),
      'pricePerPiece', coalesce((v_it->>'unit_price')::numeric,0),
      'category', nullif(v_it->>'category',''),
      'total', v_line));
  END LOOP;

  IF v_mode = 'paid' THEN
    v_paid := v_total; v_deposit := 0; v_pay_status := 'paid';
  ELSIF v_mode = 'deposit' THEN
    v_deposit := least(greatest(v_deposit,0), v_total); v_paid := v_deposit;
    v_pay_status := CASE WHEN v_deposit > 0 THEN 'partial' ELSE 'unpaid' END;
  ELSE
    v_deposit := 0; v_paid := 0; v_pay_status := 'unpaid';
  END IF;

  v_notes := nullif(concat_ws(E'\n',
    nullif(p_payload->>'job_detail',''),
    CASE WHEN nullif(p_payload->>'assignee_name','') IS NOT NULL
      THEN 'ผู้รับผิดชอบ: ' || (p_payload->>'assignee_name') END), '');

  -- customer
  v_customer_id := nullif(p_payload#>>'{customer,id}','')::uuid;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.film_customers(name, phone) VALUES (v_name, v_phone)
    RETURNING id INTO v_customer_id;
  END IF;

  SELECT public.film_next_order_number() INTO v_order_no;

  INSERT INTO public.film_orders(
    order_no, customer_id, customer_name, customer_phone, channel, title, due_at,
    is_urgent, status, payment_status, subtotal, discount, deposit, total, paid_amount,
    notes, is_draft, created_by, intake_request_id, is_test, attachments)
  VALUES (
    v_order_no, v_customer_id, v_name, v_phone, 'walkin',
    coalesce(nullif(v_items->0->>'title',''), 'งานรับหน้าร้าน'), v_due,
    coalesce((p_payload->>'is_urgent')::boolean, false), 'confirmed', v_pay_status,
    v_subtotal, v_discount, v_deposit, v_total, v_paid,
    v_notes, false, auth.uid(), v_req,
    coalesce((p_payload->>'is_test')::boolean, false),
    coalesce(p_payload->'attachments','[]'::jsonb))
  RETURNING id INTO v_order_id;

  v_idx := 0;
  FOR v_it IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_line := greatest(0,
      coalesce((v_it->>'quantity')::numeric,1) * coalesce((v_it->>'unit_price')::numeric,0)
      - coalesce((v_it->>'discount')::numeric,0));
    INSERT INTO public.film_order_items(
      order_id, description, title, category, quantity, unit, unit_price, total,
      dept, sort_order, notes, size, due_at, assigned_employee_id, attachments)
    VALUES (
      v_order_id,
      coalesce(nullif(v_it->>'detail',''), nullif(v_it->>'title',''), 'รายการงาน'),
      coalesce(nullif(v_it->>'title',''), 'รายการงาน'),
      coalesce(nullif(v_it->>'category',''), 'other'),
      coalesce((v_it->>'quantity')::numeric,1),
      coalesce(nullif(v_it->>'unit',''), 'ชิ้น'),
      coalesce((v_it->>'unit_price')::numeric,0), v_line,
      'front', v_idx, nullif(p_payload->>'job_detail',''), nullif(v_it->>'size',''),
      v_due, nullif(p_payload->>'assignee_employee_id','')::uuid,
      coalesce(p_payload->'attachments','[]'::jsonb));
    v_idx := v_idx + 1;
  END LOOP;

  PERFORM public.film_confirm_order(v_order_id);

  SELECT public.film_next_job_order_number() INTO v_jo_no;
  INSERT INTO public.film_invoices(
    invoice_number, type, customer_id, customer_name, customer_phone, items,
    subtotal, discount, deposit, total, amount_due, status, job_status,
    reference_doc, source_order_id, notes, document_date, due_date, created_via)
  VALUES (
    v_jo_no, 'job_order', v_customer_id, v_name, v_phone, v_doc_items,
    v_subtotal, v_discount, v_deposit, v_total, greatest(0, v_total - v_paid),
    CASE WHEN v_mode = 'paid' THEN 'paid' WHEN v_deposit > 0 THEN 'deposit' ELSE 'pending' END,
    CASE WHEN v_mode = 'paid' THEN 'receipt_issued' ELSE 'approved' END,
    v_order_no, v_order_id, v_notes, (now() AT TIME ZONE 'Asia/Bangkok')::date,
    (v_due AT TIME ZONE 'Asia/Bangkok')::date, 'queue_intake')
  RETURNING id INTO v_jo_id;

  IF v_mode = 'paid' THEN
    SELECT public.film_next_receipt_number() INTO v_rc_no;
    INSERT INTO public.film_invoices(
      invoice_number, type, customer_id, customer_name, customer_phone, items,
      subtotal, discount, deposit, total, amount_due, status, job_status,
      reference_doc, source_order_id, notes, document_date, paid_at, payment_method, created_via)
    VALUES (
      v_rc_no, 'receipt', v_customer_id, v_name, v_phone, v_doc_items,
      v_subtotal, v_discount, 0, v_total, 0, 'paid', 'delivered',
      v_jo_no, v_order_id, v_notes, (now() AT TIME ZONE 'Asia/Bangkok')::date,
      now(), v_method, 'queue_intake')
    RETURNING id INTO v_rc_id;
  END IF;

  RETURN jsonb_build_object('duplicate', false, 'order_id', v_order_id, 'order_no', v_order_no,
    'job_order_id', v_jo_id, 'job_order_no', v_jo_no, 'receipt_id', v_rc_id, 'receipt_no', v_rc_no);
END;
$function$;

CREATE OR REPLACE FUNCTION public.film_queue_issue_receipt(p_order_id uuid, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.film_orders%ROWTYPE;
  v_jo public.film_invoices%ROWTYPE;
  v_rc_id uuid; v_rc_no text;
  v_total numeric; v_method text := coalesce(nullif(p_payload->>'method',''),'cash');
  v_items jsonb;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_order FROM public.film_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  SELECT id, invoice_number INTO v_rc_id, v_rc_no FROM public.film_invoices
    WHERE source_order_id = p_order_id AND type = 'receipt' LIMIT 1;
  IF v_rc_id IS NOT NULL THEN
    RETURN jsonb_build_object('duplicate', true, 'receipt_id', v_rc_id, 'receipt_no', v_rc_no);
  END IF;

  SELECT * INTO v_jo FROM public.film_invoices
    WHERE source_order_id = p_order_id AND type = 'job_order' LIMIT 1;

  v_total := coalesce(nullif(p_payload->>'total','')::numeric, v_jo.total, v_order.total, 0);
  v_items := coalesce(v_jo.items, '[]'::jsonb);

  SELECT public.film_next_receipt_number() INTO v_rc_no;
  INSERT INTO public.film_invoices(
    invoice_number, type, customer_id, customer_name, customer_phone, items,
    subtotal, discount, deposit, total, amount_due, status, job_status,
    reference_doc, source_order_id, notes, document_date, paid_at, payment_method, created_via)
  VALUES (
    v_rc_no, 'receipt', v_order.customer_id, v_order.customer_name, v_order.customer_phone, v_items,
    v_total, coalesce(v_jo.discount, 0), 0, v_total, 0, 'paid', 'delivered',
    coalesce(v_jo.invoice_number, v_order.order_no), p_order_id,
    nullif(p_payload->>'note',''), (now() AT TIME ZONE 'Asia/Bangkok')::date,
    now(), v_method, 'queue_receipt')
  RETURNING id INTO v_rc_id;

  IF v_jo.id IS NOT NULL THEN
    UPDATE public.film_invoices SET job_status = 'receipt_issued', status = 'paid', amount_due = 0
      WHERE id = v_jo.id;
  END IF;

  UPDATE public.film_orders
    SET payment_status = 'paid', paid_amount = v_total, updated_at = now()
    WHERE id = p_order_id;

  RETURN jsonb_build_object('duplicate', false, 'receipt_id', v_rc_id, 'receipt_no', v_rc_no);
END;
$function$;

REVOKE ALL ON FUNCTION public.film_queue_intake_confirm(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.film_queue_issue_receipt(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.film_queue_intake_confirm(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.film_queue_issue_receipt(uuid, jsonb) TO authenticated, service_role;