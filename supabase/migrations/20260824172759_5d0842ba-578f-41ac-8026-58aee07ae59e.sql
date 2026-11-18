-- 1) Group-only enforcement on the notification queue
create or replace function public.enforce_group_only_admin_notify()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.channel, 'line') = 'line'
     and coalesce(new.payload->>'audience', '') = 'admin'
     and new.event_type in (
       'order_created', 'order_status_changed', 'requisition_submitted',
       'po_review_confirmed', 'po_review_revision'
     )
     and coalesce(new.recipient, '') !~* '^[CR][0-9a-f]{10,}$' then
    raise exception 'group_only_policy: admin notification for % must target a LINE group destination (got %)',
      new.event_type, coalesce(new.recipient, '(null)');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notification_outbox_group_only on public.notification_outbox;
create trigger trg_notification_outbox_group_only
before insert or update of recipient on public.notification_outbox
for each row execute function public.enforce_group_only_admin_notify();

-- 2) Individual (1:1) admin recipients are permanently disabled
create or replace function public.force_disable_admin_line_recipient()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.enabled := false;
  new.notify_orders := false;
  return new;
end;
$$;

drop trigger if exists trg_admin_line_recipients_disabled on public.admin_line_recipients;
create trigger trg_admin_line_recipients_disabled
before insert or update on public.admin_line_recipients
for each row execute function public.force_disable_admin_line_recipient();

update public.admin_line_recipients set updated_at = now();

-- 3) Status view for the admin screen
create or replace function public.admin_line_group_notify_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_staff_any() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(g order by g->>'linked_at' desc)
      from (
        select jsonb_build_object(
          'id', c.id,
          'destination_id', c.line_destination_id,
          'display_name', c.display_name,
          'store_id', c.store_id,
          'is_active', c.is_active,
          'linked_at', c.linked_at,
          'is_primary', c.id = (
            select c2.id from public.line_notification_channels c2
            where c2.channel_type = 'order_group' and c2.is_active
            order by c2.linked_at desc limit 1
          ),
          'last_event', (
            select jsonb_build_object(
              'event_type', o.event_type,
              'status', o.status,
              'created_at', o.created_at,
              'sent_at', o.sent_at,
              'last_error', o.last_error,
              'text', left(coalesce(o.payload->>'text', ''), 400)
            )
            from public.notification_outbox o
            where o.recipient = c.line_destination_id
            order by o.created_at desc limit 1
          ),
          'sent_7d', (
            select count(*) from public.notification_outbox o
            where o.recipient = c.line_destination_id
              and o.status = 'sent'
              and o.created_at > now() - interval '7 days'
          ),
          'failed_7d', (
            select count(*) from public.notification_outbox o
            where o.recipient = c.line_destination_id
              and o.status in ('failed', 'dead', 'skipped')
              and o.created_at > now() - interval '7 days'
          )
        ) as g
        from public.line_notification_channels c
        where c.channel_type = 'order_group'
      ) s
    ), '[]'::jsonb),
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'label', r.label,
        'masked_user_id', left(r.line_user_id, 7) || '…' || right(r.line_user_id, 5),
        'enabled', r.enabled,
        'notify_orders', r.notify_orders,
        'updated_at', r.updated_at
      ) order by r.created_at)
      from public.admin_line_recipients r
    ), '[]'::jsonb),
    'one_to_one_leak_30d', (
      select count(*) from public.notification_outbox o
      where coalesce(o.payload->>'audience', '') = 'admin'
        and coalesce(o.recipient, '') ~* '^U[0-9a-f]{10,}$'
        and o.created_at > now() - interval '30 days'
    ),
    'checked_at', now()
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_line_group_notify_status() from public;
grant execute on function public.admin_line_group_notify_status() to authenticated;