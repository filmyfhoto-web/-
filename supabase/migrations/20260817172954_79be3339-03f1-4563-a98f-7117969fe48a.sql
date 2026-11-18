-- รับงานจากกลุ่ม LINE ผ่านฟอร์มมือถือ (token อายุสั้น) — ไม่แตะข้อมูลเดิม
CREATE TABLE IF NOT EXISTS public.film_intake_form_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  channel_key text NOT NULL,
  channel_id uuid,
  group_id text NOT NULL,
  line_user_id text NOT NULL,
  store_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  used_at timestamptz,
  order_id uuid
);
CREATE INDEX IF NOT EXISTS film_intake_form_tokens_expires_idx ON public.film_intake_form_tokens(expires_at);

REVOKE ALL ON public.film_intake_form_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.film_intake_form_tokens TO service_role;
ALTER TABLE public.film_intake_form_tokens ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy โดยตั้งใจ: เข้าถึงได้เฉพาะ edge function (service_role) เท่านั้น

ALTER TABLE public.film_orders
  ADD COLUMN IF NOT EXISTS prepare_receipt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS intake_source text NOT NULL DEFAULT 'app';

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
  v_qty numeric; v_price numeric; v_disc numeric;
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
  v_docs text := coalesce(nullif(p_payload->>'docs',''), 'queue_job_order');
  v_prep boolean := coalesce((p_payload->>'prepare_receipt')::boolean, false);
  v_src text := coalesce(nullif(p_payload->>'intake_source',''), 'app');
BEGIN
  -- ผู้เรียกต้องเป็นสตาฟที่ล็อกอิน หรือ edge function ที่ตรวจ token ของกลุ่ม LINE มาแล้ว (service_role)
  IF NOT (public.is_staff(auth.uid()) OR coalesce(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_req IS NULL THEN RAISE EXCEPTION 'request_id required'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'customer name required'; END IF;
  IF jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'items required'; END IF;
  IF v_mode NOT IN ('unpaid','deposit','paid') THEN RAISE EXCEPTION 'invalid payment mode'; END IF;
  IF v_method NOT IN ('cash','transfer','other') THEN RAISE EXCEPTION 'invalid payment method'; END IF;
  IF v_docs NOT IN ('queue_only','queue_job_order') THEN RAISE EXCEPTION 'invalid docs mode'; END IF;
  IF v_docs = 'queue_only' AND v_mode = 'paid' THEN RAISE EXCEPTION 'receipt requires a job order'; END IF;

  -- serialize คำขอเดียวกันจากสองเครื่อง/สองแท็บ ก่อนตรวจ duplicate (กัน unique violation แทนผล duplicate)
  PERFORM pg_advisory_xact_lock(hashtextextended('film_queue_intake:' || v_req, 0));

  SELECT * INTO v_existing FROM public.film_orders WHERE intake_request_id = v_req;
  IF FOUND THEN
    SELECT id, invoice_number INTO v_jo_id, v_jo_no FROM public.film_invoices
      WHERE source_order_id = v_existing.id AND type = 'job_order' LIMIT 1;
    SELECT id, invoice_number INTO v_rc_id, v_rc_no FROM public.film_invoices
      WHERE source_order_id = v_existing.id AND type = 'receipt' LIMIT 1;
    RETURN jsonb_build_object('duplicate', true, 'order_id', v_existing.id, 'order_no', v_existing.order_no,
      'job_order_id', v_jo_id, 'job_order_no', v_jo_no, 'receipt_id', v_rc_id, 'receipt_no', v_rc_no);
  END IF;

  FOR v_it IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_idx := v_idx + 1;
    IF coalesce(nullif(trim(v_it->>'title'),''), '') = '' THEN
      RAISE EXCEPTION 'item % : title required', v_idx;
    END IF;
    v_qty := coalesce((v_it->>'quantity')::numeric, 0);
    v_price := coalesce((v_it->>'unit_price')::numeric, 0);
    v_disc := coalesce((v_it->>'discount')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'item % : quantity must be greater than 0', v_idx; END IF;
    IF v_price < 0 THEN RAISE EXCEPTION 'item % : unit price must not be negative', v_idx; END IF;
    IF v_disc < 0 THEN RAISE EXCEPTION 'item % : discount must not be negative', v_idx; END IF;
    IF v_disc > v_qty * v_price THEN RAISE EXCEPTION 'item % : discount exceeds line total', v_idx; END IF;

    v_line := v_qty * v_price - v_disc;
    v_subtotal := v_subtotal + v_qty * v_price;
    v_discount := v_discount + v_disc;
    v_total := v_total + v_line;
    v_doc_items := v_doc_items || jsonb_build_array(jsonb_build_object(
      'id', v_idx::text,
      'name', trim(v_it->>'title'),
      'unit', coalesce(nullif(v_it->>'unit',''), 'ชิ้น'),
      'width', 0, 'height', 0, 'pricePerSqm', 0,
      'quantity', v_qty,
      'discount', v_disc,
      'pricePerPiece', v_price,
      'category', nullif(v_it->>'category',''),
      'total', v_line));
  END LOOP;

  IF v_mode = 'paid' THEN
    IF v_total <= 0 THEN RAISE EXCEPTION 'total must be greater than 0 to issue a receipt'; END IF;
    v_paid := v_total; v_deposit := 0; v_pay_status := 'paid';
  ELSIF v_mode = 'deposit' THEN
    IF v_deposit <= 0 THEN RAISE EXCEPTION 'deposit must be greater than 0'; END IF;
    IF v_deposit > v_total THEN RAISE EXCEPTION 'deposit must not exceed total'; END IF;
    v_paid := v_deposit; v_pay_status := 'partial';
  ELSE
    v_deposit := 0; v_paid := 0; v_pay_status := 'unpaid';
  END IF;

  v_notes := nullif(concat_ws(E'\n',
    nullif(p_payload->>'job_detail',''),
    CASE WHEN nullif(p_payload->>'assignee_name','') IS NOT NULL
      THEN 'ผู้รับผิดชอบ: ' || (p_payload->>'assignee_name') END), '');

  v_customer_id := nullif(p_payload#>>'{customer,id}','')::uuid;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.film_customers(name, phone) VALUES (v_name, v_phone)
    RETURNING id INTO v_customer_id;
  END IF;

  SELECT public.film_next_order_number() INTO v_order_no;

  INSERT INTO public.film_orders(
    order_no, customer_id, customer_name, customer_phone, channel, title, due_at,
    is_urgent, status, payment_status, subtotal, discount, deposit, total, paid_amount,
    notes, is_draft, created_by, intake_request_id, is_test, attachments,
    prepare_receipt, intake_source)
  VALUES (
    v_order_no, v_customer_id, v_name, v_phone, 'walkin',
    coalesce(nullif(v_items->0->>'title',''), 'งานรับหน้าร้าน'), v_due,
    coalesce((p_payload->>'is_urgent')::boolean, false), 'confirmed', v_pay_status,
    v_subtotal, v_discount, v_deposit, v_total, v_paid,
    v_notes, false, auth.uid(), v_req,
    coalesce((p_payload->>'is_test')::boolean, false),
    coalesce(p_payload->'attachments','[]'::jsonb),
    v_prep, v_src)
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

  IF v_docs <> 'queue_only' THEN
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
  END IF;

  RETURN jsonb_build_object('duplicate', false, 'order_id', v_order_id, 'order_no', v_order_no,
    'job_order_id', v_jo_id, 'job_order_no', v_jo_no, 'receipt_id', v_rc_id, 'receipt_no', v_rc_no);
END;
$function$;