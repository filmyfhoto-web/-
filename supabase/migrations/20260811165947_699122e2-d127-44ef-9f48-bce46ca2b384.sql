alter table public.line_delivery_logs add column if not exists sender_store_id text;

drop function if exists public.admin_line_delivery_log(integer, text);

create or replace function public.admin_line_delivery_log(p_limit integer default 100, p_type text default null)
returns table(
  id uuid,
  created_at timestamptz,
  channel_type text,
  store_id text,
  room_name text,
  kind text,
  status text,
  error_code text,
  attempts integer,
  title text,
  sender_store_id text,
  notification_id uuid,
  channel_id uuid,
  order_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_role(auth.uid(),'owner'::app_role) or public.has_role(auth.uid(),'admin'::app_role)) then
    raise exception 'forbidden';
  end if;

  return query
  select l.id,
         l.created_at,
         coalesce(c.channel_type,'unknown'),
         coalesce(c.store_id,'-'),
         coalesce(c.display_name,'กลุ่ม LINE'),
         l.kind,
         l.status,
         l.error_code,
         l.attempts,
         n.title,
         coalesce(l.sender_store_id, case when c.channel_type = 'queue_group' then 'runqueue' else c.store_id end),
         l.notification_id,
         l.channel_id,
         n.order_id
    from public.line_delivery_logs l
    left join public.line_notification_channels c on c.id = l.channel_id
    left join public.film_ops_notifications n on n.id = l.notification_id
   where p_type is null or c.channel_type = p_type
   order by l.created_at desc
   limit greatest(1, least(coalesce(p_limit,100), 500));
end $$;

create or replace function public.admin_line_order_delivery_log(p_order_id uuid)
returns table(
  id uuid,
  created_at timestamptz,
  channel_id uuid,
  channel_type text,
  store_id text,
  room_name text,
  kind text,
  status text,
  error_code text,
  attempts integer,
  notification_id uuid,
  notification_title text,
  notification_kind text,
  sender_store_id text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_role(auth.uid(),'owner'::app_role) or public.has_role(auth.uid(),'admin'::app_role)) then
    raise exception 'forbidden';
  end if;

  return query
  select l.id,
         l.created_at,
         l.channel_id,
         coalesce(c.channel_type,'unknown'),
         coalesce(c.store_id,'-'),
         coalesce(c.display_name,'กลุ่ม LINE'),
         l.kind,
         l.status,
         l.error_code,
         l.attempts,
         l.notification_id,
         n.title,
         n.kind,
         coalesce(l.sender_store_id, case when c.channel_type = 'queue_group' then 'runqueue' else c.store_id end)
    from public.line_delivery_logs l
    join public.film_ops_notifications n on n.id = l.notification_id
   where n.order_id = p_order_id
   order by l.created_at desc
   limit 100;
end $$;

revoke all on function public.admin_line_delivery_log(integer, text) from public, anon;
revoke all on function public.admin_line_order_delivery_log(uuid) from public, anon;
grant execute on function public.admin_line_delivery_log(integer, text) to authenticated;
grant execute on function public.admin_line_order_delivery_log(uuid) to authenticated;