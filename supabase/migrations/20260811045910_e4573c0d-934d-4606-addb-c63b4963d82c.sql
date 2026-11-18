UPDATE public.line_notification_channels
SET is_active = false, is_hub = false, updated_at = now()
WHERE line_destination_id LIKE 'U%';