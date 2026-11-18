-- "🚀ออเดอร์ขั้นเทพ" = order/requisition notifications only (no queue commands)
update public.line_notification_channels
set queue_commands_enabled = false,
    doc_commands_enabled = false,
    updated_at = now()
where line_destination_id = 'C84f362c628aa1d92e30baef6ecfffedf';

-- "🤖botรันงาน" = Film shop queue only (never order notifications)
update public.line_notification_channels
set is_active = false,
    updated_at = now()
where line_destination_id = 'C7b423589f0fae66e0efd67c400013a4c'
  and channel_type = 'order_group';

update public.line_notification_channels
set is_active = true,
    queue_commands_enabled = true,
    updated_at = now()
where line_destination_id = 'C7b423589f0fae66e0efd67c400013a4c'
  and channel_type = 'queue_group';