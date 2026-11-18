ALTER TABLE public.line_webhook_events
  ADD COLUMN IF NOT EXISTS channel_id text,
  ADD COLUMN IF NOT EXISTS channel_label text,
  ADD COLUMN IF NOT EXISTS destination text;
CREATE INDEX IF NOT EXISTS line_webhook_events_channel_id_idx ON public.line_webhook_events (channel_id, received_at DESC);