-- 1) route group_no = 2 (NATTA.Q) to a dedicated queue group when one exists
CREATE OR REPLACE FUNCTION public.film_ops_notification_to_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
declare
  v_store text := coalesce(new.store_id, 'default');
  v_room record;
  v_text text;
  v_url text := 'https://filmyynatta.com/receipts/film?p=alerts';
  v_prefix text;
  v_found boolean := false;
  v_group_no int := coalesce(new.group_no, 1);
  v_type text;
begin
  v_prefix := case when v_group_no = 2 then '🤖 NATTA.Q' else '🛒 ออเดอร์เว็บแอป' end;
  v_type := case when v_group_no = 2 then 'queue_group' else 'admin_group' end;
  v_text := v_prefix || E'\n' || coalesce(new.title, '(ไม่มีหัวข้อ)')
            || case when coalesce(new.body,'') <> '' then E'\n' || new.body else '' end
            || E'\n' || v_url;

  for v_room in
    select id, line_destination_id, store_id
    from public.line_notification_channels
    where channel_type = v_type and is_active = true and store_id = v_store
  loop
    v_found := true;
    begin
      perform public.notification_outbox_enqueue(
        'film_ops_alert', 'film_order', new.order_id, v_room.line_destination_id,
        jsonb_build_object('text', v_text, 'url', v_url, 'store_id', v_room.store_id, 'group_no', v_group_no),
        'film_ops:' || new.id::text || ':' || v_room.id::text, 'line', null, null, null
      );
    exception when others then null;
    end;
  end loop;

  -- fallback 1: queue group not configured -> use the order-alert room of the same store
  if not v_found and v_type <> 'admin_group' then
    for v_room in
      select id, line_destination_id, store_id
      from public.line_notification_channels
      where channel_type = 'admin_group' and is_active = true and store_id = v_store
    loop
      v_found := true;
      begin
        perform public.notification_outbox_enqueue(
          'film_ops_alert', 'film_order', new.order_id, v_room.line_destination_id,
          jsonb_build_object('text', v_text, 'url', v_url, 'store_id', v_room.store_id, 'group_no', v_group_no),
          'film_ops:' || new.id::text || ':' || v_room.id::text, 'line', null, null, null
        );
      exception when others then null;
      end;
    end loop;
  end if;

  -- fallback 2: store has no room at all -> default store rooms
  if not v_found and v_store <> 'default' then
    for v_room in
      select id, line_destination_id, store_id
      from public.line_notification_channels
      where channel_type in (v_type, 'admin_group') and is_active = true and store_id = 'default'
      order by (channel_type = v_type) desc
      limit 1
    loop
      begin
        perform public.notification_outbox_enqueue(
          'film_ops_alert', 'film_order', new.order_id, v_room.line_destination_id,
          jsonb_build_object('text', v_text, 'url', v_url, 'store_id', v_room.store_id, 'group_no', v_group_no),
          'film_ops:' || new.id::text || ':' || v_room.id::text, 'line', null, null, null
        );
      exception when others then null;
      end;
    end loop;
  end if;

  return new;
end;
$fn$;

-- 2) close an order (and settle the outstanding balance) straight from the inbox
CREATE OR REPLACE FUNCTION public.film_close_order_from_inbox(
  p_order_id uuid,
  p_method text DEFAULT 'cash',
  p_note text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
declare
  v_order record;
  v_due numeric;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select * into v_order from public.film_orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found';
  end if;

  v_due := greatest(coalesce(v_order.total,0) - coalesce(v_order.paid_amount,0), 0);

  if v_due > 0 then
    insert into public.film_order_payments (order_id, kind, amount, method, note, created_by)
    values (p_order_id, 'payment', v_due, coalesce(nullif(p_method,''),'cash'),
            coalesce(p_note, 'ปิดยอดจากกล่องข้อความ'), auth.uid());
  end if;

  update public.film_orders
     set status = 'done',
         payment_status = 'paid',
         updated_at = now()
   where id = p_order_id;

  begin
    insert into public.film_order_events (order_id, event_type, payload, created_by)
    values (p_order_id, 'closed_from_inbox',
            jsonb_build_object('amount', v_due, 'method', coalesce(nullif(p_method,''),'cash')),
            auth.uid());
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'settled', v_due);
end;
$fn$;

REVOKE ALL ON FUNCTION public.film_close_order_from_inbox(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.film_close_order_from_inbox(uuid, text, text) TO authenticated;