
create or replace function public.film_ops_notification_to_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store text := coalesce(new.store_id, 'default');
  v_room record;
  v_text text;
  v_url text := 'https://filmyynatta.com/receipts/film?p=alerts';
  v_prefix text;
  v_found boolean := false;
begin
  v_prefix := case when coalesce(new.group_no, 1) = 2 then '🤖 NATTA.Q' else '🛒 ออเดอร์เว็บแอป' end;
  v_text := v_prefix || E'\n' || coalesce(new.title, '(ไม่มีหัวข้อ)')
            || case when coalesce(new.body,'') <> '' then E'\n' || new.body else '' end
            || E'\n' || v_url;

  for v_room in
    select id, line_destination_id, store_id
    from public.line_notification_channels
    where channel_type = 'admin_group' and is_active = true and store_id = v_store
  loop
    v_found := true;
    begin
      perform public.notification_outbox_enqueue(
        'film_ops_alert', 'film_order', new.order_id, v_room.line_destination_id,
        jsonb_build_object('text', v_text, 'url', v_url, 'store_id', v_room.store_id, 'group_no', coalesce(new.group_no,1)),
        'film_ops:' || new.id::text || ':' || v_room.id::text, 'line', null, null, null
      );
    exception when others then null;
    end;
  end loop;

  if not v_found and v_store <> 'default' then
    for v_room in
      select id, line_destination_id, store_id
      from public.line_notification_channels
      where channel_type = 'admin_group' and is_active = true and store_id = 'default'
    loop
      begin
        perform public.notification_outbox_enqueue(
          'film_ops_alert', 'film_order', new.order_id, v_room.line_destination_id,
          jsonb_build_object('text', v_text, 'url', v_url, 'store_id', v_room.store_id, 'group_no', coalesce(new.group_no,1)),
          'film_ops:' || new.id::text || ':' || v_room.id::text, 'line', null, null, null
        );
      exception when others then null;
      end;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_film_ops_notification_to_line on public.film_ops_notifications;
create trigger trg_film_ops_notification_to_line
after insert on public.film_ops_notifications
for each row execute function public.film_ops_notification_to_line();
