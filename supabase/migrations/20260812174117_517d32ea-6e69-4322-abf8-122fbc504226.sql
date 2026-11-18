UPDATE public.line_notification_channels
SET store_id = '0fe70906-0dc7-4682-bad5-df45c8c72e86', last_verified_at = now()
WHERE line_destination_id = 'Cd3c94f22b5f66f22db430e2cf06222b4' AND channel_type = 'doc_group';

UPDATE public.line_notification_channels
SET store_id = '99723b88-97ea-4454-b7ac-b5a61be5114d', last_verified_at = now()
WHERE line_destination_id = 'C40b49f2540621e08dd5b4e57904fd732' AND channel_type = 'doc_group';