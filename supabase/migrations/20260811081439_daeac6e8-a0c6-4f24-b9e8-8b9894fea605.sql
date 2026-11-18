-- 1) toggle active
create or replace function public.admin_line_channel_toggle(p_channel_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r public.line_notification_channels%rowtype;
begin
  if not (public.has_role(auth.uid(),'owner'::app_role) or public.has_role(auth.uid(),'admin'::app_role)) then
    raise exception 'forbidden';
  end if;
  select * into r from public.line_notification_channels where id = p_channel_id;
  if not found then raise exception 'channel_not_found'; end if;
  if p_active and r.line_destination_id !~ '^[CR]' then
    raise exception 'destination_not_group';
  end if;
  update public.line_notification_channels
     set is_active = p_active,
         is_hub = case when p_active then is_hub else false end
   where id = p_channel_id;
end $$;

-- 2) set / clear hub (backup room) — one per channel_type
create or replace function public.admin_line_channel_set_hub(p_channel_id uuid, p_hub boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r public.line_notification_channels%rowtype;
begin
  if not (public.has_role(auth.uid(),'owner'::app_role) or public.has_role(auth.uid(),'admin'::app_role)) then
    raise exception 'forbidden';
  end if;
  select * into r from public.line_notification_channels where id = p_channel_id;
  if not found then raise exception 'channel_not_found'; end if;

  if p_hub then
    if r.line_destination_id !~ '^[CR]' then raise exception 'destination_not_group'; end if;
    update public.line_notification_channels
       set is_hub = false
     where channel_type = r.channel_type and is_hub = true and id <> r.id;
    update public.line_notification_channels
       set is_hub = true, is_active = true
     where id = r.id;
  else
    update public.line_notification_channels set is_hub = false where id = r.id;
  end if;
end $$;

-- 3) exclusive routing: this room becomes the only active room for (store, type)
create or replace function public.admin_line_route_exclusive(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r public.line_notification_channels%rowtype;
begin
  if not (public.has_role(auth.uid(),'owner'::app_role) or public.has_role(auth.uid(),'admin'::app_role)) then
    raise exception 'forbidden';
  end if;
  select * into r from public.line_notification_channels where id = p_channel_id;
  if not found then raise exception 'channel_not_found'; end if;
  if r.line_destination_id !~ '^[CR]' then raise exception 'destination_not_group'; end if;

  update public.line_notification_channels
     set is_active = false, is_hub = false
   where store_id = r.store_id and channel_type = r.channel_type and id <> r.id;

  update public.line_notification_channels
     set is_active = true
   where id = r.id;
end $$;

-- 4) routing status summary (per store x type) with fallback explanation
create or replace function public.admin_line_routing_status()
returns table(
  store_id text,
  channel_type text,
  source text,
  channel_ids uuid[],
  room_names text[],
  destinations text[]
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
  with stores as (
    select distinct c.store_id from public.line_notification_channels c
    union
    select distinct lc.id::text from public.line_credentials lc
  ),
  types as (select unnest(array['admin_group','queue_group','doc_group']) as t),
  grid as (select s.store_id, ty.t as channel_type from stores s cross join types ty),
  direct as (
    select c.store_id, c.channel_type,
           array_agg(c.id order by c.linked_at) ids,
           array_agg(coalesce(c.display_name,'กลุ่ม LINE') order by c.linked_at) names,
           array_agg(left(c.line_destination_id,6) || '…' order by c.linked_at) dests
      from public.line_notification_channels c
     where c.is_active and c.line_destination_id ~ '^[CR]'
     group by c.store_id, c.channel_type
  ),
  hub as (
    select c.channel_type,
           array_agg(c.id) ids,
           array_agg(coalesce(c.display_name,'กลุ่ม LINE')) names,
           array_agg(left(c.line_destination_id,6) || '…') dests
      from public.line_notification_channels c
     where c.is_active and c.is_hub and c.line_destination_id ~ '^[CR]'
     group by c.channel_type
  ),
  admin_fb as (
    select array_agg(c.id) ids,
           array_agg(coalesce(c.display_name,'กลุ่ม LINE')) names,
           array_agg(left(c.line_destination_id,6) || '…') dests
      from public.line_notification_channels c
     where c.is_active and c.channel_type = 'admin_group' and c.line_destination_id ~ '^[CR]'
  )
  select g.store_id,
         g.channel_type,
         case
           when d.ids is not null then 'direct'
           when h.ids is not null then 'hub'
           when a.ids is not null then 'admin_fallback'
           else 'none'
         end,
         coalesce(d.ids, h.ids, a.ids),
         coalesce(d.names, h.names, a.names),
         coalesce(d.dests, h.dests, a.dests)
    from grid g
    left join direct d on d.store_id = g.store_id and d.channel_type = g.channel_type
    left join hub h on h.channel_type = g.channel_type
    left join admin_fb a on true
   order by g.store_id, g.channel_type;
end $$;

-- 5) delivery / test log by type
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
  title text
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
         n.title
    from public.line_delivery_logs l
    left join public.line_notification_channels c on c.id = l.channel_id
    left join public.film_ops_notifications n on n.id = l.notification_id
   where p_type is null or c.channel_type = p_type
   order by l.created_at desc
   limit greatest(1, least(coalesce(p_limit,100), 500));
end $$;

revoke all on function public.admin_line_channel_toggle(uuid, boolean) from public, anon;
revoke all on function public.admin_line_channel_set_hub(uuid, boolean) from public, anon;
revoke all on function public.admin_line_route_exclusive(uuid) from public, anon;
revoke all on function public.admin_line_routing_status() from public, anon;
revoke all on function public.admin_line_delivery_log(integer, text) from public, anon;

grant execute on function public.admin_line_channel_toggle(uuid, boolean) to authenticated;
grant execute on function public.admin_line_channel_set_hub(uuid, boolean) to authenticated;
grant execute on function public.admin_line_route_exclusive(uuid) to authenticated;
grant execute on function public.admin_line_routing_status() to authenticated;
grant execute on function public.admin_line_delivery_log(integer, text) to authenticated;