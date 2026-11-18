CREATE OR REPLACE FUNCTION public.film_confirm_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text := 'confirm_order:' || p_order_id::text;
  v_order public.film_orders%ROWTYPE;
  v_item record; v_route record; v_dept text; v_created int := 0; v_skipped int := 0;
  v_score numeric; v_reason text; v_due timestamptz; v_outsourced boolean;
  v_status text; v_category text;
BEGIN
  IF NOT (public.is_staff(auth.uid()) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO v_order FROM public.film_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  INSERT INTO public.film_automation_runs(kind, ref_id, idempotency_key, status)
  VALUES ('confirm_order', p_order_id, v_key, 'running')
  ON CONFLICT (idempotency_key) DO UPDATE SET attempts = public.film_automation_runs.attempts + 1;

  FOR v_item IN SELECT * FROM public.film_order_items WHERE order_id = p_order_id ORDER BY sort_order NULLS LAST, created_at LOOP
    IF EXISTS (SELECT 1 FROM public.film_order_jobs WHERE order_item_id = v_item.id) THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    SELECT * INTO v_route FROM public.film_queue_routing WHERE category = coalesce(v_item.category,'other') AND active;
    v_outsourced := coalesce(v_item.is_outsourced, false) OR coalesce(v_route.outsource_default, false);
    v_dept := coalesce(v_item.dept, v_route.dept, 'front');
    IF v_outsourced THEN v_dept := 'outsource'; END IF;
    v_due := coalesce(v_item.due_at, v_order.due_at, now() + make_interval(hours => coalesce(v_route.sla_hours, 24)::int));
    SELECT s.score, s.reason INTO v_score, v_reason
      FROM public.film_priority_score(v_order.is_urgent, v_due, now()) s;

    v_category := coalesce(v_item.category,'other');
    v_status := CASE
      WHEN v_outsourced THEN 'waiting_outsource'
      WHEN v_category = 'design' THEN 'design_queue'
      WHEN lower(coalesce(v_order.channel,'')) IN ('web','webapp','web_app','line') THEN 'order_review'
      ELSE 'new'
    END;

    INSERT INTO public.film_order_jobs(
      order_id, order_item_id, title, status, category, dept, size, unit, quantity,
      cost_price, due_at, is_outsourced, attachments, notes, assigned_employee_id,
      queue_code, priority_score, priority_reason, sort_order)
    VALUES (
      p_order_id, v_item.id, coalesce(v_item.title, v_item.description, 'งาน'),
      v_status,
      v_category, v_dept, v_item.size, v_item.unit, coalesce(v_item.quantity,1),
      coalesce(v_item.cost_price,0), v_due, v_outsourced,
      coalesce(v_item.attachments,'[]'::jsonb), v_item.notes, v_item.assigned_employee_id,
      public.film_next_queue_code(v_dept), v_score, v_reason, coalesce(v_item.sort_order, 0));
    v_created := v_created + 1;
  END LOOP;

  UPDATE public.film_orders SET is_draft = false,
    status = CASE WHEN status IN ('draft','') OR status IS NULL THEN 'confirmed' ELSE status END,
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.film_order_events(order_id, action, to_status, note, created_by)
  VALUES (p_order_id, 'confirm', 'confirmed', format('สร้างงานย่อย %s รายการ (ข้ามซ้ำ %s)', v_created, v_skipped), auth.uid());

  IF v_created > 0 THEN
    PERFORM public.film_raise_ops_notification(
      'new_job', 'info', 'ออเดอร์ใหม่เข้าคิว',
      format('%s · %s (%s งาน)', coalesce(v_order.order_no,''), coalesce(v_order.title,''), v_created),
      p_order_id, NULL, NULL, NULL, 'confirm_order:' || p_order_id::text, 60);
  END IF;

  UPDATE public.film_automation_runs
    SET status = 'ok', finished_at = now(),
        result = jsonb_build_object('created', v_created, 'skipped', v_skipped)
  WHERE idempotency_key = v_key;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped);
END; $function$;