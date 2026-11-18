update public.line_notification_channels
set queue_commands_enabled = true, updated_at = now()
where channel_type = 'doc_group' and is_active = true;