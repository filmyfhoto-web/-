ALTER TABLE public.line_notification_channels
  ADD COLUMN IF NOT EXISTS is_hub boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS line_notification_channels_single_hub
  ON public.line_notification_channels ((is_hub))
  WHERE is_hub = true AND is_active = true;

CREATE OR REPLACE FUNCTION public.film_ops_notification_to_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_store text := coalesce(new.store_id, 'default');
  v_room record;
  v_text text;
  v_url text := 'https://filmyynatta.com/receipts/film?p=alerts';
  v_found boolean := false;
  v_group_no int := coalesce(new.group_no, 1);
  v_type text;
  v_o record;
  v_items text;
  v_job_no text;
  v_status text;
  v_msg text;
begin
  v_type := case when v_group_no = 2 then 'queue_group' else 'admin_group' end;

  if new.order_id is not null then
    select order_no, customer_name, status, title
      into v_o
      from public.film_orders where id = new.order_id;
    v_url := 'https://filmyynatta.com/receipts/film?p=orders&order=' || new.order_id::text;
    select string_agg(coalesce(nullif(i.title,''), i.description, '-')
             || case when coalesce(i.quantity,0) > 0 then ' x' || i.quantity::text else '' end, E'\n     ')
      into v_items
      from (select * from public.film_order_items where order_id = new.order_id order by sort_order, created_at limit 5) i;
  end if;

  if v_group_no = 2 then
    if new.job_id is not null then
      select job_no, status into v_job_no, v_status from public.film_order_jobs where id = new.job_id;
    elsif new.order_id is not null then
      select job_no, status into v_job_no, v_status
        from public.film_order_jobs where order_id = new.order_id order by created_at limit 1;
    end if;
    v_msg := coalesce(nullif(new.meta->>'message',''), nullif(new.body,''), '-');
    v_text := '🤖 [NATTA.Q: AI ตรวจพบออเดอร์จากแชท]' || E'\n'
      || 'รหัสใบงาน: ' || coalesce(nullif(v_job_no,''), coalesce(v_o.order_no,'-')) || E'\n'
      || 'ลูกค้า: ' || coalesce(nullif(v_o.customer_name,''), nullif(new.meta->>'customer_name',''), '-') || ' (ผ่าน LINE OA)' || E'\n'
      || 'ข้อความที่ AI ตรวจจับ: "' || left(v_msg, 300) || '"' || E'\n'
      || 'สถานะ: ' || coalesce(nullif(new.title,''), 'AI สร้างใบงานและรันคิวให้อัตโนมัติเรียบร้อย ✅') || E'\n'
      || '🔗 ' || v_url;
  else
    v_text := '🔔 [แจ้งเตือนออเดอร์ใหม่จากเว็บแอป]' || E'\n'
      || 'รหัสออเดอร์: ' || coalesce(nullif(v_o.order_no,''), '-') || E'\n'
      || 'ลูกค้า: ' || coalesce(nullif(v_o.customer_name,''), nullif(new.meta->>'customer_name',''), '-') || E'\n'
      || 'รายการ: ' || coalesce(nullif(v_items,''), nullif(v_o.title,''), coalesce(nullif(new.body,''), '-')) || E'\n'
      || 'สถานะ: ' || coalesce(nullif(v_o.status,''), 'รอตรวจสอบ / เตรียมผลิต') || E'\n'
      || '🔗 ลิงก์จัดการออเดอร์: ' || v_url;
  end if;

  -- ห้องศูนย์รวม: ถ้าตั้งไว้ ทุกแจ้งเตือนไปที่ห้องเดียวนี้เท่านั้น
  for v_room in
    select id, line_destination_id, store_id
    from public.line_notification_channels
    where is_hub = true and is_active = true
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
    return new;
  end loop;

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
$function$;