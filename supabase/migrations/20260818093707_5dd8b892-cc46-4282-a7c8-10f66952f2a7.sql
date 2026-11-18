CREATE OR REPLACE FUNCTION public.admin_line_routing_status()
 RETURNS TABLE(store_id text, channel_type text, source text, channel_ids uuid[], room_names text[], destinations text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  types as (select unnest(array['admin_group','queue_group','doc_group','order_group']) as t),
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
           when a.ids is not null and g.channel_type <> 'order_group' then 'admin_fallback'
           else 'none'
         end,
         case when d.ids is not null then d.ids
              when h.ids is not null then h.ids
              when g.channel_type <> 'order_group' then a.ids end,
         case when d.ids is not null then d.names
              when h.ids is not null then h.names
              when g.channel_type <> 'order_group' then a.names end,
         case when d.ids is not null then d.dests
              when h.ids is not null then h.dests
              when g.channel_type <> 'order_group' then a.dests end
    from grid g
    left join direct d on d.store_id = g.store_id and d.channel_type = g.channel_type
    left join hub h on h.channel_type = g.channel_type
    left join admin_fb a on true
   order by g.store_id, g.channel_type;
end $function$;