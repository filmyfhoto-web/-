-- 1) allow multiple active rooms per (store, type)
DROP INDEX IF EXISTS public.line_notification_channels_one_active;

-- 2) route notifications to EVERY active room of the matching category
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
  v_found boolean := false;
  v_group_no int := coalesce(new.group_no, 1);
  v_type text;
  v_o record;
  v_items text;
  v_job_no text;
  v_status text;
  v_msg text;
begin
  -- category: 1 = orders, 2 = queue (NATTA.Q), document_issued = document room
  if new.kind = 'document_issued' then
    v_type := 'doc_group';
  elsif v_group_no = 2 then
    v_type := 'queue_group';
  else
    v_type := 'admin_group';
  end if;

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

  if v_type = 'doc_group' then
    v_text := coalesce(nullif(new.title,''), '📄 ออกเลขเอกสารสำเร็จ')
      || case when coalesce(new.body,'') <> '' then E'\n' || new.body else '' end;
  elsif v_type = 'queue_group' then
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

  -- ส่งเข้าทุกห้องที่เปิดรับของประเภทนี้ (ของร้านนี้) — ไม่ส่งแชทส่วนตัว
  for v_room in
    select id, line_destination_id, store_id
    from public.line_notification_channels
    where channel_type = v_type and is_active = true and store_id = v_store
      and line_destination_id not like 'U%'
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

  -- สำรอง 1: ห้องประเภทเดียวกันของร้านอื่น/ร้านหลัก (เลือกห้อง hub ก่อน)
  if not v_found then
    for v_room in
      select id, line_destination_id, store_id
      from public.line_notification_channels
      where channel_type = v_type and is_active = true
        and line_destination_id not like 'U%'
      order by is_hub desc, (store_id = 'default') desc, linked_at desc
      limit 1
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

  -- สำรอง 2: ถ้ายังไม่มีห้องของประเภทนั้นเลย ให้เข้าห้องออเดอร์
  if not v_found and v_type <> 'admin_group' then
    for v_room in
      select id, line_destination_id, store_id
      from public.line_notification_channels
      where channel_type = 'admin_group' and is_active = true
        and line_destination_id not like 'U%'
      order by (store_id = v_store) desc, is_hub desc, linked_at desc
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