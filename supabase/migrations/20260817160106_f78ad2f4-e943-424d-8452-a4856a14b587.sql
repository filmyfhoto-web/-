ALTER TABLE public.line_notification_channels
  ADD COLUMN IF NOT EXISTS doc_commands_enabled boolean NOT NULL DEFAULT false;

UPDATE public.line_notification_channels
SET doc_commands_enabled = true,
    store_id = 'fb975dea-cd75-444c-b04c-f51b2c527a36'
WHERE line_destination_id = 'C7b423589f0fae66e0efd67c400013a4c';